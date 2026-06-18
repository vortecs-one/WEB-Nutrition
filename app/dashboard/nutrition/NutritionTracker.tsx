"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

type Meal = {
  id: number;
  name: string;
  calories: number;
  type: MealType;
};

const CALORIE_GOAL = 2000;

export default function NutritionTracker() {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const [meals, setMeals] = useState<Meal[]>([]);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [type, setType] = useState<MealType>("breakfast");

  const consumed = useMemo(
    () => meals.reduce((sum, m) => sum + m.calories, 0),
    [meals],
  );
  const remaining = CALORIE_GOAL - consumed;
  const pct = Math.min(100, Math.round((consumed / CALORIE_GOAL) * 100));
  const over = consumed > CALORIE_GOAL;

  const mealTypeLabel = (mt: MealType) =>
    ({
      breakfast: t.breakfast,
      lunch: t.lunch,
      dinner: t.dinner,
      snack: t.snack,
    })[mt];

  const addMeal = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(calories, 10);
    if (!name.trim() || Number.isNaN(kcal) || kcal <= 0) return;
    setMeals((prev) => [
      { id: Date.now(), name: name.trim(), calories: kcal, type },
      ...prev,
    ]);
    setName("");
    setCalories("");
  };

  const removeMeal = (id: number) =>
    setMeals((prev) => prev.filter((m) => m.id !== id));

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* Section header */}
      <div className="bg-primary text-primary-foreground px-5 py-5 rounded-2xl shadow-sm">
        <h1 className="text-xl font-semibold text-balance">{t.title}</h1>
        <p className="text-sm text-primary-foreground/80 mt-0.5">{t.subtitle}</p>
      </div>

      {/* Calorie summary */}
      <section className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-sm">{t.summary}</h2>
          <span className="text-xs text-muted-foreground">{t.today}</span>
        </div>

        {/* Progress bar */}
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              over ? "bg-destructive" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          <div>
            <div className="text-xl font-semibold">{consumed}</div>
            <div className="text-xs text-muted-foreground">
              {t.caloriesConsumed}
            </div>
          </div>
          <div>
            <div className="text-xl font-semibold">{CALORIE_GOAL}</div>
            <div className="text-xs text-muted-foreground">{t.caloriesGoal}</div>
          </div>
          <div>
            <div
              className={`text-xl font-semibold ${
                over ? "text-destructive" : ""
              }`}
            >
              {remaining}
            </div>
            <div className="text-xs text-muted-foreground">
              {t.caloriesRemaining}
            </div>
          </div>
        </div>

        <p
          className={`mt-3 text-xs ${
            over ? "text-destructive" : "text-green-600"
          }`}
        >
          {over ? t.over : t.onTrack}
        </p>
      </section>

      {/* Add meal form */}
      <section className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5">
        <h2 className="font-medium text-sm mb-4">{t.addMeal}</h2>
        <form
          onSubmit={addMeal}
          className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:items-end"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t.mealName}
            </span>
            <input
              className={inputClass}
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
              className={`${inputClass} sm:w-28`}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t.mealType}
            </span>
            <select
              className={`${inputClass} sm:w-36`}
              value={type}
              onChange={(e) => setType(e.target.value as MealType)}
            >
              <option value="breakfast">{t.breakfast}</option>
              <option value="lunch">{t.lunch}</option>
              <option value="dinner">{t.dinner}</option>
              <option value="snack">{t.snack}</option>
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

      {/* Meal list */}
      <section className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm overflow-hidden">
        {meals.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t.noMeals}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {meals.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{m.name}</div>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground mt-1">
                    {mealTypeLabel(m.type)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    {m.calories} kcal
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
    </div>
  );
}
