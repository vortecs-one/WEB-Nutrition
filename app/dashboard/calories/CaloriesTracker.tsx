"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

type ActivityType = "cardio" | "strength" | "walking" | "sport" | "other";

type Activity = {
  id: number;
  name: string;
  calories: number;
  type: ActivityType;
};

// Static demo values; meals come from the nutrition tab in a real backend.
const CONSUMED = 1800;
const CALORIE_GOAL = 2000;

export default function CaloriesTracker() {
  const { dict } = useI18n();
  const t = dict.caloriesUser;

  const [activities, setActivities] = useState<Activity[]>([]);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [type, setType] = useState<ActivityType>("cardio");

  const burned = useMemo(
    () => activities.reduce((sum, a) => sum + a.calories, 0),
    [activities],
  );
  const net = CONSUMED - burned;
  const deficit = net < CALORIE_GOAL;

  const activityTypeLabel = (at: ActivityType) =>
    ({
      cardio: t.cardio,
      strength: t.strength,
      walking: t.walking,
      sport: t.sport,
      other: t.other,
    })[at];

  const addActivity = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(calories, 10);
    if (!name.trim() || Number.isNaN(kcal) || kcal <= 0) return;
    setActivities((prev) => [
      { id: Date.now(), name: name.trim(), calories: kcal, type },
      ...prev,
    ]);
    setName("");
    setCalories("");
  };

  const removeActivity = (id: number) =>
    setActivities((prev) => prev.filter((a) => a.id !== id));

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* Section header */}
      <div className="bg-primary text-primary-foreground px-5 py-5 rounded-2xl shadow-sm">
        <h1 className="text-xl font-semibold text-balance">{t.title}</h1>
        <p className="text-sm text-primary-foreground/80 mt-0.5">{t.subtitle}</p>
      </div>

      {/* Balance summary */}
      <section className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-sm">{t.balance}</h2>
          <span className="text-xs text-muted-foreground">{t.goal}: {CALORIE_GOAL}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xl font-semibold tabular-nums">{CONSUMED}</div>
            <div className="text-xs text-muted-foreground">{t.consumed}</div>
          </div>
          <div>
            <div className="text-xl font-semibold tabular-nums text-primary">
              {burned}
            </div>
            <div className="text-xs text-muted-foreground">{t.burned}</div>
          </div>
          <div>
            <div
              className={`text-xl font-semibold tabular-nums ${
                deficit ? "text-green-600" : "text-destructive"
              }`}
            >
              {net}
            </div>
            <div className="text-xs text-muted-foreground">{t.net}</div>
          </div>
        </div>

        <p
          className={`mt-4 text-xs ${
            deficit ? "text-green-600" : "text-destructive"
          }`}
        >
          {deficit ? t.deficit : t.surplus}
        </p>
      </section>

      {/* Add activity form */}
      <section className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm p-5">
        <h2 className="font-medium text-sm mb-4">{t.addActivity}</h2>
        <form
          onSubmit={addActivity}
          className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:items-end"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t.activityName}
            </span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t.activityCalories}
            </span>
            <input
              type="number"
              inputMode="numeric"
              className={`${inputClass} sm:w-32`}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t.activityType}
            </span>
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
      <section className="bg-card text-card-foreground rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-medium text-sm">{t.activities}</h2>
        </div>
        {activities.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {t.noActivities}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {activities.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.name}</div>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground mt-1">
                    {activityTypeLabel(a.type)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">
                    -{a.calories} kcal
                  </span>
                  <button
                    type="button"
                    onClick={() => removeActivity(a.id)}
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
