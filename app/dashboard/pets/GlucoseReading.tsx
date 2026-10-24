"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useGlucoseReading } from "@/lib/glucose/status-provider";
import { TREND_ICON } from "@/lib/glucose/trend-icons";
import { STALE_MINUTES, formatGlucose, minutesAgo, unitLabel } from "@/lib/glucose/types";
import { useI18n } from "@/lib/i18n/provider";

/**
 * The latest glucose reading as a small glass chip over the pet's stage (the
 * popup's top-left corner, like the "Change companion" button in the opposite
 * one): value, trend arrow, unit and how old it is, with the value in the
 * status color. Renders nothing without a reading. Taps pass through to the
 * pet underneath.
 */
export function GlucoseReading() {
  const { dict } = useI18n();
  const reading = useGlucoseReading();
  // Re-render every 30s so "X min ago" stays current between polls.
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const clock = setInterval(() => setClockTick((n) => n + 1), 30_000);
    return () => clearInterval(clock);
  }, []);

  if (!reading) return null;

  const t = dict.glucose;
  const mins = minutesAgo(reading.date);
  const stale = mins > STALE_MINUTES;
  const TrendIcon = TREND_ICON[reading.direction];

  return (
    <div
      data-aura={reading.status}
      className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1 rounded-2xl bg-black/60 px-2.5 py-1.5 text-[color:var(--pet-aura)] backdrop-blur-sm"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-2xl font-bold leading-none tabular-nums">
          {formatGlucose(reading.sgv, reading.unit)}
        </span>
        {TrendIcon && (
          <TrendIcon className="h-6 w-6 shrink-0" strokeWidth={2.75} aria-hidden="true" />
        )}
      </div>
      {/* An old reading is flagged so it never looks live. */}
      <div className="flex items-center gap-0.5 text-[10px] font-medium leading-none text-white/70">
        <span>{unitLabel(reading.unit)}</span>
        <span aria-hidden="true">·</span>
        <span className={`inline-flex items-center gap-0.5 ${stale ? "font-semibold text-white" : ""}`}>
          {stale && <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
          {mins === 0 ? t.justNow : t.lastUpdated.replace("{min}", String(mins))}
        </span>
      </div>
    </div>
  );
}
