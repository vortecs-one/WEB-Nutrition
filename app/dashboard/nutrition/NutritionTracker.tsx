"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Egg,
  Soup,
  Pizza,
  Apple,
  Plus,
  Pill,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import {
  useDayLog,
  type MealType,
  type SupplementType,
  type ActivityType,
} from "@/lib/day-log/provider";
import BarcodeLookup from "./BarcodeLookup";

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function NutritionTracker() {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  // Activity form labels reuse the existing calories-view strings.
  const ta = dict.caloriesUser;

  const {
    dayData,
    addMeal,
    removeMeal,
    addSupplement,
    removeSupplement,
    addActivity,
    removeActivity,
  } = useDayLog();

  // Stable today key — initialized after mount to avoid hydration mismatch.
  const [todayKey, setTodayKey] = useState<string>("");
  useEffect(() => setTodayKey(toDateKey(new Date())), []);

  const { meals, supplements, activities } = useMemo(
    () =>
      todayKey
        ? dayData(todayKey)
        : { meals: [], supplements: [], activities: [] },
    [dayData, todayKey],
  );

  // Add-meal modal state.
  const [addType, setAddType] = useState<MealType | null>(null);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  // Add-supplement modal state.
  const [suppModalOpen, setSuppModalOpen] = useState(false);
  const [suppName, setSuppName] = useState("");
  const [suppDose, setSuppDose] = useState("");
  const [suppType, setSuppType] = useState<SupplementType>("protein");

  // Activity-log form state.
  const [actName, setActName] = useState("");
  const [actCalories, setActCalories] = useState("");
  const [actType, setActType] = useState<ActivityType>("cardio");

  const mealTypes: { type: MealType; label: string; icon: LucideIcon }[] = [
    { type: "breakfast", label: t.breakfast, icon: Egg },
    { type: "lunch",     label: t.lunch,     icon: Soup },
    { type: "dinner",    label: t.dinner,    icon: Pizza },
    { type: "snack",     label: t.extraMeal, icon: Apple },
  ];

  const labelFor = (mt: MealType) =>
    mealTypes.find((m) => m.type === mt)?.label ?? mt;

  const caloriesFor = (mt: MealType) =>
    meals.filter((m) => m.type === mt).reduce((s, m) => s + m.calories, 0);

  // Sum a numeric meal field across today's meals; null if none present.
  const sumField = (key: keyof (typeof meals)[number]) => {
    let any = false;
    let total = 0;
    for (const m of meals) {
      const v = m[key];
      if (typeof v === "number") {
        any = true;
        total += v;
      }
    }
    return any ? total : null;
  };

  // Daily nutrient totals (from logged meals). Sodium is stored in mg.
  const dailyNutrients = useMemo(
    () => [
      { label: t.macroProtein, value: sumField("protein"), unit: t.unitG },
      { label: t.macroCarbs, value: sumField("carbs"), unit: t.unitG },
      { label: t.macroFat, value: sumField("fat"), unit: t.unitG },
      { label: t.satFat, value: sumField("saturatedFat"), unit: t.unitG },
      { label: t.sugars, value: sumField("sugars"), unit: t.unitG },
      { label: t.fiber, value: sumField("fiber"), unit: t.unitG },
      { label: t.sodium, value: sumField("sodium"), unit: t.unitMg },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meals, t],
  );

  const hasDailyNutrients = dailyNutrients.some((n) => n.value != null);

  // Compact macro chips for a single logged meal.
  const mealChips = (m: (typeof meals)[number]) =>
    [
      { label: t.macroProtein, value: m.protein, unit: t.unitG },
      { label: t.macroCarbs, value: m.carbs, unit: t.unitG },
      { label: t.macroFat, value: m.fat, unit: t.unitG },
      { label: t.fiber, value: m.fiber, unit: t.unitG },
    ].filter((c) => c.value != null);

  const supplementTypeLabel = (st: SupplementType) =>
    ({
      protein:  t.suppProtein,
      vitamin:  t.suppVitamin,
      creatine: t.suppCreatine,
      omega3:   t.suppOmega,
      other:    t.suppOther,
    })[st];

  const activityTypeLabel = (at: ActivityType) =>
    ({ cardio: ta.cardio, strength: ta.strength, walking: ta.walking, sport: ta.sport, other: ta.other })[at];

  const openAdd = (mt: MealType) => {
    setAddType(mt);
    setName(""); setCalories(""); setProtein(""); setCarbs(""); setFat("");
  };

  const parseMacro = (v: string) => {
    const n = parseInt(v, 10);
    return !Number.isNaN(n) && n > 0 ? n : undefined;
  };

  const openSupplementAdd = () => {
    setSuppName(""); setSuppDose(""); setSuppType("protein");
    setSuppModalOpen(true);
  };

  const submitMeal = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(calories, 10);
    if (!name.trim() || Number.isNaN(kcal) || kcal <= 0 || !addType || !todayKey) return;
    addMeal(todayKey, {
      name: name.trim(), calories: kcal, type: addType,
      protein: parseMacro(protein), carbs: parseMacro(carbs), fat: parseMacro(fat),
    });
    setAddType(null);
  };

  const submitSupplement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppName.trim() || !todayKey) return;
    addSupplement(todayKey, { name: suppName.trim(), dose: suppDose.trim(), type: suppType });
    setSuppModalOpen(false);
  };

  const submitActivity = (e: React.FormEvent) => {
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
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Add food by barcode (Thruxion foods API) */}
      <BarcodeLookup todayKey={todayKey} />

      {/* Diet log */}
      <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
        <h2 className="text-lg font-semibold mb-4">{t.dietLog}</h2>

        <div className="grid grid-cols-5 gap-1.5">
          {mealTypes.map(({ type, label, icon: Icon }) => {
            const total = caloriesFor(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => openAdd(type)}
                className="flex flex-col items-center gap-2 rounded-2xl p-2 hover:bg-accent active:scale-[0.97] transition"
              >
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Icon className="h-7 w-7" aria-hidden="true" />
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    {total > 0
                      ? <span className="text-[10px] font-bold leading-none">{total}</span>
                      : <Plus className="h-3 w-3" aria-hidden="true" />}
                  </span>
                </span>
                <span className="flex min-h-8 items-center text-xs font-medium text-center leading-tight">
                  {label}
                </span>
              </button>
            );
          })}

          {/* Supplements — fifth icon, same design */}
          <button
            type="button"
            onClick={openSupplementAdd}
            className="flex flex-col items-center gap-2 rounded-2xl p-2 hover:bg-accent active:scale-[0.97] transition"
          >
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Pill className="h-7 w-7" aria-hidden="true" />
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                {supplements.length > 0
                  ? <span className="text-[10px] font-bold leading-none">{supplements.length}</span>
                  : <Plus className="h-3 w-3" aria-hidden="true" />}
              </span>
            </span>
            <span className="flex min-h-8 items-center text-xs font-medium text-center leading-tight">
              {t.supplements}
            </span>
          </button>
        </div>

        {/* Logged meals */}
        {meals.length > 0 && (
          <ul className="mt-4 divide-y divide-border border-t border-border">
            {meals.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{m.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {labelFor(m.type)}
                    </span>
                    {mealChips(m).map((c) => (
                      <span
                        key={c.label}
                        className="inline-flex items-center gap-1 rounded-full bg-accent/60 px-2 py-0.5 text-[11px] font-medium text-accent-foreground"
                      >
                        {c.value}{c.unit} {c.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums">{m.calories} {t.kcal}</span>
                  <button
                    type="button"
                    onClick={() => todayKey && removeMeal(todayKey, m.id)}
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

        {/* Logged supplements */}
        {supplements.length > 0 && (
          <ul className="mt-2 divide-y divide-border border-t border-border">
            {supplements.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground mt-1">
                    <Pill className="h-3 w-3" aria-hidden="true" />
                    {supplementTypeLabel(s.type)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.dose && <span className="text-sm font-medium text-muted-foreground">{s.dose}</span>}
                  <button
                    type="button"
                    onClick={() => todayKey && removeSupplement(todayKey, s.id)}
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

      {/* Daily nutrient totals from logged meals */}
      <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
        <h2 className="text-lg font-semibold">{t.dailyNutrients}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.dailyNutrientsHint}</p>
        {hasDailyNutrients ? (
          <dl className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {dailyNutrients
              .filter((n) => n.value != null)
              .map((n) => (
                <div key={n.label} className="rounded-2xl bg-muted p-3 text-center">
                  <dt className="text-[11px] font-medium text-muted-foreground">{n.label}</dt>
                  <dd className="mt-1 text-base font-bold tabular-nums">
                    {Math.round(n.value as number)}
                    <span className="ml-0.5 text-xs font-medium text-muted-foreground">{n.unit}</span>
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t.noDailyNutrients}</p>
        )}
      </section>

      {/* Activity log */}
      <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
        <h2 className="text-lg font-semibold mb-4">{t.activityLog}</h2>
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

        {/* Today's activities */}
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
                  <span className="text-sm font-semibold tabular-nums">
                    -{a.calories} {ta.kcal}
                  </span>
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
              <h3 className="text-base font-semibold">{t.addMeal} — {labelFor(addType)}</h3>
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
                <span className="text-xs font-medium text-muted-foreground">{t.mealName}</span>
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t.mealCalories}</span>
                <input type="number" inputMode="numeric" className={inputClass} value={calories} onChange={(e) => setCalories(e.target.value)} />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t.proteinG}</span>
                  <input type="number" inputMode="numeric" className={inputClass} value={protein} onChange={(e) => setProtein(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t.carbsG}</span>
                  <input type="number" inputMode="numeric" className={inputClass} value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t.fatG}</span>
                  <input type="number" inputMode="numeric" className={inputClass} value={fat} onChange={(e) => setFat(e.target.value)} />
                </label>
              </div>
              <button type="submit" className="w-full rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition">
                {t.add}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add-supplement modal */}
      {suppModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setSuppModalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full sm:max-w-md bg-card text-card-foreground rounded-t-3xl sm:rounded-3xl shadow-lg p-5 pb-safe"
            role="dialog"
            aria-modal="true"
            aria-label={t.addSupplement}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">{t.addSupplement}</h3>
              <button type="button" onClick={() => setSuppModalOpen(false)} aria-label={dict.common.close} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent active:scale-95 transition">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={submitSupplement} className="space-y-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t.supplementName}</span>
                <input className={inputClass} value={suppName} onChange={(e) => setSuppName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t.supplementDose}</span>
                <input className={inputClass} value={suppDose} onChange={(e) => setSuppDose(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t.supplementType}</span>
                <select className={inputClass} value={suppType} onChange={(e) => setSuppType(e.target.value as SupplementType)}>
                  <option value="protein">{t.suppProtein}</option>
                  <option value="vitamin">{t.suppVitamin}</option>
                  <option value="creatine">{t.suppCreatine}</option>
                  <option value="omega3">{t.suppOmega}</option>
                  <option value="other">{t.suppOther}</option>
                </select>
              </label>
              <button type="submit" className="w-full rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition">
                {t.add}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
