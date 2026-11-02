// lib/health-formulas.ts
// Plain module with every health-measure formula in one place: glucose
// units, insulin dosing (bolus formula + the patient's dosing sheet),
// hypoglycemia carbs and nutrition math. Pure functions only — safe to
// import from server and client code.
//
// Glucose values are always mg/dL unless a function takes a unit.

import type { GlucoseUnit } from "@/lib/glucose/types";

// --- Glucose units ------------------------------------------------------------

export const MGDL_PER_MMOL = 18.0182;

/** mg/dL -> mmol/L, rounded to 1 decimal. */
export function mgdlToMmol(mgdl: number): number {
  return Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10;
}

/** A glucose value entered in `unit` -> mg/dL (unrounded). */
export function toMgdl(value: number, unit: GlucoseUnit): number {
  return unit === "mmol" ? value * MGDL_PER_MMOL : value;
}

// --- Insulin: bolus formula -----------------------------------------------------
// Total bolus = meal insulin + correction insulin − active insulin:
//
//   carbs ÷ ratio  +  (current glucose − target) ÷ sensitivity  −  IOB
//
// - ratio (I:C): grams of carbs 1 U of rapid insulin covers.
// - sensitivity (ISF): mg/dL that 1 U of rapid insulin lowers glucose.
// e.g. 40 g, ratio 10, 220 mg/dL, target 120, ISF 80 -> 4 + 1.25 = 5.25 U.

/** Units needed to cover a meal's carbs. */
export function carbBolus(carbsG: number, ratioG: number): number {
  return carbsG / ratioG;
}

/** Units to bring glucose to target. Negative below target (reduces the meal dose). */
export function correctionBolus(glucoseMgdl: number, targetMgdl: number, isfMgdl: number): number {
  return (glucoseMgdl - targetMgdl) / isfMgdl;
}

export type BolusInput = {
  carbsG: number;
  ratioG: number;
  glucoseMgdl: number;
  targetMgdl: number;
  isfMgdl: number;
  /** Insulin on board from earlier boluses, in units. */
  iobU: number;
};

export type BolusResult = {
  carb: number;
  correction: number;
  /** Part of the IOB actually subtracted (never more than the dose). */
  iobApplied: number;
  /** Exact dose before pen rounding, never below 0. */
  theoretical: number;
};

export function bolusDose({ carbsG, ratioG, glucoseMgdl, targetMgdl, isfMgdl, iobU }: BolusInput): BolusResult {
  const carb = carbBolus(carbsG, ratioG);
  const correction = correctionBolus(glucoseMgdl, targetMgdl, isfMgdl);
  const raw = carb + correction;
  const iobApplied = Math.min(iobU, Math.max(0, raw));
  return { carb, correction, iobApplied, theoretical: Math.max(0, raw - iobU) };
}

/** Pen rounding: down to the nearest 0.5 U. */
export const roundDownHalf = (u: number) => Math.floor(u * 2) / 2;

// --- Insulin: patient's dosing sheet -------------------------------------------
// The care team's paper sheet is a discretized version of the bolus formula:
// carbs are counted in whole ratio-sized portions, correction is counted in
// whole ISF-sized steps above the top of the target range, and the result is
// in whole units.

// The sheet has 8 correction rows above the target range (121–155 … 366+)
// and 16 carb columns (0 … 15 × ratio).
export const SHEET_MAX_CORRECTION_STEPS = 8;
export const SHEET_MAX_CARB_STEPS = 15;

export type SheetParams = { isf: number; low: number; high: number };

/** Whole ratio-sized carb portions (the sheet's column). */
export function sheetCarbSteps(carbsG: number, ratioG: number): number {
  // Small epsilon so 14 / 7 doesn't floor to 1.999…
  return Math.floor(carbsG / ratioG + 1e-9);
}

/** Row of the sheet the glucose falls in: -1 below range, 0 in range, 1+ above. */
export function sheetCorrectionSteps(glucoseMgdl: number, { isf, low, high }: SheetParams): number {
  if (glucoseMgdl > high) return Math.ceil((glucoseMgdl - high) / isf);
  if (glucoseMgdl < low) return -1;
  return 0;
}

