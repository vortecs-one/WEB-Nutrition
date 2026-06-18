"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// === Shared day-log store ===
// Holds the day's meals, activities, and supplements so the Calories
// dashboard (gauge) and the Nutrition diet log stay in sync without a
// backend round-trip. Swap the in-memory state for SWR + the Thruxion API
// later without changing consumers.

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
  // Optional macronutrient grams, used for the daily composition chart.
  protein?: number;
  carbs?: number;
  fat?: number;
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

// Daily targets (could later come from the user's profile / Thruxion API).
export const CONSUMED_GOAL = 1940;
export const BURNED_GOAL = 2383;

type DayLogValue = {
  meals: Meal[];
  activities: Activity[];
  supplements: Supplement[];
  consumed: number;
  burned: number;
  addMeal: (meal: Omit<Meal, "id">) => void;
  removeMeal: (id: number) => void;
  addActivity: (activity: Omit<Activity, "id">) => void;
  removeActivity: (id: number) => void;
  addSupplement: (supplement: Omit<Supplement, "id">) => void;
  removeSupplement: (id: number) => void;
};

const DayLogContext = createContext<DayLogValue | null>(null);

export function DayLogProvider({ children }: { children: ReactNode }) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [supplements, setSupplements] = useState<Supplement[]>([]);

  const consumed = useMemo(
    () => meals.reduce((sum, m) => sum + m.calories, 0),
    [meals],
  );
  const burned = useMemo(
    () => activities.reduce((sum, a) => sum + a.calories, 0),
    [activities],
  );

  const value = useMemo<DayLogValue>(
    () => ({
      meals,
      activities,
      supplements,
      consumed,
      burned,
      addMeal: (meal) =>
        setMeals((prev) => [{ id: Date.now(), ...meal }, ...prev]),
      removeMeal: (id) =>
        setMeals((prev) => prev.filter((m) => m.id !== id)),
      addActivity: (activity) =>
        setActivities((prev) => [{ id: Date.now(), ...activity }, ...prev]),
      removeActivity: (id) =>
        setActivities((prev) => prev.filter((a) => a.id !== id)),
      addSupplement: (supplement) =>
        setSupplements((prev) => [{ id: Date.now(), ...supplement }, ...prev]),
      removeSupplement: (id) =>
        setSupplements((prev) => prev.filter((s) => s.id !== id)),
    }),
    [meals, activities, supplements, consumed, burned],
  );

  return (
    <DayLogContext.Provider value={value}>{children}</DayLogContext.Provider>
  );
}

export function useDayLog() {
  const ctx = useContext(DayLogContext);
  if (!ctx) {
    throw new Error("useDayLog must be used within a DayLogProvider");
  }
  return ctx;
}
