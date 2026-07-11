"use client";

// Activity log: a form to record a burned-calorie activity plus the list of
// the selected day's activities. Embeddable — the calorie dashboard opens it in
// a popup and the Log view renders it inline — so it mirrors BarcodeLookup's
// `embedded` prop convention.

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog, type ActivityType } from "@/lib/day-log/provider";

export default function ActivityLog({
  todayKey,
  embedded = false,
}: {
  todayKey: string;
  // When embedded inside another surface (popup / diet log) drop the outer card
  // chrome so it reads as a sub-section rather than a nested card.
  embedded?: boolean;
}) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const ta = dict.caloriesUser;

  const { dayData, addActivity, removeActivity } = useDayLog();
  const { activities } = todayKey
    ? dayData(todayKey)
    : { activities: [] };

  const [actName, setActName] = useState("");
  const [actCalories, setActCalories] = useState("");
  const [actType, setActType] = useState<ActivityType>("cardio");

  const activityTypeLabel = (at: ActivityType) =>
    ({ cardio: ta.cardio, strength: ta.strength, walking: ta.walking, sport: ta.sport, other: ta.other })[at];

  const submitActivity = (e: FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(actCalories, 10);
    if (!actName.trim() || Number.isNaN(kcal) || kcal <= 0 || !todayKey) return;
    addActivity(todayKey, { name: actName.trim(), calories: kcal, type: actType });
    setActName("");
    setActCalories("");
  };

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  return (
    <section
      className={
        embedded
          ? ""
          : "bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5"
      }
    >
      {!embedded && <h2 className="text-lg font-semibold mb-4">{t.activityLog}</h2>}
      <form
        onSubmit={submitActivity}
        className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:items-end"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{ta.activityName}</span>
          <input className={inputClass} value={actName} onChange={(e) => setActName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{ta.activityCalories}</span>
          <input
            type="number"
            inputMode="numeric"
            className={`${inputClass} sm:w-32`}
            value={actCalories}
            onChange={(e) => setActCalories(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">{ta.activityType}</span>
          <select
            className={`${inputClass} sm:w-36`}
            value={actType}
            onChange={(e) => setActType(e.target.value as ActivityType)}
          >
            <option value="cardio">{ta.cardio}</option>
            <option value="strength">{ta.strength}</option>
            <option value="walking">{ta.walking}</option>
            <option value="sport">{ta.sport}</option>
            <option value="other">{ta.other}</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition w-full sm:w-auto"
        >
          {ta.add}
        </button>
      </form>

      <h3 className="text-sm font-medium mt-6 mb-1">{ta.activities}</h3>
      {activities.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{ta.noActivities}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {activities.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{a.name}</div>
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground mt-1">
                  {activityTypeLabel(a.type)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-semibold tabular-nums">-{a.calories} {ta.kcal}</span>
                <button
                  type="button"
                  onClick={() => todayKey && removeActivity(todayKey, a.id)}
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
  );
}
