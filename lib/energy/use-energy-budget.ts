"use client";

// The day's energy budget: the body profile, the latest weigh-in and the
// day's log run through lib/health-formulas.ts. Every calorie view reads its
// numbers from here, so they always agree.

import { useMemo } from "react";
import useSWR from "swr";
import { fetchBodyProfile } from "@/lib/body-profile/actions";
import type { BodyProfile } from "@/lib/body-profile/types";
import { CONSUMED_GOAL, WATER_GOAL_ML, useDayLog } from "@/lib/day-log/provider";
import {
  ACTIVITY_FACTORS,
  ageOn,
  baseBurn,
  bmrMifflin,
  caloriesLeft,
  foodTarget,
  macroTargets,
  waterGoalMl,
  weightChangeKg,
  type FoodTarget,
} from "@/lib/health-formulas";

export const BODY_PROFILE_KEY = "body-profile";

export function useBodyProfile() {
  // The server action resolves the user from the session (like "day-log").
  const { data, isLoading, mutate } = useSWR<BodyProfile | null>(
    BODY_PROFILE_KEY,
    () => fetchBodyProfile(),
    { revalidateOnFocus: false },
  );
  return { profile: data ?? null, isLoading, mutate };
}

export type MissingBodyField = "sex" | "birthDate" | "height" | "weight";

export type EnergyBudget = {
  /** All body data present: the numbers below are personal, not fallbacks. */
  complete: boolean;
  missing: MissingBodyField[];
  profile: BodyProfile | null;
  /** Latest weigh-in on or before the day (the first one for earlier days). */
  weightKg: number | null;
  weighInDate: string | null;
  age: number | null;
  /** Basal metabolic rate (kcal), null while incomplete. */
  bmr: number | null;
  activityFactor: number | null;
  /** Daily life without workouts (kcal). Assumed equal to the target while incomplete. */
  baseBurn: number;
  /** Signed daily deficit (−) or surplus (+) for the goal. */
  adjustment: number;
  /** Food to eat in the day, workouts not included (kcal). */
  target: number;
  limitedBy: FoodTarget["limitedBy"];
  eaten: number;
  workouts: number;
  /** Base burn + workouts. */
  totalBurned: number;
  /** Eaten − total burned: negative is a deficit. */
  net: number;
  /** Target + workouts − eaten: negative is over the budget. */
  left: number;
  /** Body-fat change the day's net balance amounts to (kg). */
  weightEffectKg: number;
  /** Macro targets in grams, null while incomplete. */
  macros: { protein: number; fat: number; carbs: number } | null;
  waterGoalMl: number;
};

export function useEnergyBudget(dateKey: string): EnergyBudget {
  const { consumedFor, burnedFor, weighIns, weightOn } = useDayLog();
  const { profile } = useBodyProfile();

  const eaten = dateKey ? consumedFor(dateKey) : 0;
  const workouts = dateKey ? burnedFor(dateKey) : 0;

  return useMemo(() => {
    const local = (dateKey ? weightOn(dateKey) : null) ?? weighIns[0] ?? null;
    // A newer weight in the Thruxion history (e.g. another platform) wins.
    const remote = profile?.latestWeight ?? null;
    const remoteUsable = remote && (!dateKey || remote.dateKey <= dateKey);
    const weighIn =
      remoteUsable && (!local || remote.dateKey > local.dateKey) ? remote : (local ?? remote);
    const weightKg = weighIn?.kg ?? null;
    const missing: MissingBodyField[] = [];
    if (!profile?.sex) missing.push("sex");
    if (!profile?.birthDate) missing.push("birthDate");
    if (!profile?.heightCm) missing.push("height");
    if (weightKg === null) missing.push("weight");

    let age: number | null = null;
    let bmr: number | null = null;
    let activityFactor: number | null = null;
    let base: number;
    let target: FoodTarget;
    let macros: EnergyBudget["macros"] = null;

    if (missing.length === 0 && profile?.sex && profile.birthDate && profile.heightCm && weightKg !== null) {
      age = ageOn(profile.birthDate, dateKey || profile.birthDate);
      bmr = Math.round(bmrMifflin({ sex: profile.sex, weightKg, heightCm: profile.heightCm, age }));
      activityFactor = ACTIVITY_FACTORS[profile.activityLevel];
      base = Math.round(baseBurn(bmr, profile.activityLevel));
      target = foodTarget({
        baseBurnKcal: base,
        goal: profile.goal,
        weeklyRateKg: profile.weeklyRateKg,
        sex: profile.sex,
      });
      macros = macroTargets({ targetKcal: target.kcal, weightKg, goal: profile.goal });
    } else {
      // Until the profile is complete: the old fixed target, at maintenance.
      base = CONSUMED_GOAL;
      target = { kcal: CONSUMED_GOAL, adjustment: 0, limitedBy: null };
    }

    const totalBurned = base + workouts;
    const net = eaten - totalBurned;
    return {
      complete: missing.length === 0,
      missing,
      profile,
      weightKg,
      weighInDate: weighIn?.dateKey ?? null,
      age,
      bmr,
      activityFactor,
      baseBurn: base,
      adjustment: target.adjustment,
      target: target.kcal,
      limitedBy: target.limitedBy,
      eaten,
      workouts,
      totalBurned,
      net,
      left: caloriesLeft(target.kcal, workouts, eaten),
      weightEffectKg: weightChangeKg(net),
      macros,
      waterGoalMl: weightKg !== null ? waterGoalMl(weightKg) : WATER_GOAL_ML,
    };
  }, [dateKey, eaten, workouts, profile, weighIns, weightOn]);
}
