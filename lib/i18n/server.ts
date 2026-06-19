import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, resolveLocale, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

// The native app advertises the user's selected language on every page load
// through these channels (any/all may be present inside the WebView):
//   - a cookie set before the URL is loaded
//   - a custom request header on the initial request
const APP_LANG_COOKIE = "app_lang";
const APP_LANG_HEADER = "x-app-language";

// Resolves the active locale on every load (server-side).
//
// Priority:
//   1. The app's language for the current load (app_lang cookie, then the
//      x-app-language header). The native app is authoritative inside the
//      WebView and re-asserts the language on every navigation, so this must
//      win to keep the web in sync with the app's selection.
//   2. The NEXT_LOCALE cookie (the in-app web language switcher and regular
//      browser visitors who aren't inside the app).
//   3. The default locale.
//
// This is a pure, side-effect-free read of cookies/headers. We deliberately do
// NOT call `auth()` here: this runs in the root layout on every request, and
// reading the NextAuth session during render can trigger a session-cookie
// rotation, which is disallowed mid-render and can disturb a freshly
// established handoff session.
export async function getCurrentLocale(): Promise<Locale> {
  const store = await cookies();

  // 1a. Cookie set by the native app (best for server-side detection).
  const appCookie = store.get(APP_LANG_COOKIE)?.value;
  if (isLocale(appCookie)) {
    return appCookie;
  }

  // 1b. Custom header sent by the native app on the request.
  const headerStore = await headers();
  const appHeader = headerStore.get(APP_LANG_HEADER)?.split(",")[0]?.trim();
  if (isLocale(appHeader)) {
    return appHeader;
  }

  // 2/3. Web switcher cookie, falling back to the default locale.
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

// Convenience: get the locale and its dictionary together (server-side).
export async function getServerI18n() {
  const locale = await getCurrentLocale();
  return { locale, dict: getDictionary(locale) };
}
