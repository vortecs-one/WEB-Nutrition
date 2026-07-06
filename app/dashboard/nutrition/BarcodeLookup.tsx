"use client";

import { useMemo, useState } from "react";
import {
  Barcode,
  Search,
  Loader2,
  Plus,
  Minus,
  X,
  BookmarkPlus,
  Bookmark,
  Info,
  Trash2,
  UtensilsCrossed,
  ChevronDown,
} from "lucide-react";
import useSWR from "swr";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog, type MealType, type Meal } from "@/lib/day-log/provider";
import {
  lookupFoodByBarcode,
  fetchUserSavedFoods,
  saveFoodProduct,
  removeSavedFood,
} from "@/lib/foods/actions";
import type { Basis, FoodProduct, NutrientValues } from "@/lib/foods/types";
import {
  hasBasis,
  valuesForBasis,
  scaleValues,
  sumValues,
  roundOrUndef,
} from "@/lib/foods/nutrition";
import NutritionFacts from "./NutritionFacts";

type Status = "idle" | "loading" | "not-found" | "error";

// A single line in the meal-builder cart.
type CartItem = {
  key: string;
  product: FoodProduct;
  basis: Basis;
  // Servings count when basis === "serving"; grams when basis === "100g".
  amount: number;
};

let cartSeq = 0;

// Default amount for a basis: 1 serving, or 100 g.
const defaultAmount = (basis: Basis) => (basis === "serving" ? 1 : 100);

// Scale factor applied to the per-basis values for a cart item.
const factorFor = (item: CartItem) =>
  item.basis === "serving" ? item.amount : item.amount / 100;

// Resolve the scaled nutrient values for a cart item.
function scaledValues(item: CartItem): NutrientValues {
  return scaleValues(
    valuesForBasis(item.product.nutrition, item.basis),
    factorFor(item),
  );
}

