"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Salad,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  useDayLog,
  CONSUMED_GOAL,
  BURNED_GOAL,
  type ActivityType,
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

  const {
    dayData,
    consumedFor,
    burnedFor,
    addActivity,
    removeActivity,
  } = useDayLog();

  // Initialized after mount to avoid SSR/client hydration mismatch.
  const [date, setDate] = useState<Date | null>(null);
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
  const activities = useMemo(
    () => (dateKey ? dayData(dateKey).activities : []),
    [dayData, dateKey],
  );

  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [type, setType] = useState<ActivityType>("cardio");

  const net = burned - consumed;
  const goalNet = BURNED_GOAL - CONSUMED_GOAL;

  const activityTypeLabel = (at: ActivityType) =>
    ({ cardio: t.cardio, strength: t.strength, walking: t.walking, sport: t.sport, other: t.other })[at];

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

  const onAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(calories, 10);
    if (!name.trim() || Number.isNaN(kcal) || kcal <= 0 || !dateKey) return;
    addActivity(dateKey, { name: name.trim(), calories: kcal, type });
    setName("");
    setCalories("");
  };

  const dateLabel = date
    ? date.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })
    : "\u00A0";

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Hero: date navigator + calorie balance gauge */}
      <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-5">
        {/* Date navigator */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            aria-label="previous day"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-base font-medium">{dateLabel}</span>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            aria-label="next day"
            disabled={isToday}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Gauge */}
        <div className="mt-1">
          <CalorieGauge
            value={net}
            range={GAUGE_RANGE}
            goal={goalNet}
            label={net >= 0 ? t.calorieDeficit : t.calorieSurplus}
            goalLabel={t.goalLabel}
          />
        </div>

        {/* Consumed (left) / Burned (right) stats */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          {/* Consumed — left */}
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chart-2 text-white shrink-0">
              <Salad className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-sidebar-foreground/70">{t.totalConsumed}</div>
              <div className="text-sm font-semibold tabular-nums">
                {consumed}{" "}
                <span className="font-normal text-sidebar-foreground/60">
                  / {CONSUMED_GOAL.toLocaleString(locale)} {t.kcal}
                </span>
              </div>
            </div>
          </div>
          {/* Burned — right */}
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chart-3 text-white shrink-0">
              <Flame className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-sidebar-foreground/70">{t.totalBurned}</div>
              <div className="text-sm font-semibold tabular-nums">
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
      {dateKey && <NutritionChart dateKey={dateKey} />}

      {/* Add activity form */}
      <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
        <h2 className="font-medium text-sm mb-4">{t.addActivity}</h2>
        <form
          onSubmit={onAddActivity}
          className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:items-end"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t.activityName}</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t.activityCalories}</span>
            <input
              type="number"
              inputMode="numeric"
              className={`${inputClass} sm:w-32`}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t.activityType}</span>
            <select
              className={`${inputClass} sm:w-36`}
              value={type}
              onChange={(e) => setType(e.target.value as ActivityType)}
            >
              <option value="cardio">{t.cardio}</option>
              <option value="strength">{t.strength}</option>
              <option value="walking">{t.walking}</option>
              <option value="sport">{t.sport}</option>
              <option value="other">{t.other}</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition w-full sm:w-auto"
          >
            {t.add}
          </button>
        </form>
      </section>

      {/* Activity list */}
      <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-medium text-sm">{t.activities}</h2>
        </div>
        {activities.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t.noActivities}</p>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.name}</div>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground mt-1">
                    {activityTypeLabel(a.type)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    -{a.calories} {t.kcal ?? "kcal"}
                  </span>
                  <button
                    type="button"
                    onClick={() => dateKey && removeActivity(dateKey, a.id)}
                    aria-label={dict.common.delete}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95 transition"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
