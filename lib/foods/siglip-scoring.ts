import { GATE_FOOD, GATE_NON_FOOD, type FoodPrompt } from "./food-prompts";
import { siglipProbability } from "./siglip-shared";

export type CropKind = "full" | "center" | "tile";
export type CropEmbedding = { kind: CropKind; vector: Float32Array };

export type ScoredEntry = { id: string; score: number };
export type ScoreResult = {
  ranked: ScoredEntry[];
  food: number;
  nonFood: number;
};

// Side items found only in a tile count a bit less than whole-plate matches.
const TILE_WEIGHT = 0.85;

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export function scoreCrops(
  crops: CropEmbedding[],
  prompts: FoodPrompt[],
  textVectors: Float32Array[],
  boost: (id: string) => number = () => 1,
): ScoreResult {
  const globalScores = new Map<string, number>();
  const tileScores = new Map<string, number>();
  let food = 0;
  let nonFood = 0;

  for (const crop of crops) {
    const target = crop.kind === "tile" ? tileScores : globalScores;
    for (let j = 0; j < prompts.length; j++) {
      const p = siglipProbability(dot(crop.vector, textVectors[j]));
      const { id } = prompts[j];
      if (id === GATE_FOOD || id === GATE_NON_FOOD) {
        if (crop.kind === "tile") continue;
        if (id === GATE_FOOD) food = Math.max(food, p);
        else nonFood = Math.max(nonFood, p);
        continue;
      }
      target.set(id, Math.max(target.get(id) ?? 0, p));
    }
  }

  const ids = new Set([...globalScores.keys(), ...tileScores.keys()]);
  const ranked = [...ids]
    .map((id) => ({
      id,
      score:
        Math.max(globalScores.get(id) ?? 0, (tileScores.get(id) ?? 0) * TILE_WEIGHT) * boost(id),
    }))
    .sort((a, b) => b.score - a.score);

  return { ranked, food, nonFood };
}
