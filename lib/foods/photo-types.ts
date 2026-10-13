import type { FoodProduct } from "./types";
import { emptyNutrition } from "./nutrition-empty";

export type FoodPhotoPer100g = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugars: number;
};

// "reference" is reserved for items matched against the reference table.
export type FoodPhotoSource = "ai" | "reference";

export type FoodPhotoReference = {
  id: string;
  portion: string;
  portionGrams: number;
  portionCarbs: number;
  warning?: "lactose-free";
};

export type FoodPhotoItem = {
  id: string;
  name: string;
  grams: number;
  confidence: number;
  source: FoodPhotoSource;
  per100g: FoodPhotoPer100g;
  reference?: FoodPhotoReference;
  // Other reference-table ids the model ranked next, offered as one-tap swaps.
  alternatives?: string[];
};

// Matched items are trusted for carbs, so they're pre-selected at a lower bar.
export const REFERENCE_MIN_CONFIDENCE = 0.35;

export type FoodPhotoResult =
  | { ok: true; items: FoodPhotoItem[] }
  | {
      ok: false;
      reason: "unauthenticated" | "invalid-image" | "rate-limited" | "quota" | "not-food" | "error";
    };

export const LOW_CONFIDENCE = 0.5;

// Map a detected item to the FoodProduct shape the meal cart already uses,
// with only per-100 g values so the cart logs it by grams.
export function photoItemToProduct(item: FoodPhotoItem): FoodProduct {
  const v = item.per100g;
  return {
    barcode: item.id,
    name: item.name,
    brand: null,
    image: null,
    nutrition: {
      ...emptyNutrition(),
      calories100g: v.calories,
      protein100g: v.protein,
      carbs100g: v.carbs,
      fat100g: v.fat,
      fiber100g: v.fiber,
      sugars100g: v.sugars,
    },
    meta: {
      servingSize: `${item.grams} g`,
      quantity: null,
      novaGroup: null,
      vegan: null,
      vegetarian: null,
      ingredients: null,
    },
  };
}
