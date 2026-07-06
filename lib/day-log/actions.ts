"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayLogEntries } from "@/drizzle/schema";
import { auth } from "@/auth";
import type {
  Meal,
  Activity,
  Supplement,
  DayData,
  DayLog,
} from "./types";

// Resolve a stable per-user key from the session: prefer the Thruxion
// human_id, fall back to the email. Returns null when unauthenticated so
// callers can refuse to read/write someone else's data.
async function getUserKey(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as
    | { humanId?: string | null; email?: string | null }
    | undefined;
  return user?.humanId ?? user?.email ?? null;
}

const emptyDay = (): DayData => ({ meals: [], activities: [], supplements: [] });

// Loads every entry for the signed-in user, grouped by ISO date key.
// Newest-first within each day to mirror the previous in-memory behavior.
export async function fetchUserDayLog(): Promise<DayLog> {
  const userKey = await getUserKey();
  if (!userKey) return {};

  const rows = await db
    .select()
    .from(dayLogEntries)
    .where(eq(dayLogEntries.userKey, userKey))
    .orderBy(desc(dayLogEntries.createdAt));

  const log: DayLog = {};
  for (const row of rows) {
    const key = row.logDate; // drizzle `date` returns "YYYY-MM-DD"
    const day = (log[key] ??= emptyDay());

    if (row.kind === "meal") {
      day.meals.push({
        id: row.id,
        name: row.name,
        calories: row.calories ?? 0,
        type: row.subtype as Meal["type"],
        protein: row.protein ?? undefined,
        carbs: row.carbs ?? undefined,
        fat: row.fat ?? undefined,
        saturatedFat: row.saturatedFat ?? undefined,
        sugars: row.sugars ?? undefined,
        fiber: row.fiber ?? undefined,
        sodium: row.sodium ?? undefined,
      });
    } else if (row.kind === "activity") {
      day.activities.push({
        id: row.id,
        name: row.name,
        calories: row.calories ?? 0,
        type: row.subtype as Activity["type"],
      });
    } else if (row.kind === "supplement") {
      day.supplements.push({
        id: row.id,
        name: row.name,
        dose: row.dose ?? "",
        type: row.subtype as Supplement["type"],
      });
    }
  }

  return log;
}

// Build the insertable row for a meal (shared by single + batch inserts).
function mealValues(userKey: string, dateKey: string, meal: Omit<Meal, "id">) {
  return {
    userKey,
    logDate: dateKey,
    kind: "meal" as const,
    subtype: meal.type,
    name: meal.name,
    calories: meal.calories,
    protein: meal.protein ?? null,
    carbs: meal.carbs ?? null,
    fat: meal.fat ?? null,
    saturatedFat: meal.saturatedFat ?? null,
    sugars: meal.sugars ?? null,
    fiber: meal.fiber ?? null,
    sodium: meal.sodium ?? null,
  };
}

export async function addMealEntry(
  dateKey: string,
  meal: Omit<Meal, "id">,
): Promise<Meal | null> {
  const userKey = await getUserKey();
  if (!userKey) return null;

  const [row] = await db
    .insert(dayLogEntries)
    .values(mealValues(userKey, dateKey, meal))
    .returning({ id: dayLogEntries.id });

  return { id: row.id, ...meal };
}

// Insert several meals at once (used by the meal-builder cart). Returns the
// created meals with their real row ids, in the same order.
export async function addMealEntries(
  dateKey: string,
  meals: Omit<Meal, "id">[],
): Promise<Meal[]> {
  const userKey = await getUserKey();
  if (!userKey || meals.length === 0) return [];

  const rows = await db
    .insert(dayLogEntries)
    .values(meals.map((m) => mealValues(userKey, dateKey, m)))
    .returning({ id: dayLogEntries.id });

  return meals.map((m, i) => ({ id: rows[i].id, ...m }));
}

export async function addActivityEntry(
  dateKey: string,
  activity: Omit<Activity, "id">,
): Promise<Activity | null> {
  const userKey = await getUserKey();
  if (!userKey) return null;

  const [row] = await db
    .insert(dayLogEntries)
    .values({
      userKey,
      logDate: dateKey,
      kind: "activity",
      subtype: activity.type,
      name: activity.name,
      calories: activity.calories,
    })
    .returning({ id: dayLogEntries.id });

  return { id: row.id, ...activity };
}

export async function addSupplementEntry(
  dateKey: string,
  supplement: Omit<Supplement, "id">,
): Promise<Supplement | null> {
  const userKey = await getUserKey();
  if (!userKey) return null;

  const [row] = await db
    .insert(dayLogEntries)
    .values({
      userKey,
      logDate: dateKey,
      kind: "supplement",
      subtype: supplement.type,
      name: supplement.name,
      dose: supplement.dose,
    })
    .returning({ id: dayLogEntries.id });

  return { id: row.id, ...supplement };
}

// Deletes one entry, always scoped to the signed-in user so a user can never
// remove another user's row by guessing an id.
export async function removeEntry(id: number): Promise<void> {
  const userKey = await getUserKey();
  if (!userKey) return;

  await db
    .delete(dayLogEntries)
    .where(and(eq(dayLogEntries.id, id), eq(dayLogEntries.userKey, userKey)));
}
