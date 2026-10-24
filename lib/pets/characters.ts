import type { PetLayers, VirtualCharacter } from "./types";
import generatedLayers from "./layers.generated.json";

// Popup layers written by scripts/cutout-pet.mjs, under content-hashed file
// names recorded in layers.generated.json (a regenerated image gets a new
// URL, so no image cache can serve a stale one). Fails loudly if the script
// hasn't been run for this companion yet.
function petLayers(id: string): PetLayers {
  const layers = (generatedLayers as Record<string, PetLayers>)[id];
  if (!layers) throw new Error(`No popup layers for "${id}": run node scripts/cutout-pet.mjs ${id}`);
  return layers;
}

/**
 * Only the original public-domain versions may be depicted. Artwork must be
 * created from the source work, never from later studio adaptations, and the
 * app must not imply endorsement by any trademark holder.
 */
export const VIRTUAL_CHARACTERS: readonly VirtualCharacter[] = [
  {
    id: "pluto",
    // Shown as Rover (his 1930 name): "Pluto" dates from 1931 and enters the US
    // public domain on 2027-01-01.
    name: { es: "Rover", en: "Rover" },
    species: "dog",
    temperament: "loyal",
    description: {
      es: "Un perro fiel y expresivo que reacciona a todo lo que pasa a su alrededor.",
      en: "A loyal, expressive dog who reacts to everything around him.",
    },
    rights: {
      sourceWork: "The Chain Gang / The Picnic",
      author: "Walt Disney Productions",
      firstPublished: 1930,
      publicDomainSince: 2026,
      jurisdiction: "US",
      usageNotes: {
        es: "Solo el diseño de 1930 (sin nombre o como 'Rover'). El nombre 'Pluto' aparece en 1931 y queda libre en EE. UU. en 2027. Disney mantiene marcas registradas.",
        en: "1930 design only (unnamed or as 'Rover'). The name 'Pluto' dates from 1931 and enters the US public domain in 2027. Disney holds active trademarks.",
      },
    },
    rightsRisk: "high",
    artwork: null,
    enabled: true,
  },
  {
    id: "felix",
    name: { es: "Félix el Gato", en: "Felix the Cat" },
    species: "cat",
    temperament: "mischievous",
    description: {
      es: "Un gato ingenioso que siempre encuentra una salida creativa.",
      en: "A clever cat who always finds a creative way out.",
    },
    rights: {
      sourceWork: "Feline Follies and 1920s silent shorts",
      author: "Otto Messmer / Pat Sullivan",
      firstPublished: 1919,
      publicDomainSince: 2015,
      jurisdiction: "US",
      usageNotes: {
        es: "Solo el diseño de los cortos mudos de los años 20. La marca 'Felix the Cat' sigue activa (DreamWorks).",
        en: "1920s silent-era design only. The 'Felix the Cat' trademark is still active (DreamWorks).",
      },
    },
    rightsRisk: "high",
    artwork: null,
    enabled: true,
  },
  {
    // Original character drawn on two sheets (scripts/pet-sources/): a
    // full-body pose per state in the popup, a close-up face per mood on the
    // dashboard card. Exclusive, like the Humboldt penguin.
    id: "penguin-girl",
    name: { es: "Pingüinita", en: "Penguin Girl" },
    species: "penguin",
    temperament: "cheerful",
    description: {
      es: "Una pingüina tierna, con su flor y su bufanda favorita, que siente contigo cada medición del día.",
      en: "A sweet penguin with her flower and favorite scarf, who feels every reading of your day with you.",
    },
    origin: {
      es: "Personaje original de V-Healthy",
      en: "Original V-Healthy character",
    },
    rightsRisk: "low",
    exclusive: true,
    artwork: "/pets/penguin-girl.png",
    layers: petLayers("penguin-girl"),
    scene: "ice",
    enabled: true,
  },
  {
    // The app's own original character (no public-domain source), exclusive
    // to the accounts in lib/pets/access.ts; everyone else sees it locked.
    id: "humboldt-penguin",
    name: { es: "Pingüino de Humboldt", en: "Humboldt penguin" },
    species: "penguin",
    temperament: "cheerful",
    description: {
      es: "Un pingüino curioso de la costa del Pacífico de Chile y Perú, siempre listo para un chapuzón en agua fría.",
      en: "A curious penguin from the Pacific coast of Chile and Peru, always ready for a dip in cold water.",
    },
    origin: {
      es: "Personaje original de V-Healthy",
      en: "Original V-Healthy character",
    },
    rightsRisk: "low",
    exclusive: true,
    artwork: "/pets/humboldt-penguin.png",
    layers: petLayers("humboldt-penguin"),
    scene: "ice",
    enabled: true,
  },
  {
    id: "bambi",
    name: { es: "Bambi", en: "Bambi" },
    species: "deer",
    temperament: "gentle",
    description: {
      es: "Un corzo joven y sensible que aprende a vivir en el bosque.",
      en: "A gentle young roe deer learning to live in the forest.",
    },
    rights: {
      sourceWork: "Bambi, ein Leben im Walde",
      author: "Felix Salten",
      firstPublished: 1923,
      publicDomainSince: 2022,
      jurisdiction: "US",
      usageNotes: {
        es: "Basado en la novela: es un corzo europeo. El diseño de la película de Disney (1942) está protegido.",
        en: "Based on the novel, where he is a European roe deer. Disney's 1942 film design is protected.",
      },
    },
    rightsRisk: "low",
    artwork: "/pets/bambi.png",
    layers: petLayers("bambi"),
    enabled: true,
  },
  {
    id: "winnie-the-pooh",
    name: { es: "Winnie de Pooh", en: "Winnie-the-Pooh" },
    species: "bear",
    temperament: "cheerful",
    description: {
      es: "Un oso tranquilo y cariñoso con debilidad por la miel.",
      en: "A calm, affectionate bear with a weakness for honey.",
    },
    rights: {
      sourceWork: "Winnie-the-Pooh",
      author: "A. A. Milne / E. H. Shepard",
      firstPublished: 1926,
      publicDomainSince: 2022,
      jurisdiction: "US",
      usageNotes: {
        es: "Usar el estilo de las ilustraciones de Shepard. La camiseta roja y el diseño de Disney están protegidos.",
        en: "Follow Shepard's illustrations. Disney's red shirt and design are protected.",
      },
    },
    rightsRisk: "low",
    artwork: "/pets/winnie-the-pooh.png",
    enabled: true,
  },
  {
    id: "popeye",
    name: { es: "Popeye", en: "Popeye" },
    species: "human",
    temperament: "tough",
    description: {
      es: "Un marinero fuerte y testarudo que nunca se rinde.",
      en: "A strong, stubborn sailor who never gives up.",
    },
    rights: {
      sourceWork: "Thimble Theatre (comic strip)",
      author: "E. C. Segar",
      firstPublished: 1929,
      publicDomainSince: 2025,
      jurisdiction: "US",
      usageNotes: {
        es: "Solo la versión de la tira de 1929. Elementos posteriores, como la espinaca como fuente de fuerza, pueden seguir protegidos. King Features mantiene la marca.",
        en: "1929 comic strip version only. Later traits, such as spinach as his power source, may still be protected. King Features holds the trademark.",
      },
    },
    rightsRisk: "high",
    artwork: null,
    enabled: true,
  },
  {
    id: "alice",
    name: { es: "Alicia", en: "Alice" },
    species: "human",
    temperament: "curious",
    description: {
      es: "Una niña curiosa que todo lo pregunta y todo lo explora.",
      en: "A curious girl who questions and explores everything.",
    },
    rights: {
      sourceWork: "Alice's Adventures in Wonderland",
      author: "Lewis Carroll / John Tenniel",
      firstPublished: 1865,
      publicDomainSince: 1923,
      jurisdiction: "US",
      usageNotes: {
        es: "Libre en todo el mundo. Basarse en las ilustraciones de Tenniel, no en la película de Disney (1951).",
        en: "Public domain worldwide. Base designs on Tenniel's illustrations, not Disney's 1951 film.",
      },
    },
    rightsRisk: "low",
    artwork: "/pets/alice.png",
    enabled: true,
  },
  {
    id: "pinocchio",
    name: { es: "Pinocho", en: "Pinocchio" },
    species: "puppet",
    temperament: "mischievous",
    description: {
      es: "Un muñeco de madera travieso que aprende de sus decisiones.",
      en: "A mischievous wooden puppet who learns from his choices.",
    },
    rights: {
      sourceWork: "Le avventure di Pinocchio",
      author: "Carlo Collodi / Enrico Mazzanti",
      firstPublished: 1883,
      publicDomainSince: 1923,
      jurisdiction: "US",
      usageNotes: {
        es: "Libre en todo el mundo. Evitar el diseño de Disney (1940): sombrero tirolés, pantalón corto rojo y guantes.",
        en: "Public domain worldwide. Avoid Disney's 1940 design: Tyrolean hat, red shorts, and gloves.",
      },
    },
    rightsRisk: "low",
    artwork: "/pets/pinocchio.png",
    enabled: true,
  },
  {
    id: "peter-pan",
    name: { es: "Peter Pan", en: "Peter Pan" },
    species: "human",
    temperament: "adventurous",
    description: {
      es: "Un niño que nunca quiere crecer y siempre busca aventuras.",
      en: "A boy who never wants to grow up and is always seeking adventure.",
    },
    rights: {
      sourceWork: "Peter and Wendy",
      author: "J. M. Barrie",
      firstPublished: 1911,
      publicDomainSince: 1987,
      jurisdiction: "US",
      usageNotes: {
        es: "Libre en EE. UU. En el Reino Unido existe un derecho de regalías perpetuo a favor del Great Ormond Street Hospital. Evitar el diseño de Disney (1953).",
        en: "Public domain in the US. The UK grants Great Ormond Street Hospital a perpetual royalty right. Avoid Disney's 1953 design.",
      },
    },
    rightsRisk: "low",
    artwork: "/pets/peter-pan.png",
    enabled: true,
  },
  {
    id: "mickey",
    name: { es: "Mickey", en: "Mickey" },
    species: "mouse",
    temperament: "cheerful",
    description: {
      es: "Un ratón alegre y silbador lleno de energía.",
      en: "A cheerful, whistling mouse full of energy.",
    },
    rights: {
      sourceWork: "Steamboat Willie / Plane Crazy",
      author: "Walt Disney / Ub Iwerks",
      firstPublished: 1928,
      publicDomainSince: 2024,
      jurisdiction: "US",
      usageNotes: {
        es: "Solo la versión en blanco y negro de 1928, sin guantes. Disney mantiene marcas muy activas: no usar logotipos ni sugerir patrocinio.",
        en: "1928 black-and-white version only, without gloves. Disney actively enforces its trademarks: no logos or implied endorsement.",
      },
    },
    rightsRisk: "high",
    artwork: null,
    enabled: true,
  },
  {
    id: "minnie",
    name: { es: "Minnie", en: "Minnie" },
    species: "mouse",
    temperament: "cheerful",
    description: {
      es: "Una ratona simpática y decidida, compañera de aventuras.",
      en: "A friendly, determined mouse and adventure partner.",
    },
    rights: {
      sourceWork: "Steamboat Willie / Plane Crazy",
      author: "Walt Disney / Ub Iwerks",
      firstPublished: 1928,
      publicDomainSince: 2024,
      jurisdiction: "US",
      usageNotes: {
        es: "Solo la versión en blanco y negro de 1928. Disney mantiene marcas registradas: no sugerir patrocinio.",
        en: "1928 black-and-white version only. Disney holds trademarks: no implied endorsement.",
      },
    },
    rightsRisk: "high",
    artwork: null,
    enabled: true,
  },
];

export const DEFAULT_CHARACTER_ID = "bambi";
