import { REFERENCE_TABLE } from "./reference-table";

// Short visual descriptions for entries whose English name alone is ambiguous
// to an image-text model (Chilean dishes, regional breads and fruits).
const VISUAL_EN: Record<string, string[]> = {
  "pan-batido": ["a crusty Chilean marraqueta bread roll split in four lobes"],
  "pan-hallulla": ["a round flat Chilean hallulla bread"],
  "pan-molde": ["slices of sandwich bread"],
  "pan-pita": ["a round pita flatbread"],
  "galletas-salvado": ["square whole wheat bran crackers"],
  "pan-hot-dog": ["an empty hot dog bun", "a Chilean completo hot dog with avocado and tomato"],
  "arroz-cocido": ["a plate of white steamed rice"],
  "fideos-cocidos": ["a plate of spaghetti noodles"],
  "quinoa-cocida": ["a bowl of cooked quinoa grains"],
  "papa-cocida": ["boiled potatoes", "mashed potatoes"],
  "choclo-cocido": ["a corn on the cob", "a bowl of yellow corn kernels"],
  "arvejitas-cocidas": ["a bowl of green peas"],
  semola: ["a bowl of semolina porridge"],
  maicena: ["a bowl of white cornstarch pudding"],
  avena: ["a bowl of oatmeal porridge", "raw rolled oats"],
  "lentejas-cocidas": ["a bowl of brown lentil stew"],
  "porotos-cocidos": ["a bowl of cooked beans"],
  "garbanzos-cocidos": ["a bowl of chickpeas"],
  "leche-semidescremada": ["a glass of milk"],
  "leche-en-polvo": ["a cup of milk made from powder"],
  "yogurt-sin-azucar": ["a cup of plain yogurt"],
  "leche-sin-lactosa": ["a carton of lactose-free milk"],
  ciruela: ["purple plums"],
  platano: ["a yellow banana"],
  naranja: ["an orange citrus fruit"],
  "kiwi-tuna": ["a cut green kiwi fruit", "a prickly pear cactus fruit"],
  "uva-verde": ["a bunch of green grapes"],
  sandia: ["slices of red watermelon"],
  melon: ["slices of melon", "cubes of honeydew melon"],
  manzana: ["a red apple", "a green apple"],
  "pepino-dulce": ["a pepino dulce, a yellow fruit with purple stripes"],
  pera: ["a green pear"],
  durazno: ["a peach fruit"],
  mandarina: ["small tangerines"],
  pina: ["pineapple chunks", "a slice of pineapple"],
  frutilla: ["a bowl of red strawberries"],
  frambuesas: ["a bowl of raspberries"],
  arandanos: ["a bowl of blueberries"],
  damascos: ["orange apricots"],
  chirimoya: ["a cherimoya, a green scaly fruit with white flesh"],
  "betarraga-cocida": ["slices of cooked red beetroot"],
  "zanahoria-cruda": ["grated raw carrot", "carrot sticks"],
  "zapallo-amarillo": ["a piece of cooked orange pumpkin"],
  palta: ["sliced avocado", "mashed avocado on bread"],
  aceite: ["a bottle of cooking oil"],
  mantequilla: ["a block of butter"],
  mayonesa: ["a spoon of mayonnaise"],
  crema: ["a bowl of whipped cream"],
  margarina: ["a tub of margarine"],
  aceitunas: ["black olives"],
  "frutos-secos": ["a handful of nuts and almonds"],
  "carne-vacuno": ["a grilled beef steak"],
  "carne-cerdo": ["a pork chop"],
  pollo: ["a roasted chicken breast", "a fried chicken leg"],
  pescado: ["a fillet of cooked fish", "a piece of salmon"],
  mariscos: ["a plate of mussels, clams and shrimp"],
  huevo: ["a fried egg", "boiled eggs", "scrambled eggs"],
  "guiso-legumbres": ["a bowl of bean stew with pumpkin and noodles"],
  "lentejas-con-arroz": ["a bowl of lentils mixed with rice"],
  carbonada: ["a bowl of meat and vegetable soup with potato and carrot cubes"],
  ajiaco: ["a bowl of ajiaco, a potato and beef soup"],
  charquican: ["charquicán, an orange mash of pumpkin, potato and meat with a fried egg"],
  menestron: ["a bowl of minestrone vegetable soup"],
  pancutras: ["a bowl of soup with flat hand-torn pasta pieces"],
  estofado: ["a bowl of beef stew with potatoes", "a chicken stew"],
  tomatican: ["a pan of tomato, corn and onion stew"],
  "crema-anos-dorados": ["a bowl of creamy vegetable soup"],
  "consome-fideos": ["a bowl of clear broth with thin noodles"],
  chapsui: ["chop suey stir-fried vegetables with meat"],
  "guatitas-jardinera": ["a bowl of tripe stew with vegetables"],
  "budin-zapallo-italiano": ["a slice of baked zucchini casserole"],
  "pastel-de-papas": ["a baked mashed potato pie with ground meat"],
  "pastel-de-choclo": ["pastel de choclo, a baked corn pie in a clay dish"],
  humita: ["humitas, corn tamales wrapped in corn husks"],
  caldillo: ["a bowl of fish soup", "a bowl of seafood soup"],
  cazuela: [
    "cazuela, a bowl of clear broth with a piece of meat, a potato, corn and pumpkin",
  ],
  "budin-pescado": ["a slice of baked fish casserole"],
  "empanada-horno": ["a large baked empanada pastry"],
  "empanada-frita": ["small fried empanadas"],
  "pizza-delgada": ["a slice of thin crust pizza"],
  "pizza-gruesa": ["a slice of thick crust pan pizza"],
  "guiso-acelga": ["a plate of chard stew with egg"],
  "guiso-zapallo-italiano-pan": ["zucchini stew with bread crumbs"],
  "guiso-zapallo-italiano": ["a plate of zucchini stew"],
  "zapallo-italiano-relleno-carne": ["a zucchini stuffed with ground meat"],
  "zapallo-italiano-relleno-arroz": ["a zucchini stuffed with rice"],
};

const MAX_PROMPTS_PER_ENTRY = 4;

const cleanName = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export type FoodPrompt = { id: string; text: string };

export const FOOD_PROMPTS: FoodPrompt[] = REFERENCE_TABLE.flatMap((entry) => {
  const names = entry.nameEn.split("/").map(cleanName).filter(Boolean);
  const texts = [
    ...(VISUAL_EN[entry.id] ?? []).map((v) => `a photo of ${v}.`),
    ...names.map((n) => `a photo of ${n}, a type of food.`),
  ];
  return [...new Set(texts)].slice(0, MAX_PROMPTS_PER_ENTRY).map((text) => ({ id: entry.id, text }));
});

export const GATE_FOOD = "food";
export const GATE_NON_FOOD = "non-food";

export const GATE_PROMPTS: FoodPrompt[] = [
  ...[
    "a photo of a plate of food.",
    "a photo of a meal.",
    "a photo of a bowl of soup.",
    "a photo of fruit.",
    "a photo of a drink in a glass.",
    "a photo of bread.",
  ].map((text) => ({ id: GATE_FOOD, text })),
  ...[
    "a photo of a person.",
    "a photo of a room.",
    "a photo of a document with text.",
    "a photo of a computer screen.",
    "a photo of an animal.",
    "a photo of a car.",
    "a photo of an empty plate.",
    "a photo of furniture.",
  ].map((text) => ({ id: GATE_NON_FOOD, text })),
];

export const ALL_PROMPTS: FoodPrompt[] = [...FOOD_PROMPTS, ...GATE_PROMPTS];
