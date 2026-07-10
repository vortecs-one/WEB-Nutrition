"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import useSWR from "swr";
import {
  fetchUserDayLog,
  addMealEntry,
  addMealEntries,
  addActivityEntry,
  addSupplementEntry,
  removeEntry,
} from "./actions";
import type {
  Meal,
  Activity,
  Supplement,
  DayData,
  DayLog,
} from "./types";

// Re-export shared types & constants so existing imports from
// "@/lib/day-log/provider" keep working unchanged.
export * from "./types";

// === Shared day-log store (database-backed) ===
// Data is keyed by ISO date string (YYYY-MM-DD). It is persisted per user in
// the `day_log_entries` table via server actions, so logs survive logouts and
// are restored on the next login. SWR caches the user's log on the client and
// mutations update optimistically, then reconcile with the authoritative
// server state (which carries the real row ids).

const emptyDay = (): DayData => ({
  meals: [],
  activities: [],
  supplements: [],
});

type DayLogValue = {
  dayData: (dateKey: string) => DayData;
  consumedFor: (dateKey: string) => number;
  burnedFor: (dateKey: string) => number;
  addMeal: (dateKey: string, meal: Omit<Meal, "id">) => void;
  addMeals: (dateKey: string, meals: Omit<Meal, "id">[]) => void;
  removeMeal: (dateKey: string, id: number) => void;
  addActivity: (dateKey: string, activity: Omit<Activity, "id">) => void;
  removeActivity: (dateKey: string, id: number) => void;
  addSupplement: (dateKey: string, supplement: Omit<Supplement, "id">) => void;
  removeSupplement: (dateKey: string, id: number) => void;
};

const DayLogContext = createContext<DayLogValue | null>(null);

// Immutably patch one day's data within the full log.
function patchDay(
  log: DayLog,
  dateKey: string,
  fn: (prev: DayData) => DayData,
): DayLog {
  return { ...log, [dateKey]: fn(log[dateKey] ?? emptyDay()) };
}

export function DayLogProvider({ children }: { children: ReactNode }) {
  // The server action resolves the user from the session, so a constant key
  // is correct per browser session (each user has their own session cookie).
  const { data, mutate } = useSWR<DayLog>("day-log", () => fetchUserDayLog(), {
    fallbackData: {},
    revalidateOnFocus: false,
  });

  const log = useMemo(() => data ?? {}, [data]);

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

  // Runs an optimistic local update, performs the DB write, then replaces the
  // cache with fresh server state (so temporary ids become real row ids).
  // Rolls the optimistic change back if the server write fails.
  const runMutation = useCallback(
    (optimistic: (log: DayLog) => DayLog, action: () => Promise<unknown>) => {
      void mutate(
        async () => {
          await action();
          return fetchUserDayLog();
        },
        {
          optimisticData: (current?: DayLog) => optimistic(current ?? {}),
          rollbackOnError: true,
          revalidate: false,
          populateCache: true,
        },
      );
    },
    [mutate],
  );

  const addMeal = useCallback(
    (dateKey: string, meal: Omit<Meal, "id">) => {
      const optimisticMeal: Meal = { id: -Date.now(), ...meal };
      runMutation(
        (l) =>
          patchDay(l, dateKey, (d) => ({
            ...d,
            meals: [optimisticMeal, ...d.meals],
          })),
        () => addMealEntry(dateKey, meal),
      );
    },
    [runMutation],
  );

  const addMeals = useCallback(
    (dateKey: string, meals: Omit<Meal, "id">[]) => {
      if (meals.length === 0) return;
      // Preserve visual order (first item on top) while newest sits first.
      const optimisticMeals: Meal[] = meals.map((m, i) => ({
        id: -(Date.now() + i),
        ...m,
      }));
      runMutation(
        (l) =>
          patchDay(l, dateKey, (d) => ({
            ...d,
            meals: [...optimisticMeals, ...d.meals],
          })),
        () => addMealEntries(dateKey, meals),
      );
    },
    [runMutation],
  );

  const removeMeal = useCallback(
    (dateKey: string, id: number) => {
      runMutation(
        (l) =>
          patchDay(l, dateKey, (d) => ({
            ...d,
            meals: d.meals.filter((m) => m.id !== id),
          })),
        () => removeEntry(id),
      );
    },
    [runMutation],
  );

  const addActivity = useCallback(
    (dateKey: string, activity: Omit<Activity, "id">) => {
      const optimisticActivity: Activity = { id: -Date.now(), ...activity };
      runMutation(
        (l) =>
          patchDay(l, dateKey, (d) => ({
            ...d,
            activities: [optimisticActivity, ...d.activities],
          })),
        () => addActivityEntry(dateKey, activity),
      );
    },
    [runMutation],
  );

  const removeActivity = useCallback(
    (dateKey: string, id: number) => {
      runMutation(
        (l) =>
          patchDay(l, dateKey, (d) => ({
            ...d,
            activities: d.activities.filter((a) => a.id !== id),
          })),
        () => removeEntry(id),
      );
    },
    [runMutation],
  );

  const addSupplement = useCallback(
    (dateKey: string, supplement: Omit<Supplement, "id">) => {
      const optimisticSupp: Supplement = { id: -Date.now(), ...supplement };
      runMutation(
        (l) =>
          patchDay(l, dateKey, (d) => ({
            ...d,
            supplements: [optimisticSupp, ...d.supplements],
          })),
        () => addSupplementEntry(dateKey, supplement),
      );
    },
    [runMutation],
  );

  const removeSupplement = useCallback(
    (dateKey: string, id: number) => {
      runMutation(
        (l) =>
          patchDay(l, dateKey, (d) => ({
            ...d,
            supplements: d.supplements.filter((s) => s.id !== id),
          })),
        () => removeEntry(id),
      );
    },
    [runMutation],
  );

  const value = useMemo<DayLogValue>(
    () => ({
      dayData,
      consumedFor,
      burnedFor,
      addMeal,
      addMeals,
      removeMeal,
      addActivity,
      removeActivity,
      addSupplement,
      removeSupplement,
    }),
    [
      dayData,
      consumedFor,
      burnedFor,
      addMeal,
      addMeals,
      removeMeal,
      addActivity,
      removeActivity,
      addSupplement,
      removeSupplement,
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
