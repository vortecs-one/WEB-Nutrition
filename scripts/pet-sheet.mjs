// Builds a companion drawn on character sheets (a `sheets` entry in
// scripts/pet-layers.config.mjs), run through `node scripts/cutout-pet.mjs <id>`:
//   poses — one full-body drawing per cell, upscaled 2× with an anime
//     super-resolution model, cut out of the paper and placed on one shared
//     canvas (feet on the same line, centred on the belly and feet), so the
//     popup can swap poses without the companion jumping. The first pose is
//     also the default `body`.
//   faces — one close-up per cell (busts cut off at the bottom edge),
//     upscaled, cleaned of bits of the neighbouring cells, scaled per row to
//     one head size and framed as square tiles on the sheet's paper, for the
//     dashboard card.
//   artwork — the first pose on a square of paper: the gallery picture
//     (public/pets/<id>.png).
// Publishes <id>-pose-<name>.<hash>.webp and <id>-face-<name>.<hash>.webp,
// records { body, poses, faces } in lib/pets/layers.generated.json, and
// writes contact sheets of both to <tmp>/pet-previews for checking.
import os from "node:os";
import path from "node:path";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import sharp from "sharp";
import {
  PETS_DIR,
  contentHash,
  feather,
  imageOps,
  removePaper,
  writeManifestEntry,
} from "./pet-cutout-lib.mjs";

const ALL_EDGES = { top: true, bottom: true, left: true, right: true };
// A bust is cut off at the bottom edge: the paper is never flooded from there,
// and the bust touching it is no reason to drop it.
const BUST_EDGES = { top: true, bottom: false, left: true, right: true };

export async function cutoutSheets(id, cfg) {
  const { upscaler, poses, faces } = cfg.sheets;
  const upscale = await loadUpscaler(upscaler);
  const previewDir = path.join(os.tmpdir(), "pet-previews");
  await mkdir(previewDir, { recursive: true });

  const poseImages = {};
  let posePaper = null;
  for (const [name, cell] of Object.entries(poses.cells)) {
    const { canvas, paper } = await buildPose(name, cell, poses, cfg, upscale);
    poseImages[name] = canvas;
    posePaper ??= paper;
  }
  const faceImages = {};
  for (const row of faces.rows) {
    for (const [i, name] of row.names.entries()) {
      faceImages[name] = await buildFace(name, row, i, faces, cfg, upscale);
    }
  }

  // Publish, replacing this companion's previous poses and faces.
  const stale = new RegExp(`^${id}-(pose|face)-[a-z-]+\\.[0-9a-f]{8}\\.webp$`);
  for (const file of await readdir(PETS_DIR)) {
    if (stale.test(file)) await unlink(path.join(PETS_DIR, file));
  }
  const publishAll = async (kind, images) => {
    const paths = {};
    for (const [name, buf] of Object.entries(images)) {
      const publicName = `${id}-${kind}-${name}.${contentHash(buf)}.webp`;
      await writeFile(path.join(PETS_DIR, publicName), buf);
      paths[name] = `/pets/${publicName}`;
    }
    console.log(`published: ${Object.keys(paths).length} ${kind}s as public/pets/${id}-${kind}-*.webp`);
    return paths;
  };
  const posePaths = await publishAll("pose", poseImages);
  const facePaths = await publishAll("face", faceImages);
  await writeManifestEntry(id, {
    body: posePaths[Object.keys(posePaths)[0]],
    poses: posePaths,
    faces: facePaths,
  });

  // Gallery picture: the first pose on a square of the sheet's paper.
  const artwork = path.join(PETS_DIR, `${id}.png`);
  const paperColor = { r: posePaper[0], g: posePaper[1], b: posePaper[2] };
  await sharp(poseImages[Object.keys(poseImages)[0]])
    .resize(1024, 1024, { fit: "contain", background: { ...paperColor, alpha: 1 } })
    .flatten({ background: paperColor })
    .png({ compressionLevel: 9 })
    .toFile(artwork);
  console.log(`artwork: ${artwork}`);

  await writePreviews(id, previewDir, poseImages, faceImages);
}

// 2× anime super-resolution (APISR, ONNX through transformers.js): much
// crisper line art than resampling. The model downloads once, on first use.
async function loadUpscaler(model) {
  const { pipeline, RawImage } = await import("@huggingface/transformers");
  const upscaler = await pipeline("image-to-image", model, { dtype: "fp32" });
  return async ({ data, info: { width, height } }) => {
    const out = await upscaler(new RawImage(new Uint8ClampedArray(data), width, height, 3));
    // The model pads odd sizes: keep exactly 2× the input.
    return sharp(Buffer.from(out.data), { raw: { width: out.width, height: out.height, channels: out.channels } })
      .extract({ left: 0, top: 0, width: width * 2, height: height * 2 })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  };
}

