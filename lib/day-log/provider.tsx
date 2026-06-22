"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// === Shared day-log store ===
// Data is keyed by ISO date string (YYYY-MM-DD) so every day has its own
// independent meals, activities and supplements.  The Calories view owns
// the selected date; both the gauge and the composition chart read the
// same date's data from this store.

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

// ---- saved food library ----
// Foods saved by the user (manually or via barcode scan) for quick re-use.
export type SavedFood = {
  id: number;
  name: string;
  brand?: string;
  barcode?: string;
  /** kcal per 100 g (or per serving if servingSize is set) */
  caloriesPer100g: number;
  servingSize?: number; // grams
  protein?: number;     // g per 100 g
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;      // mg per 100 g
};

// ---- per-day data structure ----
type DayData = {
  meals: Meal[];
  activities: Activity[];
  supplements: Supplement[];
};

const emptyDay = (): DayData => ({
  meals: [],
  activities: [],
  supplements: [],
});

// ---- context value ----
type DayLogValue = {
  // Returns the data for any given ISO date key.
  dayData: (dateKey: string) => DayData;
  // Convenience totals for a given date.
  consumedFor: (dateKey: string) => number;
  burnedFor: (dateKey: string) => number;
  // Mutations — all scoped by date key.
  addMeal: (dateKey: string, meal: Omit<Meal, "id">) => void;
  removeMeal: (dateKey: string, id: number) => void;
  addActivity: (dateKey: string, activity: Omit<Activity, "id">) => void;
  removeActivity: (dateKey: string, id: number) => void;
  addSupplement: (dateKey: string, supplement: Omit<Supplement, "id">) => void;
  removeSupplement: (dateKey: string, id: number) => void;
  // Food library (saved foods for quick re-use).
  foodLibrary: SavedFood[];
  addFoodToLibrary: (food: Omit<SavedFood, "id">) => void;
  removeFoodFromLibrary: (id: number) => void;
};

const DayLogContext = createContext<DayLogValue | null>(null);

export function DayLogProvider({ children }: { children: ReactNode }) {
  // Map from ISO date string → DayData.
  const [log, setLog] = useState<Record<string, DayData>>({});
  // Saved food library — persists across days (in-memory for now).
  const [foodLibrary, setFoodLibrary] = useState<SavedFood[]>([]);

  const dayData = useCallback(
    (dateKey: string): DayData => log[dateKey] ?? emptyDay(),
    [log],
  );

  const consumedFor = useCallback(
    (dateKey: string) =>
      (log[dateKey]?.meals ?? []).reduce((s, m) => s + m.calories, 0),
    [log],
  );

  const burnedFor = useCallback(
    (dateKey: string) =>
      (log[dateKey]?.activities ?? []).reduce((s, a) => s + a.calories, 0),
    [log],
  );

  // Helper to patch one day's data immutably.
  const patchDay = useCallback(
    (dateKey: string, fn: (prev: DayData) => DayData) =>
      setLog((prev) => ({
        ...prev,
        [dateKey]: fn(prev[dateKey] ?? emptyDay()),
      })),
    [],
  );

  const addMeal = useCallback(
    (dateKey: string, meal: Omit<Meal, "id">) =>
      patchDay(dateKey, (d) => ({
        ...d,
        meals: [{ id: Date.now(), ...meal }, ...d.meals],
      })),
    [patchDay],
  );
  const removeMeal = useCallback(
    (dateKey: string, id: number) =>
      patchDay(dateKey, (d) => ({
        ...d,
        meals: d.meals.filter((m) => m.id !== id),
      })),
    [patchDay],
  );

  const addActivity = useCallback(
    (dateKey: string, activity: Omit<Activity, "id">) =>
      patchDay(dateKey, (d) => ({
        ...d,
        activities: [{ id: Date.now(), ...activity }, ...d.activities],
      })),
    [patchDay],
  );
  const removeActivity = useCallback(
    (dateKey: string, id: number) =>
      patchDay(dateKey, (d) => ({
        ...d,
        activities: d.activities.filter((a) => a.id !== id),
      })),
    [patchDay],
  );

  const addSupplement = useCallback(
    (dateKey: string, supplement: Omit<Supplement, "id">) =>
      patchDay(dateKey, (d) => ({
        ...d,
        supplements: [{ id: Date.now(), ...supplement }, ...d.supplements],
      })),
    [patchDay],
  );
  const removeSupplement = useCallback(
    (dateKey: string, id: number) =>
      patchDay(dateKey, (d) => ({
        ...d,
        supplements: d.supplements.filter((s) => s.id !== id),
      })),
    [patchDay],
  );

  const addFoodToLibrary = useCallback(
    (food: Omit<SavedFood, "id">) =>
      setFoodLibrary((prev) => [{ id: Date.now(), ...food }, ...prev]),
    [],
  );

  const removeFoodFromLibrary = useCallback(
    (id: number) =>
      setFoodLibrary((prev) => prev.filter((f) => f.id !== id)),
    [],
  );

  const value = useMemo<DayLogValue>(
    () => ({
      dayData,
      consumedFor,
      burnedFor,
      addMeal,
      removeMeal,
      addActivity,
      removeActivity,
      addSupplement,
      removeSupplement,
      foodLibrary,
      addFoodToLibrary,
      removeFoodFromLibrary,
    }),
    [
      dayData,
      consumedFor,
      burnedFor,
      addMeal,
      removeMeal,
      addActivity,
      removeActivity,
      addSupplement,
      removeSupplement,
      foodLibrary,
      addFoodToLibrary,
      removeFoodFromLibrary,
    ],
  );

  return (
    <DayLogContext.Provider value={value}>{children}</DayLogContext.Provider>
  );
}

export function useDayLog() {
  const ctx = useContext(DayLogContext);
  if (!ctx) throw new Error("useDayLog must be used within a DayLogProvider");
  return ctx;
}
