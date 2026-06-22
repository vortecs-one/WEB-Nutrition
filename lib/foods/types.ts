// Shared, framework-agnostic types for the barcode food-lookup feature.
// Plain module (no "use client"/"use server"/"server-only") so it can be
// imported by the server-only Thruxion client, the server action, and the
// client UI alike.

// Nutrition values, split by basis. Each may be missing for a given product,
// so values are nullable and the UI only offers a basis when data exists.
export type FoodNutrition = {
  caloriesServing: number | null;
  calories100g: number | null;
  proteinServing: number | null;
  protein100g: number | null;
  carbsServing: number | null;
  carbs100g: number | null;
  fatServing: number | null;
  fat100g: number | null;
};

// A normalized food product returned from the barcode lookup.
export type FoodProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  image: string | null;
  nutrition: FoodNutrition;
};

// Result of a barcode lookup server action. Discriminated so the UI can render
// the right state without leaking raw errors to the client.
export type FoodLookupResult =
  | { ok: true; product: FoodProduct }
  | { ok: false; reason: "unauthenticated" | "not-found" | "error" };