async function cropSheet(src, [x0, y0, x1, y1]) {
  return sharp(src)
    .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

// The drawing's connected parts: the largest is the character; the others are
// its drawn marks (bubbles, zzz, hearts…), kept with `keepMarks` unless they
// touch one of `edges` (bits of a neighbouring cell cut by the box).
function partsToKeep(removed, ops, keepMarks, edges) {
  const { W, H, N, queue, flood } = ops;
  const labelled = new Uint8Array(N);
  const parts = [];
  for (let p = 0; p < N; p++) {
    if (removed[p] || labelled[p]) continue;
    const n = flood(p, (q) => !removed[q], labelled);
    const pixels = queue.slice(0, n);
    const touches = pixels.some((q) => {
      const x = q % W, y = (q / W) | 0;
      return (edges.left && x === 0) || (edges.right && x === W - 1) || (edges.top && y === 0) || (edges.bottom && y === H - 1);
    });
    parts.push({ pixels, touches });
  }
  parts.sort((a, b) => b.pixels.length - a.pixels.length);
  const [main, ...marks] = parts;
  const keep = new Uint8Array(N);
  for (const q of main.pixels) keep[q] = 1;
  if (keepMarks) for (const mark of marks) if (!mark.touches) for (const q of mark.pixels) keep[q] = 1;
  return { keep, main: main.pixels };
}

// Mean colour of the removed paper, to fill around the drawing.
function paperColour(data, removed) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let p = 0; p < removed.length; p++) {
    if (!removed[p]) continue;
    for (let c = 0; c < 3; c++) sum[c] += data[p * 3 + c];
    n++;
  }
  return sum.map((s) => Math.round(s / Math.max(1, n)));
}

async function buildPose(name, cell, poses, cfg, upscale) {
  const [x0, y0] = cell.box;
  const { data, info } = await upscale(await cropSheet(poses.src, cell.box));
  const { width: W, height: H } = info;
  const ops = imageOps(W, H);
  // The sheet's lavender ground shadow (cool, light pixels in the bottom
  // `shadowBand` px of the box) counts as paper: the cut-out then stops at the
  // soles (the popup draws its own shadow), and the paper between the feet,
  // which the shadow closes off, goes too.
  const bandTop = H - (cell.shadowBand ?? poses.shadowBand) * 2;
  const shadow = new Uint8Array(W * H);
  for (let p = bandTop * W; p < W * H; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    shadow[p] = r - b <= -6 && luma >= 120 && Math.max(r, g, b) - Math.min(r, g, b) <= 75 ? 1 : 0;
  }
  const { removed } = removePaper(data, ops, cfg, ALL_EDGES, shadow);
  const { keep, main } = partsToKeep(removed, ops, cell.symbols === "keep", ALL_EDGES);

  // Feet line: the bottom of the drawing, or the cell's `baseline` (sheet px)
  // for a pose in mid-air. Centre: the middle of the drawing's lower third
  // (belly and feet), which stays put whatever the flippers, bubbles or
  // scarf do.
  let minY = H, maxY = 0;
  for (const q of main) { const y = (q / W) | 0; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const baseline = cell.baseline != null ? (cell.baseline - y0) * 2 : maxY;
  const lowTop = maxY - (maxY - minY) / 3;
  let sumX = 0, count = 0;
  for (const q of main) if (((q / W) | 0) >= lowTop) { sumX += q % W; count++; }
  const cx = cell.cx != null ? (cell.cx - x0) * 2 : sumX / count;

  const alpha = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = keep[p] ? 255 : 0;
  const feathered = await feather(alpha, W, H);
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    for (let c = 0; c < 3; c++) rgba[p * 4 + c] = data[p * 3 + c];
    rgba[p * 4 + 3] = keep[p] ? feathered[p] : 0;
  }

  // Place on the shared canvas: feet `margin` above its bottom, centred.
  const [CW, CH] = poses.canvas.map((v) => v * 2);
  const left = Math.round(CW / 2 - cx), top = Math.round(CH - poses.margin * 2 - baseline);
  if (left < 0 || top < 0 || left + W > CW || top + H > CH) {
    // The box may stick out as long as the drawing itself fits: clip it.
    const bx0 = Math.max(0, -left), by0 = Math.max(0, -top);
    const bx1 = Math.min(W, CW - left), by1 = Math.min(H, CH - top);
    for (let p = 0; p < W * H; p++) {
      const x = p % W, y = (p / W) | 0;
      if (keep[p] && (x < bx0 || x >= bx1 || y < by0 || y >= by1)) {
        throw new Error(`${name}: the drawing doesn't fit the ${poses.canvas.join("×")} canvas — make it bigger`);
      }
    }
    const clipped = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
      .extract({ left: bx0, top: by0, width: bx1 - bx0, height: by1 - by0 })
      .raw()
      .toBuffer();
    return {
      canvas: await onCanvas(clipped, bx1 - bx0, by1 - by0, CW, CH, left + bx0, top + by0),
      paper: paperColour(data, removed),
    };
  }
  return { canvas: await onCanvas(rgba, W, H, CW, CH, left, top), paper: paperColour(data, removed) };
}

