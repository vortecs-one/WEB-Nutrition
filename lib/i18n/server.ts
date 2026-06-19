import { cookies } from "next/headers";
import { auth } from "@/auth";
import { LOCALE_COOKIE, isLocale, resolveLocale, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

// Resolves the active locale on every load (server-side).
//
// Priority:
//   1. The locale carried in the signed session. For users handed off from
//      the native app, this is the language they selected in the app. It's
//      validated at issue time and stored in the JWT, so it can't be tampered
//      with from the client and is re-applied on every page load.
//   2. The NEXT_LOCALE cookie (used by the in-app language switcher and by
//      regular web visitors who don't have an app-selected language).
//   3. The default locale.
export async function getCurrentLocale(): Promise<Locale> {
  // Session locale wins so the app's selection is honored on each load.
  try {
    const session = await auth();
    const sessionLocale = (session?.user as { locale?: string } | undefined)
      ?.locale;
    if (isLocale(sessionLocale)) {
      return sessionLocale;
    }
  } catch {
    // If the session can't be read, fall back to the cookie below.
  }

  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

// Convenience: get the locale and its dictionary together (server-side).
export async function getServerI18n() {
  const locale = await getCurrentLocale();
  return { locale, dict: getDictionary(locale) };
}
