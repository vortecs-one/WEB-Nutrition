"use client";

import { useTransition } from "react";
import { locales, localeShortLabels, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";
import { setLocale } from "@/lib/i18n/actions";

type Props = {
  /** "dark" suits dark backgrounds (topbar), "light" suits light pages (login). */
  variant?: "dark" | "light";
  className?: string;
};

export default function LanguageSwitcher({ variant = "dark", className = "" }: Props) {
  const { locale, dict } = useI18n();
  const [isPending, startTransition] = useTransition();

  const onChange = (next: Locale) => {
    if (next === locale) return;
    startTransition(async () => {
      await setLocale(next);
    });
  };

  const base =
    "inline-flex items-center gap-0.5 rounded-full p-0.5 text-xs font-medium border";
  const skin =
    variant === "dark"
      ? "bg-slate-800 border-slate-700"
      : "bg-muted border-border";

  return (
    <div
      className={`${base} ${skin} ${isPending ? "opacity-60" : ""} ${className}`}
      role="group"
      aria-label={dict.common.language}
    >
      {locales.map((code) => {
        const active = code === locale;
        const activeSkin =
          variant === "dark"
            ? "bg-slate-50 text-slate-900"
            : "bg-primary text-primary-foreground";
        const idleSkin =
          variant === "dark"
            ? "text-slate-300 hover:text-white"
            : "text-muted-foreground hover:text-foreground";

        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            disabled={isPending}
            aria-pressed={active}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              active ? activeSkin : idleSkin
            }`}
          >
            {localeShortLabels[code]}
          </button>
        );
      })}
    </div>
  );
}
