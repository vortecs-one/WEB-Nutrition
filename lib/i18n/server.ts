import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { getDictionary } from "./dictionaries";

// Resolves the active locale on every load (server-side).
//
// This is a pure, side-effect-free read of the NEXT_LOCALE cookie. We
// deliberately do NOT call `auth()` here: this function runs in the root
// layout on every request, and reading the NextAuth session during a Server
// Component render can trigger a session-cookie rotation, which is disallowed
// mid-render and can disturb a freshly-established handoff session.
//
// The app-selected language is instead written into NEXT_LOCALE at handoff
// time (see app/auth/handoff/HandoffClient.tsx), so the app's preference is
// honored on every subsequent load while keeping this read cheap and safe.
export async function getCurrentLocale(): Promise<Locale> {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}

// Convenience: get the locale and its dictionary together (server-side).
export async function getServerI18n() {
  const locale = await getCurrentLocale();
  return { locale, dict: getDictionary(locale) };
}
