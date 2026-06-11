"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ROLE_COOKIE, resolveRole } from "./config";

// Server Action: persist the chosen test role in a cookie.
// TEST ONLY — in production the role comes from the authenticated session.
export async function setRole(value: string) {
  const role = resolveRole(value);
  const store = await cookies();

  store.set(ROLE_COOKIE, role, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Re-render server components with the new role.
  revalidatePath("/", "layout");
}
