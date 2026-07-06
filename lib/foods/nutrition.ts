// Framework-agnostic helpers for resolving, scaling, and summing food
// nutrition. Plain module so both server actions and client UI can use it.

import {
  emptyNutrientValues,
  type Basis,
  type FoodNutrition,
  type NutrientValues,
} from "./types";

// Does the given basis have ANY data for this product?
export function hasBasis(n: FoodNutrition | undefined, basis: Basis): boolean {
  if (!n) return false;
  const keys: (keyof FoodNutrition)[] =
    basis === "serving"
      ? [
          "caloriesServing",
          "proteinServing",
          "carbsServing",
          "fatServing",
          "fiberServing",
          "sugarsServing",
          "saturatedFatServing",
          "sodiumServing",
        ]
      : [
          "calories100g",
          "protein100g",
          "carbs100g",
          "fat100g",
          "fiber100g",
          "sugars100g",
          "saturatedFat100g",
          "sodium100g",
        ];
  return keys.some((k) => n[k] != null);
}

// Resolve the raw (unscaled) nutrient values for a chosen basis.
export function valuesForBasis(
  n: FoodNutrition | undefined,
  basis: Basis,
): NutrientValues {
  if (!n) return emptyNutrientValues();
  return basis === "serving"
    ? {
        calories: n.caloriesServing,
        energyKj: n.energyKjServing,
        protein: n.proteinServing,
        carbs: n.carbsServing,
        fat: n.fatServing,
        saturatedFat: n.saturatedFatServing,
        sugars: n.sugarsServing,
        addedSugars: n.addedSugarsServing,
        fiber: n.fiberServing,
        salt: n.saltServing,
        sodium: n.sodiumServing,
      }
    : {
        calories: n.calories100g,
        energyKj: n.energyKj100g,
        protein: n.protein100g,
        carbs: n.carbs100g,
        fat: n.fat100g,
        saturatedFat: n.saturatedFat100g,
        sugars: n.sugars100g,
        addedSugars: n.addedSugars100g,
        fiber: n.fiber100g,
        salt: n.salt100g,
        sodium: n.sodium100g,
      };
}

// Multiply every present value by a quantity (e.g. 2 servings, or 1.5×100 g).
export function scaleValues(v: NutrientValues, qty: number): NutrientValues {
  const s = (x: number | null) => (x == null ? null : x * qty);
  return {
    calories: s(v.calories),
    energyKj: s(v.energyKj),
    protein: s(v.protein),
    carbs: s(v.carbs),
    fat: s(v.fat),
    saturatedFat: s(v.saturatedFat),
    sugars: s(v.sugars),
    addedSugars: s(v.addedSugars),
    fiber: s(v.fiber),
    salt: s(v.salt),
    sodium: s(v.sodium),
  };
}

// Sum a list of nutrient values. A nutrient is null only if EVERY input is
// null for it; otherwise missing values count as 0.
export function sumValues(list: NutrientValues[]): NutrientValues {
  const total = emptyNutrientValues();
  const keys = Object.keys(total) as (keyof NutrientValues)[];
  for (const key of keys) {
    let any = false;
    let acc = 0;
    for (const v of list) {
      const x = v[key];
      if (x != null) {
        any = true;
        acc += x;
      }
    }
    total[key] = any ? acc : null;
  }
  return total;
}

// Round for display / storage; returns undefined for null so it can be omitted.
export function roundOrUndef(v: number | null): number | undefined {
  return v == null ? undefined : Math.round(v);
}

// Grams of sodium -> milligrams (the API returns sodium in grams).
export function sodiumToMg(gramsValue: number | null): number | null {
  return gramsValue == null ? null : gramsValue * 1000;
}
