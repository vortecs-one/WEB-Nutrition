import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

// Reads the current locale from the cookie (server-side).
export async function getCurrentLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

// Convenience: get the locale and its dictionary together (server-side).
export async function getServerI18n() {
  const locale = await getCurrentLocale();
  return { locale, dict: getDictionary(locale) };
}
