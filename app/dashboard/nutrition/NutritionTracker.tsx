"use client";

import { useEffect, useMemo, useState } from "react";
import { useScrollLock } from "@/lib/use-scroll-lock";
import {
  Egg,
  Soup,
  Pizza,
  Apple,
  Plus,
  Pill,
  Trash2,
  X,
  Minus,
  Barcode,
  Search,
  type LucideIcon,
} from "lucide-react";
import useSWR from "swr";
import { useI18n } from "@/lib/i18n/provider";
import {
  useDayLog,
  type MealType,
  type SupplementType,
  type ActivityType,
  type Meal,
} from "@/lib/day-log/provider";
import { fetchUserSavedFoods } from "@/lib/foods/actions";
import type { Basis, FoodProduct, NutrientValues } from "@/lib/foods/types";
import {
  hasBasis,
  valuesForBasis,
  scaleValues,
  sumValues,
  roundOrUndef,
} from "@/lib/foods/nutrition";
import BarcodeLookup from "./BarcodeLookup";

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ─── Cart helpers (mirrors BarcodeLookup) ─────────────────────────────────────

type CartItem = {
  key: string;
  product: FoodProduct;
  basis: Basis;
  amount: number;
};

let cartSeq = 0;
const defaultAmount = (basis: Basis) => (basis === "serving" ? 1 : 100);
const factorFor = (item: CartItem) =>
  item.basis === "serving" ? item.amount : item.amount / 100;

function scaledValues(item: CartItem): NutrientValues {
  return scaleValues(valuesForBasis(item.product.nutrition, item.basis), factorFor(item));
}

function pickDefaultBasis(p: FoodProduct): Basis {
  return hasBasis(p.nutrition, "serving") ? "serving" : "100g";
}

// ─── Meal-builder modal ───────────────────────────────────────────────────────

type MealBuilderModalProps = {
  mealType: MealType;
  label: string;
  todayKey: string;
  onClose: () => void;
};

