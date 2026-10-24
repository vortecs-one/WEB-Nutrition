// Shared by scripts/cutout-pet.mjs and scripts/pet-sheet.mjs: mask helpers,
// the paper-background removal, and the manifest of published layers.
import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

export const PETS_DIR = "public/pets";
export const MANIFEST = "lib/pets/layers.generated.json";

// Flood fill, dilation and inversion over masks of a W×H image.
export function imageOps(W, H) {
  const N = W * H;
  const queue = new Int32Array(N);
  const neighbors4 = (p) => {
    const x = p % W, y = (p / W) | 0;
    return [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
  };
  // Visits the 4-connected region of `start` where `inside(q)` holds, marking
  // `visited`; returns the region's pixel count (pixels are left in `queue`).
  function flood(start, inside, visited) {
    let head = 0, tail = 0;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      for (const q of neighbors4(queue[head++])) {
        if (q >= 0 && !visited[q] && inside(q)) { visited[q] = 1; queue[tail++] = q; }
      }
    }
    return tail;
  }
  // Separable box dilation of a 0/1 mask by radius r.
  function dilate(mask, r) {
    const tmp = new Uint8Array(N), out = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      let count = 0;
      for (let x = -r; x < W + r; x++) {
        if (x + r < W && x + r >= 0 && mask[y * W + x + r]) count++;
        if (x - r - 1 >= 0 && x - r - 1 < W && mask[y * W + x - r - 1]) count--;
        if (x >= 0 && x < W) tmp[y * W + x] = count > 0 ? 1 : 0;
      }
    }
    for (let x = 0; x < W; x++) {
      let count = 0;
      for (let y = -r; y < H + r; y++) {
        if (y + r < H && y + r >= 0 && tmp[(y + r) * W + x]) count++;
        if (y - r - 1 >= 0 && y - r - 1 < H && tmp[(y - r - 1) * W + x]) count--;
        if (y >= 0 && y < H) out[y * W + x] = count > 0 ? 1 : 0;
      }
    }
    return out;
  }
  const invert = (mask) => mask.map((v) => (v ? 0 : 1));
  return { W, H, N, queue, neighbors4, flood, dilate, invert };
}

// === Remove the paper background ================================================
// The artwork is ink-outlined on light paper (`data`: W×H RGB): a flood fill
// from the image border over paper pixels removes the background and stops at
// the outline. `borders` picks the edges the flood starts from (a bust cut off
// at the bottom edge must not be flooded from there); `extraPaper` marks more
// pixels to treat as paper (e.g. a drawn ground shadow). Returns the removed
// mask and each pixel's luma.
export function removePaper(data, ops, cfg, borders = { top: true, bottom: true, left: true, right: true }, extraPaper = null) {
  const { W, H, N, queue, neighbors4, flood, dilate, invert } = ops;
  const luma = new Float32Array(N);
  const isPaper = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    luma[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    isPaper[p] =
      (luma[p] >= cfg.paperMinLuma && Math.max(r, g, b) - Math.min(r, g, b) <= cfg.paperMaxChroma &&
      r - b >= cfg.paperMinWarmth) || extraPaper?.[p] ? 1 : 0;
  }

  const removed = new Uint8Array(N);
  // With outlineGapPx, breaks in the outline up to twice that wide are closed
  // for the flood (paper that close to the drawing is skipped), then the
  // removal grows back over that skipped paper.
  const gapPx = cfg.outlineGapPx;
  const nearInk = gapPx > 0 ? dilate(invert(isPaper), gapPx) : null;
  const floodable = (q) => isPaper[q] && !(nearInk && nearInk[q]);
  const visited = new Uint8Array(N);
  const rows = [borders.top ? 0 : null, borders.bottom ? H - 1 : null].filter((y) => y !== null);
  const cols = [borders.left ? 0 : null, borders.right ? W - 1 : null].filter((x) => x !== null);
  for (let x = 0; x < W; x++) for (const p of rows.map((y) => y * W + x)) {
    if (floodable(p) && !visited[p]) {
      const n = flood(p, floodable, visited);
      for (let i = 0; i < n; i++) removed[queue[i]] = 1;
    }
  }
  for (let y = 0; y < H; y++) for (const p of cols.map((x) => y * W + x)) {
    if (floodable(p) && !visited[p]) {
      const n = flood(p, floodable, visited);
      for (let i = 0; i < n; i++) removed[queue[i]] = 1;
    }
  }
  for (let step = 0; gapPx > 0 && step <= gapPx; step++) {
    const grow = [];
    for (let p = 0; p < N; p++) {
      if (!removed[p] && isPaper[p] && neighbors4(p).some((q) => q >= 0 && removed[q])) grow.push(p);
    }
    for (const p of grow) removed[p] = 1;
  }
  // Paper enclosed by the drawing (between legs and grass…): big, very light.
  const seen = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (!isPaper[p] || removed[p] || seen[p]) continue;
    const n = flood(p, (q) => isPaper[q] && !removed[q], seen);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += luma[queue[i]];
    if (n >= cfg.enclosedMinPx && sum / n >= cfg.enclosedMinMeanLuma) {
      for (let i = 0; i < n; i++) removed[queue[i]] = 1;
    }
  }
  // Light anti-aliased fringe next to removed paper.
  const fringe = [];
  for (let p = 0; p < N; p++) {
    if (removed[p] || luma[p] < cfg.fringeMinLuma) continue;
    if (neighbors4(p).some((q) => q >= 0 && removed[q])) fringe.push(p);
  }
  for (const p of fringe) removed[p] = 1;
  // Specks and paper stains.
  const labelled = new Uint8Array(N);
  for (let p = 0; p < N; p++) {
    if (removed[p] || labelled[p]) continue;
    const n = flood(p, (q) => !removed[q], labelled);
    if (n < cfg.minComponentPx) for (let i = 0; i < n; i++) removed[queue[i]] = 1;
  }
  return { removed, luma };
}

// Feathered (~1px) alpha from a 0/255 mask.
export async function feather(alpha, W, H) {
  // extractChannel keeps the mask single-channel (sharp would return 3 channels).
  return sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer();
}

// Short content hash for published file names: a regenerated image gets a new
// URL, so image caches (Next's optimizer, browsers, the CDN) can't keep
// serving the old one.
export const contentHash = (buf) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);

// Records a companion's published files in the manifest read by
// lib/pets/characters.ts.
export async function writeManifestEntry(id, entry) {
  let manifest = {};
  try { manifest = JSON.parse(await readFile(MANIFEST, "utf8")); } catch { /* first run */ }
  manifest[id] = entry;
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`manifest: ${MANIFEST}`);
}
