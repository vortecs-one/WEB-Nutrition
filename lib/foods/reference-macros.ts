// Non-carb macros per 100 g for each reference-table entry. Carbs always come from
// the Tabla H. de C.; these only fill protein/fat/fiber/sugars so kcal is realistic.
// Single foods: USDA FoodData Central SR Legacy (public domain, CC0).
// Chilean dishes: estimated from typical home recipes built from the same FDC items.

export type ReferenceMacros = {
  protein: number;
  fat: number;
  fiber: number;
  sugars: number;
  estimated?: true;
};

const m = (protein: number, fat: number, fiber: number, sugars: number): ReferenceMacros => ({
  protein,
  fat,
  fiber,
  sugars,
});
const est = (protein: number, fat: number, fiber: number, sugars: number): ReferenceMacros => ({
  ...m(protein, fat, fiber, sugars),
  estimated: true,
});

export const REFERENCE_MACROS: Record<string, ReferenceMacros> = {
  "pan-batido": m(8.6, 1.6, 2.4, 3),
  "pan-hallulla": est(8, 6, 2.2, 2.5),
  "pan-molde": m(9, 3.3, 2.7, 5),
  "pan-pita": m(9.1, 1.2, 2.2, 1.3),
  "galletas-salvado": m(9, 13, 10, 12),
  "pan-hot-dog": m(9.4, 4.4, 1.6, 5.6),
  "arroz-cocido": m(2.7, 0.3, 0.4, 0.1),
  "fideos-cocidos": m(5.8, 0.9, 1.8, 0.6),
  "quinoa-cocida": m(4.4, 1.9, 2.8, 0.9),
  "papa-cocida": m(1.7, 0.1, 1.8, 0.9),
  "choclo-cocido": m(3.4, 1.5, 2.4, 4.5),
  "arvejitas-cocidas": m(5.4, 0.2, 5.5, 5.9),
  semola: m(12.7, 1.1, 3.9, 0),
  maicena: m(0.3, 0.1, 0.9, 0),
  avena: m(13.2, 6.5, 10.1, 1),
  "lentejas-cocidas": m(9, 0.4, 7.9, 1.8),
  "porotos-cocidos": m(8.7, 0.5, 6.4, 0.3),
  "garbanzos-cocidos": m(8.9, 2.6, 7.6, 4.8),
  "leche-semidescremada": m(3.3, 1.5, 0, 5),
  "leche-en-polvo": m(3.5, 0.8, 0, 5),
  "yogurt-sin-azucar": m(4.5, 1.5, 0, 4),
  "leche-sin-lactosa": m(3.3, 1.5, 0, 5),
  ciruela: m(0.7, 0.3, 1.4, 9.9),
  platano: m(1.1, 0.3, 2.6, 12.2),
  naranja: m(0.9, 0.1, 2.4, 9.4),
  "kiwi-tuna": m(1, 0.5, 3.5, 9),
  "uva-verde": m(0.7, 0.2, 0.9, 15.5),
  sandia: m(0.6, 0.2, 0.4, 6.2),
  melon: m(0.8, 0.2, 0.9, 7.9),
  manzana: m(0.3, 0.2, 2.4, 10.4),
  "pepino-dulce": est(0.4, 0.1, 1, 5),
  pera: m(0.4, 0.1, 3.1, 9.8),
  durazno: m(0.9, 0.3, 1.5, 8.4),
  mandarina: m(0.8, 0.3, 1.8, 10.6),
  pina: m(0.5, 0.1, 1.4, 9.9),
  frutilla: m(0.7, 0.3, 2, 4.9),
  frambuesas: m(1.2, 0.7, 6.5, 4.4),
  arandanos: m(0.7, 0.3, 2.4, 10),
  damascos: m(1.4, 0.4, 2, 9.2),
  chirimoya: m(1.6, 0.7, 3, 12.9),
  "betarraga-cocida": m(1.7, 0.2, 2, 8),
  "zanahoria-cruda": m(0.9, 0.2, 2.8, 4.7),
  "zapallo-amarillo": m(1, 0.1, 0.5, 2.8),
  palta: m(2, 14.7, 6.7, 0.7),
  aceite: m(0, 100, 0, 0),
  mantequilla: m(0.9, 81, 0, 0.1),
  mayonesa: m(1, 75, 0, 0.6),
  crema: m(2.1, 35, 0, 2.9),
  margarina: m(0.2, 80, 0, 0),
  aceitunas: m(0.8, 10.7, 3.2, 0),
  "frutos-secos": m(20, 54, 8, 4.4),
  "carne-vacuno": m(26, 15, 0, 0),
  "carne-cerdo": m(27, 14, 0, 0),
  pollo: m(31, 3.6, 0, 0),
  pescado: m(22, 5, 0, 0),
  mariscos: m(20, 1.5, 0, 0),
  huevo: m(12.6, 9.5, 0, 1.1),
  "guiso-legumbres": est(6, 3, 5, 2),
  "lentejas-con-arroz": est(6, 2, 4, 1),
  carbonada: est(5, 3, 1.5, 2),
  ajiaco: est(6, 3, 1.2, 1),
  charquican: est(5, 3, 2, 3),
  menestron: est(3, 2, 2.5, 2.5),
  pancutras: est(5, 3, 1, 0.8),
  estofado: est(8, 4, 1.5, 2),
  tomatican: est(2.5, 3, 1.8, 4),
  "crema-anos-dorados": est(3, 3, 1.5, 2),
  "consome-fideos": est(1.5, 0.5, 0.2, 0.3),
  chapsui: est(9, 4, 1.5, 2),
  "guatitas-jardinera": est(9, 4, 1, 1.5),
  "budin-zapallo-italiano": est(6, 6, 1, 2),
  "pastel-de-papas": est(7, 7, 1.5, 1.5),
  "pastel-de-choclo": est(7, 7, 2, 6),
  humita: est(4, 5, 2.5, 6),
  caldillo: est(7, 2, 0.8, 1),
  cazuela: est(6, 3, 1, 1.5),
  "budin-pescado": est(10, 6, 0.5, 1.5),
  "empanada-horno": est(9, 12, 1.8, 2),
  "empanada-frita": est(8, 18, 1.5, 2),
  "pizza-delgada": est(11, 10, 2.3, 3.5),
  "pizza-gruesa": est(11, 10, 2.3, 3.5),
  "guiso-acelga": est(5, 5, 2, 1),
  "guiso-zapallo-italiano-pan": est(5, 5, 1.2, 2),
  "guiso-zapallo-italiano": est(5, 5, 1, 2),
  "zapallo-italiano-relleno-carne": est(8, 6, 1, 2),
  "zapallo-italiano-relleno-arroz": est(5, 4, 1, 2),
};

export function macrosFor(id: string): ReferenceMacros {
  return REFERENCE_MACROS[id] ?? m(0, 0, 0, 0);
}
