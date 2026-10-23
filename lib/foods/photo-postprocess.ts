import type { FoodPhotoItem, FoodPhotoPer100g } from "./photo-types";
import { REFERENCE_BY_ID, REFERENCE_TABLE, type ReferenceEntry } from "./reference-table";
import { macrosFor } from "./reference-macros";
import { kcalFromMacros } from "@/lib/health-formulas";

export type RawPhotoItem = {
  name: string;
  estimatedGrams: number;
  portions: number | null;
  confidence: number;
  referenceId: string | null;
  per100g: FoodPhotoPer100g;
};

const MAX_ITEMS = 12;
const MAX_PORTIONS = 6;
const MIN_GRAMS = 3;
const MIN_CONFIDENCE = 0.15;
const MAX_KCAL_PER_100G = 900;
const KCAL_TOLERANCE = 0.2;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const REFERENCE_BY_NAME = (() => {
  const map = new Map<string, ReferenceEntry>();
  for (const entry of REFERENCE_TABLE) {
    for (const name of [entry.nameEs, entry.nameEn, ...entry.aliases]) {
      const key = normalize(name);
      if (key && !map.has(key)) map.set(key, entry);
    }
  }
  return map;
})();

export function findReference(referenceId: string | null, name: string) {
  return (
    (referenceId ? REFERENCE_BY_ID.get(referenceId) : undefined) ??
    REFERENCE_BY_NAME.get(normalize(name))
  );
}

const localDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Reference ids of table foods the user logged in the last `days` days, matched by meal name.
export function recentReferenceIds(
  log: Record<string, { meals: { name: string }[] }>,
  now = new Date(),
  days = 14,
): string[] {
  const cutoff = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
  const ids = new Set<string>();
  for (const [dateKey, day] of Object.entries(log)) {
    if (dateKey < cutoff) continue;
    for (const meal of day.meals) {
      const ref = findReference(null, meal.name);
      if (ref) ids.add(ref.id);
    }
  }
  return [...ids];
}

export function sanitizePer100g(raw: FoodPhotoPer100g, carbsOverride?: number): FoodPhotoPer100g {
  let protein = clamp(raw.protein, 0, 100);
  let carbs = carbsOverride ?? clamp(raw.carbs, 0, 100);
  let fat = clamp(raw.fat, 0, 100);

  const total = protein + carbs + fat;
  if (total > 100) {
    // Keep table carbs fixed and shrink the AI-estimated macros around them.
    if (carbsOverride !== undefined) {
      const room = Math.max(0, 100 - carbs);
      const scale = protein + fat > 0 ? room / (protein + fat) : 0;
      protein *= scale;
      fat *= scale;
    } else {
      const scale = 100 / total;
      protein *= scale;
      carbs *= scale;
      fat *= scale;
    }
  }

  const fiber = Math.min(clamp(raw.fiber, 0, 100), carbs);
  const sugars = Math.min(clamp(raw.sugars, 0, 100), carbs);
  const computed = kcalFromMacros({ protein, carbs, fat });
  const reported = clamp(raw.calories, 0, MAX_KCAL_PER_100G);

  const calories =
    carbsOverride !== undefined ||
    computed === 0 ||
    Math.abs(reported - computed) / Math.max(computed, 1) > KCAL_TOLERANCE
      ? computed
      : reported;

  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    calories: Math.round(Math.min(calories, MAX_KCAL_PER_100G)),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    fiber: round1(fiber),
    sugars: round1(sugars),
  };
}

export function searchReference(query: string, limit = 8): ReferenceEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const scored: { entry: ReferenceEntry; rank: number }[] = [];
  for (const entry of REFERENCE_TABLE) {
    let rank = Infinity;
    for (const name of [entry.nameEs, entry.nameEn, ...entry.aliases]) {
      const key = normalize(name);
      const at = key.indexOf(q);
      if (at === -1) continue;
      rank = Math.min(rank, at === 0 ? 0 : key.includes(` ${q}`) ? 1 : 2);
    }
    if (rank !== Infinity) scored.push({ entry, rank });
  }
  return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map((s) => s.entry);
}

// Builds an item straight from the Tabla H. de C.: one table portion by default,
// carbs locked to the table, other macros from the open-data snapshot.
export function referenceToItem(
  entry: ReferenceEntry,
  locale: "es" | "en",
  options: { id: string; confidence?: number; grams?: number; alternatives?: string[] },
): FoodPhotoItem {
  const macros = macrosFor(entry.id);
  return {
    id: options.id,
    name: locale === "en" ? entry.nameEn : entry.nameEs,
    grams: options.grams ?? entry.portionGrams,
    confidence: Math.round((options.confidence ?? 1) * 100) / 100,
    source: "reference",
    per100g: sanitizePer100g(
      { calories: 0, carbs: entry.carbsPer100g, ...macros },
      entry.carbsPer100g,
    ),
    reference: {
      id: entry.id,
      portion: locale === "en" ? entry.portionEn : entry.portionEs,
      portionGrams: entry.portionGrams,
      portionCarbs: entry.portionCarbs,
      ...(entry.warning ? { warning: entry.warning } : {}),
    },
    ...(options.alternatives?.length ? { alternatives: options.alternatives } : {}),
  };
}

export function postprocessPhotoItems(
  raw: RawPhotoItem[],
  locale: "es" | "en",
  idPrefix: string,
): FoodPhotoItem[] {
  const items: FoodPhotoItem[] = [];
  const byReference = new Map<string, FoodPhotoItem>();

  for (const item of raw) {
    const confidence = clamp(item.confidence, 0, 1);
    if (confidence < MIN_CONFIDENCE) continue;

    const ref = findReference(item.referenceId, item.name);
    const portions =
      ref && item.portions && item.portions > 0 ? clamp(item.portions, 0.25, MAX_PORTIONS) : null;
    const grams = Math.round(
      portions && ref ? portions * ref.portionGrams : clamp(item.estimatedGrams, 0, 2000),
    );
    if (grams < MIN_GRAMS) continue;

    const name = item.name.trim() || (ref ? (locale === "en" ? ref.nameEn : ref.nameEs) : "—");

    if (!ref) {
      items.push({
        id: `${idPrefix}-${items.length}`,
        name,
        grams,
        confidence,
        source: "ai",
        per100g: sanitizePer100g(item.per100g),
      });
      continue;
    }

    const existing = byReference.get(ref.id);
    if (existing) {
      existing.grams += grams;
      existing.confidence = Math.max(existing.confidence, confidence);
      continue;
    }

    const merged: FoodPhotoItem = {
      id: `${idPrefix}-${items.length}`,
      name,
      grams,
      confidence,
      source: "reference",
      per100g: sanitizePer100g(item.per100g, ref.carbsPer100g),
      reference: {
        id: ref.id,
        portion: locale === "en" ? ref.portionEn : ref.portionEs,
        portionGrams: ref.portionGrams,
        portionCarbs: ref.portionCarbs,
        ...(ref.warning ? { warning: ref.warning } : {}),
      },
    };
    byReference.set(ref.id, merged);
    items.push(merged);
  }

  for (const item of items) item.grams = Math.min(item.grams, 2000);
  return items.slice(0, MAX_ITEMS);
}
