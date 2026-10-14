// Builds the animated-popup layers for a companion from its artwork.
//
//   1. Add an entry for the companion in scripts/pet-layers.config.mjs.
//      (`node scripts/cutout-pet.mjs <id> --dry-run` only measures the art and
//      writes nothing — handy to check it's usable before adding the entry.)
//   2. node scripts/cutout-pet.mjs <id>
//   3. Check the preview images it prints (ground only / jump pose / rest).
//   4. In lib/pets/characters.ts set `layers: petLayers("<id>", { ground })`.
//
// Reads public/pets/<id>.png and writes, all on the same canvas so they stack:
//   <id>-cutout.png       the drawing without its paper background
//   <id>-body.png         the part that moves (the whole cut-out without ground)
//   <id>-ground.png       static grass drawn in front of the body   (grass mode)
//   <id>-ground-back.png  grass filled in behind the legs, revealed
//                         while the body jumps                      (grass mode)
import os from "node:os";
import path from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { DEFAULTS, PETS } from "./pet-layers.config.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const id = args.find((a) => !a.startsWith("--"));
if (!id) {
  console.error("usage: node scripts/cutout-pet.mjs <character-id> [--dry-run]");
  process.exit(1);
}
if (!PETS[id] && !dryRun) {
  console.error(`No entry for "${id}" in scripts/pet-layers.config.mjs — add one first.`);
  process.exit(1);
}
const cfg = { ...DEFAULTS, background: "paper", ground: null, ...PETS[id] };
if (cfg.background !== "paper") {
  console.error(`Unsupported background mode "${cfg.background}" (only "paper" for now).`);
  process.exit(1);
}

const SRC = `public/pets/${id}.png`;
const OUT = {
  cutout: `public/pets/${id}-cutout.png`,
  body: `public/pets/${id}-body.png`,
  ground: `public/pets/${id}-ground.png`,
  back: `public/pets/${id}-ground-back.png`,
};

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;

// --- helpers -----------------------------------------------------------------
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
const hueOf = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const rgb = (p) => [data[p * 3], data[p * 3 + 1], data[p * 3 + 2]];

const luma = new Float32Array(N);
const isPaper = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  const [r, g, b] = rgb(p);
  luma[p] = 0.299 * r + 0.587 * g + 0.114 * b;
  isPaper[p] = luma[p] >= cfg.paperMinLuma && Math.max(r, g, b) - Math.min(r, g, b) <= cfg.paperMaxChroma ? 1 : 0;
}

// === 1. Remove the paper background ===========================================
// The artwork is ink-outlined on light paper: a flood fill from the image
// border over paper pixels removes the background and stops at the outline.
const removed = new Uint8Array(N);
{
  const visited = new Uint8Array(N);
  for (let x = 0; x < W; x++) for (const p of [x, (H - 1) * W + x]) {
    if (isPaper[p] && !visited[p]) {
      const n = flood(p, (q) => isPaper[q], visited);
      for (let i = 0; i < n; i++) removed[queue[i]] = 1;
    }
  }
  for (let y = 0; y < H; y++) for (const p of [y * W, y * W + W - 1]) {
    if (isPaper[p] && !visited[p]) {
      const n = flood(p, (q) => isPaper[q], visited);
      for (let i = 0; i < n; i++) removed[queue[i]] = 1;
    }
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
}
const keptShare = 1 - removed.reduce((a, b) => a + b, 0) / N;
if (dryRun) {
  const verdict = keptShare > cfg.maxKeptShare ? "full scene — not usable as is" : "usable";
  console.log(`${id}: the cut-out keeps ${(keptShare * 100).toFixed(1)}% of the image → ${verdict}`);
  process.exit(0);
}
if (keptShare > cfg.maxKeptShare) {
  console.error(
    `${id}: the cut-out keeps ${(keptShare * 100).toFixed(0)}% of the image — this looks like a full scene, ` +
      `not a character on plain paper. Use plain-paper artwork (or add a model-based background mode).`,
  );
  process.exit(1);
}

// Feathered alpha (~1px) and a padded crop around the drawing, shared by all
// outputs so they stack exactly.
const alpha = Buffer.alloc(N);
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let p = 0; p < N; p++) {
  if (removed[p]) continue;
  alpha[p] = 255;
  const x = p % W, y = (p / W) | 0;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
// extractChannel keeps the mask single-channel (sharp would return 3 channels).
const feathered = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } })
  .blur(0.8).extractChannel(0).raw().toBuffer();
const PAD = 16;
const left = Math.max(0, minX - PAD), top = Math.max(0, minY - PAD);
const cropW = Math.min(W, maxX + PAD) - left, cropH = Math.min(H, maxY + PAD) - top;

