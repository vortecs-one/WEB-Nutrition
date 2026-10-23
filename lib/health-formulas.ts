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
