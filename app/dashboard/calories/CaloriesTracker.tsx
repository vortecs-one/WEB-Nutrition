"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Salad,
  ChevronLeft,
  ChevronRight,
  Plus,
  Droplet,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  useDayLog,
  CONSUMED_GOAL,
  BURNED_GOAL,
  WATER_GOAL_ML,
} from "@/lib/day-log/provider";
import { Modal } from "@/components/ui/modal";
import CalorieGauge from "../nutrition/CalorieGauge";
import NutritionChart from "../nutrition/NutritionChart";
import BarcodeLookup from "../nutrition/BarcodeLookup";
import ActivityLog from "../nutrition/ActivityLog";
import DietLog from "../nutrition/DietLog";
import WaterLog, { NitroBottle } from "./WaterLog";

const GAUGE_RANGE = 1000;

// Derive a stable YYYY-MM-DD key from a Date so both the gauge stats and the
// composition chart always read the same day's data.
function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function CaloriesTracker() {
  const { dict, locale } = useI18n();
  const t = dict.caloriesUser;

  const { consumedFor, burnedFor, waterFor } = useDayLog();

  // Quick-add food popup (barcode / saved foods, same flow as the Log view).
  const [showAddFood, setShowAddFood] = useState(false);
  // Quick-add activity popup (burned-calorie logging, same flow as the Log view).
  const [showAddActivity, setShowAddActivity] = useState(false);
  // Water popup (nitro hydration gauge + quick add).
  const [showAddWater, setShowAddWater] = useState(false);

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
  const waterMl = useMemo(
    () => (dateKey ? waterFor(dateKey) : 0),
    [waterFor, dateKey],
  );

  // Signed calorie balance from the food perspective: eaten minus burned.
  // Negative = deficit (burned more than eaten), positive = surplus. Drives
  // both the needle and the center readout so they always point to the same value.
  const balance = consumed - burned;
  const goalBalance = CONSUMED_GOAL - BURNED_GOAL;

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
      <div className="flex flex-col md:flex-row items-stretch gap-3">
        {/* Hero: date navigator + calorie balance gauge.
            flex-[1.3] : flex-1 gives a ~57/43 split (meter/composition). */}
        <section className="min-w-0 flex-[1.3] flex flex-col bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-3 sm:p-5">
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

          {/* Gauge (left) + quick-add icon column (right), side by side. */}
          <div className="flex flex-row items-center justify-center gap-2 sm:gap-3">

          {/* Gauge with nitro bottles nested in the dial's bottom gap.
              flex-1 + max-w-md keeps this wrapper's width tracking the SVG so the
              bottles (sized in cqi of this @container) stay proportioned. */}
          <div className="relative flex-1 min-w-0 max-w-md @container">
            <CalorieGauge
              value={balance}
              range={GAUGE_RANGE}
              goal={goalBalance}
              label={balance <= 0 ? t.calorieDeficit : t.calorieSurplus}
              goalLabel={t.goalLabel}
              hideLabel
            />
            {/* Nitro bottles — one per completed liter of water drunk today.
                Sized in cqi (fraction of the gauge width) with clamp() min/max
                so they scale down when the gauge is narrow and never overlap
                the center readout, but stay legible on wide screens. */}
            {(() => {
              const bottles = Math.floor(waterMl / 1000);
              const goalBottles = Math.ceil(WATER_GOAL_ML / 1000);
              const slots = Math.min(Math.max(bottles, goalBottles), 6);
              return (
                <div className="absolute inset-x-0 bottom-[3%] flex flex-col items-center gap-[1cqi]">
                  <div className="flex items-center justify-center gap-[1.5cqi]">
                    {Array.from({ length: slots }, (_, i) => (
                      <NitroBottle
                        key={i}
                        variant={i < bottles ? "filled" : "ghost"}
                        className="h-[clamp(1.4rem,11cqi,2.75rem)] w-[clamp(0.95rem,7.4cqi,1.85rem)]"
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-[1.5cqi]">
                    <span className="font-semibold tabular-nums text-[clamp(0.7rem,3.6cqi,0.875rem)]">
                      × {bottles}
                    </span>
                    <span className="text-sidebar-foreground/60 text-[clamp(0.6rem,3.1cqi,0.75rem)]">
                      {bottles === 1 ? dict.hydration.waterLiter : dict.hydration.waterLiters}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Water / Consumed / Burned — quick-add icons stacked vertically,
              to the right of the gauge. */}
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowAddWater(true)}
              aria-label={dict.hydration.title}
              className="flex flex-col items-center gap-2 rounded-2xl p-1.5 sm:p-3 hover:bg-sidebar-accent active:scale-[0.98] transition"
            >
              <span className="relative flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-2xl bg-cyan-500 text-white">
                <Droplet className="h-8 w-8 sm:h-10 sm:w-10 -translate-y-1" />
                <span className="absolute inset-x-0 bottom-1.5 text-center text-[10px] sm:text-xs font-bold text-white leading-none whitespace-nowrap">
                  +{(waterMl / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} {dict.hydration.liters}
                </span>
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddFood(true)}
              aria-label={dict.nutritionUser.barcodeTitle}
              className="flex flex-col items-center gap-2 rounded-2xl p-1.5 sm:p-3 hover:bg-sidebar-accent active:scale-[0.98] transition"
            >
              <span className="relative flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-2xl bg-lime-500 text-white">
                <Salad className="h-8 w-8 sm:h-10 sm:w-10 -translate-y-1" aria-hidden="true" />
                <span className="absolute inset-x-0 bottom-1.5 text-center text-[10px] sm:text-xs font-bold text-white leading-none whitespace-nowrap">
                  +{consumed} {t.kcal}
                </span>
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddActivity(true)}
              aria-label={dict.nutritionUser.activityLog}
              className="flex flex-col items-center gap-2 rounded-2xl p-1.5 sm:p-3 hover:bg-sidebar-accent active:scale-[0.98] transition"
            >
              <span className="relative flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white">
                <Flame className="h-8 w-8 sm:h-10 sm:w-10 -translate-y-1" aria-hidden="true" />
                <span className="absolute inset-x-0 bottom-1.5 text-center text-[10px] sm:text-xs font-bold text-white leading-none whitespace-nowrap">
                  -{burned} {t.kcal}
                </span>
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                </span>
              </span>
            </button>
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

      {/* Water popup — nitro hydration gauge + quick-add for the selected day */}
      <Modal
        isOpen={showAddWater}
        onClose={() => setShowAddWater(false)}
        title={dict.hydration.title}
      >
        {dateKey && <WaterLog todayKey={dateKey} />}
      </Modal>
    </div>
  );
}
