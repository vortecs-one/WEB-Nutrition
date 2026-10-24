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
  pinocchio: { background: "paper", ground: null },
  "winnie-the-pooh": { background: "paper", ground: null },
};
