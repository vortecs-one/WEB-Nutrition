"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bodyProfiles } from "@/drizzle/schema";
import { getHuman } from "@/lib/thruxion-api";
import {
  DEFAULT_ACTIVITY_LEVEL,
  isActivityLevel,
  isBirthDate,
  isHeightCm,
  isSex,
  isWeeklyRateKg,
  isWeightGoal,
  sexFromGender,
  type BodyProfile,
  type BodyProfileInput,
} from "./types";

// Same per-user key as the day log: Thruxion human_id, falling back to email.
async function currentUser(): Promise<{ userKey: string; humanId: string | null } | null> {
  const session = await auth();
  const user = session?.user as { humanId?: string | null; email?: string | null } | undefined;
  const userKey = user?.humanId ?? user?.email ?? null;
  return userKey ? { userKey, humanId: user?.humanId ?? null } : null;
}

// Server-side "today"; only used to sanity-check a birth date's year.
const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * The signed-in user's body profile. Sex and birth date fall back to the
 * Thruxion record until the user saves their own. Null when signed out.
 */
export async function fetchBodyProfile(): Promise<BodyProfile | null> {
  const user = await currentUser();
  if (!user) return null;

  let row: typeof bodyProfiles.$inferSelect | undefined;
  try {
    [row] = await db.select().from(bodyProfiles).where(eq(bodyProfiles.userKey, user.userKey)).limit(1);
  } catch (err) {
    // E.g. before drizzle/0011_add_body_profiles.sql is applied: the
    // dashboard keeps working with the fallback targets.
    console.log("[body-profile] read failed:", (err as Error).message);
  }

  let sex = isSex(row?.sex) ? row.sex : null;
  let birthDate = row?.birthDate ?? null;
  const fromThruxion = { sex: false, birthDate: false };
  if ((!sex || !birthDate) && user.humanId) {
    try {
      const human = await getHuman(user.humanId);
      const thruxionSex = sexFromGender(human?.gender);
      const thruxionBirth = human?.birthdate?.slice(0, 10) ?? null;
      if (!sex && thruxionSex) { sex = thruxionSex; fromThruxion.sex = true; }
      if (!birthDate && isBirthDate(thruxionBirth, todayKey())) { birthDate = thruxionBirth; fromThruxion.birthDate = true; }
    } catch (err) {
      console.log("[body-profile] Thruxion read failed:", (err as Error).message);
    }
  }

  return {
    sex,
    birthDate,
    heightCm: row?.heightCm ?? null,
    activityLevel: isActivityLevel(row?.activityLevel) ? row.activityLevel : DEFAULT_ACTIVITY_LEVEL,
    goal: isWeightGoal(row?.goal) ? row.goal : "maintain",
    weeklyRateKg: row ? row.weeklyRateG / 1000 : 0.25,
    fromThruxion,
  };
}

export type SaveBodyProfileResult = { ok: true } | { ok: false; error: "unauthenticated" | "invalid" | "failed" };

/** Saves the profile form. Every field is re-validated: actions are public endpoints. */
export async function saveBodyProfile(input: BodyProfileInput): Promise<SaveBodyProfileResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { sex, birthDate, heightCm, activityLevel, goal, weeklyRateKg } = input ?? {};
  if (
    (sex !== null && !isSex(sex)) ||
    (birthDate !== null && !isBirthDate(birthDate, todayKey())) ||
    (heightCm !== null && !isHeightCm(heightCm)) ||
    !isActivityLevel(activityLevel) ||
    !isWeightGoal(goal) ||
    !isWeeklyRateKg(weeklyRateKg)
  ) {
    return { ok: false, error: "invalid" };
  }

  const values = {
    sex,
    birthDate,
    heightCm,
    activityLevel,
    goal,
    weeklyRateG: Math.round(weeklyRateKg * 1000),
    updatedAt: new Date(),
  };
  try {
    await db
      .insert(bodyProfiles)
      .values({ userKey: user.userKey, ...values })
      .onConflictDoUpdate({ target: bodyProfiles.userKey, set: values });
    return { ok: true };
  } catch (err) {
    console.log("[body-profile] save failed:", err);
    return { ok: false, error: "failed" };
  }
}
