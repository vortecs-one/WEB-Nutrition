// Source: "Tabla H. de C." (carbohydrate exchange table provided by the care team).
// Only carbohydrates come from this table; liquids use 1 cc ≈ 1 g.

export const REFERENCE_SOURCE = "Tabla H. de C.";

export type ReferenceGroup =
  | "breads"
  | "cereals"
  | "legumes"
  | "dairy"
  | "fruits"
  | "vegetables"
  | "fats"
  | "protein"
  | "dishes";

export type ReferenceWarning = "lactose-free";

export type ReferenceEntry = {
  id: string;
  group: ReferenceGroup;
  nameEs: string;
  nameEn: string;
  aliases: string[];
  portionEs: string;
  portionEn: string;
  portionGrams: number;
  portionCarbs: number;
  carbsPer100g: number;
  warning?: ReferenceWarning;
};

type Row = [
  id: string,
  nameEs: string,
  nameEn: string,
  portionEs: string,
  portionEn: string,
  grams: number,
  carbs: number,
  aliases?: string[],
  warning?: ReferenceWarning,
];

// Groups 7 and 8 are listed as "no contiene carbohidratos" without portions.
const noCarbs = (id: string, nameEs: string, nameEn: string, aliases: string[] = []): Row => [
  id,
  nameEs,
  nameEn,
  "100 g",
  "100 g",
  100,
  0,
  aliases,
];