function MealBuilderModal({
  mealType,
  label,
  todayKey,
  onClose,
}: MealBuilderModalProps) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const { addMeals } = useDayLog();
  useScrollLock(true);

  // Fetch saved foods live — uses the shared SWR key so it stays in sync with
  // BarcodeLookup and always reflects the latest saved foods without a refresh.
  const { data: savedFoods = [], isLoading: foodsLoading } = useSWR(
    "saved-foods",
    () => fetchUserSavedFoods(),
    { revalidateOnMount: true, revalidateOnFocus: false },
  );

  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");

  // ── cart helpers ────────────────────────────────────────────────────────────

  const toggleCart = (p: FoodProduct) => {
    const exists = cart.find((i) => i.product.barcode === p.barcode);
    if (exists) {
      setCart((prev) => prev.filter((i) => i.product.barcode !== p.barcode));
    } else {
      const basis = pickDefaultBasis(p);
      setCart((prev) => [
        ...prev,
        { key: `m${cartSeq++}`, product: p, basis, amount: defaultAmount(basis) },
      ]);
    }
  };

  const setItemBasis = (key: string, basis: Basis) =>
    setCart((prev) =>
      prev.map((i) =>
        i.key === key ? { ...i, basis, amount: defaultAmount(basis) } : i,
      ),
    );

  const changeAmount = (key: string, delta: number) =>
    setCart((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i;
        const step = i.basis === "serving" ? 0.5 : 10;
        const next = Math.max(step, Math.round((i.amount + delta * step) * 100) / 100);
        return { ...i, amount: next };
      }),
    );

  const setAmount = (key: string, raw: string) =>
    setCart((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i;
        const parsed = parseFloat(raw);
        return { ...i, amount: Number.isNaN(parsed) || parsed <= 0 ? 0 : parsed };
      }),
    );

  const combined = useMemo(() => sumValues(cart.map(scaledValues)), [cart]);

  const mealFromItem = (item: CartItem): Omit<Meal, "id"> => {
    const v = scaledValues(item);
    const base = item.product.brand
      ? `${item.product.name} (${item.product.brand})`
      : item.product.name;
    const qtyLabel =
      item.basis === "serving" ? `${item.amount}×` : `${item.amount}${t.unitG}`;
    return {
      name: `${base} — ${qtyLabel}`,
      calories: roundOrUndef(v.calories) ?? 0,
      type: mealType,
      protein: roundOrUndef(v.protein),
      carbs: roundOrUndef(v.carbs),
      fat: roundOrUndef(v.fat),
      saturatedFat: roundOrUndef(v.saturatedFat),
      sugars: roundOrUndef(v.sugars),
      fiber: roundOrUndef(v.fiber),
      sodium: roundOrUndef(v.sodium == null ? null : v.sodium * 1000),
    };
  };

  const logCart = () => {
    if (!todayKey) return;
    const valid = cart.filter((i) => i.amount > 0);
    if (valid.length === 0) return;
    addMeals(todayKey, valid.map(mealFromItem));
    onClose();
  };

  // ── filtered list ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return savedFoods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.brand ?? "").toLowerCase().includes(q),
    );
  }, [query, savedFoods]);

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg bg-card text-card-foreground rounded-t-3xl shadow-xl max-h-[92dvh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={`${t.addMeal} — ${label}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <h3 className="text-base font-semibold">
            {t.addMeal} — <span className="text-primary">{label}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.common.close}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent active:scale-95 transition"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search bar — fixed below header */}
        <div className="shrink-0 px-5 pt-4 pb-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              className="w-full rounded-xl border border-border bg-background pl-9 pr-10 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.foodSearchHint}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                aria-label={t.clear}
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable food list */}
        <div className="overflow-y-auto flex-1 px-5 pb-3">
          {foodsLoading ? (
            <ul className="divide-y divide-border" aria-busy="true" aria-label="Loading">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 rounded-md bg-muted animate-pulse" />
                    <div className="h-3 w-1/3 rounded-md bg-muted animate-pulse" />
                  </div>
                  <div className="h-6 w-6 rounded-full bg-muted animate-pulse shrink-0" />
                </li>
              ))}
            </ul>
          ) : savedFoods.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t.savedFoodsEmpty}
            </p>
          ) : !query.trim() ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t.foodSearchHint}
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t.noNutritionData}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((food) => {
                const inCart = cart.some((c) => c.product.barcode === food.barcode);
                const cartItem = cart.find((c) => c.product.barcode === food.barcode);
                const v = cartItem
                  ? scaledValues(cartItem)
                  : valuesForBasis(food.nutrition, pickDefaultBasis(food));

                return (
                  <li key={food.barcode}>
                    {/* Main row — tap to toggle */}
                    <button
                      type="button"
                      onClick={() => toggleCart(food)}
                      className="flex w-full items-center gap-3 py-3 text-left hover:bg-accent/50 active:bg-accent transition rounded-lg -mx-1 px-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium leading-tight">
                          {food.name}
                        </div>
                        {food.brand && (
                          <div className="truncate text-xs text-muted-foreground">
                            {food.brand}
                          </div>
                        )}
                      </div>
                      {v.calories != null && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {Math.round(v.calories)} {t.kcal}
                        </span>
                      )}
                      {/* Checkmark / add indicator */}
                      <span
                        className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full border transition ${
                          inCart
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {inCart ? (
                          <span className="text-[11px] font-bold leading-none">✓</span>
                        ) : (
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </span>
                    </button>

                    {/* Portion controls — only visible when in cart */}
                    {inCart && cartItem && (
                      <div className="mb-3 ml-1 flex flex-wrap items-center gap-2">
                        {/* Basis toggle */}
                        {hasBasis(food.nutrition, "serving") && hasBasis(food.nutrition, "100g") && (
                          <div className="inline-flex rounded-lg border border-border p-0.5">
                            <button
                              type="button"
                              onClick={() => setItemBasis(cartItem.key, "serving")}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                                cartItem.basis === "serving"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {t.perServing}
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemBasis(cartItem.key, "100g")}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                                cartItem.basis === "100g"
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {t.unitG}
                            </button>
                          </div>
                        )}

                        {/* Amount stepper */}
                        <div className="inline-flex items-center rounded-lg border border-border overflow-hidden">
                          <button
                            type="button"
                            onClick={() => changeAmount(cartItem.key, -1)}
                            aria-label="-"
                            className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-accent active:scale-95 transition"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={cartItem.amount || ""}
                            onChange={(e) => setAmount(cartItem.key, e.target.value)}
                            className="h-9 w-14 border-x border-border bg-background text-center text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring"
                            aria-label={t.quantity}
                          />
                          <button
                            type="button"
                            onClick={() => changeAmount(cartItem.key, 1)}
                            aria-label="+"
                            className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:bg-accent active:scale-95 transition"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <span className="text-xs text-muted-foreground">
                          {cartItem.basis === "serving" ? t.perServing.toLowerCase() : t.unitG}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer — combined total + log button */}
        {cart.length > 0 && (
          <div className="shrink-0 border-t border-border px-5 py-4 space-y-3">
            {/* Combined total strip */}
            <dl className="grid grid-cols-4 gap-1 text-center">
              <div>
                <dt className="text-[10px] text-muted-foreground">{t.kcal}</dt>
                <dd className="text-sm font-bold tabular-nums text-primary">
                  {combined.calories != null ? Math.round(combined.calories) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">{t.macroProtein}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {combined.protein != null ? combined.protein.toFixed(1) : "—"}{t.unitG}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">{t.macroCarbs}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {combined.carbs != null ? combined.carbs.toFixed(1) : "—"}{t.unitG}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] text-muted-foreground">{t.macroFat}</dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {combined.fat != null ? combined.fat.toFixed(1) : "—"}{t.unitG}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={logCart}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              {t.logToDiet} ({cart.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Supplement modal ─────────────────────────────────────────────────────────

type SupplementModalProps = {
  todayKey: string;
  onClose: () => void;
};

function SupplementModal({ todayKey, onClose }: SupplementModalProps) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const { addSupplement } = useDayLog();
  useScrollLock(true);

  // Live saved-foods list — same shared SWR key, always up to date.
  const { data: savedFoods = [], isLoading: foodsLoading } = useSWR(
    "saved-foods",
    () => fetchUserSavedFoods(),
    { revalidateOnMount: true, revalidateOnFocus: false },
  );

  const [suppName, setSuppName] = useState("");
  const [suppDose, setSuppDose] = useState("");
  const [suppType, setSuppType] = useState<SupplementType>("protein");

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppName.trim() || !todayKey) return;
    addSupplement(todayKey, { name: suppName.trim(), dose: suppDose.trim(), type: suppType });
    onClose();
  };

  const filtered = useMemo(() => {
    const q = suppName.trim().toLowerCase();
    if (!q) return [];
    return savedFoods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.brand ?? "").toLowerCase().includes(q),
    );
  }, [suppName, savedFoods]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md bg-card text-card-foreground rounded-t-3xl shadow-xl max-h-[92dvh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={t.addSupplement}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
          <h3 className="text-base font-semibold">{t.addSupplement}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.common.close}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent active:scale-95 transition"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Search bar */}
        <div className="shrink-0 px-5 pt-4 pb-2">
          <span className="block mb-2 text-xs font-medium text-muted-foreground">{t.supplementName}</span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              className="w-full rounded-xl border border-border bg-background pl-9 pr-10 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring"
              value={suppName}
              onChange={(e) => setSuppName(e.target.value)}
              autoComplete="off"
              placeholder={t.foodSearchHint}
            />
            {suppName && (
              <button
                type="button"
                aria-label={t.clear}
                onClick={() => setSuppName("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable food list */}
        <div className="overflow-y-auto flex-1 px-5 pb-3">
          {foodsLoading ? (
            <ul className="divide-y divide-border" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 rounded-md bg-muted animate-pulse" />
                    <div className="h-3 w-1/3 rounded-md bg-muted animate-pulse" />
                  </div>
                </li>
              ))}
            </ul>
          ) : savedFoods.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t.savedFoodsEmpty}</p>
          ) : !suppName.trim() ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t.foodSearchHint}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t.noNutritionData}</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((food) => (
                <li key={food.barcode}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 py-3 text-left hover:bg-accent/50 active:bg-accent transition rounded-lg -mx-1 px-1"
                    onClick={() => setSuppName(food.name)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-tight">{food.name}</div>
                      {food.brand && (
                        <div className="truncate text-xs text-muted-foreground">{food.brand}</div>
                      )}
                    </div>
                    {suppName.trim().toLowerCase() === food.name.toLowerCase() && (
                      <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full border border-primary bg-primary text-primary-foreground">
                        <span className="text-[11px] font-bold leading-none">✓</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer form — dose, type, submit */}
        <form onSubmit={submit} className="shrink-0 border-t border-border px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t.supplementDose}</span>
              <input
                className={inputClass}
                value={suppDose}
                onChange={(e) => setSuppDose(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t.supplementType}</span>
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
          </div>
          <button
            type="submit"
            disabled={!suppName.trim()}
            className="w-full rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t.add}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function NutritionTracker() {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const ta = dict.caloriesUser;

  const {
    dayData,
    removeMeal,
    removeSupplement,
    addActivity,
    removeActivity,
  } = useDayLog();

  const [todayKey, setTodayKey] = useState<string>("");
  useEffect(() => setTodayKey(toDateKey(new Date())), []);

  const { meals, supplements, activities } = useMemo(
    () =>
      todayKey
        ? dayData(todayKey)
        : { meals: [], supplements: [], activities: [] },
    [dayData, todayKey],
  );

  // Modal state
  const [addType, setAddType] = useState<MealType | null>(null);
  const [suppModalOpen, setSuppModalOpen] = useState(false);

  // Activity form state
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

  const mealChips = (m: (typeof meals)[number]) =>
    [
      { label: t.macroProtein, value: m.protein,  unit: t.unitG },
      { label: t.macroCarbs,   value: m.carbs,    unit: t.unitG },
      { label: t.macroFat,     value: m.fat,      unit: t.unitG },
      { label: t.fiber,        value: m.fiber,    unit: t.unitG },
    ].filter((c) => c.value != null);

  const supplementTypeLabel = (st: SupplementType) =>
    ({ protein: t.suppProtein, vitamin: t.suppVitamin, creatine: t.suppCreatine, omega3: t.suppOmega, other: t.suppOther })[st];

  const activityTypeLabel = (at: ActivityType) =>
    ({ cardio: ta.cardio, strength: ta.strength, walking: ta.walking, sport: ta.sport, other: ta.other })[at];

  const submitActivity = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(actCalories, 10);
    if (!actName.trim() || Number.isNaN(kcal) || kcal <= 0 || !todayKey) return;
    addActivity(todayKey, { name: actName.trim(), calories: kcal, type: actType });
    setActName(""); setActCalories("");
  };

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Barcode scanner — at the top for easy access */}
      <div className="rounded-2xl border border-border bg-card text-card-foreground shadow-sm p-4">
        <BarcodeLookup todayKey={todayKey} embedded />
      </div>

      {/* Diet log */}
      <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">

        <div className="grid grid-cols-5 gap-1.5">
          {mealTypes.map(({ type, label, icon: Icon }) => {
            const total = caloriesFor(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => setAddType(type)}
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

          {/* Supplements */}
          <button
            type="button"
            onClick={() => setSuppModalOpen(true)}
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

      {/* Meal-builder modal (breakfast / lunch / dinner / snack) */}
      {addType && (
        <MealBuilderModal
          mealType={addType}
          label={labelFor(addType)}
          todayKey={todayKey}
          onClose={() => setAddType(null)}
        />
      )}

      {/* Supplement modal */}
      {suppModalOpen && todayKey && (
        <SupplementModal
          todayKey={todayKey}
          onClose={() => setSuppModalOpen(false)}
        />
      )}
    </div>
  );
}
