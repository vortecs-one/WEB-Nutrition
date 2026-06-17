// lib/handoff.ts
// Secure native-app -> WebView session handoff.
//
// Flow:
//   1. The mobile app POSTs the credentials it already holds to
//      /api/auth/app-handoff/issue, signed with an HMAC shared secret.
//   2. We validate those credentials against the Thruxion API, then mint a
//      random, single-use, short-lived token. Only its SHA-256 hash is stored.
//   3. The app opens the WebView at /auth/handoff?token=<token>. The NextAuth
//      "app-handoff" provider atomically consumes the token and creates the
//      normal session cookie.
//
// Security properties:
//   - Raw credentials never appear in a URL or browser history.
//   - The handoff token is single-use (atomic UPDATE ... RETURNING) and expires
//     in ~2 minutes.
//   - Only the token HASH is persisted, so a DB leak can't be replayed.
//   - The issue endpoint is authenticated with an HMAC of the timestamp + body
//     using APP_HANDOFF_SECRET, with a timestamp skew check to block replays.
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { handoffTokens } from "@/drizzle/schema";

// Shared secret known to the mobile app and this server.
// NOTE: a secret embedded in an APK can be extracted; this is one layer.
// For higher assurance, combine with Play Integrity / device attestation, or
// have the Thruxion API issue the handoff token directly.
const APP_HANDOFF_SECRET = process.env.APP_HANDOFF_SECRET ?? "";

// How long a handoff token is valid for (ms).
const TOKEN_TTL_MS = 2 * 60 * 1000; // 2 minutes
// Allowed clock skew between the app and server for the signed request (ms).
const SIGNATURE_SKEW_MS = 5 * 60 * 1000; // 5 minutes

export type HandoffIdentity = {
  email: string;
  userId?: string | null;
  humanId?: string | null;
  name?: string | null;
  role?: string | null;
  platform?: string | null;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time string compare that won't throw on length mismatch. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify the HMAC signature sent by the mobile app.
 *
 * Signature = hex(HMAC_SHA256(APP_HANDOFF_SECRET, `${timestamp}.${rawBody}`))
 *
 * @param rawBody   The exact raw request body string (pre-parse).
 * @param timestamp The `x-app-timestamp` header (unix ms as string).
 * @param signature The `x-app-signature` header (hex).
 */
export function verifyAppSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!APP_HANDOFF_SECRET) {
    return { ok: false, reason: "server-misconfigured" };
  }
  if (!timestamp || !signature) {
    return { ok: false, reason: "missing-signature" };
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: "bad-timestamp" };
  }
  if (Math.abs(Date.now() - ts) > SIGNATURE_SKEW_MS) {
    return { ok: false, reason: "stale-timestamp" };
  }

  const expected = createHmac("sha256", APP_HANDOFF_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  if (!safeEqualHex(expected, signature)) {
    return { ok: false, reason: "bad-signature" };
  }

  return { ok: true };
}

/**
 * Create a single-use handoff token for a validated identity.
 * Returns the RAW token (returned to the app once; never stored).
 */
export async function issueHandoffToken(
  identity: HandoffIdentity,
): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(handoffTokens).values({
    tokenHash,
    email: identity.email,
    userId: identity.userId ?? null,
    humanId: identity.humanId ?? null,
    name: identity.name ?? null,
    role: identity.role ?? null,
    platform: identity.platform ?? null,
    expiresAt,
    used: false,
  });

  return { token: rawToken, expiresAt };
}

/**
 * Atomically consume a handoff token. Marks it used so it can never be
 * replayed, and only succeeds if it's unused and unexpired.
 * Returns the stored identity, or null if invalid/expired/already used.
 */
export async function consumeHandoffToken(
  rawToken: string,
): Promise<HandoffIdentity | null> {
  if (!rawToken) return null;
  const tokenHash = sha256Hex(rawToken);

  // Single-use guard: only flips rows that are still valid.
  const rows = await db
    .update(handoffTokens)
    .set({ used: true })
    .where(
      and(
        eq(handoffTokens.tokenHash, tokenHash),
        eq(handoffTokens.used, false),
        gt(handoffTokens.expiresAt, new Date()),
      ),
    )
    .returning();

  const record = rows[0];
  if (!record) return null;

  return {
    email: record.email,
    userId: record.userId,
    humanId: record.humanId,
    name: record.name,
    role: record.role,
    platform: record.platform,
  };
}

/** Best-effort cleanup of expired tokens (call opportunistically). */
export async function purgeExpiredHandoffTokens(): Promise<void> {
  try {
    await db.delete(handoffTokens).where(lt(handoffTokens.expiresAt, new Date()));
  } catch {
    // Non-critical.
  }
}
