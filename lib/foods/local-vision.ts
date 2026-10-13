"use client";

import type { ZeroShotImageClassificationPipeline } from "@huggingface/transformers";
import type { FoodPhotoItem, FoodPhotoResult } from "./photo-types";
import { sanitizePer100g } from "./photo-postprocess";
import { REFERENCE_TABLE, type ReferenceEntry } from "./reference-table";

// Open-source CLIP (MIT) running fully in the browser via Transformers.js (Apache-2.0).
// Weights are downloaded once from the Hugging Face Hub and cached by the browser.
const MODEL_ID = "Xenova/clip-vit-base-patch32";
const HYPOTHESIS = "a photo of {}.";
const MAX_ITEMS = 3;
const MIN_SCORE = 0.04;
const TOP_MIN_SCORE = 0.12;

const NON_FOOD_LABELS = [
  "a person",
  "a room interior",
  "a text document",
  "a screen",
  "an animal",
  "a car",
  "an empty plate",
];

const LABEL_TO_ENTRY = new Map<string, ReferenceEntry>();
for (const entry of REFERENCE_TABLE) {
  const label = entry.nameEn.toLowerCase();
  if (!LABEL_TO_ENTRY.has(label)) LABEL_TO_ENTRY.set(label, entry);
}
const FOOD_LABELS = [...LABEL_TO_ENTRY.keys()];
const NON_FOOD = new Set(NON_FOOD_LABELS);
const ALL_LABELS = [...FOOD_LABELS, ...NON_FOOD_LABELS];

let classifierPromise: Promise<ZeroShotImageClassificationPipeline> | null = null;

function getClassifier() {
  classifierPromise ??= import("@huggingface/transformers").then(
    ({ pipeline }) =>
      pipeline("zero-shot-image-classification", MODEL_ID, {
        dtype: "q8",
      }) as Promise<ZeroShotImageClassificationPipeline>,
  );
  classifierPromise.catch(() => {
    classifierPromise = null;
  });
  return classifierPromise;
}

export function preloadLocalFoodModel() {
  void getClassifier().catch(() => {});
}

function toItem(entry: ReferenceEntry, confidence: number, locale: "es" | "en"): FoodPhotoItem {
  return {
    id: `local-${entry.id}`,
    name: locale === "en" ? entry.nameEn : entry.nameEs,
    grams: entry.portionGrams,
    confidence: Math.round(confidence * 100) / 100,
    source: "reference",
    per100g: sanitizePer100g(
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugars: 0 },
      entry.carbsPer100g,
    ),
    reference: {
      id: entry.id,
      portion: locale === "en" ? entry.portionEn : entry.portionEs,
      portionGrams: entry.portionGrams,
      portionCarbs: entry.portionCarbs,
      ...(entry.warning ? { warning: entry.warning } : {}),
    },
  };
}

export async function analyzeFoodPhotoLocally(
  dataUrl: string,
  locale: "es" | "en",
): Promise<FoodPhotoResult> {
  if (!dataUrl.startsWith("data:image/")) return { ok: false, reason: "invalid-image" };
  try {
    const classifier = await getClassifier();
    const raw = await classifier(dataUrl, ALL_LABELS, { hypothesis_template: HYPOTHESIS });
    const ranked = (Array.isArray(raw[0]) ? raw[0] : raw) as { label: string; score: number }[];

    const top = ranked[0];
    if (!top || NON_FOOD.has(top.label)) return { ok: false, reason: "not-food" };

    const foods = ranked
      .filter((r) => !NON_FOOD.has(r.label) && r.score >= MIN_SCORE)
      .slice(0, MAX_ITEMS);
    if (!foods.length || foods[0].score < TOP_MIN_SCORE / 3) {
      return { ok: false, reason: "not-food" };
    }

    const best = foods[0].score;
    const items = foods.flatMap((r, index) => {
      const entry = LABEL_TO_ENTRY.get(r.label);
      if (!entry) return [];
      // Softmax over ~150 labels spreads probability thin, so scale relative to the best match.
      const relative = r.score / best;
      const confidence =
        index === 0 ? (best >= TOP_MIN_SCORE ? Math.max(0.6, best) : 0.4) : relative * 0.3;
      return [toItem(entry, Math.min(1, confidence), locale)];
    });
    return items.length ? { ok: true, items } : { ok: false, reason: "not-food" };
  } catch (err) {
    console.log("[v0] local vision failed:", err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err));
    return { ok: false, reason: "error" };
  }
}
