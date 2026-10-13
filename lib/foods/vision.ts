"use server";

import { generateText, Output } from "ai";
import { z } from "zod";
import { auth } from "@/auth";
import type { FoodPhotoItem, FoodPhotoPer100g, FoodPhotoResult } from "./photo-types";
import { REFERENCE_BY_ID, REFERENCE_CATALOG, REFERENCE_SOURCE } from "./reference-table";

const VISION_MODEL = "google/gemini-3.5-flash";

// Client compresses to ~1024px JPEG, which lands well under this.
const MAX_IMAGE_BYTES = 1_500_000;

// Per-instance throttle. Serverless instances don't share memory, so this is
// a soft guard against accidental rapid-fire taps, not a hard quota.
const MIN_INTERVAL_MS = 4_000;
const lastCallByUser = new Map<string, number>();

const itemSchema = z.object({
  name: z.string().describe("Food name in the requested language, short and specific."),
  estimatedGrams: z
    .number()
    .describe("Estimated edible weight in grams of this item as served in the photo."),
  confidence: z
    .number()
    .describe("0 to 1: how confident you are in the identification and portion."),
  referenceId: z
    .string()
    .nullable()
    .describe("id from the reference table that matches this item, or null if none matches."),
  per100g: z.object({
    calories: z.number().describe("kcal per 100 g"),
    protein: z.number().describe("grams per 100 g"),
    carbs: z.number().describe("total carbohydrates, grams per 100 g"),
    fat: z.number().describe("grams per 100 g"),
    fiber: z.number().describe("grams per 100 g"),
    sugars: z.number().describe("grams per 100 g"),
  }),
});

const photoSchema = z.object({
  isFood: z.boolean().describe("False if the photo does not show food or drink."),
  items: z.array(itemSchema),
});

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

export async function analyzeFoodPhoto(
  imageDataUrl: string,
  locale: "es" | "en" = "es",
): Promise<FoodPhotoResult> {
  const session = await auth();
  const user = session?.user as { humanId?: string | null; email?: string | null } | undefined;
  const userKey = user?.humanId ?? user?.email;
  if (!session?.user || !userKey) return { ok: false, reason: "unauthenticated" };

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    imageDataUrl ?? "",
  );
  if (!match) return { ok: false, reason: "invalid-image" };
  const [, mediaType, base64] = match;
  if ((base64.length * 3) / 4 > MAX_IMAGE_BYTES) return { ok: false, reason: "invalid-image" };

  const now = Date.now();
  const last = lastCallByUser.get(userKey) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return { ok: false, reason: "rate-limited" };
  lastCallByUser.set(userKey, now);

  const language = locale === "en" ? "English" : "Spanish (Latin America)";

  try {
    const { output } = await generateText({
      model: VISION_MODEL,
      output: Output.object({ schema: photoSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "You are a nutrition assistant. Identify every distinct food or drink visible in this photo.",
                "For each item estimate the edible weight in grams using visual cues (plate ~26 cm, cutlery, hands).",
                "Give typical nutrition values per 100 g for the item as prepared (consider cooking method, sauces, oil).",
                "Split mixed plates into their main components when they are visually separable.",
                `Write food names in ${language}.`,
                "If the photo shows no food, set isFood to false and return an empty items list.",
                "",
                `Reference table (${REFERENCE_SOURCE}, Chilean foods). Columns: id | name (aliases) | household portion | grams | carbs per portion.`,
                "For each item set referenceId to the matching id, or null when nothing in the table matches.",
                "Prefer matching a whole home-made dish (cazuela, pastel de choclo, empanada, charquicán…) as ONE item instead of splitting it into ingredients.",
                "Use the table's portion weights as a scale hint when estimating grams.",
                "Use null for packaged or branded products and for anything not in the table.",
                "'Pepino dulce' is a sweet fruit: never match it to cucumber. 'Tuna' is prickly pear, not tuna fish.",
                REFERENCE_CATALOG,
              ].join("\n"),
            },
            { type: "file", mediaType, data: base64 },
          ],
        },
      ],
    });

    if (!output.isFood || output.items.length === 0) {
      return { ok: false, reason: "not-food" };
    }

    const items: FoodPhotoItem[] = output.items.slice(0, 12).map((item, i) => {
      const base: FoodPhotoItem = {
        id: `ai-${now}-${i}`,
        name: item.name.trim() || "—",
        grams: Math.round(clamp(item.estimatedGrams, 1, 2000)),
        confidence: clamp(item.confidence, 0, 1),
        source: "ai",
        per100g: {
          calories: clamp(item.per100g.calories, 0, 950),
          protein: clamp(item.per100g.protein, 0, 100),
          carbs: clamp(item.per100g.carbs, 0, 100),
          fat: clamp(item.per100g.fat, 0, 100),
          fiber: clamp(item.per100g.fiber, 0, 100),
          sugars: clamp(item.per100g.sugars, 0, 100),
        },
      };

      const ref = item.referenceId ? REFERENCE_BY_ID.get(item.referenceId) : undefined;
      if (!ref) return base;

      // The table is authoritative for carbs only; keep AI protein/fat and
      // shift calories by the carb difference (4 kcal/g).
      const carbs = ref.carbsPer100g;
      const per100g: FoodPhotoPer100g = {
        ...base.per100g,
        carbs,
        calories: Math.max(0, base.per100g.calories - 4 * (base.per100g.carbs - carbs)),
        fiber: Math.min(base.per100g.fiber, carbs),
        sugars: Math.min(base.per100g.sugars, carbs),
      };

      return {
        ...base,
        source: "reference",
        per100g,
        reference: {
          id: ref.id,
          portion: locale === "en" ? ref.portionEn : ref.portionEs,
          portionGrams: ref.portionGrams,
          portionCarbs: ref.portionCarbs,
          ...(ref.warning ? { warning: ref.warning } : {}),
        },
      };
    });

    return { ok: true, items };
  } catch (error) {
    console.error("[food-photo] analysis failed:", error);
    return { ok: false, reason: "error" };
  }
}
