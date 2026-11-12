"use server";

import { and, eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { savedFoods } from "@/drizzle/schema";
import { z } from "zod";
import {
  createFoodProduct,
  getFoodByBarcode,
  readFoodIngredientsFromPhoto,
  updateFoodProduct,
  uploadFoodImage,
  type FoodApiResponse,
} from "@/lib/thruxion-api";
import {
  NUTRIMENT_KEYS,
  type FoodLookupResult,
  type FoodMeta,
  type FoodNutrition,
  type FoodPhotoKind,
  type FoodPhotoUploadResult,
  type FoodProduct,
  type FoodProductPatch,
  type FoodWriteResult,
  type IngredientsOcrResult,
  type NewFoodProductInput,
  type SavedFoodProduct,
} from "./types";

// Default metadata for older saved rows that predate the meta field.
const emptyMeta = (): FoodMeta => ({
  servingSize: null,
  quantity: null,
  novaGroup: null,
  vegan: null,
  vegetarian: null,
  ingredients: null,
});

// Parse the `nutrition_data` column, which may be either the current
// `{ nutrition, meta }` shape or an older flat `FoodNutrition` blob.
function parseNutritionData(raw: string): {
  nutrition: FoodNutrition;
  meta: FoodMeta;
} {
  const parsed = JSON.parse(raw) as
    | { nutrition?: FoodNutrition; meta?: FoodMeta }
    | FoodNutrition;
  if (parsed && typeof parsed === "object" && "nutrition" in parsed) {
    return {
      nutrition: parsed.nutrition as FoodNutrition,
      meta: { ...emptyMeta(), ...(parsed.meta ?? {}) },
    };
  }
  return { nutrition: parsed as FoodNutrition, meta: emptyMeta() };
}

// Resolve a stable per-user key from the session: prefer the Thruxion
// human_id, fall back to the email. Returns null when unauthenticated.
async function getUserKey(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as
    | { humanId?: string | null; email?: string | null }
    | undefined;
  return user?.humanId ?? user?.email ?? null;
}

// Looks up a food product by barcode via the Thruxion foods API.
//
// Runs on the server so the Thruxion client (and its system token) never reach
// the browser. Requires an authenticated session, mirroring the rest of the
// dashboard, and returns a discriminated result so the UI can render the right
// state without exposing raw errors.
export async function lookupFoodByBarcode(
  barcode: string,
): Promise<FoodLookupResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, reason: "unauthenticated" };
  }

  // Barcodes are digits only; strip whitespace and any stray characters.
  const clean = (barcode ?? "").replace(/\D+/g, "");
  if (!clean) {
    return { ok: false, reason: "not-found" };
  }

  try {
    const product = await getFoodByBarcode(clean);
    if (!product) {
      return { ok: false, reason: "not-found" };
    }
    return { ok: true, product };
  } catch (error) {
    console.error(
      "[v0] lookupFoodByBarcode failed:",
      (error as Error).message,
    );
    return { ok: false, reason: "error" };
  }
}

// ---------------------------------------------------------------------------
// Contributing to Open Food Facts (register missing barcodes, send photos).
// Everything goes through the Thruxion Food API with the server-side system
// token; the browser only ever talks to these actions.
// ---------------------------------------------------------------------------

const BARCODE_RE = /^\d{8,14}$/;
const LANG_RE = /^[a-z]{2}$/;
const PHOTO_KINDS: readonly FoodPhotoKind[] = [
  "front",
  "ingredients",
  "nutrition",
  "packaging",
];
const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/gif"]);
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const tagList = z
  .array(z.string().trim().min(1).max(100))
  .max(20)
  .optional()
  .transform((v) => (v && v.length ? v : undefined));

const productFieldsSchema = z.object({
  brand: optionalText(200),
  quantity: optionalText(50),
  servingSize: optionalText(50),
  ingredients: optionalText(5000),
  categories: tagList,
  labels: tagList,
  countries: tagList,
  nutritionBasis: z.enum(["100g", "serving"]).optional(),
  // Energy in kJ goes up to ~3800 per 100 g; sodium is entered in mg.
  nutriments: z
    .partialRecord(z.enum(NUTRIMENT_KEYS), z.number().finite().min(0).max(40000))
    .optional(),
});

const newProductSchema = productFieldsSchema.extend({
  name: z.string().trim().min(1).max(200),
});

const patchSchema = productFieldsSchema.extend({
  name: optionalText(200),
});

