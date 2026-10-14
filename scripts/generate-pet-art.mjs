// Generates companion artwork in the storybook style of public/pets/*.png,
// through the Vercel AI Gateway (needs AI_GATEWAY_API_KEY in .env.local).
//
//   node --env-file=.env.local scripts/generate-pet-art.mjs <id> [--count 3]
//     → writes candidates to <tmp>/pet-art/<id>-candidate-<n>.png
//     (add --model <gateway-model-id> to try a specific model)
//   node scripts/generate-pet-art.mjs <id> --pick <n>
//     → copies the chosen candidate to public/pets/<id>.png
//
// Existing portraits are sent as style references so the new one matches
// their paper, ink and watercolor look. Each candidate is a paid image call.
import os from "node:os";
import path from "node:path";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { generateImage, generateText } from "ai";
import sharp from "sharp";

const STYLE_REFERENCES = ["public/pets/bambi.png", "public/pets/pinocchio.png"];
const MODELS = ["google/gemini-3-pro-image", "openai/gpt-image-1.5"];

const STYLE =
  "Use exactly the same illustration style as the reference images: a single aged cream parchment " +
  "card with soft vignette and faint stains, fine sepia ink outlines with delicate cross-hatching, " +
  "soft muted watercolor washes, vintage storybook look. The character is drawn full body, centered, " +
  "with plenty of empty paper around it and no frame, no border, no text, no signature, " +
  "no other scenery or background.";

// Subject prompts per companion id.
const SUBJECTS = {
  "humboldt-penguin":
    "Subject: a friendly Humboldt penguin (Spheniscus humboldti), standing upright in a three-quarter " +
    "view, anatomically accurate: black-brown back and head, white belly with a single black band " +
    "across the chest and a few small black speckles, a white stripe curving from the eye around the " +
    "face, a pink fleshy patch of bare skin at the base of the black beak, black flippers held slightly " +
    "out, black-and-pink webbed feet. It stands on a small patch of snow and ice at its feet (a few " +
    "snow mounds and icy crystals, drawn in the same ink and pale blue watercolor), like the grass " +
    "patch under the reference deer.",
};

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!id || !SUBJECTS[id]) {
  console.error(`usage: node --env-file=.env.local scripts/generate-pet-art.mjs <id> [--count n | --pick n]`);
  console.error(`known ids: ${Object.keys(SUBJECTS).join(", ")}`);
  process.exit(1);
}

const outDir = path.join(os.tmpdir(), "pet-art");
await mkdir(outDir, { recursive: true });
const candidatePath = (n) => path.join(outDir, `${id}-candidate-${n}.png`);

const pick = flag("pick");
if (pick) {
  await copyFile(candidatePath(pick), `public/pets/${id}.png`);
  console.log(`public/pets/${id}.png ← ${candidatePath(pick)}`);
  process.exit(0);
}

if (!process.env.AI_GATEWAY_API_KEY) {
  console.error("AI_GATEWAY_API_KEY is not set: add it to .env.local and run with --env-file=.env.local");
  process.exit(1);
}

const references = await Promise.all(STYLE_REFERENCES.map((f) => readFile(f)));
const count = Number(flag("count") ?? 3);
// --model <id> tries just that model (e.g. a cheaper one) instead of MODELS.
const models = flag("model") ? [flag("model")] : MODELS;
for (let n = 1; n <= count; n++) {
  let saved = false;
  for (const model of models) {
    try {
      const text = `${STYLE}\n\n${SUBJECTS[id]}`;
      let bytes;
      if (model.startsWith("google/")) {
        // Gemini image models are language models on the gateway: they
        // return the picture as a generated file of a text call.
        const result = await generateText({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text },
                ...references.map((data) => ({ type: "file", data, mediaType: "image/png" })),
              ],
            },
          ],
        });
        const file = result.files.find((f) => f.mediaType?.startsWith("image/"));
        if (!file) throw new Error(`no image in the response (${result.text?.slice(0, 120) || "empty"})`);
        bytes = file.uint8Array;
      } else {
        const { image } = await generateImage({
          model,
          prompt: { images: references, text },
          aspectRatio: "1:1",
        });
        bytes = image.uint8Array;
      }
      // Normalise to the same 1024×1024 PNG as the other portraits.
      await sharp(Buffer.from(bytes)).resize(1024, 1024, { fit: "cover" }).png().toFile(candidatePath(n));
      console.log(`candidate ${n} (${model}): ${candidatePath(n)}`);
      saved = true;
      break;
    } catch (err) {
      console.error(`candidate ${n}: ${model} failed — ${err.message}`);
    }
  }
  if (!saved) process.exitCode = 1;
}
