// lib/thruxion-api.ts
// Client for the external Thruxion "humans" API.
//
// Auth flow (see API docs):
//   1. POST /api/humans/auth/system-login  -> returns a system JWT bearer token
//   2. POST /api/humans/user/login         -> requires the bearer token from step 1
//
// Config via env vars (with sensible test defaults):
//   THRUXION_API_BASE_URL   default: https://thruxion.com
//   THRUXION_SYSTEM_USER     default: admin   (test only)
//   THRUXION_SYSTEM_PASSWORD default: admin   (test only)

const BASE_URL = process.env.THRUXION_API_BASE_URL ?? "https://thruxion.com";
const SYSTEM_USER = process.env.THRUXION_SYSTEM_USER ?? "admin";
const SYSTEM_PASSWORD = process.env.THRUXION_SYSTEM_PASSWORD ?? "admin";

export type SystemLoginResponse = {
  token: string;
  role?: string;
};

export type ThruxionUser = {
  id?: string | number;
  email?: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
};

/**
 * Step 1 — Authenticate the *system* to obtain a JWT bearer token.
 */
export async function getSystemToken(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/humans/auth/system-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: SYSTEM_USER,
      password: SYSTEM_PASSWORD,
    }),
    // Never cache auth requests.
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(
      `system-login failed (${res.status} ${res.statusText}): ${detail}`,
    );
  }

  const data = (await res.json()) as SystemLoginResponse;
  if (!data?.token) {
    throw new Error("system-login succeeded but no token was returned");
  }

  return data.token;
}

/**
 * Step 2 — Log a user in using their email/password.
 * Requires the system bearer token in the Authorization header.
 *
 * Returns the user payload on success, or `null` on invalid credentials.
 */
export async function userLogin(
  email: string,
  password: string,
): Promise<ThruxionUser | null> {
  const token = await getSystemToken();

  const res = await fetch(`${BASE_URL}/api/humans/user/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  // Invalid user credentials -> treat as a failed login, not an error.
  if (res.status === 401 || res.status === 403) {
    return null;
  }

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(
      `user/login failed (${res.status} ${res.statusText}): ${detail}`,
    );
  }

  const data = (await res.json().catch(() => ({}))) as
    | ThruxionUser
    | { user?: ThruxionUser };

  // The API may return the user directly or nested under `user`.
  const user = (data as { user?: ThruxionUser })?.user ?? (data as ThruxionUser);
  return user ?? {};
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