// The one place that knows the Food API's field names. The API rejects any
// unknown field with a 400, so app-side names never reach it directly.
function toOffFields(
  input: z.infer<typeof patchSchema>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name) out.name = input.name;
  if (input.brand) out.brand = input.brand;
  if (input.quantity) out.quantity = input.quantity;
  if (input.servingSize) out.serving_size = input.servingSize;
  if (input.ingredients) out.ingredients = input.ingredients;
  if (input.categories) out.categories = input.categories;
  if (input.labels) out.labels = input.labels;
  if (input.countries) out.countries = input.countries;

  const nutriments = input.nutriments ?? {};
  if (Object.keys(nutriments).length > 0) {
    const sent: Record<string, number | string> = { ...nutriments };
    if (nutriments.sodium != null) sent.sodium_unit = "mg";
    out.nutriments = sent;
    out.nutrition_data_per = input.nutritionBasis ?? "100g";
  }
  return out;
}

const cleanLang = (lang: string | undefined) =>
  lang && LANG_RE.test(lang) ? lang : "es";

// Map a Food API response to the UI-safe result union.
function toWriteResult(
  { status, body }: FoodApiResponse,
  okStatus: number,
): FoodWriteResult {
  if (status === okStatus) return { ok: true };
  const message = body.details ?? body.message;
  // A 404 without the API's JSON error means the route itself is missing
  // (Express "Cannot POST"), i.e. the new endpoints aren't deployed yet.
  if (status === 404) {
    return { ok: false, reason: body.message ? "not-found" : "unavailable" };
  }
  if (status === 409) return { ok: false, reason: "exists" };
  if (status === 400) return { ok: false, reason: "invalid", message };
  if (status === 502 || status === 503) {
    return { ok: false, reason: "rejected", message };
  }
  console.error("[v0] Food API write failed:", status, message);
  return { ok: false, reason: "error" };
}

// Register a barcode that Open Food Facts doesn't know yet.
export async function registerFoodProduct(
  barcode: string,
  input: NewFoodProductInput,
  lang?: string,
): Promise<FoodWriteResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  const clean = (barcode ?? "").replace(/\D+/g, "");
  const parsed = newProductSchema.safeParse(input);
  if (!BARCODE_RE.test(clean) || !parsed.success) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const res = await createFoodProduct(clean, {
      ...toOffFields(parsed.data),
      lang: cleanLang(lang),
      comment: "Added from the V-Healthy app",
    });
    return toWriteResult(res, 201);
  } catch (error) {
    console.error("[v0] registerFoodProduct failed:", (error as Error).message);
    return { ok: false, reason: "error" };
  }
}

// Complete an existing product with the fields the user confirmed. Only the
// given fields are sent; list fields replace the whole list on Open Food Facts.
export async function completeFoodProduct(
  barcode: string,
  patch: FoodProductPatch,
  lang?: string,
): Promise<FoodWriteResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  const clean = (barcode ?? "").replace(/\D+/g, "");
  const parsed = patchSchema.safeParse(patch);
  if (!BARCODE_RE.test(clean) || !parsed.success) {
    return { ok: false, reason: "invalid" };
  }
  const fields = toOffFields(parsed.data);
  if (Object.keys(fields).length === 0) return { ok: true };

  try {
    const res = await updateFoodProduct(clean, {
      ...fields,
      lang: cleanLang(lang),
      comment: "Added from the V-Healthy app",
    });
    return toWriteResult(res, 200);
  } catch (error) {
    console.error("[v0] completeFoodProduct failed:", (error as Error).message);
    return { ok: false, reason: "error" };
  }
}

// Save (user-verified) ingredients text on an existing product.
export async function saveFoodIngredients(
  barcode: string,
  ingredients: string,
  lang?: string,
): Promise<FoodWriteResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  const clean = (barcode ?? "").replace(/\D+/g, "");
  const text = (ingredients ?? "").trim();
  if (!BARCODE_RE.test(clean) || !text || text.length > 5000) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const res = await updateFoodProduct(clean, {
      ingredients: text,
      lang: cleanLang(lang),
      comment: "Ingredients verified in the V-Healthy app",
    });
    return toWriteResult(res, 200);
  } catch (error) {
    console.error("[v0] saveFoodIngredients failed:", (error as Error).message);
    return { ok: false, reason: "error" };
  }
}

