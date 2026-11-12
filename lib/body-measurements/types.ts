// Height / weight history stored in the Thruxion Humans API. Plain module so
// the client and the server actions share the types and validation.

import { MAX_WEIGHT_G, MIN_WEIGHT_G } from "@/lib/day-log/types";
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from "@/lib/body-profile/types";

export type MeasurementPoint = {
  id: number;
  /** YYYY-MM-DD (UTC date of `measured_at`, which we write at 12:00 UTC). */
  dateKey: string;
  heightCm: number | null;
  weightKg: number | null;
};

export type MeasurementInput = {
  dateKey: string;
  heightCm: number | null;
  weightKg: number | null;
};

export const MEASUREMENTS_KEY = "body-measurements";

/** Matches every SWR key the measurement views use, for global revalidation. */
export const isMeasurementsKey = (key: unknown) =>
  key === MEASUREMENTS_KEY || (Array.isArray(key) && key[0] === MEASUREMENTS_KEY);

export const measurementDateKey = (iso: string) => iso.slice(0, 10);

export const MEASUREMENT_RANGES = ["30d", "90d", "1y", "all"] as const;
export type MeasurementRange = (typeof MEASUREMENT_RANGES)[number];
export const isMeasurementRange = (v: unknown): v is MeasurementRange =>
  typeof v === "string" && (MEASUREMENT_RANGES as readonly string[]).includes(v);

export const HISTORY_PAGE_SIZE = 50;

export type MeasurementPage = { points: MeasurementPoint[]; hasMore: boolean };

export type MeasurementSummary = {
  heightCm: number | null;
  heightDateKey: string | null;
  weightKg: number | null;
  weightDateKey: string | null;
  /** Current weight minus the closest weigh-in on or before 7 / 30 days ago. */
  weightDelta7d: number | null;
  weightDelta30d: number | null;
};

// Limits the Humans API enforces. The server validates against these so
// nothing is sent that the API would reject.
export const API_MIN_HEIGHT_CM = 30;
export const API_MAX_HEIGHT_CM = 300;
export const API_MIN_WEIGHT_KG = 0.5;
export const API_MAX_WEIGHT_KG = 700;

/** Height in cm (one decimal allowed), same range as the profile form. */
export const isMeasurementHeight = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= MIN_HEIGHT_CM && v <= MAX_HEIGHT_CM;

/** Weight in kg, same range as the day-log weigh-ins. */
export const isMeasurementWeight = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v * 1000 >= MIN_WEIGHT_G && v * 1000 <= MAX_WEIGHT_G;

export const isApiHeight = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= API_MIN_HEIGHT_CM && v <= API_MAX_HEIGHT_CM;

export const isApiWeight = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= API_MIN_WEIGHT_KG && v <= API_MAX_WEIGHT_KG;

export type BmiCategory = "under" | "normal" | "over" | "obese";

export function bmiOf(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export const bmiCategory = (bmi: number): BmiCategory =>
  bmi < 18.5 ? "under" : bmi < 25 ? "normal" : bmi < 30 ? "over" : "obese";
