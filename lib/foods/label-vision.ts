"use server";

import { generateText, Output } from "ai";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { aiPhotoScans } from "@/drizzle/schema";
import { BARCODE_RE, cleanUploadedPhotos, offImageUrl, type UploadedPhoto } from "./off-images";
import type { LabelAiResult, NutrimentKey, ProductExtraction } from "./types";

// Fallback only: runs when Open Food Facts' own OCR + Robotoff left fields
// empty, and only for those fields. The model reads the photos straight from
// Open Food Facts, so nothing is re-uploaded.

const LABEL_MODEL = "google/gemini-3.8-flash";
const USER_DAILY_LIMIT = 10;
const GLOBAL_DAILY_LIMIT = 80;
const MIN_INTERVAL_MS = 4_000;
const lastCallByUser = new Map<string, number>();

const CACHE_SIZE = 50;
const resultCache = new Map<string, ProductExtraction>();

const FIELDS = [
  "brand",
  "quantity",
  "servingSize",
  "ingredients",
  "categories",
  "labels",
  "nutrition",
] as const;
export type LabelField = (typeof FIELDS)[number];

const num = (d: string) => z.number().nullable().describe(d);
const labelSchema = z.object({
  brand: z.string().nullable().describe("Brand exactly as printed, or null."),
  quantity: z.string().nullable().describe('Net quantity with unit as printed, e.g. "400 g", or null.'),
  servingSize: z.string().nullable().describe('Serving size with unit, e.g. "30 g", or null.'),
  ingredients: z
    .string()
    .nullable()
    .describe("Ingredient list transcribed verbatim from the package, or null if not visible."),
  categories: z.array(z.string()).describe("1-3 product categories from general to specific."),
  labels: z.array(z.string()).describe("Certifications/claims printed on pack (Organic, Gluten-free...)."),
  nutritionBasis: z
    .enum(["100g", "serving"])
    .nullable()
    .describe("Column the nutrition values below were read from. Prefer per 100 g/ml."),
  nutriments: z.object({
    "energy-kcal": num("kcal"),
    "energy-kj": num("kJ"),
    fat: num("g"),
    "saturated-fat": num("g"),
    carbohydrates: num("g"),
    sugars: num("g"),
    fiber: num("g"),
    proteins: num("g"),
    salt: num("g"),
    sodium: num("mg"),
  }),
});

const SYSTEM_PROMPT = [
  "You read packaged food labels from photos.",
  "Only report values that are clearly printed on the package. Use null (or an empty list) for anything not visible.",
  "Never estimate or invent values. Transcribe the ingredient list verbatim, keeping allergens and percentages.",
  "Nutrition: read one column only, per 100 g/ml if present, otherwise per serving, and set nutritionBasis.",
  "Sodium in mg. Energy as printed (kcal and/or kJ).",
].join("\n");

async function consumeQuota(userKey: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const bump = (key: string) =>
    db
      .insert(aiPhotoScans)
      .values({ userKey: key, day, count: 1 })
      .onConflictDoUpdate({
        target: [aiPhotoScans.userKey, aiPhotoScans.day],
        set: { count: sql`${aiPhotoScans.count} + 1` },
      })
      .returning({ count: aiPhotoScans.count });

  const [user] = await bump(`label:${userKey}`);
  if (user.count > USER_DAILY_LIMIT) return false;
  const [global] = await bump("label:__global__");
  return global.count <= GLOBAL_DAILY_LIMIT;
}

function toExtraction(
  output: z.infer<typeof labelSchema>,
  wanted: Set<LabelField>,
): ProductExtraction {
  const ai = <T>(value: T) => ({ value, source: "ai" as const });
  const out: ProductExtraction = {};
  if (wanted.has("brand") && output.brand?.trim()) out.brand = ai(output.brand.trim());
  if (wanted.has("quantity") && output.quantity?.trim()) out.quantity = ai(output.quantity.trim());
  if (wanted.has("servingSize") && output.servingSize?.trim()) {
    out.servingSize = ai(output.servingSize.trim());
  }
  if (wanted.has("ingredients") && output.ingredients?.trim()) {
    out.ingredients = ai(output.ingredients.trim());
  }
  if (wanted.has("categories") && output.categories.length) {
    out.categories = ai(output.categories.slice(0, 5));
  }
  if (wanted.has("labels") && output.labels.length) out.labels = ai(output.labels.slice(0, 10));
  if (wanted.has("nutrition")) {
    const nutriments: ProductExtraction["nutriments"] = {};
    for (const [key, value] of Object.entries(output.nutriments)) {
      if (value != null && Number.isFinite(value) && value >= 0) {
        nutriments[key as NutrimentKey] = ai(value);
      }
    }
    if (Object.keys(nutriments).length) {
      out.nutriments = nutriments;
      out.nutritionBasis = ai(output.nutritionBasis ?? "100g");
    }
  }
  return out;
}

export async function readLabelWithAi(
  barcode: string,
  uploaded: UploadedPhoto[],
  missing: LabelField[],
  lang?: string,
): Promise<LabelAiResult> {
  const session = await auth();
  const user = session?.user as { humanId?: string | null; email?: string | null } | undefined;
  const userKey = user?.humanId ?? user?.email;
  if (!session?.user || !userKey) return { ok: false, reason: "unauthenticated" };

  const clean = (barcode ?? "").replace(/\D+/g, "");
  const photos = cleanUploadedPhotos(uploaded);
  const wanted = new Set((missing ?? []).filter((f) => FIELDS.includes(f)));
  if (!BARCODE_RE.test(clean) || photos.length === 0 || wanted.size === 0) {
    return { ok: false, reason: "invalid" };
  }

  const cacheKey = `${clean}:${photos.map((p) => p.imgid).join(",")}:${[...wanted].sort()}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return { ok: true, data: cached };

  const now = Date.now();
  if (now - (lastCallByUser.get(userKey) ?? 0) < MIN_INTERVAL_MS) {
    return { ok: false, reason: "rate-limited" };
  }
  lastCallByUser.set(userKey, now);

  try {
    if (!(await consumeQuota(userKey))) return { ok: false, reason: "quota" };
  } catch (error) {
    console.error("[label-ai] quota check failed:", error);
    return { ok: false, reason: "error" };
  }

  const language = lang === "en" ? "English" : "Spanish";
  try {
    const { output } = await generateText({
      model: LABEL_MODEL,
      output: Output.object({ schema: labelSchema }),
      reasoning: "minimal",
      maxOutputTokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Photos of one product (${photos.map((p) => p.kind).join(", ")}). Fields needed: ${[...wanted].join(", ")}. Write categories and labels in ${language}.`,
            },
            ...photos.map((p) => ({
              type: "file" as const,
              mediaType: "image/jpeg",
              data: new URL(offImageUrl(clean, p.imgid)),
            })),
          ],
        },
      ],
    });

    const data = toExtraction(output, wanted);
    resultCache.set(cacheKey, data);
    if (resultCache.size > CACHE_SIZE) {
      const oldest = resultCache.keys().next().value;
      if (oldest) resultCache.delete(oldest);
    }
    return { ok: true, data };
  } catch (error) {
    console.error("[label-ai] failed:", error);
    return { ok: false, reason: "error" };
  }
}
