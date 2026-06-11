import { cookies } from "next/headers";
import { ROLE_COOKIE, resolveRole, type Role } from "./config";

// Reads the current role from the cookie (server-side).
//
// NOTE: this is a TEST mechanism so we can preview both experiences.
// Later, replace the cookie read with the role coming from the
// authenticated session (e.g. session.user.role from the Thruxion API).
export async function getCurrentRole(): Promise<Role> {
  const store = await cookies();
  return resolveRole(store.get(ROLE_COOKIE)?.value);
}
