// app/api/auth/app-handoff/issue/route.ts
// Called by the NATIVE APP (not the browser) to exchange the credentials it
// already holds for a single-use handoff token.
//
// Request:
//   POST /api/auth/app-handoff/issue
//   Headers:
//     x-app-timestamp: <unix ms>
//     x-app-signature: hex(HMAC_SHA256(APP_HANDOFF_SECRET, `${timestamp}.${rawBody}`))
//   Body (raw JSON): { "email": "...", "password": "..." }
//
// Response (200):
//   {
//     "token": "<single-use token>",
//     "expiresAt": "<ISO date>",
//     "handoffUrl": "https://<host>/auth/handoff?token=<token>"
//   }
//
// The app then loads `handoffUrl` in its WebView to establish the session.
import { NextResponse } from "next/server";
import { userLogin } from "@/lib/thruxion-api";
import {
  verifyAppSignature,
  issueHandoffToken,
  purgeExpiredHandoffTokens,
} from "@/lib/handoff";

export async function POST(req: Request) {
  // Read the RAW body first — the HMAC is computed over the exact bytes.
  const rawBody = await req.text();

  const sig = verifyAppSignature(
    rawBody,
    req.headers.get("x-app-timestamp"),
    req.headers.get("x-app-signature"),
  );
  if (!sig.ok) {
    // Don't leak which check failed beyond a coarse reason.
    const status = sig.reason === "server-misconfigured" ? 500 : 401;
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status },
    );
  }

  let email: string | undefined;
  let password: string | undefined;
  try {
    const parsed = JSON.parse(rawBody || "{}");
    email = parsed.email;
    password = parsed.password;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: "Missing email or password" },
      { status: 400 },
    );
  }

  // Validate the credentials against the SAME Thruxion API the website uses.
  // We never trust the app's claim of identity without verifying it.
  let user;
  try {
    user = await userLogin(email, password);
  } catch (err) {
    console.log("[v0] app-handoff userLogin error:", (err as Error).message);
    return NextResponse.json(
      { success: false, error: "Auth service unavailable" },
      { status: 502 },
    );
  }

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Invalid credentials" },
      { status: 401 },
    );
  }

  // Opportunistic cleanup so the table doesn't grow unbounded.
  void purgeExpiredHandoffTokens();

  const { token, expiresAt } = await issueHandoffToken({
    email: user.email ?? email,
    userId: user.id != null ? String(user.id) : null,
    humanId: user.human_id != null ? String(user.human_id) : null,
    name: user.name ?? null,
    role: user.role ?? null,
    platform: user.platform ?? null,
  });

  const origin = new URL(req.url).origin;
  const handoffUrl = `${origin}/auth/handoff?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    success: true,
    token,
    expiresAt: expiresAt.toISOString(),
    handoffUrl,
  });
}
