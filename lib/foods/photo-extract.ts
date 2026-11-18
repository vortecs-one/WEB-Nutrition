"use server";

import { auth } from "@/auth";
import { readFoodIngredientsFromPhoto } from "@/lib/thruxion-api";
import {
  BARCODE_RE,
  cleanUploadedPhotos,
  offImageUrl,
  offOcrUrl,
  type UploadedPhoto,
} from "./off-images";
import type {
  ExtractStatus,
  Extracted,
  NutrimentKey,
  NutritionBasis,
  ProductExtraction,
  ProductExtractionResult,
} from "./types";

// Reads uploaded product photos with Open Food Facts' own tools:
//   1. the Google Cloud Vision text Open Food Facts stores next to each photo,
//   2. Thruxion's ingredients-from-photo (Open Food Facts OCR),
//   3. Robotoff (Open Food Facts' public ML API) for nutrition facts,
//      ingredients and brand/label/category suggestions.
// Nothing is saved: the results only pre-fill the review form.

const ROBOTOFF = "https://robotoff.openfoodfacts.org/api/v1";
const OCR_POLL_MS = 2_000;
const OCR_WAIT_MS = 30_000;
const CALL_TIMEOUT_MS = 20_000;
const MIN_PREDICTION_CONFIDENCE = 0.6;
const MIN_NUTRIENT_SCORE = 0.5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Open Food Facts runs OCR a few seconds after an upload; the JSON appears
// next to the photo once it's done.
async function waitForOcr(ocrUrl: string): Promise<boolean> {
  const deadline = Date.now() + OCR_WAIT_MS;
  while (Date.now() < deadline) {
    const json = await getJson<{ responses?: unknown[] }>(ocrUrl);
    if (json?.responses?.[0]) return true;
    await sleep(OCR_POLL_MS);
  }
  return false;
}

const robo = <T>(path: string, params: Record<string, string>) =>
  getJson<T>(`${ROBOTOFF}${path}?${new URLSearchParams(params)}`);

