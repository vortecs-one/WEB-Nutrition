"use client";

import type {
  PreTrainedModel,
  Processor,
  RawImage as RawImageType,
  ZeroShotImageClassificationPipeline,
} from "@huggingface/transformers";
import type { FoodPhotoItem, FoodPhotoResult } from "./photo-types";
import { referenceToItem } from "./photo-postprocess";
import { REFERENCE_BY_ID, REFERENCE_TABLE, type ReferenceEntry } from "./reference-table";
import {
  decodeEmbeddings,
  normalizeVector,
  SIGLIP_MODEL_ID,
  TEXT_EMBEDDINGS_PATH,
  type EmbeddingsFile,
} from "./siglip-shared";
import { scoreCrops, type CropEmbedding, type CropKind, type ScoredEntry } from "./siglip-scoring";

// Open-source SigLIP (Apache-2.0) via Transformers.js, fully in the browser. Text
// embeddings for every table entry are precomputed, so only the vision encoder loads.
const MAX_ITEMS = 4;
const MAX_ALTERNATIVES = 4;
// Calibrated on sample photos: real foods top out well above this, non-food stays < 0.002.
const MIN_TOP_SCORE = 0.02;
const MIN_SECONDARY_SCORE = 0.1;
const SECONDARY_RATIO = 0.2;
const PRIOR_BOOST = 1.1;

type SiglipRuntime = {
  processor: Processor;
  model: PreTrainedModel;
  RawImage: typeof RawImageType;
  file: EmbeddingsFile;
  text: Float32Array[];
};

let siglipPromise: Promise<SiglipRuntime> | null = null;

function getSiglip() {
  siglipPromise ??= (async () => {
    const [{ AutoProcessor, SiglipVisionModel, RawImage }, file] = await Promise.all([
      import("@huggingface/transformers"),
      fetch(TEXT_EMBEDDINGS_PATH).then((r) => {
        if (!r.ok) throw new Error(`embeddings ${r.status}`);
        return r.json() as Promise<EmbeddingsFile>;
      }),
    ]);
    const [processor, model] = await Promise.all([
      AutoProcessor.from_pretrained(SIGLIP_MODEL_ID),
      SiglipVisionModel.from_pretrained(SIGLIP_MODEL_ID, { dtype: "q8" }),
    ]);
    return { processor, model, RawImage, file, text: decodeEmbeddings(file) };
  })();
  siglipPromise.catch(() => {
    siglipPromise = null;
  });
  return siglipPromise;
}

export function preloadLocalFoodModel() {
  void getSiglip().catch(() => {});
}

// Full frame, the dashed-guide center crop, and four overlapping tiles for side items.
async function buildCrops(image: RawImageType) {
  const { width: w, height: h } = image;
  const box = (x: number, y: number, cw: number, ch: number) =>
    [Math.round(x), Math.round(y), Math.round(x + cw) - 1, Math.round(y + ch) - 1] as const;
  const crops: { kind: CropKind; image: RawImageType }[] = [{ kind: "full", image }];
  const cw = w * 0.8;
  const ch = h * 0.8;
  crops.push({ kind: "center", image: await image.crop([...box((w - cw) / 2, (h - ch) / 2, cw, ch)]) });
  const tw = w * 0.6;
  const th = h * 0.6;
  for (const [x, y] of [
    [0, 0],
    [w - tw, 0],
    [0, h - th],
    [w - tw, h - th],
  ]) {
    crops.push({ kind: "tile", image: await image.crop([...box(x, y, tw, th)]) });
  }
  return crops;
}

function mealSlotPrior(): (id: string) => number {
  const hour = new Date().getHours();
  const boosted = new Set<ReferenceEntry["group"]>(
    hour >= 5 && hour < 11
      ? ["breads", "dairy", "fruits"]
      : (hour >= 12 && hour < 16) || (hour >= 19 && hour < 23)
        ? ["dishes", "cereals", "legumes", "protein"]
        : [],
  );
  return (id) => (boosted.has(REFERENCE_BY_ID.get(id)?.group as never) ? PRIOR_BOOST : 1);
}

// Sigmoid scores are calibrated but small; sqrt spreads them into a usable 0–1 range.
const toConfidence = (score: number) => Math.min(0.99, Math.sqrt(Math.min(1, score)));

