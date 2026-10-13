// Checks the reference table and its macros snapshot stay consistent.
// Run: npx tsx scripts/validate-reference-table.ts  (exits 1 on any error)
import { REFERENCE_TABLE } from "../lib/foods/reference-table";
import { REFERENCE_MACROS } from "../lib/foods/reference-macros";
import { ALL_PROMPTS } from "../lib/foods/food-prompts";

const CARB_TOLERANCE_G = 0.5;

const errors: string[] = [];
const warnings: string[] = [];
const ids = new Set<string>();

for (const entry of REFERENCE_TABLE) {
  const where = `${entry.id} (${entry.nameEs})`;

  if (ids.has(entry.id)) errors.push(`${where}: duplicate id`);
  ids.add(entry.id);

  if (!(entry.portionGrams > 0)) errors.push(`${where}: portionGrams must be > 0`);
  if (entry.portionCarbs < 0) errors.push(`${where}: portionCarbs must be >= 0`);

  const derivedCarbs = (entry.carbsPer100g * entry.portionGrams) / 100;
  if (Math.abs(derivedCarbs - entry.portionCarbs) > CARB_TOLERANCE_G) {
    errors.push(
      `${where}: portion × carbs/100g = ${derivedCarbs.toFixed(2)} g, table says ${entry.portionCarbs} g`,
    );
  }

  const macros = REFERENCE_MACROS[entry.id];
  if (!macros) {
    errors.push(`${where}: missing protein/fat/fiber/sugars in reference-macros.ts`);
    continue;
  }
  const values = [macros.protein, macros.fat, macros.fiber, macros.sugars];
  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    errors.push(`${where}: macros must be finite and >= 0`);
  }
  const total = macros.protein + macros.fat + entry.carbsPer100g;
  if (total > 100) errors.push(`${where}: protein + fat + carbs = ${total.toFixed(1)} g per 100 g`);
  // Zero-carb rows ("no contiene carbohidratos") round trace sugars down, so skip them.
  if (entry.carbsPer100g > 0 && macros.sugars > entry.carbsPer100g + CARB_TOLERANCE_G) {
    warnings.push(`${where}: sugars ${macros.sugars} g exceed table carbs ${entry.carbsPer100g} g/100 g`);
  }
  const kcal = 4 * macros.protein + 4 * entry.carbsPer100g + 9 * macros.fat;
  if (kcal === 0 && entry.group !== "vegetables") warnings.push(`${where}: computes to 0 kcal`);
}

for (const id of Object.keys(REFERENCE_MACROS)) {
  if (!ids.has(id)) errors.push(`reference-macros.ts: "${id}" is not in the reference table`);
}

const prompted = new Set(ALL_PROMPTS.flatMap((p) => ("id" in p && p.id ? [p.id as string] : [])));
if (prompted.size > 0) {
  for (const id of ids) if (!prompted.has(id)) errors.push(`${id}: no recognition prompts`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(
  `${REFERENCE_TABLE.length} entries checked: ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