const parseNum = (raw: unknown): number | null => {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const n = parseFloat(raw.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
};

// Robotoff nutrient entity names -> Food API nutriment keys.
const ROBOTOFF_NUTRIENTS: Record<string, NutrimentKey> = {
  "energy-kcal": "energy-kcal",
  "energy-kj": "energy-kj",
  fat: "fat",
  "saturated-fat": "saturated-fat",
  carbohydrates: "carbohydrates",
  sugars: "sugars",
  fiber: "fiber",
  proteins: "proteins",
  salt: "salt",
  sodium: "sodium",
};

type RobotoffNutrient = { value?: string; unit?: string | null; text?: string; score?: number };

async function readNutrition(
  barcode: string,
  photo: UploadedPhoto,
): Promise<Partial<ProductExtraction> | null> {
  const json = await robo<{ predictions?: { nutrients?: Record<string, RobotoffNutrient> }[] }>(
    "/predict/nutrition",
    {
      image_url: offImageUrl(barcode, photo.imgid),
      ocr_url: offOcrUrl(barcode, photo.imgid),
    },
  );
  const found = json?.predictions?.[0]?.nutrients ?? {};

  const byBasis: Record<NutritionBasis, Partial<Record<NutrimentKey, Extracted<number>>>> = {
    "100g": {},
    serving: {},
  };
  for (const [entity, n] of Object.entries(found)) {
    const match = /^(.+)_(100g|serving)$/.exec(entity);
    if (!match || (n.score ?? 0) < MIN_NUTRIENT_SCORE) continue;
    const key = ROBOTOFF_NUTRIENTS[match[1]];
    let value = parseNum(n.value);
    if (!key || value == null) continue;
    // The form takes sodium in mg.
    if (key === "sodium" && n.unit?.toLowerCase() !== "mg") value = value * 1000;
    byBasis[match[2] as NutritionBasis][key] = { value, source: "robotoff" };
  }

  // Prefer per-100 g (what Open Food Facts compares products on).
  const basis: NutritionBasis =
    Object.keys(byBasis["100g"]).length >= Object.keys(byBasis.serving).length
      ? "100g"
      : "serving";
  const nutriments = byBasis[basis];

  const out: Partial<ProductExtraction> = {};
  if (Object.keys(nutriments).length > 0) {
    out.nutriments = nutriments;
    out.nutritionBasis = { value: basis, source: "robotoff" };
  }
  const serving = found.serving_size;
  if (serving && (serving.score ?? 0) >= MIN_NUTRIENT_SCORE) {
    const text = (serving.text ?? serving.value ?? "").trim();
    if (text) {
      const withUnit = /[a-z]/i.test(text) ? text : `${text} ${serving.unit ?? "g"}`;
      out.servingSize = { value: withUnit, source: "robotoff" };
    }
  }
  return Object.keys(out).length ? out : null;
}

async function readIngredients(
  barcode: string,
  photo: UploadedPhoto,
  lang: string,
): Promise<Extracted<string> | null> {
  const thruxion = await readFoodIngredientsFromPhoto(barcode, lang).catch(() => null);
  const text = thruxion?.status === 200 ? thruxion.body.ingredients : null;
  if (typeof text === "string" && text.trim().length > 3) {
    return { value: text.trim(), source: "off-ocr" };
  }

  const json = await robo<{ entities?: { text?: string }[] }>("/predict/ingredient_list", {
    ocr_url: offOcrUrl(barcode, photo.imgid),
  });
  const best = (json?.entities ?? [])
    .map((e) => (e.text ?? "").trim())
    .sort((a, b) => b.length - a.length)[0];
  return best && best.length > 3 ? { value: best, source: "robotoff" } : null;
}

type OcrPrediction = {
  type?: string;
  value?: string | null;
  value_tag?: string | null;
  confidence?: number | null;
};

// Turn a taxonomy tag ("en:gluten-free") into a readable value ("Gluten free").
const tagToText = (tag: string) => {
  const raw = tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ").trim();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

async function readSuggestions(
  barcode: string,
  photos: UploadedPhoto[],
): Promise<Partial<ProductExtraction>> {
  const brands = new Map<string, number>();
  const labels = new Set<string>();
  const categories = new Set<string>();

  await Promise.all(
    photos.map(async (photo) => {
      const json = await robo<{ predictions?: OcrPrediction[] }>("/predict/ocr_prediction", {
        ocr_url: offOcrUrl(barcode, photo.imgid),
        prediction_types: "brand,label,category",
      });
      for (const p of json?.predictions ?? []) {
        // Taxonomy matches come without a confidence; they're exact matches.
        if (p.confidence != null && p.confidence < MIN_PREDICTION_CONFIDENCE) continue;
        const text = p.value?.trim() || (p.value_tag ? tagToText(p.value_tag) : "");
        if (!text) continue;
        if (p.type === "brand") brands.set(text, (brands.get(text) ?? 0) + 1);
        else if (p.type === "label") labels.add(text);
        else if (p.type === "category") categories.add(text);
      }
    }),
  );

  const out: Partial<ProductExtraction> = {};
  const brand = [...brands.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (brand) out.brand = { value: brand, source: "robotoff" };
  if (labels.size) out.labels = { value: [...labels].slice(0, 10), source: "robotoff" };
  if (categories.size) {
    out.categories = { value: [...categories].slice(0, 5), source: "robotoff" };
  }
  return out;
}

export async function extractFromProductPhotos(
  barcode: string,
  uploaded: UploadedPhoto[],
  lang?: string,
): Promise<ProductExtractionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  const clean = (barcode ?? "").replace(/\D+/g, "");
  const photos = cleanUploadedPhotos(uploaded);
  if (!BARCODE_RE.test(clean) || photos.length === 0) {
    return { ok: false, reason: "invalid" };
  }
  const language = lang && /^[a-z]{2}$/.test(lang) ? lang : "es";

  try {
    const ready = await Promise.all(
      photos.map(async (p) => ({ photo: p, ok: await waitForOcr(offOcrUrl(clean, p.imgid)) })),
    );
    const withText = ready.filter((r) => r.ok).map((r) => r.photo);
    const status: Record<string, ExtractStatus> = {};
    for (const r of ready) status[r.photo.kind] = r.ok ? "empty" : "no-text";

    const nutritionPhoto = withText.find((p) => p.kind === "nutrition");
    const ingredientsPhoto = withText.find((p) => p.kind === "ingredients");

    const [nutrition, ingredients, suggestions] = await Promise.all([
      nutritionPhoto ? readNutrition(clean, nutritionPhoto) : null,
      ingredientsPhoto ? readIngredients(clean, ingredientsPhoto, language) : null,
      withText.length ? readSuggestions(clean, withText) : {},
    ]);

    const data: ProductExtraction = { ...suggestions, ...(nutrition ?? {}) };
    if (ingredients) data.ingredients = ingredients;

    if (nutrition && nutritionPhoto) status.nutrition = "ok";
    if (ingredients && ingredientsPhoto) status.ingredients = "ok";
    if (Object.keys(suggestions).length) {
      for (const p of withText) if (p.kind === "front" || p.kind === "packaging") status[p.kind] = "ok";
    }
    return { ok: true, data, status };
  } catch (error) {
    console.error("[food-extract] failed:", (error as Error).message);
    return { ok: false, reason: "error" };
  }
}
