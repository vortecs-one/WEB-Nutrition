"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Salad,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  useDayLog,
  CONSUMED_GOAL,
  BURNED_GOAL,
} from "@/lib/day-log/provider";
import CalorieGauge from "../nutrition/CalorieGauge";
import NutritionChart from "../nutrition/NutritionChart";

const GAUGE_RANGE = 1000;

// Derive a stable YYYY-MM-DD key from a Date so both the gauge stats and the
// composition chart always read the same day's data.
function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function CaloriesTracker() {
  const { dict, locale } = useI18n();
  const t = dict.caloriesUser;

  const { consumedFor, burnedFor } = useDayLog();

  // Initialized after mount to avoid SSR/client hydration mismatch.
  const [date, setDate] = useState<Date | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only init to avoid SSR/hydration mismatch
  useEffect(() => setDate(new Date()), []);

  const dateKey = useMemo(
    () => (date ? toDateKey(date) : ""),
    [date],
  );

  const consumed = useMemo(
    () => (dateKey ? consumedFor(dateKey) : 0),
    [consumedFor, dateKey],
  );
  const burned = useMemo(
    () => (dateKey ? burnedFor(dateKey) : 0),
    [burnedFor, dateKey],
  );

  const net = burned - consumed;
  const goalNet = BURNED_GOAL - CONSUMED_GOAL;

  // Today's date key — used to cap forward navigation.
  const [todayKey] = useState(() => toDateKey(new Date()));
  const isToday = dateKey === todayKey;

  const shiftDay = (delta: number) =>
    setDate((d) => {
      const next = new Date(d ?? new Date());
      next.setDate(next.getDate() + delta);
      // Never allow navigating past today.
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (next > today) return d ?? new Date();
      return next;
    });

  const dateLabel = date
    ? date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })
    : "\u00A0";

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-row items-start gap-3">
        {/* Hero: date navigator + calorie balance gauge */}
        <section className="min-w-0 flex-1 bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-3 sm:p-5">
          {/* Date navigator */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftDay(-1)}
              aria-label="previous day"
              className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition shrink-0"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
            <span className="text-xs sm:text-base font-medium text-center truncate px-1">
              {dateLabel}
            </span>
            <button
              type="button"
              onClick={() => shiftDay(1)}
              aria-label="next day"
              disabled={isToday}
              className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none shrink-0"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </button>
          </div>

          {/* Gauge */}
          <div className="mt-0">
            <CalorieGauge
              value={net}
              range={GAUGE_RANGE}
              goal={goalNet}
              label={net >= 0 ? t.calorieDeficit : t.calorieSurplus}
              goalLabel={t.goalLabel}
            />
          </div>

          {/* Consumed / Burned stats — stacked so each stays legible at half width */}
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-chart-2 text-white shrink-0">
                <Salad className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] sm:text-xs text-sidebar-foreground/70">{t.totalConsumed}</div>
                <div className="text-xs sm:text-sm font-semibold tabular-nums truncate">
                  {consumed}{" "}
                  <span className="font-normal text-sidebar-foreground/60">
                    / {CONSUMED_GOAL.toLocaleString(locale)} {t.kcal}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-chart-3 text-white shrink-0">
                <Flame className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] sm:text-xs text-sidebar-foreground/70">{t.totalBurned}</div>
                <div className="text-xs sm:text-sm font-semibold tabular-nums truncate">
                  {burned}{" "}
                  <span className="font-normal text-sidebar-foreground/60">
                    / {BURNED_GOAL.toLocaleString(locale)} {t.kcal}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Nutrient composition chart — driven by the same date key as the gauge */}
        {dateKey && (
          <div className="min-w-0 flex-1">
            <NutritionChart dateKey={dateKey} />
          </div>
        )}
      </div>
    </div>
  );
}