// Upload one product photo. Expects FormData with `barcode`, `kind`, `lang`
// and `image` (a JPEG/PNG/GIF file up to 10 MB).
export async function uploadFoodPhoto(
  form: FormData,
): Promise<FoodPhotoUploadResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  const barcode = String(form.get("barcode") ?? "").replace(/\D+/g, "");
  const kind = String(form.get("kind") ?? "") as FoodPhotoKind;
  const lang = cleanLang(String(form.get("lang") ?? ""));
  const image = form.get("image");

  if (
    !BARCODE_RE.test(barcode) ||
    !PHOTO_KINDS.includes(kind) ||
    !(image instanceof Blob) ||
    !PHOTO_MIME.has(image.type) ||
    image.size === 0 ||
    image.size > MAX_PHOTO_BYTES
  ) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const res = await uploadFoodImage(barcode, image, kind, lang);
    const result = toWriteResult(res, 201);
    if (!result.ok) return result;
    const imgid = Number(res.body.imgid);
    return { ok: true, imgid: Number.isInteger(imgid) && imgid > 0 ? imgid : null };
  } catch (error) {
    console.error("[v0] uploadFoodPhoto failed:", (error as Error).message);
    return { ok: false, reason: "error" };
  }
}

// Read the ingredients list off the product's ingredients photo (OCR). This
// saves nothing — the user reviews the text, then calls saveFoodIngredients.
export async function readIngredientsFromPhoto(
  barcode: string,
  lang?: string,
): Promise<IngredientsOcrResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  const clean = (barcode ?? "").replace(/\D+/g, "");
  if (!BARCODE_RE.test(clean)) return { ok: false, reason: "invalid" };

  try {
    const res = await readFoodIngredientsFromPhoto(clean, cleanLang(lang));
    const { status, body } = res;
    if (status === 200 && typeof body.ingredients === "string") {
      return {
        ok: true,
        ingredients: body.ingredients,
        lang: typeof body.lang === "string" ? body.lang : cleanLang(lang),
      };
    }
    // 404 with an `available` list = the product exists but has no
    // ingredients photo in that language.
    if (status === 404 && Array.isArray(body.available)) {
      return { ok: false, reason: "no-photo", available: body.available };
    }
    const failure = toWriteResult(res, 200);
    return failure.ok ? { ok: false, reason: "error" } : failure;
  } catch (error) {
    console.error("[v0] readIngredientsFromPhoto failed:", (error as Error).message);
    return { ok: false, reason: "error" };
  }
}

// Fetch all saved foods for the current user, ordered by most recently saved.
export async function fetchUserSavedFoods(): Promise<SavedFoodProduct[]> {
  const userKey = await getUserKey();
  if (!userKey) return [];

  const rows = await db
    .select()
    .from(savedFoods)
    .where(eq(savedFoods.userKey, userKey))
    .orderBy(desc(savedFoods.savedAt));

  return rows.map((row) => {
    const { nutrition, meta } = parseNutritionData(row.nutritionData);
    return {
      barcode: row.barcode,
      name: row.name,
      brand: row.brand,
      image: row.image,
      nutrition,
      meta,
      savedAt: row.savedAt,
    };
  });
}

// Save a food product for the current user. If already saved, this is a no-op.
export async function saveFoodProduct(product: FoodProduct): Promise<boolean> {
  const userKey = await getUserKey();
  if (!userKey) return false;

  try {
    // Upsert: try to insert, ignore if barcode already exists for this user.
    await db
      .insert(savedFoods)
      .values({
        userKey,
        barcode: product.barcode,
        name: product.name,
        brand: product.brand ?? null,
        image: product.image ?? null,
        // Store the current `{ nutrition, meta }` shape so the detail view can
        // show rich facts for saved foods too.
        nutritionData: JSON.stringify({
          nutrition: product.nutrition,
          meta: product.meta,
        }),
      })
      .onConflictDoNothing();

    return true;
  } catch (error) {
    console.error("[v0] saveFoodProduct failed:", (error as Error).message);
    return false;
  }
}

// Remove a saved food product by barcode for the current user.
export async function removeSavedFood(barcode: string): Promise<boolean> {
  const userKey = await getUserKey();
  if (!userKey) return false;

  try {
    await db
      .delete(savedFoods)
      .where(
        and(
          eq(savedFoods.userKey, userKey),
          eq(savedFoods.barcode, barcode),
        ),
      );
    return true;
  } catch (error) {
    console.error("[v0] removeSavedFood failed:", (error as Error).message);
    return false;
  }
}
