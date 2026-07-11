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

// Per-day data structure.
export type DayData = {
  meals: Meal[];
  activities: Activity[];
  supplements: Supplement[];
  water: WaterEntry[];
};

// Map from ISO date string (YYYY-MM-DD) -> that day's data.
export type DayLog = Record<string, DayData>;

// Daily targets (could later come from the user's profile / Thruxion API).
export const CONSUMED_GOAL = 1940;
export const BURNED_GOAL = 2383;
export const WATER_GOAL_ML = 3000;
