"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
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

// ─── Saved-food autocomplete input ───────────────────────────────────────────

type FoodAutocompleteProps = {
  value: string;
  onChange: (v: string) => void;
  onSelect: (food: FoodProduct) => void;
  savedFoods: FoodProduct[];
  placeholder?: string;
  inputClass: string;
};

function FoodAutocomplete({
  value,
  onChange,
  onSelect,
  savedFoods,
  placeholder,
  inputClass,
}: FoodAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return savedFoods.slice(0, 8);
    const q = value.toLowerCase();
    return savedFoods
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          (f.brand ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [value, savedFoods]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={inputClass}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {filtered.map((food) => (
            <li key={food.barcode}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent active:bg-accent/70 transition"
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur from closing before click
                  onSelect(food);
                  setOpen(false);
                }}
              >
                {food.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={food.image}
                    alt={food.name}
                    className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover bg-muted"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                    <Barcode className="h-4 w-4" aria-hidden="true" />
                  </div>
                )}
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
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Meal-builder modal ───────────────────────────────────────────────────────

type MealBuilderModalProps = {
  mealType: MealType;
  label: string;
  todayKey: string;
  onClose: () => void;
  savedFoods: FoodProduct[];
};

function MealBuilderModal({
  mealType,
  label,
  todayKey,
  onClose,
  savedFoods,
}: MealBuilderModalProps) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const { addMeal, addMeals } = useDayLog();

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // Manual-entry form state
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  // Whether manual form is expanded
  const [manualOpen, setManualOpen] = useState(false);

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  const fmt0 = (v: number | null) => (v == null ? "—" : `${Math.round(v)}`);
  const fmt1 = (v: number | null) =>
    v == null ? "—" : v.toFixed(1);

  // Cart mutations
  const addToCart = (p: FoodProduct) => {
    const basis = pickDefaultBasis(p);
    setCart((prev) => [
      ...prev,
      { key: `m${cartSeq++}`, product: p, basis, amount: defaultAmount(basis) },
    ]);
  };

  const removeCartItem = (key: string) =>
    setCart((prev) => prev.filter((i) => i.key !== key));

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
        const min = step;
        const next = Math.max(min, Math.round((i.amount + delta * step) * 100) / 100);
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

  // Build a Meal from a cart item
  const mealFromItem = (item: CartItem): Omit<Meal, "id"> => {
    const v = scaledValues(item);
    const base = item.product.brand
      ? `${item.product.name} (${item.product.brand})`
      : item.product.name;
    const qtyLabel =
      item.basis === "serving"
        ? `${item.amount}×`
        : `${item.amount}${t.unitG}`;
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

  const parseMacro = (v: string) => {
    const n = parseInt(v, 10);
    return !Number.isNaN(n) && n > 0 ? n : undefined;
  };

  const logCart = () => {
    if (!todayKey) return;
    const valid = cart.filter((i) => i.amount > 0);
    if (valid.length === 0) return;
    addMeals(todayKey, valid.map(mealFromItem));
    onClose();
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const kcal = parseInt(calories, 10);
    if (!name.trim() || Number.isNaN(kcal) || kcal <= 0 || !todayKey) return;
    addMeal(todayKey, {
      name: name.trim(),
      calories: kcal,
      type: mealType,
      protein: parseMacro(protein),
      carbs: parseMacro(carbs),
      fat: parseMacro(fat),
    });
    onClose();
  };

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

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Saved-foods quick-add */}
          {savedFoods.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.savedFoods}
              </h4>
              <ul className="space-y-2">
                {savedFoods.map((food) => {
                  const basis = hasBasis(food.nutrition, "serving") ? "serving" : "100g";
                  const v = valuesForBasis(food.nutrition, basis);
                  const inCart = cart.some((c) => c.product.barcode === food.barcode);
                  return (
                    <li
                      key={food.barcode}
                      className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"
                    >
                      {food.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={food.image}
                          alt={food.name}
                          className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover bg-muted"
                        />
                      ) : (
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                          <Barcode className="h-5 w-5" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium leading-tight">{food.name}</div>
                        {food.brand && (
                          <div className="truncate text-xs text-muted-foreground">{food.brand}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.calories != null && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                              {Math.round(v.calories)} {t.kcal}
                            </span>
                          )}
                          {v.protein != null && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                              {v.protein.toFixed(1)}{t.unitG} {t.macroProtein}
                            </span>
                          )}
                          {v.carbs != null && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                              {v.carbs.toFixed(1)}{t.unitG} {t.macroCarbs}
                            </span>
                          )}
                          {v.fat != null && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                              {v.fat.toFixed(1)}{t.unitG} {t.macroFat}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => (inCart ? undefined : addToCart(food))}
                        disabled={inCart}
                        aria-label={`${t.addToMeal}: ${food.name}`}
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition active:scale-95 ${
                          inCart
                            ? "bg-primary text-primary-foreground cursor-default"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                        }`}
                      >
                        {inCart ? (
                          <span className="text-lg font-bold leading-none">✓</span>
                        ) : (
                          <Plus className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Cart */}
          {cart.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.mealBuilder}
                  <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary normal-case tracking-normal">
                    {cart.length} {t.itemsCount}
                  </span>
                </h4>
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-medium text-muted-foreground hover:text-destructive transition"
                >
                  {t.clear}
                </button>
              </div>

              <ul className="space-y-2">
                {cart.map((item) => {
                  const v = scaledValues(item);
                  const showBasisToggle =
                    hasBasis(item.product.nutrition, "serving") &&
                    hasBasis(item.product.nutrition, "100g");
                  return (
                    <li key={item.key} className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium leading-tight">{item.product.name}</div>
                          {item.product.brand && (
                            <div className="truncate text-xs text-muted-foreground">{item.product.brand}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.key)}
                          aria-label={dict.common.delete}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95 transition"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {showBasisToggle && (
                          <div className="inline-flex rounded-lg border border-border p-0.5">
                            <button
                              type="button"
                              onClick={() => setItemBasis(item.key, "serving")}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${item.basis === "serving" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                            >
                              {t.perServing}
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemBasis(item.key, "100g")}
                              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${item.basis === "100g" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                            >
                              {t.unitG}
                            </button>
                          </div>
                        )}

                        {/* Amount stepper */}
                        <div className="inline-flex items-center rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => changeAmount(item.key, -1)}
                            aria-label="-"
                            className="flex h-10 w-10 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-accent active:scale-95 transition"
                          >
                            <Minus className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={item.amount || ""}
                            onChange={(e) => setAmount(item.key, e.target.value)}
                            className="h-10 w-14 border-x border-border bg-background text-center text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring"
                            aria-label={t.quantity}
                          />
                          <button
                            type="button"
                            onClick={() => changeAmount(item.key, 1)}
                            aria-label="+"
                            className="flex h-10 w-10 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-accent active:scale-95 transition"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {item.basis === "serving" ? t.perServing.toLowerCase() : t.unitG}
                        </span>
                        <span className="ml-auto text-sm font-semibold tabular-nums">
                          {fmt0(v.calories)} {t.kcal}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Combined total */}
              <div className="mt-2 rounded-xl bg-muted p-3">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{t.combinedTotal}</div>
                <dl className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">{t.kcal}</dt>
                    <dd className="text-sm font-bold tabular-nums text-primary">{fmt0(combined.calories)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">{t.macroProtein}</dt>
                    <dd className="text-sm font-semibold tabular-nums">{fmt1(combined.protein)}{t.unitG}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">{t.macroCarbs}</dt>
                    <dd className="text-sm font-semibold tabular-nums">{fmt1(combined.carbs)}{t.unitG}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">{t.macroFat}</dt>
                    <dd className="text-sm font-semibold tabular-nums">{fmt1(combined.fat)}{t.unitG}</dd>
                  </div>
                </dl>
              </div>
            </section>
          )}

          {/* Manual entry (collapsible) */}
          <section>
            <button
              type="button"
              onClick={() => setManualOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-accent transition"
            >
              <span>{t.mealName} — {dict.common.save} manual</span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${manualOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {manualOpen && (
              <form onSubmit={submitManual} className="mt-3 space-y-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t.mealName}</span>
                  <FoodAutocomplete
                    value={name}
                    onChange={setName}
                    onSelect={(food) => {
                      setName(food.name);
                      const v = valuesForBasis(
                        food.nutrition,
                        hasBasis(food.nutrition, "serving") ? "serving" : "100g",
                      );
                      if (v.calories != null) setCalories(String(Math.round(v.calories)));
                      if (v.protein != null) setProtein(String(Math.round(v.protein)));
                      if (v.carbs != null) setCarbs(String(Math.round(v.carbs)));
                      if (v.fat != null) setFat(String(Math.round(v.fat)));
                    }}
                    savedFoods={savedFoods}
                    inputClass={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">{t.mealCalories}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className={inputClass}
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                  />
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
                <button
                  type="submit"
                  className="w-full rounded-xl bg-secondary text-secondary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-secondary/90 active:scale-[0.98] transition"
                >
                  {t.add}
                </button>
              </form>
            )}
          </section>
        </div>

        {/* Footer — log cart button */}
        {cart.length > 0 && (
          <div className="shrink-0 border-t border-border px-5 py-4">
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

// ─── Main component ────────────────────────────────────────────────────────────

export default function NutritionTracker() {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
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

  const [todayKey, setTodayKey] = useState<string>("");
  useEffect(() => setTodayKey(toDateKey(new Date())), []);

  const { meals, supplements, activities } = useMemo(
    () =>
      todayKey
        ? dayData(todayKey)
        : { meals: [], supplements: [], activities: [] },
    [dayData, todayKey],
  );

  // Preload saved foods so both BarcodeLookup and the modals share the SWR cache
  const { data: savedFoods = [] } = useSWR(
    "saved-foods",
    () => fetchUserSavedFoods(),
    { revalidateOnFocus: false },
  );

  // Modal state
  const [addType, setAddType] = useState<MealType | null>(null);
  const [suppModalOpen, setSuppModalOpen] = useState(false);

  // Supplement form state
  const [suppName, setSuppName] = useState("");
  const [suppDose, setSuppDose] = useState("");
  const [suppType, setSuppType] = useState<SupplementType>("protein");

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

  // ── Daily nutrient totals ──────────────────────────────────────────────────

  const sumField = (key: keyof (typeof meals)[number]) => {
    let any = false;
    let total = 0;
    for (const m of meals) {
      const v = m[key];
      if (typeof v === "number") { any = true; total += v; }
    }
    return any ? total : null;
  };

  const dailyNutrients = useMemo(
    () => [
      { label: t.macroProtein, value: sumField("protein"),     unit: t.unitG  },
      { label: t.macroCarbs,   value: sumField("carbs"),       unit: t.unitG  },
      { label: t.macroFat,     value: sumField("fat"),         unit: t.unitG  },
      { label: t.satFat,       value: sumField("saturatedFat"),unit: t.unitG  },
      { label: t.sugars,       value: sumField("sugars"),      unit: t.unitG  },
      { label: t.fiber,        value: sumField("fiber"),       unit: t.unitG  },
      { label: t.sodium,       value: sumField("sodium"),      unit: t.unitMg },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meals, t],
  );

  const hasDailyNutrients = dailyNutrients.some((n) => n.value != null);

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

  const openSupplementAdd = () => {
    setSuppName(""); setSuppDose(""); setSuppType("protein");
    setSuppModalOpen(true);
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
    setActName(""); setActCalories("");
  };

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* Barcode food finder */}
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

      {/* Daily nutrient totals */}
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
          savedFoods={savedFoods}
        />
      )}

      {/* Supplement modal */}
      {suppModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setSuppModalOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md bg-card text-card-foreground rounded-t-3xl shadow-xl p-5 pb-safe"
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
                <span className="text-xs font-medium text-muted-foreground">{t.supplementName}</span>
                <FoodAutocomplete
                  value={suppName}
                  onChange={setSuppName}
                  onSelect={(food) => setSuppName(food.name)}
                  savedFoods={savedFoods}
                  inputClass={inputClass}
                />
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
