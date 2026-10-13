"use server";

import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { aiPhotoScans } from "@/drizzle/schema";
import type { FoodPhotoResult } from "./photo-types";
import { postprocessPhotoItems } from "./photo-postprocess";
import { REFERENCE_CATALOG, REFERENCE_SOURCE } from "./reference-table";

// Half the price of gemini-3.5-flash; supports vision + structured output.
const VISION_MODEL = "google/gemini-3.8-flash";

// Client compresses to ~768px JPEG, which lands well under this.
const MAX_IMAGE_BYTES = 1_500_000;

// Hard daily caps protect the AI Gateway balance.
const USER_DAILY_LIMIT = 25;
const GLOBAL_DAILY_LIMIT = 150;
const GLOBAL_KEY = "__global__";

// Guard against double taps only; the DB quota is the real limit.
const MIN_INTERVAL_MS = 4_000;
const lastCallByUser = new Map<string, number>();

// Same photo + locale is never paid for twice on this instance.
const CACHE_SIZE = 50;
const resultCache = new Map<string, FoodPhotoResult>();

const itemSchema = z.object({
  name: z.string().describe("Food name in the requested language, short and specific."),
  estimatedGrams: z
    .number()
    .describe("Estimated edible weight in grams of this item as served in the photo."),
  portions: z
    .number()
    .nullable()
    .describe(
      "Only when referenceId is set: how many of the table's household portions are visible (e.g. 1.5). Otherwise null.",
    ),
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

// Kept byte-identical across calls so Gemini's implicit prefix cache applies.
const SYSTEM_PROMPT = [
  "You are a nutrition assistant. Identify every distinct food or drink visible in the photo.",
  "For each item estimate the edible weight in grams using visual cues (plate ~26 cm, cutlery, hands, cups).",
  "Give typical nutrition values per 100 g for the item as prepared (consider cooking method, sauces, oil).",
  "Calories must be consistent with macros: kcal ≈ 4·protein + 4·carbs + 9·fat.",
  "Split mixed plates into their main components when they are visually separable; list each component once.",
  "Never invent brand names. If the photo shows no food, set isFood to false and return an empty items list.",
  "",
  `Reference table (${REFERENCE_SOURCE}, Chilean foods). Columns: id | name (aliases) | household portion | grams | carbs per portion.`,
  "For each item set referenceId to the matching id, or null when nothing in the table matches.",
  "When referenceId is set, also set portions = how many of that household portion are visible (0.5, 1, 1.5, 2…).",
  "Prefer matching a whole home-made dish (cazuela, pastel de choclo, empanada, charquicán…) as ONE item instead of splitting it into ingredients.",
  "Use the table's portion weights as a scale hint when estimating grams.",
  "Use null for packaged or branded products and for anything not in the table.",
  "'Pepino dulce' is a sweet fruit: never match it to cucumber. 'Tuna' is prickly pear, not tuna fish.",
  REFERENCE_CATALOG,
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

  const [user] = await bump(userKey);
  if (user.count > USER_DAILY_LIMIT) return false;
  const [global] = await bump(GLOBAL_KEY);
  return global.count <= GLOBAL_DAILY_LIMIT;
}

function remember(key: string, result: FoodPhotoResult) {
  resultCache.set(key, result);
  if (resultCache.size > CACHE_SIZE) {
    const oldest = resultCache.keys().next().value;
    if (oldest) resultCache.delete(oldest);
  }
}

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

  const cacheKey = `${locale}:${createHash("sha256").update(base64).digest("hex")}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return cached;

  const now = Date.now();
  const last = lastCallByUser.get(userKey) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return { ok: false, reason: "rate-limited" };
  lastCallByUser.set(userKey, now);

  try {
    if (!(await consumeQuota(userKey))) return { ok: false, reason: "quota" };
  } catch (error) {
    console.error("[food-photo] quota check failed:", error);
    return { ok: false, reason: "error" };
  }

  const language = locale === "en" ? "English" : "Spanish (Latin America)";

  try {
    const { output } = await generateText({
      model: VISION_MODEL,
      output: Output.object({ schema: photoSchema }),
      reasoning: "minimal",
      maxOutputTokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Write food names in ${language}.` },
            { type: "file", mediaType, data: base64 },
          ],
        },
      ],
    });

    const items = output.isFood ? postprocessPhotoItems(output.items, locale, `ai-${now}`) : [];
    const result: FoodPhotoResult =
      items.length > 0 ? { ok: true, items } : { ok: false, reason: "not-food" };
    remember(cacheKey, result);
    return result;
  } catch (error) {
    console.error("[food-photo] analysis failed:", error);
    return { ok: false, reason: "error" };
  }
}
