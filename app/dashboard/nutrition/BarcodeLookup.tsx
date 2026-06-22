"use client";

import { useMemo, useState, useEffect } from "react";
import { Barcode, Search, Loader2, Plus, X, BookmarkPlus, Bookmark, Info } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog, type MealType } from "@/lib/day-log/provider";
import { lookupFoodByBarcode } from "@/lib/foods/actions";
import type { FoodProduct } from "@/lib/foods/types";

type Basis = "serving" | "100g";
type Status = "idle" | "loading" | "not-found" | "error";

interface SavedFood extends FoodProduct {
  savedAt: number;
}

export default function BarcodeLookup({ todayKey }: { todayKey: string }) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const { addMeal } = useDayLog();

  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [basis, setBasis] = useState<Basis>("serving");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [detailFood, setDetailFood] = useState<FoodProduct | null>(null);

  // Load saved foods from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("nutrition-saved-foods");
      if (stored) {
        setSavedFoods(JSON.parse(stored));
      }
    } catch (err) {
      console.error("[v0] Failed to load saved foods:", err);
    }
  }, []);

  // Save foods to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("nutrition-saved-foods", JSON.stringify(savedFoods));
    } catch (err) {
      console.error("[v0] Failed to save foods:", err);
    }
  }, [savedFoods]);

  const mealOptions: { type: MealType; label: string }[] = [
    { type: "breakfast", label: t.breakfast },
    { type: "lunch", label: t.lunch },
    { type: "dinner", label: t.dinner },
    { type: "snack", label: t.extraMeal },
  ];

  // Which bases have any data, so we only offer the user real options.
  const hasServing = useMemo(() => {
    const n = product?.nutrition;
    return !!n && [n.caloriesServing, n.proteinServing, n.carbsServing, n.fatServing].some((v) => v != null);
  }, [product]);

  const has100g = useMemo(() => {
    const n = product?.nutrition;
    return !!n && [n.calories100g, n.protein100g, n.carbs100g, n.fat100g].some((v) => v != null);
  }, [product]);

  const hasNutrition = hasServing || has100g;

  // Values for the currently selected basis.
  const current = useMemo(() => {
    const n = product?.nutrition;
    if (!n) return { calories: null, protein: null, carbs: null, fat: null };
    return basis === "serving"
      ? { calories: n.caloriesServing, protein: n.proteinServing, carbs: n.carbsServing, fat: n.fatServing }
      : { calories: n.calories100g, protein: n.protein100g, carbs: n.carbs100g, fat: n.fat100g };
  }, [product, basis]);

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-12 text-base outline-none focus:ring-2 focus:ring-ring";

  const isFoodSaved = useMemo(() => {
    return product ? savedFoods.some((f) => f.barcode === product.barcode) : false;
  }, [product, savedFoods]);

  const saveFood = () => {
    if (!product) return;
    const alreadySaved = savedFoods.some((f) => f.barcode === product.barcode);
    if (alreadySaved) {
      setSavedFoods((prev) => prev.filter((f) => f.barcode !== product.barcode));
    } else {
      setSavedFoods((prev) => [{ ...product, savedAt: Date.now() }, ...prev]);
    }
  };

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
        // Default to the basis that actually has data (prefer per serving).
        const n = result.product.nutrition;
        const servingAvailable = [n.caloriesServing, n.proteinServing, n.carbsServing, n.fatServing].some((v) => v != null);
        setBasis(servingAvailable ? "serving" : "100g");
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

  const clearProduct = () => {
    setProduct(null);
    setStatus("idle");
  };

  const round = (v: number | null) => (v == null ? undefined : Math.round(v));

  const onAdd = () => {
    if (!product || !todayKey) return;
    const kcal = round(current.calories);
    if (kcal == null || kcal <= 0) return;
    const name = product.brand ? `${product.name} (${product.brand})` : product.name;
    addMeal(todayKey, {
      name,
      calories: kcal,
      type: mealType,
      protein: round(current.protein),
      carbs: round(current.carbs),
      fat: round(current.fat),
    });
    // Reset for the next scan.
    setProduct(null);
    setStatus("idle");
    setBarcode("");
  };

  const fmt = (v: number | null) => (v == null ? "—" : `${Math.round(v)}`);

  return (
    <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Barcode className="h-5 w-5" aria-hidden="true" />
          {t.barcodeTitle}
        </h2>
        {savedFoods.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSaved(!showSaved)}
            className="flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition"
          >
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            {savedFoods.length} Saved
          </button>
        )}
      </div>

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

      {/* Status messages */}
      {status === "not-found" && (
        <p className="mt-4 text-sm text-muted-foreground">{t.barcodeNotFound}</p>
      )}
      {status === "error" && (
        <p className="mt-4 text-sm text-destructive">{t.barcodeError}</p>
      )}

      {/* Product preview */}
      {product && (
        <div className="mt-4 rounded-2xl border border-border p-4">
          <div className="flex items-start gap-4">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image || "/placeholder.svg"}
                alt={product.name}
                width={72}
                height={72}
                loading="lazy"
                className="h-18 w-18 shrink-0 rounded-xl border border-border object-cover bg-muted"
                style={{ height: 72, width: 72 }}
              />
            ) : (
              <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground" style={{ height: 72, width: 72 }}>
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
                  <div className="text-xs text-muted-foreground mt-1">Barcode: {product.barcode}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={saveFood}
                    aria-label={isFoodSaved ? "Remove from saved" : "Save food"}
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                      isFoodSaved
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {isFoodSaved ? (
                      <Bookmark className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <BookmarkPlus className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={clearProduct}
                    aria-label={dict.common.close}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent active:scale-95 transition"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {hasNutrition ? (
            <>
              {/* Basis toggle (only show options that have data) */}
              {hasServing && has100g && (
                <div className="mt-4 inline-flex rounded-xl border border-border p-1">
                  <button
                    type="button"
                    onClick={() => setBasis("serving")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${basis === "serving" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t.perServing}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBasis("100g")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${basis === "100g" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t.per100g}
                  </button>
                </div>
              )}

              {/* Nutrition grid */}
              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                <div className="rounded-xl bg-muted p-2">
                  <dt className="text-[11px] text-muted-foreground">{t.kcal}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{fmt(current.calories)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <dt className="text-[11px] text-muted-foreground">{t.macroProtein}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{fmt(current.protein)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <dt className="text-[11px] text-muted-foreground">{t.macroCarbs}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{fmt(current.carbs)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-2">
                  <dt className="text-[11px] text-muted-foreground">{t.macroFat}</dt>
                  <dd className="text-sm font-semibold tabular-nums">{fmt(current.fat)}</dd>
                </div>
              </dl>

              {/* Meal type + add */}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
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
                  onClick={onAdd}
                  disabled={round(current.calories) == null}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  {t.addToLog}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t.noNutritionData}</p>
          )}
        </div>
      )}

      {/* Saved foods list */}
      {showSaved && savedFoods.length > 0 && (
        <div className="mt-4 rounded-2xl border border-border p-4 bg-muted/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Saved Foods ({savedFoods.length})</h3>
            <button
              type="button"
              onClick={() => setShowSaved(false)}
              aria-label={dict.common.close}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent active:scale-95 transition"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="space-y-2 max-h-80 overflow-y-auto">
            {savedFoods.map((food) => (
              <li key={food.barcode} className="rounded-lg border border-border bg-background p-3 hover:bg-accent/5 transition">
                <div className="flex gap-3 items-start">
                  {food.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={food.image || "/placeholder.svg"}
                      alt={food.name}
                      width={48}
                      height={48}
                      loading="lazy"
                      className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover bg-muted"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground text-xs">
                      <Barcode className="h-5 w-5" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm leading-tight text-pretty">{food.name}</div>
                    {food.brand && (
                      <div className="text-xs text-muted-foreground">{food.brand}</div>
                    )}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {[
                        { label: t.kcal, value: Math.round(food.nutrition.caloriesServing ?? food.nutrition.calories100g ?? 0) },
                        { label: t.macroProtein, value: Math.round(food.nutrition.proteinServing ?? food.nutrition.protein100g ?? 0) },
                        { label: t.macroCarbs, value: Math.round(food.nutrition.carbsServing ?? food.nutrition.carbs100g ?? 0) },
                        { label: t.macroFat, value: Math.round(food.nutrition.fatServing ?? food.nutrition.fat100g ?? 0) },
                      ].filter(({ value }) => value > 0).map(({ label, value }) => (
                        <span key={label} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium">
                          {value} {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDetailFood(food)}
                      aria-label={`View details for ${food.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95 transition"
                    >
                      <Info className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProduct(food);
                        const n = food.nutrition;
                        const servingAvailable = [n.caloriesServing, n.proteinServing, n.carbsServing, n.fatServing].some((v) => v != null);
                        setBasis(servingAvailable ? "serving" : "100g");
                        setShowSaved(false);
                      }}
                      aria-label={`Quick add ${food.name}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-primary/10 active:scale-95 transition"
                    >
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Nutrition details modal */}
      {detailFood && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetailFood(null)}>
          <div className="bg-card text-card-foreground rounded-3xl border border-border shadow-lg max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="sticky top-0 bg-card border-b border-border p-5 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-lg leading-tight text-pretty">{detailFood.name}</h3>
                {detailFood.brand && (
                  <p className="text-sm text-muted-foreground mt-1">{detailFood.brand}</p>
                )}
                <p className="text-xs text-muted-foreground mt-2">Barcode: {detailFood.barcode}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailFood(null)}
                aria-label={dict.common.close}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent active:scale-95 transition"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Product image */}
            {detailFood.image && (
              <div className="border-b border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detailFood.image}
                  alt={detailFood.name}
                  className="w-full h-auto object-cover bg-muted"
                />
              </div>
            )}

            {/* Nutrition table */}
            <div className="p-5 space-y-6">
              {/* Per Serving */}
              {[detailFood.nutrition.caloriesServing, detailFood.nutrition.proteinServing, detailFood.nutrition.carbsServing, detailFood.nutrition.fatServing].some((v) => v != null) && (
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-foreground">Per Serving</h4>
                  <div className="bg-muted/50 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {detailFood.nutrition.caloriesServing != null && (
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 font-medium text-foreground">{t.kcal}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">{Math.round(detailFood.nutrition.caloriesServing)}</td>
                          </tr>
                        )}
                        {detailFood.nutrition.proteinServing != null && (
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 font-medium text-foreground">{t.macroProtein}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">{detailFood.nutrition.proteinServing.toFixed(1)}g</td>
                          </tr>
                        )}
                        {detailFood.nutrition.carbsServing != null && (
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 font-medium text-foreground">{t.macroCarbs}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">{detailFood.nutrition.carbsServing.toFixed(1)}g</td>
                          </tr>
                        )}
                        {detailFood.nutrition.fatServing != null && (
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 font-medium text-foreground">{t.macroFat}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">{detailFood.nutrition.fatServing.toFixed(1)}g</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Per 100g */}
              {[detailFood.nutrition.calories100g, detailFood.nutrition.protein100g, detailFood.nutrition.carbs100g, detailFood.nutrition.fat100g].some((v) => v != null) && (
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-foreground">Per 100g</h4>
                  <div className="bg-muted/50 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <tbody>
                        {detailFood.nutrition.calories100g != null && (
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 font-medium text-foreground">{t.kcal}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">{Math.round(detailFood.nutrition.calories100g)}</td>
                          </tr>
                        )}
                        {detailFood.nutrition.protein100g != null && (
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 font-medium text-foreground">{t.macroProtein}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">{detailFood.nutrition.protein100g.toFixed(1)}g</td>
                          </tr>
                        )}
                        {detailFood.nutrition.carbs100g != null && (
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 font-medium text-foreground">{t.macroCarbs}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">{detailFood.nutrition.carbs100g.toFixed(1)}g</td>
                          </tr>
                        )}
                        {detailFood.nutrition.fat100g != null && (
                          <tr className="border-b border-border last:border-b-0">
                            <td className="px-4 py-3 font-medium text-foreground">{t.macroFat}</td>
                            <td className="px-4 py-3 text-right font-semibold text-primary">{detailFood.nutrition.fat100g.toFixed(1)}g</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* No nutrition data */}
              {![detailFood.nutrition.caloriesServing, detailFood.nutrition.proteinServing, detailFood.nutrition.carbsServing, detailFood.nutrition.fatServing, detailFood.nutrition.calories100g, detailFood.nutrition.protein100g, detailFood.nutrition.carbs100g, detailFood.nutrition.fat100g].some((v) => v != null) && (
                <div className="text-center py-6 text-muted-foreground">
                  No nutrition information available for this product.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
