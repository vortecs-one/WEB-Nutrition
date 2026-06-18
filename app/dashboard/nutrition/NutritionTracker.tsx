"use client";

import { useState } from "react";
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
} from "@/lib/day-log/provider";

export default function NutritionTracker() {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const {
    meals,
    addMeal,
    removeMeal,
    supplements,
    addSupplement,
    removeSupplement,
  } = useDayLog();

  // Add-meal modal state.
  const [addType, setAddType] = useState<MealType | null>(null);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");

  // Add-supplement modal state.
  const [suppModalOpen, setSuppModalOpen] = useState(false);
  const [suppName, setSuppName] = useState("");
  const [suppDose, setSuppDose] = useState("");
  const [suppType, setSuppType] = useState<SupplementType>("protein");

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

  const supplementTypeLabel = (st: SupplementType) =>
    ({
      protein: t.suppProtein,
      vitamin: t.suppVitamin,
      creatine: t.suppCreatine,
      omega3: t.suppOmega,
      other: t.suppOther,
    })[st];

  const openAdd = (mt: MealType) => {
    setAddType(mt);
    setName("");
    setCalories("");
  };

  const openSupplementAdd = () => {
    setSuppName("");
    setSuppDose("");
    setSuppType("protein");
    setSuppModalOpen(true);
  };

  const submitMeal = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(calories, 10);
    if (!name.trim() || Number.isNaN(kcal) || kcal <= 0 || !addType) return;
    addMeal({ name: name.trim(), calories: kcal, type: addType });
    setAddType(null);
  };

  const submitSupplement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppName.trim()) return;
    addSupplement({
      name: suppName.trim(),
      dose: suppDose.trim(),
      type: suppType,
    });
    setSuppModalOpen(false);
  };

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-5 py-5 rounded-2xl shadow-sm">
        <h1 className="text-xl font-semibold text-balance">{t.title}</h1>
        <p className="text-sm text-primary-foreground/80 mt-0.5">
          {t.subtitle}
        </p>
      </div>

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
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="flex min-h-8 items-center text-xs font-medium text-center leading-tight">
                  {label}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {total > 0 ? `${total}` : ""}
                </span>
              </button>
            );
          })}

          {/* Supplements: fifth category, same design as meals */}
          <button
            type="button"
            onClick={openSupplementAdd}
            className="flex flex-col items-center gap-2 rounded-2xl p-2 hover:bg-accent active:scale-[0.97] transition"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Pill className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className="flex min-h-8 items-center text-xs font-medium text-center leading-tight">
              {t.supplements}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {supplements.length > 0 ? `${supplements.length}` : ""}
            </span>
          </button>
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

        {/* Logged supplements */}
        {supplements.length > 0 && (
          <ul className="mt-2 divide-y divide-border border-t border-border">
            {supplements.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground mt-1">
                    <Pill className="h-3 w-3" aria-hidden="true" />
                    {supplementTypeLabel(s.type)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.dose && (
                    <span className="text-sm font-medium text-muted-foreground">
                      {s.dose}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeSupplement(s.id)}
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
                  className={inputClass}
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

      {/* Add-supplement modal (same design as add-meal) */}
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
              <button
                type="button"
                onClick={() => setSuppModalOpen(false)}
                aria-label={dict.common.close}
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent active:scale-95 transition"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={submitSupplement} className="space-y-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.supplementName}
                </span>
                <input
                  className={inputClass}
                  value={suppName}
                  onChange={(e) => setSuppName(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.supplementDose}
                </span>
                <input
                  className={inputClass}
                  value={suppDose}
                  onChange={(e) => setSuppDose(e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t.supplementType}
                </span>
                <select
                  className={inputClass}
                  value={suppType}
                  onChange={(e) => setSuppType(e.target.value as SupplementType)}
                >
                  <option value="protein">{t.suppProtein}</option>
                  <option value="vitamin">{t.suppVitamin}</option>
                  <option value="creatine">{t.suppCreatine}</option>
                  <option value="omega3">{t.suppOmega}</option>
                  <option value="other">{t.suppOther}</option>
                </select>
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