function pickItems(ranked: ScoredEntry[]) {
  const top = ranked[0];
  if (!top || top.score < MIN_TOP_SCORE) return null;
  const threshold = Math.max(MIN_SECONDARY_SCORE, top.score * SECONDARY_RATIO);
  const picked: ScoredEntry[] = [top];
  const usedGroups = new Set([REFERENCE_BY_ID.get(top.id)?.group]);
  for (const entry of ranked.slice(1)) {
    if (picked.length >= MAX_ITEMS || entry.score < threshold) break;
    // One per table group: rival dishes or milk variants become alternatives instead.
    const group = REFERENCE_BY_ID.get(entry.id)?.group;
    if (usedGroups.has(group)) continue;
    usedGroups.add(group);
    picked.push(entry);
  }
  const pickedIds = new Set(picked.map((p) => p.id));
  return picked.map((p) => {
    const group = REFERENCE_BY_ID.get(p.id)?.group;
    const others = ranked.filter((r) => !pickedIds.has(r.id));
    const sameGroup = others.filter((r) => REFERENCE_BY_ID.get(r.id)?.group === group);
    const alternatives = [...new Set([...sameGroup, ...others].map((r) => r.id))].slice(
      0,
      MAX_ALTERNATIVES,
    );
    return { ...p, alternatives };
  });
}

async function analyzeWithSiglip(dataUrl: string, locale: "es" | "en"): Promise<FoodPhotoResult> {
  const { processor, model, RawImage, file, text } = await getSiglip();
  const image = await RawImage.fromURL(dataUrl);
  const crops = await buildCrops(image);
  const inputs = await processor(crops.map((c) => c.image));
  const { pooler_output } = await model(inputs);
  const dim: number = pooler_output.dims[1];
  const data = pooler_output.data as Float32Array;
  const embeddings: CropEmbedding[] = crops.map((c, i) => ({
    kind: c.kind,
    vector: normalizeVector(data.slice(i * dim, (i + 1) * dim)),
  }));

  const { ranked, food, nonFood } = scoreCrops(embeddings, file.prompts, text, mealSlotPrior());
  const picks = pickItems(ranked);
  if (!picks || (nonFood > food && picks[0].score < MIN_SECONDARY_SCORE)) {
    return { ok: false, reason: "not-food" };
  }

  const items: FoodPhotoItem[] = picks.flatMap((p, index) => {
    const entry = REFERENCE_BY_ID.get(p.id);
    if (!entry) return [];
    return [
      referenceToItem(entry, locale, {
        id: `local-${index}-${entry.id}`,
        confidence: toConfidence(p.score),
        alternatives: p.alternatives,
      }),
    ];
  });
  return items.length ? { ok: true, items } : { ok: false, reason: "not-food" };
}

// CLIP fallback, only used if SigLIP fails to load (e.g. very old browsers).
const CLIP_MODEL_ID = "Xenova/clip-vit-base-patch32";
const CLIP_NON_FOOD = ["a person", "a room interior", "a text document", "a screen", "an empty plate"];
let clipPromise: Promise<ZeroShotImageClassificationPipeline> | null = null;

async function analyzeWithClip(dataUrl: string, locale: "es" | "en"): Promise<FoodPhotoResult> {
  clipPromise ??= import("@huggingface/transformers").then(
    ({ pipeline }) =>
      pipeline("zero-shot-image-classification", CLIP_MODEL_ID, {
        dtype: "q8",
      }) as Promise<ZeroShotImageClassificationPipeline>,
  );
  clipPromise.catch(() => {
    clipPromise = null;
  });
  const classifier = await clipPromise;
  const byLabel = new Map(REFERENCE_TABLE.map((e) => [e.nameEn.toLowerCase(), e]));
  const raw = await classifier(dataUrl, [...byLabel.keys(), ...CLIP_NON_FOOD], {
    hypothesis_template: "a photo of {}.",
  });
  const ranked = (Array.isArray(raw[0]) ? raw[0] : raw) as { label: string; score: number }[];
  const top = ranked[0];
  const entry = top && byLabel.get(top.label);
  if (!entry || top.score < 0.04) return { ok: false, reason: "not-food" };
  const alternatives = ranked
    .slice(1)
    .flatMap((r) => byLabel.get(r.label)?.id ?? [])
    .slice(0, MAX_ALTERNATIVES);
  return {
    ok: true,
    items: [referenceToItem(entry, locale, { id: `clip-${entry.id}`, confidence: 0.4, alternatives })],
  };
}

export async function analyzeFoodPhotoLocally(
  dataUrl: string,
  locale: "es" | "en",
): Promise<FoodPhotoResult> {
  if (!dataUrl.startsWith("data:image/")) return { ok: false, reason: "invalid-image" };
  try {
    return await analyzeWithSiglip(dataUrl, locale);
  } catch {
    try {
      return await analyzeWithClip(dataUrl, locale);
    } catch {
      return { ok: false, reason: "error" };
    }
  }
}
