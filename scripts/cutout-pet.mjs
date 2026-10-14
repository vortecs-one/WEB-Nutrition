// Cuts a companion illustration out of its parchment background.
//
//   node scripts/cutout-pet.mjs bambi
//
// Reads public/pets/<id>.png and writes public/pets/<id>-cutout.png with a
// transparent background, used by the animated companion popup. The pet
// artwork is ink-outlined on light paper, so a flood fill from the image
// borders over "paper" pixels (light, low-chroma) removes the background
// without touching the drawing: the dark outline stops the fill.
import sharp from "sharp";

const id = process.argv[2];
if (!id) {
  console.error("usage: node scripts/cutout-pet.mjs <character-id>");
  process.exit(1);
}

const SRC = `public/pets/${id}.png`;
const OUT = `public/pets/${id}-cutout.png`;
// Paper: luma 200–245, chroma up to ~52 at the vignetted corners. Fur and
// grass are far more saturated, ink far darker.
const PAPER_MIN_LUMA = 185;
const PAPER_MAX_CHROMA = 62;
// Anti-aliased edge pixels lighter than this, next to removed paper, are
// dropped too so no cream fringe shows on a dark background.
const FRINGE_MIN_LUMA = 165;
// Isolated leftovers (paper stains, specks) smaller than this are removed.
const MIN_COMPONENT_PX = 1500;
const OUTPUT_SIZE = 768;

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;

const luma = new Float32Array(N);
const isPaper = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
  luma[p] = 0.299 * r + 0.587 * g + 0.114 * b;
  isPaper[p] = luma[p] >= PAPER_MIN_LUMA && Math.max(r, g, b) - Math.min(r, g, b) <= PAPER_MAX_CHROMA ? 1 : 0;
}

// 1. Flood fill the background from every border pixel (4-connected).
const removed = new Uint8Array(N);
const queue = new Int32Array(N);
let head = 0, tail = 0;
const seed = (p) => {
  if (!removed[p] && isPaper[p]) { removed[p] = 1; queue[tail++] = p; }
};
for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
while (head < tail) {
  const p = queue[head++];
  const x = p % W, y = (p / W) | 0;
  if (x > 0) seed(p - 1);
  if (x < W - 1) seed(p + 1);
  if (y > 0) seed(p - W);
  if (y < H - 1) seed(p + W);
}

// 1b. Paper enclosed by the drawing (e.g. between the legs and the grass) is
// unreachable from the border. Remove enclosed paper regions that are big
// and very light; the fur's light spots and the inner ears are smaller or
// darker, so they stay.
const ENCLOSED_MIN_PX = 1500;
const ENCLOSED_MIN_MEAN_LUMA = 232;
const seen = new Uint8Array(N);
for (let start = 0; start < N; start++) {
  if (!isPaper[start] || removed[start] || seen[start]) continue;
  head = 0; tail = 0;
  queue[tail++] = start; seen[start] = 1;
  let lumaSum = 0;
  while (head < tail) {
    const p = queue[head++];
    lumaSum += luma[p];
    const x = p % W, y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q >= 0 && isPaper[q] && !removed[q] && !seen[q]) { seen[q] = 1; queue[tail++] = q; }
    }
  }
  if (tail >= ENCLOSED_MIN_PX && lumaSum / tail >= ENCLOSED_MIN_MEAN_LUMA) {
    for (let i = 0; i < tail; i++) removed[queue[i]] = 1;
  }
}

// 2. Drop the light anti-aliased fringe bordering the removed paper.
const fringe = [];
for (let p = 0; p < N; p++) {
  if (removed[p] || luma[p] < FRINGE_MIN_LUMA) continue;
  const x = p % W, y = (p / W) | 0;
  if ((x > 0 && removed[p - 1]) || (x < W - 1 && removed[p + 1]) ||
      (y > 0 && removed[p - W]) || (y < H - 1 && removed[p + W])) fringe.push(p);
}
for (const p of fringe) removed[p] = 1;

// 3. Keep only sizeable kept regions (the drawing); remove specks and stains.
const label = new Int32Array(N).fill(-1);
for (let start = 0; start < N; start++) {
  if (removed[start] || label[start] !== -1) continue;
  head = 0; tail = 0;
  queue[tail++] = start; label[start] = start;
  while (head < tail) {
    const p = queue[head++];
    const x = p % W, y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
      if (q >= 0 && !removed[q] && label[q] === -1) { label[q] = start; queue[tail++] = q; }
    }
  }
  if (tail < MIN_COMPONENT_PX) for (let i = 0; i < tail; i++) removed[queue[i]] = 1;
}

// 4. Alpha mask, feathered ~1px, trimmed to the drawing with some padding.
const alpha = Buffer.alloc(N);
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let p = 0; p < N; p++) {
  if (removed[p]) continue;
  alpha[p] = 255;
  const x = p % W, y = (p / W) | 0;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
// extractChannel keeps the result single-channel (sharp would otherwise
// return the blurred mask as 3-channel sRGB and misalign the indices).
const feathered = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } })
  .blur(0.8)
  .extractChannel(0)
  .raw()
  .toBuffer();
if (feathered.length !== N) throw new Error(`unexpected mask size ${feathered.length} (want ${N})`);

const rgba = Buffer.alloc(N * 4);
for (let p = 0; p < N; p++) {
  rgba[p * 4] = data[p * 3];
  rgba[p * 4 + 1] = data[p * 3 + 1];
  rgba[p * 4 + 2] = data[p * 3 + 2];
  // Removed paper stays fully transparent (no cream halo); the blur only
  // softens the drawing's own edge pixels.
  rgba[p * 4 + 3] = removed[p] ? 0 : feathered[p];
}

const PAD = 16;
const left = Math.max(0, minX - PAD), top = Math.max(0, minY - PAD);
const cropW = Math.min(W, maxX + PAD) - left, cropH = Math.min(H, maxY + PAD) - top;
await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width: cropW, height: cropH })
  .resize({ width: OUTPUT_SIZE, height: OUTPUT_SIZE, fit: "inside" })
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(`${OUT}: crop ${cropW}x${cropH} at (${left},${top}), removed ${(removed.reduce((a, b) => a + b, 0) / N * 100).toFixed(1)}% of pixels`);