const GROUPS: Record<ReferenceGroup, Row[]> = {
  breads: [
    ["pan-batido", "Pan batido / marraqueta", "Marraqueta bread roll", "1/2 unidad", "1/2 roll", 50, 30, ["marraqueta", "pan francés", "batido"]],
    ["pan-hallulla", "Hallulla", "Hallulla flatbread", "1/2 unidad", "1/2 piece", 50, 30, ["hallulla"]],
    ["pan-molde", "Pan de molde", "Sliced bread", "2 rebanadas", "2 slices", 50, 30, ["pan blanco", "pan integral", "toast"]],
    ["pan-pita", "Pan pita", "Pita bread", "1 1/2 unidad", "1 1/2 pita", 50, 30],
    ["galletas-salvado", "Galletas de salvado", "Bran crackers", "6 unidades", "6 crackers", 42, 30, ["galletas integrales"]],
    ["pan-hot-dog", "Pan de hot dog", "Hot dog bun", "1 unidad", "1 bun", 50, 30, ["pan de completo"]],
  ],
  cereals: [
    ["arroz-cocido", "Arroz cocido", "Cooked rice", "1 taza", "1 cup", 144, 40, ["arroz", "rice"]],
    ["fideos-cocidos", "Fideos cocidos", "Cooked pasta", "1 taza", "1 cup", 160, 40, ["pasta", "tallarines", "spaghetti"]],
    ["quinoa-cocida", "Quinoa cocida", "Cooked quinoa", "1 taza", "1 cup", 150, 40],
    ["papa-cocida", "Papa cocida", "Boiled potato", "2 unidades medianas", "2 medium", 240, 40, ["papas", "puré de papas", "potato"]],
    ["choclo-cocido", "Choclo cocido", "Cooked corn", "1 1/4 taza", "1 1/4 cup", 210, 40, ["maíz", "corn"]],
    ["arvejitas-cocidas", "Arvejitas cocidas", "Cooked peas", "1 1/4 taza", "1 1/4 cup", 285, 40, ["arvejas", "peas"]],
    ["semola", "Sémola", "Semolina", "6 cucharadas", "6 tbsp", 52, 40],
    ["maicena", "Maicena", "Cornstarch", "6 cucharadas", "6 tbsp", 46, 40, ["fécula de maíz"]],
    ["avena", "Avena", "Oats", "8 cucharadas rasas", "8 level tbsp", 60, 40, ["oatmeal", "copos de avena"]],
  ],
  legumes: [
    ["lentejas-cocidas", "Lentejas cocidas", "Cooked lentils", "1 taza", "1 cup", 160, 40, ["lentils"]],
    ["porotos-cocidos", "Porotos cocidos", "Cooked beans", "1 taza", "1 cup", 85, 20, ["frijoles", "beans"]],
    ["garbanzos-cocidos", "Garbanzos cocidos", "Cooked chickpeas", "1 taza", "1 cup", 100, 20, ["chickpeas"]],
  ],
  dairy: [
    ["leche-semidescremada", "Leche semidescremada", "Semi-skimmed milk", "1 taza", "1 cup", 200, 10, ["leche", "milk"]],
    ["leche-en-polvo", "Leche en polvo (preparada)", "Powdered milk (prepared)", "1 taza preparada", "1 prepared cup", 200, 10],
    ["yogurt-sin-azucar", "Yogurt sin azúcar", "Sugar-free yogurt", "1 unidad", "1 cup", 120, 10, ["yogur", "yoghurt"]],
    ["leche-sin-lactosa", "Leche sin lactosa sin azúcar", "Lactose-free milk", "1 taza", "1 cup", 200, 15, [], "lactose-free"],
  ],
  fruits: [
    ["ciruela", "Ciruela", "Plum", "2 unidades", "2 plums", 150, 15],
    ["platano", "Plátano", "Banana", "1/2 unidad de 10 cm", "1/2 banana (10 cm)", 65, 15, ["banana"]],
    ["naranja", "Naranja", "Orange", "1 unidad regular", "1 regular", 220, 20],
    ["kiwi-tuna", "Kiwi / tuna", "Kiwi / prickly pear", "2 unidades chicas", "2 small", 100, 15, ["kiwi", "tuna (fruta de nopal)", "prickly pear"]],
    ["uva-verde", "Uva verde", "Green grapes", "10 a 15 unidades", "10–15 grapes", 100, 15, ["uvas", "grapes"]],
    ["sandia", "Sandía", "Watermelon", "1 taza", "1 cup", 200, 15],
    ["melon", "Melón", "Melon", "1 taza", "1 cup", 200, 15],
    ["manzana", "Manzana", "Apple", "1 unidad chica", "1 small", 150, 20],
    ["pepino-dulce", "Pepino dulce", "Pepino melon (sweet fruit)", "1 mediano", "1 medium", 230, 15, ["pepino dulce (fruta, NO el pepino ensalada/cucumber)"]],
    ["pera", "Pera", "Pear", "1 unidad chica", "1 small", 170, 20],
    ["durazno", "Durazno", "Peach", "1 unidad", "1 peach", 170, 20, ["melocotón"]],
    ["mandarina", "Mandarina", "Tangerine", "2 unidades (5 cm)", "2 (5 cm)", 200, 20],
    ["pina", "Piña", "Pineapple", "1 taza en cubos", "1 cup cubes", 130, 15, ["ananá"]],
    ["frutilla", "Frutilla", "Strawberries", "1 taza", "1 cup", 140, 15, ["fresa", "strawberry"]],
    ["frambuesas", "Frambuesas", "Raspberries", "1 taza", "1 cup", 125, 15],
    ["arandanos", "Arándanos", "Blueberries", "1 taza", "1 cup", 125, 15],
    ["damascos", "Damascos", "Apricots", "3 unidades", "3 apricots", 120, 15, ["albaricoque"]],
    ["chirimoya", "Chirimoya", "Cherimoya", "1/2 unidad", "1/2 fruit", 180, 20],
  ],
  vegetables: [
    ["betarraga-cocida", "Betarraga cocida", "Cooked beet", "1/2 taza", "1/2 cup", 60, 5, ["remolacha", "beet"]],
    ["zanahoria-cruda", "Zanahoria cruda", "Raw carrot", "1/2 taza", "1/2 cup", 60, 5, ["carrot"]],
    ["zapallo-amarillo", "Zapallo amarillo", "Squash / pumpkin", "1/2 taza o un trozo", "1/2 cup or a piece", 80, 5, ["calabaza", "pumpkin"]],
  ],
  fats: [
    noCarbs("palta", "Palta", "Avocado", ["aguacate", "avocado"]),
    noCarbs("aceite", "Aceite", "Oil"),
    noCarbs("mantequilla", "Mantequilla", "Butter"),
    noCarbs("mayonesa", "Mayonesa", "Mayonnaise"),
    noCarbs("crema", "Crema", "Cream"),
    noCarbs("margarina", "Margarina", "Margarine"),
    noCarbs("aceitunas", "Aceitunas", "Olives"),
    noCarbs("frutos-secos", "Frutos secos", "Nuts", ["nueces", "almendras", "maní"]),
  ],
  protein: [
    noCarbs("carne-vacuno", "Carne de vacuno", "Beef", ["bistec", "carne", "beef"]),
    noCarbs("carne-cerdo", "Carne de cerdo", "Pork"),
    noCarbs("pollo", "Pollo", "Chicken", ["pavo", "ave"]),
    noCarbs("pescado", "Pescado", "Fish", ["salmón", "merluza", "atún"]),
    noCarbs("mariscos", "Mariscos", "Seafood"),
    noCarbs("huevo", "Huevo", "Egg", ["huevos", "egg"]),
  ],
  dishes: [
    ["guiso-legumbres", "Guiso de legumbres (porotos/garbanzos)", "Bean/chickpea stew", "1 taza", "1 cup", 200, 30, ["porotos con riendas", "porotos granados"]],
    ["lentejas-con-arroz", "Lentejas con arroz", "Lentils with rice", "1 taza", "1 cup", 200, 30],
    ["carbonada", "Carbonada (con 120 g de papa)", "Carbonada stew", "1 taza", "1 cup", 250, 30],
    ["ajiaco", "Ajiaco", "Ajiaco soup", "1 taza", "1 cup", 200, 25],
    ["charquican", "Charquicán", "Charquicán", "1 taza", "1 cup", 300, 40],
    ["menestron", "Menestrón", "Minestrone", "1 taza", "1 cup", 200, 30],
    ["pancutras", "Pancutras", "Pancutras soup", "1 taza", "1 cup", 200, 25],
    ["estofado", "Estofado de vacuno o pollo", "Beef or chicken stew", "1 taza", "1 cup", 300, 35],
    ["tomatican", "Tomaticán", "Tomaticán", "1 taza", "1 cup", 300, 25],
    ["crema-anos-dorados", "Crema Años Dorados", "Años Dorados cream soup", "1 taza", "1 cup", 200, 30],
    ["consome-fideos", "Consomé con fideos o sémola", "Broth with noodles or semolina", "1 plato", "1 bowl", 200, 5, ["sopa de fideos"]],
    ["chapsui", "Chapsui de ave o vacuno (sin harina)", "Chop suey (no flour)", "1 taza", "1 cup", 250, 0],
    ["guatitas-jardinera", "Guatitas a la jardinera", "Tripe stew", "1 taza", "1 cup", 200, 10],
    ["budin-zapallo-italiano", "Budín de zapallo italiano (con harina)", "Zucchini pudding", "1 trozo", "1 piece", 250, 10],
    ["pastel-de-papas", "Pastel de papas", "Shepherd's pie", "1 trozo", "1 piece", 300, 60],
    ["pastel-de-choclo", "Pastel de choclo", "Corn pie", "1 trozo", "1 piece", 300, 60],
    ["humita", "Humita", "Humita (corn tamale)", "1 unidad", "1 humita", 200, 60],
    ["caldillo", "Caldillo de mariscos o pescado", "Fish or seafood soup", "1 plato", "1 bowl", 300, 30],
    ["cazuela", "Cazuela con 1 papa", "Cazuela soup with 1 potato", "1 plato", "1 bowl", 300, 30],
    ["budin-pescado", "Budín de pescado (con harina)", "Fish pudding", "1 trozo", "1 piece", 220, 10],
    ["empanada-horno", "Empanada de horno", "Baked empanada", "1 unidad", "1 empanada", 200, 60, ["empanada de pino"]],
    ["empanada-frita", "Empanada frita pequeña", "Small fried empanada", "1 unidad pequeña", "1 small", 100, 30, ["empanada de queso"]],
    ["pizza-delgada", "Pizza masa delgada", "Thin-crust pizza", "1 trozo", "1 slice", 40, 30],
    ["pizza-gruesa", "Pizza masa gruesa", "Thick-crust pizza", "1 trozo", "1 slice", 50, 40],
    ["guiso-acelga", "Guiso de acelga", "Chard stew", "250 g", "250 g", 250, 0],
    ["guiso-zapallo-italiano-pan", "Guiso de zapallo italiano con pan", "Zucchini stew with bread", "1 taza", "1 cup", 250, 10],
    ["guiso-zapallo-italiano", "Guiso de zapallo italiano sin pan", "Zucchini stew, no bread", "1 taza", "1 cup", 250, 0],
    ["zapallo-italiano-relleno-carne", "Zapallo italiano relleno con carne", "Meat-stuffed zucchini", "1 unidad", "1 zucchini", 100, 0],
    ["zapallo-italiano-relleno-arroz", "Zapallo italiano relleno con arroz", "Rice-stuffed zucchini", "1 unidad", "1 zucchini", 100, 10],
  ],
};

export const REFERENCE_TABLE: ReferenceEntry[] = (
  Object.entries(GROUPS) as [ReferenceGroup, Row[]][]
).flatMap(([group, rows]) =>
  rows.map(([id, nameEs, nameEn, portionEs, portionEn, grams, carbs, aliases = [], warning]) => ({
    id,
    group,
    nameEs,
    nameEn,
    aliases,
    portionEs,
    portionEn,
    portionGrams: grams,
    portionCarbs: carbs,
    carbsPer100g: Math.round((carbs / grams) * 1000) / 10,
    ...(warning ? { warning } : {}),
  })),
);

export const REFERENCE_BY_ID = new Map(REFERENCE_TABLE.map((entry) => [entry.id, entry]));

// Compact catalog for the model prompt: id | name (aliases) | portion | g | carbs.
export const REFERENCE_CATALOG = REFERENCE_TABLE.map((e) => {
  const names = e.aliases.length ? `${e.nameEs} (${e.aliases.join(", ")})` : e.nameEs;
  return `${e.id} | ${names} | ${e.portionEs} | ${e.portionGrams} | ${e.portionCarbs}`;
}).join("\n");
