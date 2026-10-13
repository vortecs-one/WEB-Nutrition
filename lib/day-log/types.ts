// Shared, framework-agnostic types & constants for the day-log feature.
// Kept in a plain module (no "use client"/"use server") so both the client
// provider and the server actions can import them.

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type ActivityType =
  | "cardio"
  | "strength"
  | "walking"
  | "sport"
  | "other";
export type SupplementType =
  | "protein"
  | "vitamin"
  | "creatine"
  | "omega3"
  | "other";

export type Meal = {
  id: number;
  name: string;
  calories: number;
  type: MealType;
  protein?: number;
  carbs?: number;
  fat?: number;
  // Extended nutrients (grams, except sodium in mg).
  saturatedFat?: number;
  sugars?: number;
  fiber?: number;
  sodium?: number;
};

export type Activity = {
  id: number;
  name: string;
  calories: number;
  type: ActivityType;
};

export type Supplement = {
  id: number;
  name: string;
  dose: string;
  type: SupplementType;
};

// One logged water intake (milliliters).
export type WaterEntry = {
  id: number;
  amountMl: number;
};

// One sleep record per day (minutes slept).
export type SleepEntry = {
  id: number;
  minutes: number;
};

// Self-reported stress, one per day.
export type StressLevel = 1 | 2 | 3 | 4 | 5;
export type StressEntry = {
  id: number;
  level: StressLevel;
};

// Per-day data structure.
export type DayData = {
  meals: Meal[];
  activities: Activity[];
  supplements: Supplement[];
  water: WaterEntry[];
  sleep?: SleepEntry;
  stress?: StressEntry;
};

// Map from ISO date string (YYYY-MM-DD) -> that day's data.
export type DayLog = Record<string, DayData>;

// Daily targets (could later come from the user's profile / Thruxion API).
export const CONSUMED_GOAL = 1940;
export const BURNED_GOAL = 2383;
export const WATER_GOAL_ML = 3000;
export const SLEEP_GOAL_MIN = 480;
export const MAX_SLEEP_MIN = 1440;

export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isStressLevel(value: unknown): value is StressLevel {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;
}

export function isSleepMinutes(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_SLEEP_MIN;
}
