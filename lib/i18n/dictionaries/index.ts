import type { Locale } from "../config";
import type { Dictionary } from "./es";
import es from "./es";
import en from "./en";

// Registry of all available dictionaries.
// Add new languages here after creating their dictionary file.
export const dictionaries: Record<Locale, Dictionary> = {
  es,
  en,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.es;
}

export type { Dictionary };
