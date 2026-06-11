"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";

type I18nContextValue = {
  locale: Locale;
  dict: Dictionary;
};

const I18nContext = createContext<I18nContextValue | null>(null);

// Provider is fed the locale from a Server Component (e.g. root layout),
// so the very first client render already has the correct language.
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({ locale, dict: getDictionary(locale) }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}

// Shorthand to grab just the dictionary.
export function useTranslation(): Dictionary {
  return useI18n().dict;
}
