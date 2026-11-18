// Shared, framework-agnostic types for the barcode food-lookup feature.
// Plain module (no "use client"/"use server"/"server-only") so it can be
// imported by the server-only Thruxion client, the server action, and the
// client UI alike.

// Nutrition values, split by basis. Each may be missing for a given product,
// so values are nullable and the UI only offers a basis when data exists.
//
// The shape is intentionally FLAT (one field per nutrient/basis) so it stays
// backward-compatible with rows already saved in the database: older rows just
// lack the newer fields, which read back as `undefined` and are treated as
// `null`.
export type FoodNutrition = {
  // Energy
  caloriesServing: number | null;
  calories100g: number | null;
  energyKjServing: number | null;
  energyKj100g: number | null;
  // Macros
  proteinServing: number | null;
  protein100g: number | null;
  carbsServing: number | null;
  carbs100g: number | null;
  fatServing: number | null;
  fat100g: number | null;
  // Fat detail
  saturatedFatServing: number | null;
  saturatedFat100g: number | null;
  // Carb detail
  sugarsServing: number | null;
  sugars100g: number | null;
  addedSugarsServing: number | null;
  addedSugars100g: number | null;
  fiberServing: number | null;
  fiber100g: number | null;
  // Salt / sodium (grams, as returned by the API)
  saltServing: number | null;
  salt100g: number | null;
  sodiumServing: number | null;
  sodium100g: number | null;
};

// Extra, product-level metadata surfaced on the detail view. All optional so
// the UI can show only what the API actually returned.
export type FoodMeta = {
  servingSize: string | null; // e.g. "30 g"
  quantity: string | null; // package size, e.g. "400 g"
  novaGroup: number | null; // 1..4 processing level
  vegan: boolean | null;
  vegetarian: boolean | null;
  ingredients: string | null;
};

// A normalized food product returned from the barcode lookup.
export type FoodProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  image: string | null;
  nutrition: FoodNutrition;
  meta: FoodMeta;
};

// A saved food product with optional metadata (savedAt timestamp).
export type SavedFoodProduct = FoodProduct & {
  savedAt?: Date;
};

// Result of a barcode lookup server action. Discriminated so the UI can render
// the right state without leaking raw errors to the client.
export type FoodLookupResult =
  | { ok: true; product: FoodProduct }
  | { ok: false; reason: "unauthenticated" | "not-found" | "error" };

// Open Food Facts nutrient names accepted by the Food API's `nutriments`
// object (grams, except energy in kcal / kJ; sodium is entered in mg and sent
// with `sodium_unit: "mg"`).
export const NUTRIMENT_KEYS = [
  "energy-kcal",
  "energy-kj",
  "fat",
  "saturated-fat",
  "carbohydrates",
  "sugars",
  "fiber",
  "proteins",
  "salt",
  "sodium",
] as const;
export type NutrimentKey = (typeof NUTRIMENT_KEYS)[number];

export type NutritionBasis = "100g" | "serving";

// Product fields the app can send to Open Food Facts (create or update).
export type NewFoodProductInput = {
  name: string;
  brand?: string;
  quantity?: string;
  servingSize?: string;
  ingredients?: string;
  categories?: string[];
  labels?: string[];
  countries?: string[];
  nutritionBasis?: NutritionBasis;
  nutriments?: Partial<Record<NutrimentKey, number>>;
};

// PATCH payload: every field optional, only the changed ones are sent.
export type FoodProductPatch = Partial<NewFoodProductInput>;

// Photo kinds the app lets users send to Open Food Facts.
export type FoodPhotoKind = "front" | "ingredients" | "nutrition" | "packaging";

// Result of a photo upload: `imgid` is the photo's number on Open Food Facts,
// used to find the text Open Food Facts reads from it.
export type FoodPhotoUploadResult =
  | { ok: true; imgid: number | null }
  | { ok: false; reason: FoodWriteFailure; message?: string };

// Where a pre-filled value came from, shown as a badge in the review form.
export type ExtractSource = "off-ocr" | "robotoff" | "ai";

export type Extracted<T> = { value: T; source: ExtractSource };

// Values read from the product photos. Every field is optional; the form
// only pre-fills what was found and the user confirms before anything is sent.
export type ProductExtraction = {
  brand?: Extracted<string>;
  quantity?: Extracted<string>;
  servingSize?: Extracted<string>;
  ingredients?: Extracted<string>;
  categories?: Extracted<string[]>;
  labels?: Extracted<string[]>;
  nutritionBasis?: Extracted<NutritionBasis>;
  nutriments?: Partial<Record<NutrimentKey, Extracted<number>>>;
};

export type ExtractStatus = "ok" | "no-text" | "empty";

export type ProductExtractionResult =
  | { ok: true; data: ProductExtraction; status: Record<string, ExtractStatus> }
  | { ok: false; reason: "unauthenticated" | "invalid" | "error" };

export type LabelAiResult =
  | { ok: true; data: ProductExtraction }
  | {
      ok: false;
      reason: "unauthenticated" | "invalid" | "rate-limited" | "quota" | "error";
    };

export type FoodWriteFailure =
  | "unauthenticated"
  | "invalid"
  | "exists"
  | "not-found"
  | "rejected"
  | "unavailable"
  | "error";

// Result of a create / update / photo-upload server action.
export type FoodWriteResult =
  | { ok: true }
  | { ok: false; reason: FoodWriteFailure; message?: string };

// Result of reading the ingredients text from the ingredients photo (OCR).
export type IngredientsOcrResult =
  | { ok: true; ingredients: string; lang: string }
  | {
      ok: false;
      reason: FoodWriteFailure | "no-photo";
      message?: string;
      available?: string[];
    };

// The two bases a product's nutrition can be shown/logged in.
export type Basis = "serving" | "100g";

// A single, basis-agnostic set of nutrient values (already resolved for a
// chosen basis and scaled by quantity). Used by the meal-builder cart.
export type NutrientValues = {
  calories: number | null;
  energyKj: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  saturatedFat: number | null;
  sugars: number | null;
  addedSugars: number | null;
  fiber: number | null;
  salt: number | null;
  sodium: number | null;
};

// Empty (all-null) nutrient values.
export const emptyNutrientValues = (): NutrientValues => ({
  calories: null,
  energyKj: null,
  protein: null,
  carbs: null,
  fat: null,
  saturatedFat: null,
  sugars: null,
  addedSugars: null,
  fiber: null,
  salt: null,
  sodium: null,
});
