"use client";

// Small pieces shared by the calorie views that show the energy budget
// (lib/energy/use-energy-budget.ts): the "complete your profile" prompt and
// breakdown rows whose formula opens under an info button.

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Info, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { MissingBodyField } from "@/lib/energy/use-energy-budget";

/** Signed kcal: "+120", "−340" (true minus sign), "0". */
export function signedKcal(n: number, locale: string): string {
  const abs = Math.abs(Math.round(n)).toLocaleString(locale);
  return n > 0.5 ? `+${abs}` : n < -0.5 ? `−${abs}` : "0";
}

/** Shown while the body profile misses data the formulas need. */
export function ProfilePrompt({ missing }: { missing: MissingBodyField[] }) {
  const { dict, locale } = useI18n();
  const t = dict.energy;
  if (missing.length === 0) return null;
  const names: Record<MissingBodyField, string> = {
    sex: t.missingSex,
    birthDate: t.missingBirthDate,
    height: t.missingHeight,
    weight: t.missingWeight,
  };
  const list = new Intl.ListFormat(locale, { type: "conjunction" }).format(missing.map((m) => names[m]));
  return (
    <Link
      href="/dashboard/profile"
      className="flex items-center gap-3 rounded-2xl border border-highlight/30 bg-highlight/10 p-3 text-sm transition hover:bg-highlight/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
    >
      <UserRound className="h-5 w-5 shrink-0 text-highlight" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t.completeTitle}</span>
        <span className="block text-xs opacity-70">{t.completeBody.replace("{missing}", list)}</span>
      </span>
      <span className="sr-only">{t.goToProfile}</span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
    </Link>
  );
}

/**
 * One line of a breakdown. With `info`, an info button beside the label
 * shows how the value is calculated, right under the row.
 */
export function FormulaRow({
  label,
  value,
  info,
  strong = false,
  valueClassName = "",
}: {
  label: string;
  value: ReactNode;
  info?: ReactNode;
  strong?: boolean;
  valueClassName?: string;
}) {
  const { dict } = useI18n();
  const [open, setOpen] = useState(false);
  const infoId = useId();
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-sm">
        <span className={`min-w-0 truncate ${strong ? "font-semibold" : "opacity-70"}`}>{label}</span>
        {info && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={infoId}
            aria-label={`${dict.energy.howCalculated}: ${label}`}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight ${
              open ? "text-highlight" : "opacity-50"
            }`}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <span
          className={`ml-auto shrink-0 tabular-nums ${strong ? "font-bold" : "font-semibold"} ${valueClassName}`}
        >
          {value}
        </span>
      </div>
      {info && open && (
        <p id={infoId} className="rounded-lg bg-current/5 px-2.5 py-1.5 text-xs leading-relaxed opacity-70">
          {info}
        </p>
      )}
    </li>
  );
}
