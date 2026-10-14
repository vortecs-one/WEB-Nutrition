// Per-companion settings for scripts/cutout-pet.mjs.
//
// background: "paper" — ink-outlined artwork on light paper; the paper is
//   removed by flood fill. Full-scene artworks (Alice, Peter Pan) aren't
//   supported: they need plain-paper art or a segmentation-model mode.
// ground: how the art is split for the animated popup.
//   { mode: "grass", top } — moving body, static grass in front of it, and
//     back-filled grass revealed when the body jumps. `top` is where the
//     grass starts, as a fraction of the image height (just below the belly).
//   null — no split: the whole cut-out moves together.
// Any value in DEFAULTS can be overridden in a companion's entry.

export const DEFAULTS = {
  // Paper: light, low-chroma pixels reachable from the image border.
  paperMinLuma: 185,
  paperMaxChroma: 62,
  // Light anti-aliased pixels next to removed paper (avoids a cream fringe).
  fringeMinLuma: 165,
  // Leftover specks/stains smaller than this are removed.
  minComponentPx: 1500,
  // Paper enclosed by the drawing (e.g. between the legs) is removed when
  // big and very light; light spots on the character are smaller or darker.
  enclosedMinPx: 1500,
  enclosedMinMeanLuma: 232,
  // A cut-out keeping more than this share of the image is a full scene.
  // Measured: plain-paper characters keep 17–18%, the Alice and Peter Pan
  // scenes 44% and 63%.
  maxKeptShare: 0.3,
  outputSize: 768,
};

export const PETS = {
  bambi: { background: "paper", ground: { mode: "grass", top: 0.575 } },
  pinocchio: { background: "paper", ground: null },
  "winnie-the-pooh": { background: "paper", ground: null },
};
