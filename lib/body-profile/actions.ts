"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { bodyProfiles } from "@/drizzle/schema";
import { createBodyMeasurement, getHuman, getLatestBodyMeasurement } from "@/lib/thruxion-api";
import { measurementDateKey } from "@/lib/body-measurements/types";
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
  let heightCm = row?.heightCm ?? null;
  let latestWeight: BodyProfile["latestWeight"] = null;
  const fromThruxion = { sex: false, birthDate: false, height: false };
  if (user.humanId) {
    const humanId = user.humanId;
    const [human, latest] = await Promise.all([
      !sex || !birthDate
        ? getHuman(humanId).catch((err) => {
            console.log("[body-profile] Thruxion read failed:", (err as Error).message);
            return null;
          })
        : null,
      getLatestBodyMeasurement(humanId).catch((err) => {
        console.log("[body-profile] Thruxion measurements read failed:", (err as Error).message);
        return null;
      }),
    ]);

    const thruxionSex = sexFromGender(human?.gender);
    const thruxionBirth = human?.birthdate?.slice(0, 10) ?? null;
    if (!sex && thruxionSex) { sex = thruxionSex; fromThruxion.sex = true; }
    if (!birthDate && isBirthDate(thruxionBirth, todayKey())) { birthDate = thruxionBirth; fromThruxion.birthDate = true; }

    // The measurement history wins when it's newer than the last profile save
    // (e.g. measured on another Thruxion platform).
    const thruxionHeight = latest?.height_cm != null ? Math.round(latest.height_cm) : null;
    const heightAt = latest?.height_measured_at ? Date.parse(latest.height_measured_at) : NaN;
    if (
      isHeightCm(thruxionHeight) &&
      thruxionHeight !== heightCm &&
      (heightCm === null || !row?.updatedAt || heightAt > row.updatedAt.getTime())
    ) {
      heightCm = thruxionHeight;
      fromThruxion.height = true;
    }
    if (latest?.weight_kg != null && latest.weight_measured_at) {
      latestWeight = { kg: latest.weight_kg, dateKey: measurementDateKey(latest.weight_measured_at) };
    }
  }

  return {
    sex,
    birthDate,
    heightCm,
    activityLevel: isActivityLevel(row?.activityLevel) ? row.activityLevel : DEFAULT_ACTIVITY_LEVEL,
    goal: isWeightGoal(row?.goal) ? row.goal : "maintain",
    weeklyRateKg: row ? row.weeklyRateG / 1000 : 0.25,
    fromThruxion,
    latestWeight,
  };
}

// Adds a changed height to the Thruxion history. Best effort, like weigh-ins.
async function syncHeight(humanId: string, heightCm: number): Promise<void> {
  try {
    const latest = await getLatestBodyMeasurement(humanId);
    // Compare at 0.1 cm so a 170.5 cm record isn't rewritten by a 170 cm form value
    // that the user didn't actually change.
    const tenth = (v: number) => Math.round(v * 10);
    const current = latest?.height_cm != null ? latest.height_cm : null;
    const unchanged =
      current !== null &&
      (tenth(current) === tenth(heightCm) || Math.round(current) === heightCm);
    if (!unchanged) await createBodyMeasurement(humanId, { height_cm: heightCm });
  } catch (err) {
    console.log("[body-profile] height sync failed:", (err as Error).message);
  }
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
    if (heightCm !== null && user.humanId) await syncHeight(user.humanId, heightCm);
    return { ok: true };
  } catch (err) {
    console.log("[body-profile] save failed:", err);
    return { ok: false, error: "failed" };
  }
}
