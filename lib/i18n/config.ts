// Central i18n configuration.
// To add a new language in the future:
//   1. Add its code + label here.
//   2. Create a matching dictionary file in lib/i18n/dictionaries/<code>.ts
//   3. Register it in lib/i18n/dictionaries/index.ts
// Everything else (switcher, cookie, provider) picks it up automatically.

export const locales = ["es", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "es";

// Human-readable labels shown in the language switcher.
export const localeLabels: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

// Short flag/badge text shown in compact switchers.
export const localeShortLabels: Record<Locale, string> = {
  es: "ES",
  en: "EN",
};

export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale;
}
