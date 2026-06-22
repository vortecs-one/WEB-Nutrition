"use client";

import { useState, useCallback, useRef } from "react";
import {
  X,
  Search,
  ScanBarcode,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  BookOpen,
  PenLine,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useDayLog, type SavedFood, type MealType } from "@/lib/day-log/provider";

type Props = {
  /** When provided, "Add to meal" adds the food directly to that meal slot. */
  targetMeal?: MealType;
  onClose: () => void;
  /** Called with the selected food so the parent can pre-fill the meal form. */
  onSelectFood?: (food: SavedFood) => void;
};

// Fetch product data from the Open Food Facts public API (no key required).
async function lookupBarcode(barcode: string): Promise<Partial<SavedFood> | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const n = p.nutriments ?? {};
    return {
      name: p.product_name || p.generic_name || "",
      brand: p.brands || "",
      barcode,
      caloriesPer100g: Math.round(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0),
      protein:  Math.round((n.proteins_100g  ?? 0) * 10) / 10,
      carbs:    Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
      fat:      Math.round((n.fat_100g ?? 0) * 10) / 10,
      fiber:    Math.round((n.fiber_100g  ?? 0) * 10) / 10,
      sugar:    Math.round((n.sugars_100g ?? 0) * 10) / 10,
      sodium:   Math.round((n.sodium_100g ?? 0) * 1000 * 10) / 10,
      servingSize: p.serving_quantity ? Math.round(Number(p.serving_quantity)) : undefined,
    };
  } catch {
    return null;
  }
}

const MACRO_FIELDS = [
  "caloriesPer100g",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "sodium",
] as const;

type MacroField = (typeof MACRO_FIELDS)[number];

const EMPTY_FORM: Record<MacroField | "name" | "brand" | "barcode" | "servingSize", string> = {
  name: "", brand: "", barcode: "", servingSize: "",
  caloriesPer100g: "", protein: "", carbs: "", fat: "", fiber: "", sugar: "", sodium: "",
};