async function writeRgba(out, rgba) {
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: cfg.outputSize, height: cfg.outputSize, fit: "inside" })
    .png({ compressionLevel: 9 })
    .toFile(out);
}
// The drawing's pixels where `include(p)` holds; removed paper is always clear.
async function writeLayer(out, include) {
  const rgba = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) {
    [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]] = rgb(p);
    rgba[p * 4 + 3] = removed[p] || !include(p) ? 0 : feathered[p];
  }
  await writeRgba(out, rgba);
}

await writeLayer(OUT.cutout, () => true);
console.log(`${OUT.cutout}: kept ${(keptShare * 100).toFixed(1)}% of the image`);

if (!cfg.ground) {
  await copyFile(OUT.cutout, OUT.body);
  console.log(`${OUT.body}: no ground split — the whole cut-out moves`);
  process.exit(0);
}
if (cfg.ground.mode !== "grass") {
  console.error(`Unsupported ground mode "${cfg.ground.mode}".`);
  process.exit(1);
}

// === 2. Split the body from the grass ===========================================
const GROUND_TOP = Math.round(H * cfg.ground.top);
const kept = (p) => !removed[p];
const green = new Uint8Array(N);
const fur = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (!kept(p)) continue;
  const [r, g, b] = rgb(p);
  const chroma = Math.max(r, g, b) - Math.min(r, g, b), h = hueOf(r, g, b);
  if (h >= 45 && h <= 170 && chroma >= 18) green[p] = 1;
  else if ((h < 45 || h > 340) && chroma >= 35) fur[p] = 1;
}
// Trace the legs down from the body through fur or pale-leg pixels, so brown
// things merely touching a hoof (a fallen leaf, dirt) stay on the ground.
const legLike = (p) => kept(p) && !green[p] && (fur[p] || luma[p] >= 140);
const leg = new Uint8Array(N);
{
  let head = 0, tail = 0;
  for (let x = 0; x < W; x++) {
    const p = (GROUND_TOP - 1) * W + x;
    if (legLike(p)) { leg[p] = 1; queue[tail++] = p; }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % W, y = (p / W) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y < H - 1 ? p + W : -1]) {
      if (q >= 0 && !leg[q] && legLike(q)) { leg[q] = 1; queue[tail++] = q; }
    }
  }
}
const nearLeg = dilate(leg, 3); // leg outlines
const nearLegWide = dilate(leg, 16); // hooves hang below the fur
const candidate = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (!kept(p)) continue;
  if (((p / W) | 0) < GROUND_TOP) { candidate[p] = 1; continue; }
  if (green[p]) continue;
  candidate[p] = leg[p] || nearLeg[p] || (luma[p] < 90 && nearLegWide[p]) ? 1 : 0;
}
// The body is the largest connected candidate region; then close small gaps
// (blades drawn across a leg) so the legs stay whole.
let animal = new Uint8Array(N);
{
  const visited = new Uint8Array(N);
  let best = [];
  for (let p = 0; p < N; p++) {
    if (!candidate[p] || visited[p]) continue;
    const n = flood(p, (q) => candidate[q], visited);
    if (n > best.length) best = Array.from(queue.subarray(0, n));
  }
  for (const p of best) animal[p] = 1;
  const closed = invert(dilate(invert(dilate(animal, 3)), 3));
  for (let p = 0; p < N; p++) animal[p] = closed[p] && kept(p) ? 1 : 0;
}
await writeLayer(OUT.body, (p) => animal[p] === 1);
await writeLayer(OUT.ground, (p) => animal[p] === 0);
console.log(`${OUT.body} / ${OUT.ground}: body is ${(animal.reduce((a, b) => a + b, 0) / N * 100).toFixed(1)}% of the image`);