async function onCanvas(rgba, W, H, CW, CH, left, top) {
  return sharp({ create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: rgba, raw: { width: W, height: H, channels: 4 }, left, top }])
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
}

async function buildFace(name, row, i, faces, cfg, upscale) {
  const box = [row.columns[i], row.top, row.columns[i + 1], row.cut];
  const { data, info } = await upscale(await cropSheet(faces.src, box));
  const { width: W, height: H } = info;
  const ops = imageOps(W, H);
  const { removed, luma } = removePaper(data, ops, cfg, BUST_EDGES);
  const { keep, main } = partsToKeep(removed, ops, true, BUST_EDGES);

  // Head centre: the middle of the widest run of dark feathers in the top 60%
  // of the bust (the cheeks), so every face sits in the middle of its tile.
  let minY = H;
  for (const q of main) minY = Math.min(minY, (q / W) | 0);
  const headBottom = minY + (H - minY) * 0.6;
  let widest = { span: -1, cx: W / 2 };
  for (let y = minY; y < headBottom; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (keep[p] && luma[p] < 95) { if (x0 < 0) x0 = x; x1 = x; }
    }
    if (x0 >= 0 && x1 - x0 > widest.span) widest = { span: x1 - x0, cx: (x0 + x1) / 2 };
  }

  // The kept drawing over plain paper (bits of neighbours and specks go).
  const paper = paperColour(data, removed);
  const alpha = Buffer.alloc(W * H);
  for (let p = 0; p < W * H; p++) alpha[p] = keep[p] ? 255 : 0;
  const feathered = await feather(alpha, W, H);
  const rgb = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    const a = keep[p] ? feathered[p] / 255 : 0;
    for (let c = 0; c < 3; c++) rgb[p * 3 + c] = Math.round(data[p * 3 + c] * a + paper[c] * (1 - a));
  }

  // Scale to one head size (`row.scale`), then frame: the bust's bottom edge
  // on the tile's bottom edge, the head centred.
  const T = faces.tile * 2;
  const sW = Math.round(W * row.scale), sH = Math.round(H * row.scale);
  const scaled = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
    .resize(sW, sH, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
  const left = Math.round(T / 2 - widest.cx * row.scale), top = T - sH;
  const vx0 = Math.max(0, -left), vy0 = Math.max(0, -top);
  const vx1 = Math.min(sW, T - left), vy1 = Math.min(sH, T - top);
  const visible = await sharp(scaled, { raw: { width: sW, height: sH, channels: 3 } })
    .extract({ left: vx0, top: vy0, width: vx1 - vx0, height: vy1 - vy0 })
    .raw()
    .toBuffer();
  // (Composite and resize are separate passes: sharp resizes before
  // compositing. Compositing also adds an alpha channel, dropped again.)
  const framed = await sharp({ create: { width: T, height: T, channels: 3, background: { r: paper[0], g: paper[1], b: paper[2] } } })
    .composite([{ input: visible, raw: { width: vx1 - vx0, height: vy1 - vy0, channels: 3 }, left: left + vx0, top: top + vy0 }])
    .removeAlpha()
    .raw()
    .toBuffer();
  return sharp(framed, { raw: { width: T, height: T, channels: 3 } })
    .resize(faces.size, faces.size, { kernel: "lanczos3" })
    .webp({ quality: 90, effort: 6 })
    .toBuffer();
}

// Contact sheets: every pose on a dark stage (shows fringes, leftover paper
// and whether the feet line up) and every face in a grid.
async function writePreviews(id, dir, poseImages, faceImages) {
  const poses = Object.values(poseImages);
  const { width: pw, height: ph } = await sharp(poses[0]).metadata();
  const posesFile = path.join(dir, `${id}-poses-preview.png`);
  await sharp({ create: { width: pw * poses.length, height: ph, channels: 4, background: { r: 30, g: 32, b: 38, alpha: 1 } } })
    .composite(poses.map((input, i) => ({ input, left: i * pw, top: 0 })))
    .png()
    .toFile(posesFile);
  const faces = Object.values(faceImages);
  const { width: fw } = await sharp(faces[0]).metadata();
  const perRow = 6;
  const facesFile = path.join(dir, `${id}-faces-preview.png`);
  await sharp({
    create: { width: perRow * fw, height: Math.ceil(faces.length / perRow) * fw, channels: 3, background: { r: 30, g: 32, b: 38 } },
  })
    .composite(faces.map((input, i) => ({ input, left: (i % perRow) * fw, top: Math.floor(i / perRow) * fw })))
    .png()
    .toFile(facesFile);
  console.log(`preview: ${posesFile}`);
  console.log(`preview: ${facesFile}`);
}
