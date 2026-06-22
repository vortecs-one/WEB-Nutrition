"use client";

import { useMemo, useState } from "react";
import { Barcode, Search, Loader2, Plus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog, type MealType } from "@/lib/day-log/provider";
import { lookupFoodByBarcode } from "@/lib/foods/actions";
import type { FoodProduct } from "@/lib/foods/types";

type Basis = "serving" | "100g";
type Status = "idle" | "loading" | "not-found" | "error";

export default function BarcodeLookup({ todayKey }: { todayKey: string }) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;

  const { addMeal } = useDayLog();

  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [basis, setBasis] = useState<Basis>("serving");
  const [mealType, setMealType] = useState<MealType>("breakfast");

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

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = barcode.replace(/\D+/g, "");
    if (!clean) return;
    setStatus("loading");
    setProduct(null);
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
    <section className="bg-card text-card-foreground rounded-3xl border border-border shadow-sm p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
        <Barcode className="h-5 w-5" aria-hidden="true" />
        {t.barcodeTitle}
      </h2>

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
                </div>
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
    </section>
  );
}
