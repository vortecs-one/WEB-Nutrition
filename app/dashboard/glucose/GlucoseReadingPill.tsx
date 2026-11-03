"use client";

// Current-reading pill — big value + trend arrow, tinted by status. The
// compact card shows it plain (value, unit label, arrow). The detail view
// passes `onUnitChange`, which merges the mg/dL | mmol/L switch into the pill
// itself instead of leaving it as a separate control beside it.

import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  type GlucoseStatus,
  type GlucoseUnit,
  type TrendDirection,
  unitLabel,
} from "@/lib/glucose/types";

// Status → card accent classes (background + text pairs kept together for
// contrast, per design guidelines).
const statusCard: Record<GlucoseStatus, string> = {
  "in-range": "bg-lime-400 text-lime-950",
  high: "bg-amber-500 text-amber-950",
  low: "bg-amber-500 text-amber-950",
  urgent: "bg-destructive text-destructive-foreground",
};

export default function GlucoseReadingPill({
  value,
  unit,
  status,
  TrendIcon,
  direction,
  onUnitChange,
  savingUnit = false,
}: {
  /** Already formatted in `unit`, or "--" when there's no reading. */
  value: string;
  unit: GlucoseUnit;
  status: GlucoseStatus;
  TrendIcon: LucideIcon | null;
  direction?: TrendDirection;
  /** When set, the pill carries the unit switch. */
  onUnitChange?: (unit: GlucoseUnit) => void;
  savingUnit?: boolean;
}) {
  const { dict } = useI18n();
  const t = dict.glucose;

  const trend = TrendIcon && (
    <TrendIcon
      className="h-8 w-8 sm:h-10 sm:w-10 shrink-0"
      strokeWidth={2.75}
      role="img"
      aria-label={direction}
    />
  );

  if (!onUnitChange) {
    return (
      <div
        className={`flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 transition-colors ${statusCard[status]}`}
      >
        <div className="flex flex-col items-center leading-none">
          <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">{value}</span>
          <span className="mt-0.5 text-xs sm:text-sm font-bold opacity-90">{unitLabel(unit)}</span>
        </div>
        {trend}
      </div>
    );
  }

  // The switch names the unit, so the label under the number is dropped.
  return (
    <div
      className={`flex shrink-0 flex-col gap-2 rounded-2xl px-3 py-2 transition-colors ${statusCard[status]}`}
    >
      <div className="flex items-center justify-center gap-2">
        <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">{value}</span>
        {trend}
      </div>
      <div
        role="group"
        aria-label={t.unit}
        className="flex rounded-full bg-black/15 p-0.5"
      >
        {(["mgdl", "mmol"] as const).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onUnitChange(u)}
            aria-pressed={unit === u}
            disabled={savingUnit}
            className={`flex-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-60 ${
              unit === u
                ? "bg-purple-600 text-white shadow-sm"
                : "opacity-70 hover:opacity-100"
            }`}
          >
            {u === "mgdl" ? t.unitMgdl : t.unitMmol}
          </button>
        ))}
      </div>
    </div>
  );
}