// === 3. Back-fill the grass behind the legs ======================================
// The ground layer has leg-shaped gaps. This layer sits behind the body and
// fills them row by row: each horizontal run of gap pixels (one leg at that
// row) is filled — only if real grass grows right beside it on that row, so
// the fill follows the local grass height — with the best-matching strip of
// grass from the same row anywhere on the ground. Clean, dense grass scores
// highest; other gaps, clover leaves and pale stems (which would look copied)
// score low; staying on the row above's offset keeps blades continuous.
const gap = dilate(animal, 2).map((v, p) => (v && ((p / W) | 0) >= GROUND_TOP ? 1 : 0));
const groundAlpha = (p) => (removed[p] || animal[p] ? 0 : feathered[p]);
const distinctiveRaw = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (!groundAlpha(p)) continue;
  const [r, g, b] = rgb(p);
  const h = hueOf(r, g, b), chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if ((h >= 90 && h <= 170 && chroma >= 25) || (luma[p] > 210 && chroma < 45)) distinctiveRaw[p] = 1;
}
const distinctive = dilate(distinctiveRaw, 8);
const NEIGHBOR_PX = 16;
const gapLabel = new Int32Array(N).fill(-1);
{
  const visited = new Uint8Array(N);
  let label = 0;
  for (let p = 0; p < N; p++) {
    if (!gap[p] || visited[p]) continue;
    const n = flood(p, (q) => gap[q], visited);
    for (let i = 0; i < n; i++) gapLabel[queue[i]] = label;
    label++;
  }
}
const stats = new Map(); // gap label -> { x0, x1, needed, filled }
const back = Buffer.alloc(N * 4);
let prevDxAt = new Int32Array(W);
for (let y = GROUND_TOP; y < H; y++) {
  const rowDx = new Int32Array(W);
  const row = y * W;
  let x = 0;
  while (x < W) {
    if (!gap[row + x]) { x++; continue; }
    const a = x;
    while (x < W && gap[row + x]) x++;
    const b = x - 1, L = b - a + 1;
    // Is there real grass right beside this run on this row? Clovers and
    // pale stems don't count, so the fill follows the grass, not them.
    let grassBeside = false;
    for (let k = 1; k <= NEIGHBOR_PX && !grassBeside; k++) {
      for (const sx of [a - k, b + k]) {
        if (sx >= 0 && sx < W && !gap[row + sx] && !distinctive[row + sx] && groundAlpha(row + sx) > 128) grassBeside = true;
      }
    }
    const s = stats.get(gapLabel[row + a]) ?? { x0: W, x1: 0, needed: 0, filled: 0 };
    s.x0 = Math.min(s.x0, a); s.x1 = Math.max(s.x1, b);
    stats.set(gapLabel[row + a], s);
    if (!grassBeside) continue;
    s.needed += L;

    const prev = prevDxAt[a] || prevDxAt[(a + b) >> 1] || prevDxAt[b];
    let best = 0, bestScore = -Infinity;
    const consider = (dx) => {
      let score = 0;
      for (let xx = a; xx <= b; xx++) {
        const sx = xx + dx;
        if (sx < 0 || sx >= W) { score -= 2; continue; }
        const src = row + sx;
        if (gap[src]) score -= 2;
        else if (distinctive[src]) score -= 3;
        else if (groundAlpha(src) > 128) score += 1;
        else score -= 0.5; // empty source, but grass is needed here
      }
      if (dx === prev) score += L * 0.6; // continuity with the row above
      score -= Math.abs(dx) * 0.004; // nearer grass looks more natural
      if (score > bestScore) { bestScore = score; best = dx; }
    };
    if (prev) consider(prev);
    for (let d = L + 2; d < W; d += 2) { consider(d); consider(-d); }

    for (let xx = a; xx <= b; xx++) {
      rowDx[xx] = best;
      const sx = xx + best;
      if (sx < 0 || sx >= W) continue;
      const p = row + xx, src = row + sx;
      // Never copy a gap, a clover leaf or a pale stem.
      const alphaSrc = gap[src] || distinctive[src] ? 0 : groundAlpha(src);
      if (!alphaSrc) continue;
      [back[p * 4], back[p * 4 + 1], back[p * 4 + 2]] = rgb(src);
      back[p * 4 + 3] = alphaSrc;
      s.filled++;
    }
  }
  prevDxAt = rowDx;
}
await writeRgba(OUT.back, back);
console.log(`${OUT.back}:`);
for (const s of [...stats.values()].sort((u, v) => u.x0 - v.x0)) {
  const pct = s.needed ? Math.round((s.filled / s.needed) * 100) : 100;
  console.log(`  leg gap x ${s.x0}-${s.x1}: filled ${pct}% of the rows with grass beside it`);
}

// === 4. Previews ===================================================================
// Ground only, jump pose (body lifted 9%) and rest pose on a dark background,
// to check the result before using it in the app.
const previewDir = path.join(os.tmpdir(), "pet-previews");
await mkdir(previewDir, { recursive: true });
const meta = await sharp(OUT.body).metadata();
const dark = { r: 30, g: 32, b: 38, alpha: 1 };
const stage = () => sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: dark } });
const lift = Math.round(meta.height * 0.09);
const lifted = await sharp(
  await sharp(OUT.body).extend({ bottom: lift, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
).extract({ left: 0, top: lift, width: meta.width, height: meta.height }).png().toBuffer();
const previews = {
  ground: [OUT.back, OUT.ground],
  jump: [OUT.back, lifted, OUT.ground],
  rest: [OUT.back, OUT.body, OUT.ground],
};
for (const [name, layers] of Object.entries(previews)) {
  const file = path.join(previewDir, `${id}-${name}.png`);
  await stage().composite(layers.map((input) => ({ input }))).png().toFile(file);
  console.log(`preview: ${file}`);
}
