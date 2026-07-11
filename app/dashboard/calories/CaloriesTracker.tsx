"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Salad,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  useDayLog,
  CONSUMED_GOAL,
  BURNED_GOAL,
} from "@/lib/day-log/provider";
import { Modal } from "@/components/ui/modal";
import CalorieGauge from "../nutrition/CalorieGauge";
import NutritionChart from "../nutrition/NutritionChart";
import BarcodeLookup from "../nutrition/BarcodeLookup";
import ActivityLog from "../nutrition/ActivityLog";
import DietLog from "../nutrition/DietLog";

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

  // Quick-add food popup (barcode / saved foods, same flow as the Log view).
  const [showAddFood, setShowAddFood] = useState(false);
  // Quick-add activity popup (burned-calorie logging, same flow as the Log view).
  const [showAddActivity, setShowAddActivity] = useState(false);

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

          {/* Consumed / Burned — two big tappable icons with their totals below */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={() => setShowAddFood(true)}
              aria-label={dict.nutritionUser.barcodeTitle}
              className="flex flex-col items-center gap-2 rounded-2xl p-1.5 sm:p-3 hover:bg-sidebar-accent active:scale-[0.98] transition"
            >
              <span className="relative flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-full bg-chart-2 text-white">
                <Salad className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden="true" />
                <span className="absolute -top-1 -right-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                </span>
              </span>
              <div className="text-center leading-tight">
                <div className="text-base sm:text-lg font-semibold tabular-nums">{consumed}</div>
                <div className="text-[11px] sm:text-xs text-sidebar-foreground/60 tabular-nums">
                  / {CONSUMED_GOAL.toLocaleString(locale)} {t.kcal}
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowAddActivity(true)}
              aria-label={dict.nutritionUser.activityLog}
              className="flex flex-col items-center gap-2 rounded-2xl p-1.5 sm:p-3 hover:bg-sidebar-accent active:scale-[0.98] transition"
            >
              <span className="relative flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-full bg-chart-3 text-white">
                <Flame className="h-6 w-6 sm:h-8 sm:w-8" aria-hidden="true" />
                <span className="absolute -top-1 -right-1 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />
                </span>
              </span>
              <div className="text-center leading-tight">
                <div className="text-base sm:text-lg font-semibold tabular-nums">{burned}</div>
                <div className="text-[11px] sm:text-xs text-sidebar-foreground/60 tabular-nums">
                  / {BURNED_GOAL.toLocaleString(locale)} {t.kcal}
                </div>
              </div>
            </button>
          </div>
        </section>

        {/* Nutrient composition chart — driven by the same date key as the gauge */}
        {dateKey && (
          <div className="min-w-0 flex-1">
            <NutritionChart dateKey={dateKey} />
          </div>
        )}
      </div>

      {/* Quick-add food popup — barcode lookup + meal/supplement quick-add */}
      <Modal
        isOpen={showAddFood}
        onClose={() => setShowAddFood(false)}
        title={dict.nutritionUser.barcodeTitle}
      >
        {dateKey && (
          <div className="space-y-5">
            <BarcodeLookup todayKey={dateKey} embedded />
            {/* Diet log — meal and supplement quick-add, below the scanner */}
            <DietLog todayKey={dateKey} />
          </div>
        )}
      </Modal>

      {/* Quick-add activity popup — logs burned calories for the selected day */}
      <Modal
        isOpen={showAddActivity}
        onClose={() => setShowAddActivity(false)}
        title={dict.nutritionUser.activityLog}
      >
        {dateKey && <ActivityLog todayKey={dateKey} embedded />}
      </Modal>
    </div>
  );
}
