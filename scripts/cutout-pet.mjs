// Builds the animated-popup layers for a companion from its artwork.
//
//   1. Add an entry for the companion in scripts/pet-layers.config.mjs.
//      (`node scripts/cutout-pet.mjs <id> --dry-run` only measures the art and
//      writes nothing — handy to check it's usable before adding the entry.)
//   2. node scripts/cutout-pet.mjs <id>
//   3. Check the preview images it prints (ground only / jump pose / rest).
//   4. In lib/pets/characters.ts set `layers: petLayers("<id>")`.
//
// Reads public/pets/<id>.png and writes, all on the same canvas so they stack:
//   <id>-body.<hash>.png         the part that moves (the whole cut-out
//                                without ground)
//   <id>-ground.<hash>.png       static ground in front of the body
//   <id>-ground-back.<hash>.png  ground filled in behind the legs, revealed
//                                while the body jumps
// (the ground layers only with a ground split: grass or outline mode)
// and records their paths in lib/pets/layers.generated.json. The content hash
// in each name means a regenerated image gets a new URL, so image caches
// (Next's optimizer, browsers, the CDN) can't keep serving the old one.
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
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
const PETS_DIR = "public/pets";
const MANIFEST = "lib/pets/layers.generated.json";
// Layers are built in the preview folder first, then published to
// public/pets under content-hashed names (see publish() below).
const previewDir = path.join(os.tmpdir(), "pet-previews");
await mkdir(previewDir, { recursive: true });
const OUT = {
  cutout: path.join(previewDir, `${id}-cutout.png`),
  body: path.join(previewDir, `${id}-body.png`),
  ground: path.join(previewDir, `${id}-ground.png`),
  back: path.join(previewDir, `${id}-ground-back.png`),
};

// Copies the built layers into public/pets as <id>-<layer>.<hash>.png,
// removing that companion's previous versions (hashed or legacy unhashed),
// and records the new paths in the manifest read by lib/pets/characters.ts.
async function publish(layers) {
  const stale = new RegExp(`^${id}-(cutout|body|ground|ground-back)(\\.[0-9a-f]{8})?\\.png$`);
  for (const file of await readdir(PETS_DIR)) {
    if (stale.test(file)) await unlink(path.join(PETS_DIR, file));
  }
  const entry = {};
  for (const [key, [name, file]] of Object.entries(layers)) {
    const buf = await readFile(file);
    const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 8);
    const publicName = `${id}-${name}.${hash}.png`;
    await writeFile(path.join(PETS_DIR, publicName), buf);
    entry[key] = `/pets/${publicName}`;
  }
  let manifest = {};
  try { manifest = JSON.parse(await readFile(MANIFEST, "utf8")); } catch { /* first run */ }
  manifest[id] = entry;
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  for (const p of Object.values(entry)) console.log(`published: public${p}`);
  console.log(`manifest: ${MANIFEST}`);
}

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
  isPaper[p] =
    luma[p] >= cfg.paperMinLuma && Math.max(r, g, b) - Math.min(r, g, b) <= cfg.paperMaxChroma &&
    r - b >= cfg.paperMinWarmth ? 1 : 0;
}

