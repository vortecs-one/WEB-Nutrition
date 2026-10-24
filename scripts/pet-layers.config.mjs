// Per-companion settings for scripts/cutout-pet.mjs.
//
// background: "paper" — ink-outlined artwork on light paper; the paper is
//   removed by flood fill. Full-scene artworks (Alice, Peter Pan) aren't
//   supported: they need plain-paper art or a segmentation-model mode.
// ground: how the art is split for the animated popup.
//   { mode: "grass", top } — moving body, static grass in front of it, and
//     back-filled grass revealed when the body jumps. `top` is where the
//     grass starts, as a fraction of the image height (just below the belly).
//   { mode: "outline", top, body, holes? } — the same three layers, for art
//     where color can't tell the body from the ground (e.g. a white belly on
//     pale rocks): below `top`, the body is the drawing inside the `body`
//     polygon traced around its lower outline, minus any `holes` (ground seen
//     between the legs). Points are artwork pixels ([x, y] on the 1024×1024
//     source); the polygon only needs to be tight where it touches ground.
//   distinctive (both modes) — ground pixels never copied into the back-fill,
//     because a copy would look duplicated: "green" (clover leaves), "pale"
//     (light stems). Default ["green", "pale"].
//   bodyOnly (both modes) — publish just the body, with no ground or back-fill
//     layers: the companion stands on a floor drawn in code (the ice floe,
//     app/dashboard/pets/IceFloor.tsx). The split still decides what is body.
//   null — no split: the whole cut-out moves together.
// sheets: the companion is drawn on character sheets instead of one artwork
//   (built by scripts/pet-sheet.mjs; coordinates are sheet pixels):
//   upscaler — Hugging Face id of the 2× super-resolution model.
//   poses — full-body drawings for the popup: `cells` maps each pose to its
//     `box` [x0, y0, x1, y1] (inside the cell: no label, no neighbour; even
//     sizes), `symbols: "keep"` to keep its separate marks (bubbles, zzz…;
//     default: only the character), `baseline` for a pose in mid-air (the
//     ground line), `cx` to override the centre. All poses share one
//     `canvas` [w, h] with the feet `margin` above its bottom. In the bottom
//     `shadowBand` px of each box the drawn ground shadow (cool, light
//     pixels) counts as paper. The first pose is the default body and the
//     gallery artwork.
//   faces — close-ups for the dashboard card, by sheet `rows`: `top`/`cut`
//     (the busts' flat bottom edge), `columns` (x boundaries between the
//     busts), `scale` (to one head size across rows) and the `names` in
//     order; framed as `tile`-px squares, saved at `size` px.
// Any value in DEFAULTS can be overridden in a companion's entry.

export const DEFAULTS = {
  // Paper: light, low-chroma pixels reachable from the image border.
  paperMinLuma: 185,
  paperMaxChroma: 62,
  // …and at least this warm (red minus blue). The parchment is warm cream
  // (25–40), so a cool snow or ice floor stays even when it's as light.
  paperMinWarmth: -255,
  // Light anti-aliased pixels next to removed paper (avoids a cream fringe).
  fringeMinLuma: 165,
  // Leftover specks/stains smaller than this are removed.
  minComponentPx: 1500,
  // Paper enclosed by the drawing (e.g. between the legs) is removed when
  // big and very light; light spots on the character are smaller or darker.
  // (A white belly or face stripe is big and light too: set
  // enclosedMinMeanLuma above 255 to turn this off for such a character.)
  enclosedMinPx: 1500,
  enclosedMinMeanLuma: 232,
  // Closes breaks in a thin outline up to twice this width, so the paper
  // removal can't leak into white parts of the character (a belly the same
  // color as the paper). 0 = off.
  outlineGapPx: 0,
  // A cut-out keeping more than this share of the image is a full scene.
  // Measured: plain-paper characters keep 17–18%, the Alice and Peter Pan
  // scenes 44% and 63%.
  maxKeptShare: 0.3,
  outputSize: 768,
};