/**
 * Units from the sheet. With carbs, each ratio-sized portion adds 1 U on top
 * of the row's correction. In the 0 g column the sheet is one unit more
 * conservative (pure correction without a meal).
 */
export function sheetDose(carbSteps: number, correctionSteps: number): number {
  return carbSteps === 0
    ? Math.max(0, correctionSteps - 1)
    : Math.max(0, carbSteps + correctionSteps);
}

// --- Hypoglycemia ---------------------------------------------------------------

/**
 * Grams of fast carbs to raise glucose to `goalMgdl`. 1 g raises glucose by
 * ISF ÷ ratio mg/dL; never less than the 15 g of the "rule of 15".
 */
export function carbsToReach(glucoseMgdl: number, goalMgdl: number, ratioG: number, isfMgdl: number): number {
  return Math.max(15, Math.ceil(((goalMgdl - glucoseMgdl) * ratioG) / isfMgdl));
}

// --- Nutrition --------------------------------------------------------------------

/** Atwater factors (kcal per gram). */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

export function kcalFromMacros({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }): number {
  return KCAL_PER_GRAM.protein * protein + KCAL_PER_GRAM.carbs * carbs + KCAL_PER_GRAM.fat * fat;
}

/** Daily value reference amounts for a 2000-kcal diet (g, g, mg). */
export const DAILY_VALUE = { saturatedFat: 20, fiber: 28, sodium: 2300 } as const;

/** Whole-number % of a daily value reference amount. */
export function percentOfDailyValue(value: number, dailyValue: number): number {
  return Math.round((value / dailyValue) * 100);
}

/** Grams of sodium -> milligrams (food APIs return sodium in grams). */
export function sodiumToMg(gramsValue: number | null): number | null {
  return gramsValue == null ? null : gramsValue * 1000;
}

// --- Energy balance and body measures ----------------------------------------------
// Standard estimates for adults, not medical advice:
//
//   BMR (Mifflin-St Jeor)  10 × kg + 6.25 × cm − 5 × age, +5 men / −161 women
//   base burn              BMR × activity factor (daily life, workouts excluded)
//   goal adjustment        kg per week × 7700 ÷ 7 (1 kg of body fat ≈ 7700 kcal)
//   food target            base burn ± goal adjustment
//   calories left          food target + logged workouts − food eaten
//
// e.g. a woman of 30, 165 cm, 60 kg: BMR 1320; light activity → 1815; losing
// 0.25 kg a week (−275) → eats 1540 kcal, plus whatever her workouts burn.

export type Sex = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "veryActive";
export type WeightGoal = "lose" | "maintain" | "gain";

/** Daily life without workouts: desk job … physical job with lots of walking. */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

/** kcal stored in 1 kg of body fat. */
export const KCAL_PER_KG = 7700;

/** Weekly weight-change rates offered to the user (kg). */
export const WEEKLY_RATES_KG = [0.25, 0.5, 0.75] as const;

/** The daily deficit or surplus never exceeds this share of the base burn. */
export const MAX_ADJUSTMENT_SHARE = 0.25;

/** Lowest food target suggested without medical supervision (kcal). */
export const MIN_INTAKE_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

/** Whole years between a YYYY-MM-DD birth date and a YYYY-MM-DD day. */
export function ageOn(birthDate: string, dateKey: string): number {
  const [by, bm, bd] = birthDate.slice(0, 10).split("-").map(Number);
  const [y, m, d] = dateKey.slice(0, 10).split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export type BodyInput = { sex: Sex; weightKg: number; heightCm: number; age: number };

/** Basal metabolic rate, Mifflin-St Jeor (kcal/day). */
export function bmrMifflin({ sex, weightKg, heightCm, age }: BodyInput): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "male" ? 5 : -161);
}

/** Calories burned by daily life (BMR × activity factor), workouts excluded. */
export function baseBurn(bmr: number, level: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[level];
}

/** Daily kcal change that gains or loses `weeklyRateKg` a week (signed). */
export function goalAdjustment(goal: WeightGoal, weeklyRateKg: number): number {
  if (goal === "maintain") return 0;
  const kcal = (weeklyRateKg * KCAL_PER_KG) / 7;
  return goal === "lose" ? -kcal : kcal;
}

