// Body data the calorie formulas need (lib/health-formulas.ts). Plain module
// so the client and the server actions share the types and validation.

import {
  ACTIVITY_FACTORS,
  WEEKLY_RATES_KG,
  type ActivityLevel,
  type Sex,
  type WeightGoal,
} from "@/lib/health-formulas";
import { DATE_KEY_RE } from "@/lib/day-log/types";

export type BodyProfile = {
  sex: Sex | null;
  /** YYYY-MM-DD. */
  birthDate: string | null;
  heightCm: number | null;
  /** Daily life without workouts. */
  activityLevel: ActivityLevel;
  goal: WeightGoal;
  weeklyRateKg: number;
  /** Values read from the Thruxion record instead of this app's profile. */
  fromThruxion: { sex: boolean; birthDate: boolean; height: boolean };
  /** Newest weight in the Thruxion measurement history (any platform). */
  latestWeight: { kg: number; dateKey: string } | null;
};

/** What the profile form saves (weight is a weigh-in in the day log). */
export type BodyProfileInput = Omit<BodyProfile, "fromThruxion" | "latestWeight">;

export const DEFAULT_ACTIVITY_LEVEL: ActivityLevel = "light";
export const MIN_HEIGHT_CM = 100;
export const MAX_HEIGHT_CM = 250;

export const isSex = (v: unknown): v is Sex => v === "male" || v === "female";
export const isActivityLevel = (v: unknown): v is ActivityLevel =>
  typeof v === "string" && Object.hasOwn(ACTIVITY_FACTORS, v);
export const isWeightGoal = (v: unknown): v is WeightGoal =>
  v === "lose" || v === "maintain" || v === "gain";
export const isWeeklyRateKg = (v: unknown): v is number =>
  (WEEKLY_RATES_KG as readonly number[]).includes(v as number);
export const isHeightCm = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= MIN_HEIGHT_CM && (v as number) <= MAX_HEIGHT_CM;

/** A real past date, for someone between 10 and 120 years old. */
export function isBirthDate(v: unknown, todayKey: string): v is string {
  if (typeof v !== "string" || !DATE_KEY_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
  const years = Number(todayKey.slice(0, 4)) - Number(v.slice(0, 4));
  return years >= 10 && years <= 120;
}

/** Thruxion's free-text gender → the sex the formulas use, when clear. */
export function sexFromGender(gender: string | undefined | null): Sex | null {
  const g = gender?.trim().toLowerCase() ?? "";
  if (/^(m|male|man|masculino|hombre|h)$/.test(g)) return "male";
  if (/^(f|female|woman|femenino|mujer)$/.test(g)) return "female";
  return null;
}
