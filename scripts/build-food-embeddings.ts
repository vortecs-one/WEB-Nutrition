// Dev-only: precompute SigLIP text embeddings for every food prompt so the browser
// only has to download and run the vision encoder.
// Run: npx tsx scripts/build-food-embeddings.ts
import { mkdir, writeFile } from "node:fs/promises";
import { AutoTokenizer, SiglipTextModel } from "@huggingface/transformers";
import { ALL_PROMPTS } from "../lib/foods/food-prompts";
import { encodeEmbeddings, SIGLIP_MODEL_ID, TEXT_EMBEDDINGS_PATH } from "../lib/foods/siglip-shared";

const BATCH = 32;

async function main() {
  const tokenizer = await AutoTokenizer.from_pretrained(SIGLIP_MODEL_ID);
  const model = await SiglipTextModel.from_pretrained(SIGLIP_MODEL_ID, { dtype: "fp32" });

  const vectors: Float32Array[] = [];
  for (let i = 0; i < ALL_PROMPTS.length; i += BATCH) {
    const texts = ALL_PROMPTS.slice(i, i + BATCH).map((p) => p.text);
    const inputs = tokenizer(texts, { padding: "max_length", truncation: true, max_length: 64 });
    const { pooler_output } = await model(inputs);
    const [rows, dim] = pooler_output.dims as [number, number];
    const data = pooler_output.data as Float32Array;
    for (let r = 0; r < rows; r++) vectors.push(data.slice(r * dim, (r + 1) * dim));
    console.log(`encoded ${Math.min(i + BATCH, ALL_PROMPTS.length)}/${ALL_PROMPTS.length}`);
  }

  const file = encodeEmbeddings(ALL_PROMPTS, vectors);
  await mkdir("public/models", { recursive: true });
  await writeFile(`public${TEXT_EMBEDDINGS_PATH}`, JSON.stringify(file));
  console.log(`wrote public${TEXT_EMBEDDINGS_PATH} (${vectors.length} prompts, dim ${file.dim})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