// === 1. Remove the paper background ===========================================
// The artwork is ink-outlined on light paper: a flood fill from the image
// border over paper pixels removes the background and stops at the outline.
const removed = new Uint8Array(N);
{
  // With outlineGapPx, breaks in the outline up to twice that wide are closed
  // for the flood (paper that close to the drawing is skipped), then the
  // removal grows back over that skipped paper.
  const gapPx = cfg.outlineGapPx;
  const nearInk = gapPx > 0 ? dilate(invert(isPaper), gapPx) : null;
  const floodable = (q) => isPaper[q] && !(nearInk && nearInk[q]);
  const visited = new Uint8Array(N);
  for (let x = 0; x < W; x++) for (const p of [x, (H - 1) * W + x]) {
    if (floodable(p) && !visited[p]) {
      const n = flood(p, floodable, visited);
      for (let i = 0; i < n; i++) removed[queue[i]] = 1;
    }
  }
  for (let y = 0; y < H; y++) for (const p of [y * W, y * W + W - 1]) {
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
  // No ground split: the whole cut-out is the moving body.
  await publish({ body: ["body", OUT.cutout] });
  process.exit(0);
}
if (cfg.ground.mode !== "grass" && cfg.ground.mode !== "outline") {
  console.error(`Unsupported ground mode "${cfg.ground.mode}".`);
  process.exit(1);
}

// === 2. Split the body from the ground ==========================================
const GROUND_TOP = Math.round(H * cfg.ground.top);
const kept = (p) => !removed[p];
// Everything above GROUND_TOP is body; below it, `candidate` marks the body.
const candidate = new Uint8Array(N);
// Where the body may be at all (the outline mode keeps it inside its polygon).
let allowed = () => true;
if (cfg.ground.mode === "grass") markGrassBody();
else markOutlineBody();

// Grass mode: the grass is green and the legs are fur or pale.
function markGrassBody() {
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
  for (let p = 0; p < N; p++) {
    if (!kept(p)) continue;
    if (((p / W) | 0) < GROUND_TOP) { candidate[p] = 1; continue; }
    if (green[p]) continue;
    candidate[p] = leg[p] || nearLeg[p] || (luma[p] < 90 && nearLegWide[p]) ? 1 : 0;
  }
}

// Outline mode: below GROUND_TOP the body is what's inside the traced polygon
// (minus its holes). Pixel centres are tested with the even-odd rule.
function markOutlineBody() {
  const inside = new Uint8Array(N);
  const fill = (poly, value) => {
    for (let y = GROUND_TOP; y < H; y++) {
      const cy = y + 0.5, xs = [];
      for (let i = 0; i < poly.length; i++) {
        const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
        if ((y0 <= cy) !== (y1 <= cy)) xs.push(x0 + ((cy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x < Math.min(W, xs[i + 1] - 0.5); x++) inside[y * W + x] = value;
      }
    }
  };
  fill(cfg.ground.body, 1);
  for (const hole of cfg.ground.holes ?? []) fill(hole, 0);
  allowed = (p) => ((p / W) | 0) < GROUND_TOP || inside[p] === 1;
  for (let p = 0; p < N; p++) candidate[p] = kept(p) && allowed(p) ? 1 : 0;
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
  for (let p = 0; p < N; p++) animal[p] = closed[p] && kept(p) && allowed(p) ? 1 : 0;
}
await writeLayer(OUT.body, (p) => animal[p] === 1);
await writeLayer(OUT.ground, (p) => animal[p] === 0);
console.log(`${OUT.body} / ${OUT.ground}: body is ${(animal.reduce((a, b) => a + b, 0) / N * 100).toFixed(1)}% of the image`);

// === 3. Back-fill the ground behind the legs =====================================
// The ground layer has leg-shaped gaps. This layer sits behind the body and
// fills them (outline mode: see fillWithGroundPatch). Grass mode fills them
// row by row: each horizontal run of gap pixels (one leg at that
// row) is filled — only if ground grows right beside it on that row, so the
// fill follows the local ground height — with the best-matching strip of
// grass from the same row (or a few rows lower) anywhere on the ground.
// Clean, dense grass scores highest; other gaps and distinctive pixels
// (clover leaves, pale stems: they would look copied) score low; staying on
// the row above's offset keeps blades continuous.
const gap = dilate(animal, 2).map((v, p) => (v && ((p / W) | 0) >= GROUND_TOP ? 1 : 0));
const groundAlpha = (p) => (removed[p] || animal[p] ? 0 : feathered[p]);
const distinctiveKinds = new Set(cfg.ground.distinctive ?? ["green", "pale"]);
const distinctiveRaw = new Uint8Array(N);
for (let p = 0; p < N; p++) {
  if (!groundAlpha(p)) continue;
  const [r, g, b] = rgb(p);
  const h = hueOf(r, g, b), chroma = Math.max(r, g, b) - Math.min(r, g, b);
  if (distinctiveKinds.has("green") && h >= 90 && h <= 170 && chroma >= 25) distinctiveRaw[p] = 1;
  if (distinctiveKinds.has("pale") && luma[p] > 210 && chroma < 45) distinctiveRaw[p] = 1;
}
const distinctive = dilate(distinctiveRaw, 8);
const back = Buffer.alloc(N * 4);
console.log(`${OUT.back}:`);
if (cfg.ground.mode === "grass") fillRows();
else fillWithGroundPatch();
await writeRgba(OUT.back, back);

// Grass mode: row-by-row copies (see above).
function fillRows() {
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
  // Offset (dx, dy) used at each column in the row above, for continuity.
  let prevAt = new Array(W).fill(null);
  const DY_STEPS = [0, 8, 16, 24, 32]; // also borrow grass from a few rows lower
  for (let y = GROUND_TOP; y < H; y++) {
    const rowAt = new Array(W).fill(null);
    const row = y * W;
    let x = 0;
    while (x < W) {
      if (!gap[row + x]) { x++; continue; }
      const a = x;
      while (x < W && gap[row + x]) x++;
      const b = x - 1, L = b - a + 1;
      // Is there ground right beside this run on this row (grass, or a clover
      // or stem)? Then the fill follows the real ground silhouette here.
      let groundBeside = false;
      for (let k = 1; k <= NEIGHBOR_PX && !groundBeside; k++) {
        for (const sx of [a - k, b + k]) {
          if (sx >= 0 && sx < W && !gap[row + sx] && groundAlpha(row + sx) > 128) groundBeside = true;
        }
      }
      const s = stats.get(gapLabel[row + a]) ?? { x0: W, x1: 0, needed: 0, filled: 0 };
      s.x0 = Math.min(s.x0, a); s.x1 = Math.max(s.x1, b);
      stats.set(gapLabel[row + a], s);
      if (!groundBeside) continue;
      s.needed += L;

      // Best source strip: same row or a few rows lower, anywhere on the ground.
      const prev = prevAt[a] ?? prevAt[(a + b) >> 1] ?? prevAt[b];
      let best = null, bestScore = -Infinity;
      const consider = (dx, dy) => {
        const sy = y + dy;
        if (sy >= H) return;
        let score = 0;
        for (let xx = a; xx <= b; xx++) {
          const sx = xx + dx;
          if (sx < 0 || sx >= W) { score -= 2; continue; }
          const src = sy * W + sx;
          if (gap[src]) score -= 2;
          else if (distinctive[src]) score -= 3;
          else if (groundAlpha(src) > 128) score += 1;
          else score -= 0.5; // empty source, but grass is needed here
        }
        if (prev && dx === prev.dx && dy === prev.dy) score += L * 0.6; // continuity with the row above
        score -= Math.abs(dx) * 0.004 + dy * 0.01; // nearer grass looks more natural
        if (score > bestScore) { bestScore = score; best = { dx, dy }; }
      };
      if (prev) consider(prev.dx, prev.dy);
      for (const dy of DY_STEPS) {
        for (let d = L + 2; d < W; d += 2) { consider(d, dy); consider(-d, dy); }
      }
      if (!best) continue;

      for (let xx = a; xx <= b; xx++) {
        rowAt[xx] = best;
        const sx = xx + best.dx, sy = y + best.dy;
        if (sx < 0 || sx >= W || sy >= H) continue;
        const p = row + xx, src = sy * W + sx;
        // Never copy a gap, a clover leaf or a pale stem.
        const alphaSrc = gap[src] || distinctive[src] ? 0 : groundAlpha(src);
        if (!alphaSrc) continue;
        [back[p * 4], back[p * 4 + 1], back[p * 4 + 2]] = rgb(src);
        back[p * 4 + 3] = alphaSrc;
        s.filled++;
      }
    }
    prevAt = rowAt;
  }
  for (const s of [...stats.values()].sort((u, v) => u.x0 - v.x0)) {
    const pct = s.needed ? Math.round((s.filled / s.needed) * 100) : 100;
    console.log(`  leg gap x ${s.x0}-${s.x1}: filled ${pct}% of the rows with ground beside it`);
  }
}

// Outline mode: one wide gap under the whole body (feet, tail, belly), where
// row copies would streak. It's filled with blended patches of plain floor
// instead, faded in by how much ground surrounds each spot.
function fillWithGroundPatch() {
  // 1. How much ground continues behind the body: the ground coverage around
  //    the gap, diffused into it on a coarse grid. It fades towards the body
  //    above and the paper below, following the ground's silhouette.
  const C = 8, gw = Math.ceil(W / C), gh = Math.ceil(H / C);
  const cover = new Float32Array(gw * gh), count = new Float32Array(gw * gh);
  for (let p = 0; p < N; p++) {
    if (gap[p]) continue;
    const cell = ((((p / W) | 0) / C) | 0) * gw + (((p % W) / C) | 0);
    cover[cell] += groundAlpha(p) / 255;
    count[cell]++;
  }
  const known = new Uint8Array(gw * gh);
  for (let c = 0; c < gw * gh; c++) {
    if (count[c] >= (C * C) / 4) { cover[c] /= count[c]; known[c] = 1; } else cover[c] = 0;
  }
  for (let iter = 0; iter < 400; iter++) {
    for (let c = 0; c < gw * gh; c++) {
      if (known[c]) continue;
      const cx = c % gw, cy = (c / gw) | 0;
      let sum = 0, n = 0;
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx >= 0 && ny >= 0 && nx < gw && ny < gh) { sum += cover[ny * gw + nx]; n++; }
      }
      cover[c] = sum / n;
    }
  }
  const coverAt = (x, y) => {
    const fx = Math.min(gw - 1.001, Math.max(0, x / C - 0.5)), fy = Math.min(gh - 1.001, Math.max(0, y / C - 0.5));
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    const v = (xx, yy) => cover[yy * gw + xx];
    return (v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx) * (1 - ty) + (v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx) * ty;
  };

  // 2. Texture: small patches of plain floor (dense ground, no gap, no
  //    distinctive pixels, almost no ink lines), picked at random for each
  //    block of the gap and blended over feathered overlaps, so the floor
  //    continues without repeats, mirrors or streaks.
  const S = 32, O = 10, P = S + 2 * O; // block size, overlap, patch size
  const integral = (test) => {
    const t = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += test(y * W + x) ? 1 : 0;
        t[(y + 1) * (W + 1) + x + 1] = t[y * (W + 1) + x + 1] + row;
      }
    }
    return (x, y) =>
      t[(y + P) * (W + 1) + x + P] - t[y * (W + 1) + x + P] - t[(y + P) * (W + 1) + x] + t[y * (W + 1) + x];
  };
  const plain = integral((p) => !gap[p] && !distinctive[p] && groundAlpha(p) > 200);
  const ink = integral((p) => luma[p] < 110);
  const sources = [];
  for (let minPlain = 0.97; sources.length < 8 && minPlain > 0.5; minPlain -= 0.07) {
    sources.length = 0;
    for (let y = GROUND_TOP; y + P <= H; y += 4) {
      for (let x = 0; x + P <= W; x += 4) {
        if (plain(x, y) >= minPlain * P * P && ink(x, y) <= 0.02 * P * P) sources.push([x, y]);
      }
    }
  }
  if (!sources.length) {
    console.log("  no plain ground to copy from: the back-fill stays empty");
    return;
  }
  let seed = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const acc = new Float32Array(N * 3), weight = new Float32Array(N);
  const ramp = (i) => Math.min(1, (i + 0.5) / O, (P - i - 0.5) / O);
  let gx0 = W, gy0 = H, gx1 = 0, gy1 = 0;
  for (let p = 0; p < N; p++) {
    if (!gap[p]) continue;
    const x = p % W, y = (p / W) | 0;
    gx0 = Math.min(gx0, x); gx1 = Math.max(gx1, x); gy0 = Math.min(gy0, y); gy1 = Math.max(gy1, y);
  }
  for (let by = gy0 - O; by <= gy1; by += S) {
    for (let bx = gx0 - O; bx <= gx1; bx += S) {
      const [sx, sy] = sources[(random() * sources.length) | 0];
      for (let j = 0; j < P; j++) {
        const y = by - O + j;
        if (y < 0 || y >= H) continue;
        for (let i = 0; i < P; i++) {
          const x = bx - O + i;
          if (x < 0 || x >= W || !gap[y * W + x]) continue;
          const wgt = ramp(i) * ramp(j), q = y * W + x, [r, g, b] = rgb((sy + j) * W + sx + i);
          acc[q * 3] += r * wgt; acc[q * 3 + 1] += g * wgt; acc[q * 3 + 2] += b * wgt;
          weight[q] += wgt;
        }
      }
    }
  }

  // 3. Fill, faded in where ground continues behind the body.
  let filled = 0, total = 0;
  for (let p = 0; p < N; p++) {
    if (!gap[p]) continue;
    total++;
    const x = p % W, y = (p / W) | 0;
    const a = Math.min(1, Math.max(0, (coverAt(x, y) - 0.3) / 0.4));
    if (a <= 0 || !weight[p]) continue;
    for (let c = 0; c < 3; c++) back[p * 4 + c] = Math.round(acc[p * 3 + c] / weight[p]);
    back[p * 4 + 3] = Math.round(a * 255);
    filled++;
  }
  console.log(`  ${sources.length} floor patches to copy from; ` +
    `filled ${Math.round((filled / total) * 100)}% of the gap (the rest is where no ground continues)`);
}

await publish({
  body: ["body", OUT.body],
  ground: ["ground", OUT.ground],
  back: ["ground-back", OUT.back],
});

// === 4. Previews ===================================================================
// Ground only, jump pose (body lifted 9%) and rest pose on a dark background,
// to check the result before using it in the app.
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
  // Own names: the layer files in this folder must not be overwritten.
  const file = path.join(previewDir, `${id}-preview-${name}.png`);
  await stage().composite(layers.map((input) => ({ input }))).png().toFile(file);
  console.log(`preview: ${file}`);
}
