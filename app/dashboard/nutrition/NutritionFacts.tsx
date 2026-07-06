"use client";

import { Leaf, Sprout } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { FoodProduct } from "@/lib/foods/types";

// A full nutrition-facts panel for a product: a per-serving / per-100g table
// covering every nutrient the API returned, plus product metadata (serving
// size, package size, processing level, diet flags, ingredients).
//
// Rows with no data on either basis are hidden so the table stays compact.
export default function NutritionFacts({ product }: { product: FoodProduct }) {
  const { dict } = useI18n();
  const t = dict.nutritionUser;
  const n = product.nutrition;
  const m = product.meta;

  const g = t.unitG;
  const mg = t.unitMg;

  // Each row: label, per-serving value, per-100g value, unit, decimals.
  type Row = {
    label: string;
    serving: number | null;
    per100g: number | null;
    unit: string;
    decimals: number;
    strong?: boolean;
    indent?: boolean;
  };

  const rows: Row[] = [
    { label: t.kcal, serving: n.caloriesServing, per100g: n.calories100g, unit: t.kcal, decimals: 0, strong: true },
    { label: t.energyKj, serving: n.energyKjServing, per100g: n.energyKj100g, unit: "kJ", decimals: 0 },
    { label: t.macroFat, serving: n.fatServing, per100g: n.fat100g, unit: g, decimals: 1, strong: true },
    { label: t.satFat, serving: n.saturatedFatServing, per100g: n.saturatedFat100g, unit: g, decimals: 1, indent: true },
    { label: t.macroCarbs, serving: n.carbsServing, per100g: n.carbs100g, unit: g, decimals: 1, strong: true },
    { label: t.sugars, serving: n.sugarsServing, per100g: n.sugars100g, unit: g, decimals: 1, indent: true },
    { label: t.addedSugars, serving: n.addedSugarsServing, per100g: n.addedSugars100g, unit: g, decimals: 1, indent: true },
    { label: t.fiber, serving: n.fiberServing, per100g: n.fiber100g, unit: g, decimals: 1 },
    { label: t.macroProtein, serving: n.proteinServing, per100g: n.protein100g, unit: g, decimals: 1, strong: true },
    { label: t.salt, serving: n.saltServing, per100g: n.salt100g, unit: g, decimals: 2 },
    { label: t.sodium, serving: n.sodiumServing != null ? n.sodiumServing * 1000 : null, per100g: n.sodium100g != null ? n.sodium100g * 1000 : null, unit: mg, decimals: 0 },
  ].filter((r) => r.serving != null || r.per100g != null);

  const fmt = (v: number | null, decimals: number, unit: string) =>
    v == null ? "—" : `${v.toFixed(decimals)}${unit === t.kcal ? "" : ""} ${unit}`.trim();

  const novaLabel =
    m.novaGroup == null
      ? null
      : ({ 1: t.nova1, 2: t.nova2, 3: t.nova3, 4: t.nova4 } as Record<number, string>)[
          m.novaGroup
        ] ?? t.novaUnknown;

  const novaTone =
    m.novaGroup == null
      ? ""
      : m.novaGroup <= 2
        ? "bg-primary/10 text-primary"
        : m.novaGroup === 3
          ? "bg-accent text-accent-foreground"
          : "bg-destructive/10 text-destructive";

  return (
    <div className="space-y-4">
      {/* Metadata badges */}
      {(m.servingSize || m.quantity || novaLabel || m.vegan || m.vegetarian) && (
        <div className="flex flex-wrap gap-2">
          {m.servingSize && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t.servingSizeLabel}: <span className="text-foreground">{m.servingSize}</span>
            </span>
          )}
          {m.quantity && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t.packageSizeLabel}: <span className="text-foreground">{m.quantity}</span>
            </span>
          )}
          {novaLabel && (
            <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium ${novaTone}`}>
              {t.processingLabel}: {novaLabel}
            </span>
          )}
          {m.vegan && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
              {t.veganLabel}
            </span>
          )}
          {!m.vegan && m.vegetarian && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Sprout className="h-3.5 w-3.5" aria-hidden="true" />
              {t.vegetarianLabel}
            </span>
          )}
        </div>
      )}

      {/* Facts table */}
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/80">
                <th className="px-3 py-2.5 text-left font-semibold text-foreground">{t.nutrientCol}</th>
                <th className="px-3 py-2.5 text-right font-semibold text-foreground whitespace-nowrap">{t.perServingCol}</th>
                <th className="px-3 py-2.5 text-right font-semibold text-foreground whitespace-nowrap">{t.per100gCol}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border last:border-b-0">
                  <td className={`px-3 py-2.5 ${r.strong ? "font-semibold text-foreground" : r.indent ? "pl-6 text-muted-foreground" : "text-foreground"}`}>
                    {r.label}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {fmt(r.serving, r.decimals, r.unit)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {fmt(r.per100g, r.decimals, r.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t.noNutritionData}</p>
      )}

      {/* Ingredients */}
      {m.ingredients && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            {t.ingredientsLabel}
          </h4>
          <p className="text-sm leading-relaxed text-foreground/90">{m.ingredients}</p>
        </div>
      )}
    </div>
  );
}