export const PETS = {
  bambi: { background: "paper", ground: { mode: "grass", top: 0.575 } },
  "humboldt-penguin": {
    background: "paper",
    // The belly and face stripe are paper-white; the snow floor is cool.
    outlineGapPx: 2,
    enclosedMinMeanLuma: 256,
    paperMinWarmth: 18,
    ground: {
      mode: "outline",
      top: 0.68,
      body: [
        [330, 690], [329, 715], [328, 740], [326, 765], [321, 790], [315, 800], [307, 820],
        [299, 840], [301, 846], [317, 847], [327, 838], [335, 846], [345, 836], [351, 842],
        [360, 830], [366, 832], [375, 824], [390, 821], [400, 821], [412, 818], [422, 817],
        [428, 822], [431, 830], [433, 850], [440, 862], [452, 872], [470, 878], [485, 882],
        [500, 884], [506, 878], [520, 872], [535, 872], [541, 866], [543, 858], [555, 856],
        [566, 853], [590, 862], [600, 850], [615, 856], [628, 856], [627, 846], [622, 836],
        [614, 828], [596, 823], [568, 818], [550, 810], [546, 795], [550, 785], [556, 760],
        [565, 725], [590, 712], [640, 730], [700, 730], [700, 690],
      ],
      holes: [[[473, 816], [498, 808], [501, 822], [503, 838], [488, 840], [474, 838]]],
      // The sketched rocks and snow aren't used: the popup draws an ice floe.
      bodyOnly: true,
    },
  },
  // Two ChatGPT sheets in scripts/pet-sources/penguin-girl/ (1536×1024 each).
  "penguin-girl": {
    background: "paper",
    // White belly and face inside clean outlines; small drawn marks stay.
    outlineGapPx: 2,
    enclosedMinMeanLuma: 256,
    minComponentPx: 60,
    sheets: {
      upscaler: "Xenova/2x_APISR_RRDB_GAN_generator-onnx",
      poses: {
        src: "scripts/pet-sources/penguin-girl/poses.png",
        canvas: [360, 440],
        margin: 12,
        shadowBand: 30,
        cells: {
          standing: { box: [4, 90, 302, 528] },
          walking: { box: [308, 90, 596, 528] },
          running: { box: [596, 90, 916, 528] },
          jumping: { box: [914, 90, 1240, 528], baseline: 518 },
          sitting: { box: [1236, 90, 1532, 528] },
          "looking-up": { box: [4, 580, 302, 966] },
          hungry: { box: [304, 580, 616, 966], symbols: "keep" },
          drinking: { box: [614, 580, 916, 966], symbols: "keep" },
          stretching: { box: [914, 580, 1210, 966] },
          // Its dark zzz would vanish on the dark popup: the app animates its own.
          sleeping: { box: [1208, 580, 1536, 966] },
        },
      },
      faces: {
        src: "scripts/pet-sources/penguin-girl/emotions.png",
        tile: 272,
        size: 320,
        rows: [
          {
            top: 37, cut: 291, scale: 1,
            columns: [0, 264, 524, 770, 1024, 1282, 1536],
            names: ["happy", "excited", "surprised", "sad", "angry", "frustrated"],
          },
          {
            top: 313, cut: 553, scale: 1.07,
            columns: [0, 266, 534, 778, 1024, 1274, 1536],
            names: ["shy", "curious", "confused", "determined", "scared", "happy-tears"],
          },
          {
            top: 574, cut: 792, scale: 1.16,
            columns: [0, 258, 516, 770, 1022, 1272, 1536],
            names: ["tired", "annoyed", "playful", "hungry", "love", "embarrassed"],
          },
          {
            top: 812, cut: 1000, scale: 1.21,
            columns: [0, 250, 528, 766, 1010, 1258, 1536],
            names: ["confident", "sleepy", "shocked", "teasing", "worried", "exhausted"],
          },
        ],
      },
    },
  },
  pinocchio: { background: "paper", ground: null },
  "winnie-the-pooh": { background: "paper", ground: null },
};
