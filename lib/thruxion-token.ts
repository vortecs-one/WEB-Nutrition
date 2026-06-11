// lib/thruxion-token.ts
//
// Server-only secure token manager for the Thruxion "humans" API.
//
// The system bearer token (from POST /api/humans/auth/system-login) is required
// on EVERY other endpoint. This module:
//   - caches the token in server memory (never sent to the browser)
//   - decodes the JWT `exp` claim and refreshes proactively before it expires
//   - uses single-flight locking so concurrent requests share one refresh
//   - exposes a forced invalidation path for 401 retries
//
// SECURITY: This file must only ever run on the server. The `server-only`
// import below will throw at build time if it is ever imported into a Client
// Component, guaranteeing the system credentials and token never leak.

import "server-only";

const BASE_URL = process.env.THRUXION_API_BASE_URL ?? "https://thruxion.com";
const SYSTEM_USER = process.env.THRUXION_SYSTEM_USER ?? "admin";
const SYSTEM_PASSWORD = process.env.THRUXION_SYSTEM_PASSWORD ?? "admin";

// Refresh this many seconds BEFORE the token actually expires, to avoid
// using a token that dies mid-request.
const EXPIRY_BUFFER_SECONDS = 60;

// Fallback lifetime (seconds) if the JWT has no decodable `exp` claim.
const FALLBACK_TTL_SECONDS = 5 * 60;

type CachedToken = {
  token: string;
  /** Epoch milliseconds at which we consider the token stale. */
  expiresAt: number;
};

// Module-level cache. Persists across requests within a warm server instance.
let cached: CachedToken | null = null;

// Single-flight: while a refresh is in progress, concurrent callers await the
// same promise instead of triggering a stampede of system-login calls.
let inFlight: Promise<CachedToken> | null = null;

/**
 * Decode the `exp` (seconds since epoch) claim from a JWT without verifying
 * the signature. We only trust this for scheduling refreshes, never for authz.
 */
function decodeJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    // base64url -> base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    const claims = JSON.parse(json) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp : null;
  } catch {
    return null;
  }
}

async function requestSystemToken(): Promise<CachedToken> {
  const res = await fetch(`${BASE_URL}/api/humans/auth/system-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: SYSTEM_USER, password: SYSTEM_PASSWORD }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "<no body>");
    throw new Error(
      `system-login failed (${res.status} ${res.statusText}): ${detail}`,
    );
  }

  const data = (await res.json()) as { token?: string };
  if (!data?.token) {
    throw new Error("system-login succeeded but no token was returned");
  }

  const exp = decodeJwtExp(data.token);
  const expiresAt =
    exp !== null
      ? exp * 1000 - EXPIRY_BUFFER_SECONDS * 1000
      : Date.now() + FALLBACK_TTL_SECONDS * 1000;

  return { token: data.token, expiresAt };
}

function isFresh(entry: CachedToken | null): entry is CachedToken {
  return entry !== null && Date.now() < entry.expiresAt;
}

/**
 * Returns a valid system bearer token, refreshing it if missing or near expiry.
 * Concurrent callers during a refresh share a single in-flight request.
 */
export async function getSystemToken(): Promise<string> {
  if (isFresh(cached)) {
    return cached.token;
  }

  if (inFlight) {
    const entry = await inFlight;
    return entry.token;
  }

  inFlight = requestSystemToken();
  try {
    cached = await inFlight;
    return cached.token;
  } finally {
    inFlight = null;
  }
}

/**
 * Force a token refresh on the next call. Use after a 401 to recover from a
 * token the server rejected before its computed expiry (e.g. remote rotation).
 */
export function invalidateSystemToken(): void {
  cached = null;
}

export { BASE_URL };