export default function FoodLibrary({ onClose, onSelectFood }: Props) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const { foodLibrary, addFoodToLibrary, removeFoodFromLibrary } = useDayLog();

  const [tab, setTab] = useState<"library" | "add" | "scan">("library");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Scan state
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanStatus, setScanStatus] = useState<"idle" | "loading" | "found" | "notfound" | "error">("idle");
  const [scannedData, setScannedData] = useState<Partial<SavedFood> | null>(null);

  // Manual form state
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const barcodeRef = useRef<HTMLInputElement>(null);

  const inputClass =
    "w-full rounded-xl border border-border bg-background px-4 min-h-11 text-sm outline-none focus:ring-2 focus:ring-ring";

  const filtered = foodLibrary.filter((f) =>
    `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(query.toLowerCase()),
  );

  const handleLookup = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setScanStatus("loading");
    setScannedData(null);
    const result = await lookupBarcode(code.trim());
    if (!result) {
      setScanStatus("notfound");
      // Pre-fill the barcode field in the manual form so the user can continue.
      setForm((f) => ({ ...f, barcode: code.trim() }));
      setTab("add");
      return;
    }
    setScannedData(result);
    setScanStatus("found");
    // Pre-fill the manual form with found data.
    setForm({
      name:            result.name ?? "",
      brand:           result.brand ?? "",
      barcode:         result.barcode ?? "",
      servingSize:     result.servingSize?.toString() ?? "",
      caloriesPer100g: result.caloriesPer100g?.toString() ?? "",
      protein:         result.protein?.toString() ?? "",
      carbs:           result.carbs?.toString() ?? "",
      fat:             result.fat?.toString() ?? "",
      fiber:           result.fiber?.toString() ?? "",
      sugar:           result.sugar?.toString() ?? "",
      sodium:          result.sodium?.toString() ?? "",
    });
    setTab("add");
  }, []);

  const saveFood = useCallback(() => {
    const cal = parseFloat(form.caloriesPer100g);
    if (!form.name.trim() || Number.isNaN(cal) || cal <= 0) return;
    const pf = (v: string) => { const n = parseFloat(v); return Number.isNaN(n) ? undefined : n; };
    addFoodToLibrary({
      name:            form.name.trim(),
      brand:           form.brand.trim() || undefined,
      barcode:         form.barcode.trim() || undefined,
      caloriesPer100g: cal,
      servingSize:     pf(form.servingSize),
      protein:         pf(form.protein),
      carbs:           pf(form.carbs),
      fat:             pf(form.fat),
      fiber:           pf(form.fiber),
      sugar:           pf(form.sugar),
      sodium:          pf(form.sodium),
    });
    setForm({ ...EMPTY_FORM });
    setScanStatus("idle");
    setScannedData(null);
    setTab("library");
  }, [form, addFoodToLibrary]);

  const macroLabel: Record<MacroField, string> = {
    caloriesPer100g: t.caloriesPer100g,
    protein:  t.proteinG,
    carbs:    t.carbsG,
    fat:      t.fatG,
    fiber:    t.fiberG,
    sugar:    t.sugarG,
    sodium:   t.sodiumMg,
  };

  const macroUnit: Record<MacroField, string> = {
    caloriesPer100g: "kcal",
    protein: "g", carbs: "g", fat: "g", fiber: "g", sugar: "g", sodium: "mg",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full sm:max-w-lg bg-card text-card-foreground rounded-t-3xl sm:rounded-3xl shadow-xl flex flex-col max-h-[90dvh]"
        role="dialog"
        aria-modal="true"
        aria-label={t.foodLibrary}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h3 className="text-base font-semibold">{t.foodLibrary}</h3>
            <p className="text-xs text-muted-foreground">{t.foodLibrarySubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={dict.common.close}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent active:scale-95 transition shrink-0"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pb-3 shrink-0">
          {(["library", "scan", "add"] as const).map((id) => {
            const Icon = id === "library" ? BookOpen : id === "scan" ? ScanBarcode : PenLine;
            const label = id === "library" ? t.foodLibrary : id === "scan" ? t.scanTab : t.manualEntry;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  tab === id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-3">

          {/* ── LIBRARY tab ── */}
          {tab === "library" && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-4 min-h-11 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder={t.searchFood}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">{t.noFoods}</p>
                  <button
                    type="button"
                    onClick={() => setTab("scan")}
                    className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition"
                  >
                    {t.scanBarcode}
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((food) => {
                    const isOpen = expandedId === food.id;
                    const cal = food.servingSize
                      ? Math.round((food.caloriesPer100g * food.servingSize) / 100)
                      : food.caloriesPer100g;
                    const unit = food.servingSize ? t.perServing : t.per100g;
                    return (
                      <li key={food.id} className="rounded-2xl border border-border bg-background overflow-hidden">
                        {/* Row */}
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-sm truncate">{food.name}</div>
                            {food.brand && (
                              <div className="text-xs text-muted-foreground truncate">{food.brand}</div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold tabular-nums">{cal} kcal</div>
                            <div className="text-[10px] text-muted-foreground">{unit}</div>
                          </div>
                          {/* Actions */}
                          {onSelectFood && (
                            <button
                              type="button"
                              onClick={() => { onSelectFood(food); onClose(); }}
                              aria-label={t.addToMeal}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition shrink-0"
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedId(isOpen ? null : food.id)}
                            aria-label={isOpen ? dict.common.close : t.addFood}
                            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent active:scale-95 transition shrink-0"
                          >
                            {isOpen
                              ? <ChevronUp className="h-4 w-4" aria-hidden="true" />
                              : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFoodFromLibrary(food.id)}
                            aria-label={dict.common.delete}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95 transition shrink-0"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>

                        {/* Expanded macro panel */}
                        {isOpen && (
                          <div className="border-t border-border bg-muted/40 px-4 py-3">
                            {food.barcode && (
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground">{t.barcode}</span>
                                <span className="text-xs font-mono">{food.barcode}</span>
                              </div>
                            )}
                            {food.servingSize && (
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground">{t.servingSize}</span>
                                <span className="text-xs font-semibold">{food.servingSize} g</span>
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                              {MACRO_FIELDS.map((key) => {
                                const val = food[key];
                                if (val == null) return null;
                                return (
                                  <div key={key} className="flex flex-col">
                                    <span className="text-[10px] text-muted-foreground leading-tight">{macroLabel[key]}</span>
                                    <span className="text-sm font-semibold tabular-nums">
                                      {val} <span className="text-[10px] font-normal text-muted-foreground">{macroUnit[key]}</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {/* ── SCAN tab ── */}
          {tab === "scan" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t.scanHint}</p>

              {/* Barcode number input — works for manual code entry and camera scanning */}
              <div className="flex gap-2">
                <input
                  ref={barcodeRef}
                  className={inputClass + " flex-1"}
                  placeholder={t.barcode}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup(barcodeInput)}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => handleLookup(barcodeInput)}
                  disabled={scanStatus === "loading"}
                  className="flex h-11 items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-4 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition shrink-0"
                >
                  {scanStatus === "loading"
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Search className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>

              {/* Status messages */}
              {scanStatus === "loading" && (
                <p className="text-sm text-muted-foreground">{t.scanLookingUp}</p>
              )}
              {scanStatus === "notfound" && (
                <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  {t.scanNotFound}
                </div>
              )}
              {scanStatus === "found" && scannedData && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-1">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">{t.scanSuccess}</p>
                  <p className="font-medium text-sm">{scannedData.name}</p>
                  {scannedData.brand && <p className="text-xs text-muted-foreground">{scannedData.brand}</p>}
                  <p className="text-sm tabular-nums">
                    {scannedData.caloriesPer100g} kcal / 100 g
                    {scannedData.protein != null && ` · P ${scannedData.protein}g`}
                    {scannedData.carbs   != null && ` · C ${scannedData.carbs}g`}
                    {scannedData.fat     != null && ` · F ${scannedData.fat}g`}
                  </p>
                  <p className="text-xs text-muted-foreground pt-1">{t.manualEntry} →</p>
                </div>
              )}
              {scanStatus === "error" && (
                <p className="text-sm text-destructive">{t.scanError}</p>
              )}
            </div>
          )}

          {/* ── ADD / MANUAL ENTRY tab ── */}
          {tab === "add" && (
            <form
              onSubmit={(e) => { e.preventDefault(); saveFood(); }}
              className="space-y-3"
            >
              {/* Required */}
              <div className="space-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{t.foodName} *</span>
                  <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{t.brand}</span>
                    <input className={inputClass} value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{t.barcode}</span>
                    <input className={inputClass} inputMode="numeric" value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{t.caloriesPer100g} *</span>
                    <input className={inputClass} type="number" inputMode="decimal" value={form.caloriesPer100g} onChange={(e) => setForm((f) => ({ ...f, caloriesPer100g: e.target.value }))} required />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">{t.servingSize}</span>
                    <input className={inputClass} type="number" inputMode="decimal" value={form.servingSize} onChange={(e) => setForm((f) => ({ ...f, servingSize: e.target.value }))} />
                  </label>
                </div>
              </div>

              {/* Macros grid */}
              <div className="rounded-2xl border border-border p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t.per100g}</p>
                <div className="grid grid-cols-3 gap-3">
                  {(["protein", "carbs", "fat", "fiber", "sugar", "sodium"] as MacroField[]).map((key) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-muted-foreground">{macroLabel[key]}</span>
                      <input
                        className={inputClass}
                        type="number"
                        inputMode="decimal"
                        value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-primary text-primary-foreground px-5 min-h-12 text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition"
              >
                {t.saveToLibrary}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
