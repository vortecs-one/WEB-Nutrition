import type { NutrimentKey, NutritionBasis } from "./types";

export type NutritionWarning =
  | "over100"
  | "satFatOverFat"
  | "sugarsOverCarbs"
  | "energyMismatch"
  | "saltSodiumMismatch";

type Values = Partial<Record<NutrimentKey, number>>;

// Soft checks on what the user is about to send: warnings never block the
// submit, they only point at numbers worth a second look.
export function checkNutrition(values: Values, basis: NutritionBasis): NutritionWarning[] {
  const w: NutritionWarning[] = [];
  const g = (k: NutrimentKey) => values[k] ?? 0;

  if (basis === "100g") {
    const mass = g("fat") + g("carbohydrates") + g("proteins") + g("fiber") + g("salt");
    if (mass > 101) w.push("over100");
  }
  if (values["saturated-fat"] != null && values.fat != null && g("saturated-fat") > g("fat") + 0.1) {
    w.push("satFatOverFat");
  }
  if (values.sugars != null && values.carbohydrates != null && g("sugars") > g("carbohydrates") + 0.1) {
    w.push("sugarsOverCarbs");
  }

  const kcal = values["energy-kcal"] ?? (values["energy-kj"] != null ? g("energy-kj") / 4.184 : null);
  if (kcal != null && kcal > 0 && (values.fat != null || values.proteins != null || values.carbohydrates != null)) {
    const fromMacros = 9 * g("fat") + 4 * g("carbohydrates") + 4 * g("proteins") + 2 * g("fiber");
    if (fromMacros > 20 && Math.abs(fromMacros - kcal) / Math.max(kcal, fromMacros) > 0.25) {
      w.push("energyMismatch");
    }
  }

  if (values.salt != null && values.sodium != null && g("salt") > 0) {
    const expectedMg = (g("salt") / 2.5) * 1000;
    if (Math.abs(expectedMg - g("sodium")) / expectedMg > 0.2) w.push("saltSodiumMismatch");
  }
  return w;
}

// Fill the other of salt (g) / sodium (mg) when only one is given.
export function deriveSaltSodium(values: Values): Values {
  const out = { ...values };
  if (out.salt != null && out.sodium == null) out.sodium = Math.round(out.salt * 400);
  else if (out.sodium != null && out.salt == null) out.salt = Math.round((out.sodium / 400) * 100) / 100;
  return out;
}
