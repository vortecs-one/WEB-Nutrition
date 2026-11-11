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

export const measurementDateKey = (iso: string) => iso.slice(0, 10);

/** Height in cm (one decimal allowed), same range as the profile form. */
export const isMeasurementHeight = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= MIN_HEIGHT_CM && v <= MAX_HEIGHT_CM;

/** Weight in kg, same range as the day-log weigh-ins. */
export const isMeasurementWeight = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v * 1000 >= MIN_WEIGHT_G && v * 1000 <= MAX_WEIGHT_G;
