import type { FoodPrompt } from "./food-prompts";

// SigLIP base (Apache-2.0). Text embeddings are precomputed at build time; the
// browser only loads the ~99 MB quantized vision encoder.
export const SIGLIP_MODEL_ID = "Xenova/siglip-base-patch16-224";
export const TEXT_EMBEDDINGS_PATH = "/models/food-siglip-text.json";

// Learned scale/bias of google/siglip-base-patch16-224 (read from model.safetensors).
export const SIGLIP_LOGIT_SCALE = 117.33;
export const SIGLIP_LOGIT_BIAS = -12.93;

export type EmbeddingsFile = {
  model: string;
  dim: number;
  prompts: FoodPrompt[];
  // Int8 per-vector quantized, L2-normalized embeddings (base64).
  data: string;
  scales: number[];
};

const toBase64 = (bytes: Uint8Array) =>
  typeof Buffer !== "undefined"
    ? Buffer.from(bytes).toString("base64")
    : btoa(String.fromCharCode(...bytes));

const fromBase64 = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function normalizeVector(v: Float32Array) {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export function encodeEmbeddings(prompts: FoodPrompt[], vectors: Float32Array[]): EmbeddingsFile {
  const dim = vectors[0]?.length ?? 0;
  const bytes = new Int8Array(vectors.length * dim);
  const scales = vectors.map((raw, r) => {
    const v = normalizeVector(raw);
    const max = v.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;
    for (let i = 0; i < dim; i++) bytes[r * dim + i] = Math.round((v[i] / max) * 127);
    return max / 127;
  });
  return {
    model: SIGLIP_MODEL_ID,
    dim,
    prompts,
    data: toBase64(new Uint8Array(bytes.buffer)),
    scales,
  };
}

export function decodeEmbeddings(file: EmbeddingsFile): Float32Array[] {
  const bytes = new Int8Array(fromBase64(file.data).buffer);
  return file.scales.map((scale, r) => {
    const v = new Float32Array(file.dim);
    for (let i = 0; i < file.dim; i++) v[i] = bytes[r * file.dim + i] * scale;
    return normalizeVector(v);
  });
}

export const siglipProbability = (cosine: number) =>
  1 / (1 + Math.exp(-(SIGLIP_LOGIT_SCALE * cosine + SIGLIP_LOGIT_BIAS)));
