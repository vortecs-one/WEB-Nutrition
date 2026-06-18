"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Salad,
  Egg,
  Soup,
  Pizza,
  Apple,
  Plus,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import CalorieGauge from "./CalorieGauge";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type Meal = {
  id: number;
  name: string;
  calories: number;
  type: MealType;
};

// Daily targets (could later come from the user's profile / Thruxion API).
const CONSUMED_GOAL = 1940;
const BURNED_GOAL = 2383;
// Symmetric dial range in kcal: left = surplus, right = deficit.
const GAUGE_RANGE = 1000;

export default function NutritionTracker() {
  const { dict, locale } = useI18n();
  const t = dict.nutritionUser;

  // Initialized after mount to avoid SSR/client hydration mismatch
  // (new Date() is variable input that can differ between server and client).
  const [date, setDate] = useState<Date | null>(null);
  useEffect(() => setDate(new Date()), []);

  const [meals, setMeals] = useState<Meal[]>([]);
  // Calories burned for the day (linkable to the activities tracker later).
  const [burned] = useState(0);

  // Add-meal modal state.
  const [addType, setAddType] = useState<MealType | null>(null);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");

  const consumed = useMemo(
    () => meals.reduce((sum, m) => sum + m.calories, 0),
    [meals],
  );

  // Positive net = calorie deficit (burned more than eaten).
  const net = burned - consumed;
  const goalNet = BURNED_GOAL - CONSUMED_GOAL;

  const mealTypes: { type: MealType; label: string; icon: LucideIcon }[] = [
    { type: "breakfast", label: t.breakfast, icon: Egg },
    { type: "lunch", label: t.lunch, icon: Soup },
    { type: "dinner", label: t.dinner, icon: Pizza },
    { type: "snack", label: t.extraMeal, icon: Apple },
  ];

  const labelFor = (mt: MealType) =>
    mealTypes.find((m) => m.type === mt)?.label ?? mt;

  const caloriesFor = (mt: MealType) =>
    meals.filter((m) => m.type === mt).reduce((s, m) => s + m.calories, 0);

  const shiftDay = (delta: number) =>
    setDate((d) => {
      const next = new Date(d ?? new Date());
      next.setDate(next.getDate() + delta);
      return next;
    });

  const openAdd = (mt: MealType) => {
    setAddType(mt);
    setName("");
    setCalories("");
  };

  const submitMeal = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(calories, 10);
    if (!name.trim() || Number.isNaN(kcal) || kcal <= 0 || !addType) return;
    setMeals((prev) => [
      { id: Date.now(), name: name.trim(), calories: kcal, type: addType },
      ...prev,
    ]);
    setAddType(null);
  };

  const removeMeal = (id: number) =>
    setMeals((prev) => prev.filter((m) => m.id !== id));

  const dateLabel = date
    ? date.toLocaleDateString(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "\u00A0"; // non-breaking space placeholder before mount

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Hero: date navigator + calorie balance gauge */}
      <section className="bg-sidebar text-sidebar-foreground rounded-3xl shadow-sm p-5">
        {/* Date navigator */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            aria-label={`${dict.common.edit} -1`}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-base font-medium">{dateLabel}</span>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            aria-label={`${dict.common.edit} +1`}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-sidebar-accent active:scale-95 transition"
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

        {/* Burned / consumed stats */}
        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chart-4 text-white shrink-0">
              <Flame className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-sidebar-foreground/70">
                {t.totalBurned}
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {burned}{" "}
                <span className="font-normal text-sidebar-foreground/60">
                  / {BURNED_GOAL.toLocaleString(locale)} {t.kcal}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-chart-2 text-white shrink-0">
              <Salad className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-sidebar-foreground/70">
                {t.totalConsumed}
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {consumed}{" "}
                <span className="font-normal text-sidebar-foreground/60">
                  / {CONSUMED_GOAL.toLocaleString(locale)} {t.kcal}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Diet log */}
      <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
        <h2 className="text-lg font-semibold mb-4">{t.dietLog}</h2>

        <div className="grid grid-cols-4 gap-2">
          {mealTypes.map(({ type, label, icon: Icon }) => {
            const total = caloriesFor(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => openAdd(type)}
                className="flex flex-col items-center gap-2 rounded-2xl p-2 hover:bg-accent active:scale-[0.97] transition"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="text-xs font-medium text-center leading-tight">
                  {label}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {total > 0 ? `${total}` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* Logged meals */}
        {meals.length > 0 && (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {meals.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{m.name}</div>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground mt-1">
                    {labelFor(m.type)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    {m.calories} {t.kcal}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMeal(m.id)}
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

      {/* Add-meal modal */}
      {addType && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setAddType(null)}
          role="presentation"
        >
          <div
            className="w-full sm:max-w-md bg-card text-card-foreground rounded-t-3xl sm:rounded-3xl shadow-lg p-5 pb-safe"
            role="dialog"
            aria-modal="true"
            aria-label={`${t.addMeal} — ${labelFor(addType)}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">
                {t.addMeal} — {labelFor(addType)}
              </h3>
              <button
                type="button"
                onClick={() => setAddType(null)}
                aria-label={dict.common.close}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent active:scale-95 transition"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={submitMeal} className="space-y-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.mealName}
                </span>
                <input
                  className="w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.mealCalories}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                />
              </label>

              <button
                type="submit"
                className="w-full rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition"
              >
                {t.add}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