export default function BarcodeLookup({
  todayKey,
  embedded = false,
}: {
  todayKey: string;
  // When embedded inside another card (e.g. the diet log), drop the outer
  // card chrome so it reads as a sub-section rather than a nested card.
  embedded?: boolean;
}) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const { addMeals } = useDayLog();

  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [productBasis, setProductBasis] = useState<Basis>("serving");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [detailFood, setDetailFood] = useState<FoodProduct | null>(null);

  // Preloaded saved foods (available immediately in the diet-log flow).
  const {
    data: savedFoods = [],
    mutate: mutateSavedFoods,
    isLoading: loadingSaved,
  } = useSWR("saved-foods", () => fetchUserSavedFoods(), {
    revalidateOnFocus: false,
  });

  const mealOptions: { type: MealType; label: string }[] = [
    { type: "breakfast", label: t.breakfast },
    { type: "lunch", label: t.lunch },
    { type: "dinner", label: t.dinner },
    { type: "snack", label: t.extraMeal },
  ];

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  const pickDefaultBasis = (p: FoodProduct): Basis =>
    hasBasis(p.nutrition, "serving") ? "serving" : "100g";

  const isSaved = (bc: string) => savedFoods.some((f) => f.barcode === bc);

  const productSaved = product ? isSaved(product.barcode) : false;

  // Values for the currently previewed product + basis.
  const previewValues = useMemo(
    () => (product ? valuesForBasis(product.nutrition, productBasis) : null),
    [product, productBasis],
  );

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = barcode.replace(/\D+/g, "");
    if (!clean) return;
    setStatus("loading");
    setProduct(null);
    try {
      const result = await lookupFoodByBarcode(clean);
      if (result.ok) {
        setProduct(result.product);
        setProductBasis(pickDefaultBasis(result.product));
        setStatus("idle");
      } else if (result.reason === "not-found") {
        setStatus("not-found");
      } else {
        setStatus("error");
      }
    } catch (error) {
      console.error("[v0] Search error:", error);
      setStatus("error");
    }
  };

  const toggleSave = async (p: FoodProduct) => {
    if (isSaved(p.barcode)) {
      await removeSavedFood(p.barcode);
    } else {
      await saveFoodProduct(p);
    }
    await mutateSavedFoods();
  };

  // Add a product to the meal-builder cart.
  const addToCart = (p: FoodProduct) => {
    const basis = pickDefaultBasis(p);
    if (!hasBasis(p.nutrition, "serving") && !hasBasis(p.nutrition, "100g")) {
      return;
    }
    setCart((prev) => [
      ...prev,
      { key: `c${cartSeq++}`, product: p, basis, amount: defaultAmount(basis) },
    ]);
  };

  const addProductToCart = () => {
    if (!product) return;
    addToCart(product);
    // Clear the preview + input, ready for the next scan.
    setProduct(null);
    setStatus("idle");
    setBarcode("");
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
        if (Number.isNaN(parsed) || parsed <= 0) return { ...i, amount: 0 };
        return { ...i, amount: parsed };
      }),
    );

  const combined = useMemo(
    () => sumValues(cart.map(scaledValues)),
    [cart],
  );

  // Build a Meal from a cart item (rounding + sodium g -> mg).
  const mealFromItem = (item: CartItem): Omit<Meal, "id"> => {
    const v = scaledValues(item);
    const base = item.product.brand
      ? `${item.product.name} (${item.product.brand})`
      : item.product.name;
    const qtyLabel =
      item.basis === "serving"
        ? `${item.amount} × ${t.perServing.toLowerCase()}`
        : `${item.amount} ${t.unitG}`;
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

  const logMeal = () => {
    if (!todayKey || cart.length === 0) return;
    const valid = cart.filter((i) => i.amount > 0);
    if (valid.length === 0) return;
    addMeals(todayKey, valid.map(mealFromItem));
    setCart([]);
  };

  const fmt0 = (v: number | null) => (v == null ? "—" : `${Math.round(v)}`);
  const fmt1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));

  // Compact macro chips for a set of nutrient values.
  const macroChips = (v: NutrientValues) =>
    [
      { label: t.kcal, value: fmt0(v.calories) },
      { label: t.macroProtein, value: `${fmt1(v.protein)}${t.unitG}` },
      { label: t.macroCarbs, value: `${fmt1(v.carbs)}${t.unitG}` },
      { label: t.macroFat, value: `${fmt1(v.fat)}${t.unitG}` },
    ].filter((c) => !c.value.startsWith("—"));

  return (
    <div
      className={
        embedded
          ? "space-y-4"
          : "bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5 space-y-4"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          className={
            embedded
              ? "flex items-center gap-2 text-sm font-semibold text-muted-foreground"
              : "flex items-center gap-2 text-lg font-semibold"
          }
        >
          <Barcode className="h-5 w-5" aria-hidden="true" />
          {t.barcodeTitle}
        </h2>
        {savedFoods.length > 0 && (
          <button
            type="button"
            onClick={() => setSavedOpen((o) => !o)}
            aria-expanded={savedOpen}
            className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 active:scale-95 transition"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            {savedFoods.length}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${savedOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {/* Search */}
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          className={inputClass}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t.barcodePlaceholder}
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          aria-label={t.barcodePlaceholder}
        />
        <button
          type="submit"
          disabled={status === "loading" || !barcode.replace(/\D+/g, "")}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
        >
          {status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-5 w-5" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">
            {status === "loading" ? t.barcodeSearching : t.barcodeSearch}
          </span>
        </button>
      </form>

      {status === "idle" && !product && cart.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.foodSearchHint}</p>
      )}
      {status === "not-found" && (
        <p className="text-sm text-muted-foreground">{t.barcodeNotFound}</p>
      )}
      {status === "error" && (
        <p className="text-sm text-destructive">{t.barcodeError}</p>
      )}

      {/* Current product preview */}
      {product && (
        <div className="rounded-2xl border border-border p-4">
          <div className="flex items-start gap-4">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image || "/placeholder.svg"}
                alt={product.name}
                loading="lazy"
                className="shrink-0 rounded-xl border border-border object-cover bg-muted"
                style={{ height: 72, width: 72 }}
              />
            ) : (
              <div
                className="flex shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground"
                style={{ height: 72, width: 72 }}
              >
                <Barcode className="h-7 w-7" aria-hidden="true" />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold leading-tight text-pretty">{product.name}</div>
                  {product.brand && (
                    <div className="text-sm text-muted-foreground">{product.brand}</div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.barcodePlaceholder}: {product.barcode}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setDetailFood(product)}
                    aria-label={t.viewDetails}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent active:scale-95 transition"
                  >
                    <Info className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSave(product)}
                    aria-label={productSaved ? dict.common.delete : dict.common.save}
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95 ${
                      productSaved
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {productSaved ? (
                      <Bookmark className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <BookmarkPlus className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProduct(null);
                      setStatus("idle");
                    }}
                    aria-label={dict.common.close}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent active:scale-95 transition"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {previewValues &&
          (hasBasis(product.nutrition, "serving") ||
            hasBasis(product.nutrition, "100g")) ? (
            <>
              {hasBasis(product.nutrition, "serving") &&
                hasBasis(product.nutrition, "100g") && (
                  <div className="mt-4 inline-flex rounded-xl border border-border p-1">
                    <button
                      type="button"
                      onClick={() => setProductBasis("serving")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${productBasis === "serving" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t.perServing}
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductBasis("100g")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${productBasis === "100g" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t.per100g}
                    </button>
                  </div>
                )}

              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl bg-muted p-2">
                  <dt className="text-[11px] text-muted-foreground">{t.kcal}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{fmt0(previewValues.calories)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <dt className="text-[11px] text-muted-foreground">{t.macroProtein}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{fmt1(previewValues.protein)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <dt className="text-[11px] text-muted-foreground">{t.macroCarbs}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{fmt1(previewValues.carbs)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <dt className="text-[11px] text-muted-foreground">{t.macroFat}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{fmt1(previewValues.fat)}</dd>
                </div>
              </dl>

              <button
                type="button"
                onClick={addProductToCart}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                {t.addToMeal}
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t.noNutritionData}</p>
          )}
        </div>
      )}

      {/* Preloaded saved foods */}
      {savedOpen && (
        <div className="rounded-2xl border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold">
            {t.savedFoods} ({savedFoods.length})
          </h3>
          {loadingSaved ? (
            <p className="text-sm text-muted-foreground">{dict.common.loading}</p>
          ) : savedFoods.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.savedFoodsEmpty}</p>
          ) : (
            <ul className="space-y-2 max-h-80 overflow-y-auto">
              {savedFoods.map((food) => {
                const v = valuesForBasis(
                  food.nutrition,
                  hasBasis(food.nutrition, "serving") ? "serving" : "100g",
                );
                return (
                  <li
                    key={food.barcode}
                    className="flex items-start gap-3 rounded-xl border border-border bg-background p-3"
                  >
                    {food.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={food.image || "/placeholder.svg"}
                        alt={food.name}
                        loading="lazy"
                        className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover bg-muted"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                        <Barcode className="h-5 w-5" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium leading-tight">{food.name}</div>
                      {food.brand && (
                        <div className="truncate text-xs text-muted-foreground">{food.brand}</div>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {macroChips(v).map((c) => (
                          <span
                            key={c.label}
                            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium"
                          >
                            {c.value} {c.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setDetailFood(food)}
                        aria-label={t.viewDetails}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95 transition"
                      >
                        <Info className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => addToCart(food)}
                        aria-label={`${t.addToMeal}: ${food.name}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition"
                      >
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Meal builder cart */}
      {cart.length > 0 && (
      <div className="rounded-2xl border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
            {t.mealBuilder}
            {cart.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {cart.length} {t.itemsCount}
              </span>
            )}
          </h3>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs font-medium text-muted-foreground hover:text-destructive transition"
            >
              {t.clear}
            </button>
          )}
        </div>

        {(
          <div className="space-y-3">
            <ul className="space-y-3">
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

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* Basis toggle */}
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
            <div className="rounded-xl bg-muted p-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">{t.combinedTotal}</div>
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

            {/* Meal type + log */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t.mealType}</span>
                <select
                  className={inputClass}
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealType)}
                >
                  {mealOptions.map((m) => (
                    <option key={m.type} value={m.type}>{m.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={logMeal}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                {t.logToDiet} ({cart.length})
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Nutrition details modal */}
      {detailFood && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setDetailFood(null)}
          role="presentation"
        >
          <div
            className="w-full sm:max-w-lg bg-card text-card-foreground rounded-t-3xl sm:rounded-3xl shadow-lg max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label={detailFood.name}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card p-5">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                {detailFood.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detailFood.image || "/placeholder.svg"}
                    alt={detailFood.name}
                    className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover bg-muted"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-tight text-pretty">{detailFood.name}</h3>
                  {detailFood.brand && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{detailFood.brand}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.barcodePlaceholder}: {detailFood.barcode}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailFood(null)}
                aria-label={dict.common.close}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent active:scale-95 transition"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5">
              <NutritionFacts product={detailFood} />
              <button
                type="button"
                onClick={() => {
                  addToCart(detailFood);
                  setDetailFood(null);
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                {t.addToMeal}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
