"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, resolveLocale } from "./config";

// Server Action: persist the chosen locale in a cookie for 1 year.
export async function setLocale(value: string) {
  const locale = resolveLocale(value);
  const store = await cookies();

  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Re-render server components with the new language.
  revalidatePath("/", "layout");
}