export type FoodTarget = {
  /** kcal to eat in the day, workouts not included. */
  kcal: number;
  /** Signed daily deficit (−) or surplus (+) actually applied. */
  adjustment: number;
  /** Which safety limit changed the requested target, if any. */
  limitedBy: "adjustmentCap" | "minIntake" | null;
};

/**
 * Food target for the day: base burn ± the goal adjustment, keeping the
 * deficit or surplus within 25% of the base burn and the target above the
 * minimum intake.
 */
export function foodTarget({
  baseBurnKcal,
  goal,
  weeklyRateKg,
  sex,
}: {
  baseBurnKcal: number;
  goal: WeightGoal;
  weeklyRateKg: number;
  sex: Sex;
}): FoodTarget {
  const requested = goalAdjustment(goal, weeklyRateKg);
  const cap = baseBurnKcal * MAX_ADJUSTMENT_SHARE;
  let adjustment = Math.max(-cap, Math.min(cap, requested));
  let limitedBy: FoodTarget["limitedBy"] = adjustment !== requested ? "adjustmentCap" : null;
  if (baseBurnKcal + adjustment < MIN_INTAKE_KCAL[sex]) {
    // Never raise the target above the base burn just to reach the minimum.
    adjustment = Math.min(0, MIN_INTAKE_KCAL[sex] - baseBurnKcal);
    limitedBy = "minIntake";
  }
  return { kcal: Math.round(baseBurnKcal + adjustment), adjustment: Math.round(adjustment), limitedBy };
}

/** kcal still available today: target + workouts − food (negative = over). */
export function caloriesLeft(targetKcal: number, workoutsKcal: number, eatenKcal: number): number {
  return targetKcal + workoutsKcal - eatenKcal;
}

/** Body-fat change a net energy balance amounts to (kg, signed). */
export function weightChangeKg(netKcal: number): number {
  return netKcal / KCAL_PER_KG;
}

/** Body mass index (kg/m²). */
export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export type BmiCategory = "underweight" | "healthy" | "overweight" | "obese";

/** WHO adult categories. */
export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return "underweight";
  if (value < 25) return "healthy";
  if (value < 30) return "overweight";
  return "obese";
}

/** Weights with a healthy BMI (18.5–24.9) for a height, in kg (1 decimal). */
export function healthyWeightRange(heightCm: number): { minKg: number; maxKg: number } {
  const m2 = (heightCm / 100) ** 2;
  return { minKg: Math.round(18.5 * m2 * 10) / 10, maxKg: Math.round(24.9 * m2 * 10) / 10 };
}

/** Protein per kg of body weight: higher while losing or gaining. */
export const PROTEIN_G_PER_KG: Record<WeightGoal, number> = { lose: 1.6, maintain: 1.2, gain: 1.6 };
/** Share of the food target eaten as fat. */
export const FAT_SHARE = 0.3;
/** Recommended minimum of carbohydrate per day (g). */
export const MIN_CARBS_G = 130;

/**
 * Macro targets in grams: protein by body weight, 30% of the kcal as fat,
 * the rest as carbs (never under 130 g).
 */
export function macroTargets({
  targetKcal,
  weightKg,
  goal,
}: {
  targetKcal: number;
  weightKg: number;
  goal: WeightGoal;
}): { protein: number; fat: number; carbs: number } {
  const protein = Math.round(weightKg * PROTEIN_G_PER_KG[goal]);
  const fat = Math.round((targetKcal * FAT_SHARE) / KCAL_PER_GRAM.fat);
  const carbsKcal = targetKcal - protein * KCAL_PER_GRAM.protein - fat * KCAL_PER_GRAM.fat;
  const carbs = Math.max(MIN_CARBS_G, Math.round(carbsKcal / KCAL_PER_GRAM.carbs));
  return { protein, fat, carbs };
}

/** Daily water from body weight (35 ml/kg), rounded to 100 ml. */
export function waterGoalMl(weightKg: number): number {
  return Math.round((weightKg * 35) / 100) * 100;
}
