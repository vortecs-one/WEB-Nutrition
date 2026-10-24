// lib/pets/mood.ts
// How the companion feels, derived from the user's health data: the latest
// glucose reading first, then the sleep, stress, water and exercise logged
// today, and the time of day. Pure functions only; the client hook in
// app/dashboard/pets/use-companion-mood.ts gathers the inputs.

import { STALE_MINUTES, type GlucoseStatus, type TrendDirection } from "@/lib/glucose/types";
import type { StressLevel } from "@/lib/day-log/types";
import type { CharacterMood, PetPose } from "./types";

/** Every mood, in the order of Penguin Girl's emotions sheet. */
export const CHARACTER_MOODS = [
  "happy",
  "excited",
  "surprised",
  "sad",
  "angry",
  "frustrated",
  "shy",
  "curious",
  "confused",
  "determined",
  "scared",
  "happy-tears",
  "tired",
  "annoyed",
  "playful",
  "hungry",
  "love",
  "embarrassed",
  "confident",
  "sleepy",
  "shocked",
  "teasing",
  "worried",
  "exhausted",
] as const satisfies readonly CharacterMood[];

/** Every pose, in the order of Penguin Girl's pose sheet. */
export const PET_POSES = [
  "standing",
  "walking",
  "running",
  "jumping",
  "sitting",
  "looking-up",
  "hungry",
  "drinking",
  "stretching",
  "sleeping",
] as const satisfies readonly PetPose[];

/** The pose that goes with each mood, unless a rule picks another one. */
export const POSE_FOR_MOOD: Record<CharacterMood, PetPose> = {
  happy: "standing",
  excited: "jumping",
  surprised: "looking-up",
  sad: "sitting",
  angry: "standing",
  frustrated: "sitting",
  shy: "walking",
  curious: "looking-up",
  confused: "standing",
  determined: "walking",
  scared: "standing",
  "happy-tears": "jumping",
  tired: "stretching",
  annoyed: "standing",
  playful: "walking",
  hungry: "hungry",
  love: "standing",
  embarrassed: "walking",
  confident: "running",
  sleepy: "sleeping",
  shocked: "looking-up",
  teasing: "walking",
  worried: "sitting",
  exhausted: "sleeping",
};

/** Why the companion feels the way it does (shown under the mood). */
export type MoodReason =
  | "urgentLow"
  | "urgentHigh"
  | "low"
  | "highFalling"
  | "high"
  | "fallingFast"
  | "changing"
  | "stale"
  | "night"
  | "veryShortSleep"
  | "late"
  | "shortSleep"
  | "stress"
  | "waterBehind"
  | "waterGoal"
  | "exercise"
  | "inRange"
  | "calm";

export interface MoodInputs {
  /** The latest glucose reading; null without one (no glucose card or sensor). */
  glucose: {
    status: GlucoseStatus;
    /** mg/dL. */
    sgv: number;
    direction: TrendDirection;
    /** Bottom of the user's target range (mg/dL). */
    targetLow: number;
    /** How old the reading is. */
    ageMinutes: number;
  } | null;
  waterMl: number;
  waterGoalMl: number;
  burnedKcal: number;
  /** Sleep logged for today; null when not logged. */
  sleepMinutes: number | null;
  stress: StressLevel | null;
  /** Local time of day in hours, 0–24 (fractional). */
  hour: number;
}

export interface CompanionMood {
  mood: CharacterMood;
  pose: PetPose;
  reason: MoodReason;
}

const FALLING: readonly TrendDirection[] = ["FortyFiveDown", "SingleDown", "DoubleDown"];
// Moving fast while in range (falling fast is its own rule).
const CHANGING: readonly TrendDirection[] = ["DoubleUp", "SingleUp", "SingleDown"];

/** Water the day's goal expects by this hour: none at 08:00, all of it at 22:00. */
function waterExpectedBy(hour: number, goalMl: number): number {
  return goalMl * Math.min(1, Math.max(0, (hour - 8) / 14));
}

/**
 * The first matching rule wins, the glucose reading first: a fresh reading
 * that needs attention outranks everything else, and a stale one makes the
 * companion confused (it doesn't know). Then sleep and the night, stress,
 * water and exercise; otherwise happy with glucose in range, playful without.
 */
export function deriveMood(input: MoodInputs): CompanionMood {
  const feel = (mood: CharacterMood, reason: MoodReason, pose = POSE_FOR_MOOD[mood]): CompanionMood => ({
    mood,
    pose,
    reason,
  });
  const g = input.glucose;
  const fresh = g !== null && g.ageMinutes <= STALE_MINUTES;
  if (g && fresh) {
    if (g.status === "urgent") return feel("surprised", g.sgv < g.targetLow ? "urgentLow" : "urgentHigh");
    if (g.status === "low") return feel("hungry", "low");
    if (g.status === "high") {
      return FALLING.includes(g.direction) ? feel("determined", "highFalling") : feel("sad", "high");
    }
    if (g.direction === "DoubleDown") return feel("worried", "fallingFast");
    if (CHANGING.includes(g.direction)) return feel("curious", "changing");
  } else if (g) {
    return feel("confused", "stale");
  }

  const { hour, sleepMinutes, stress } = input;
  if (hour < 6) return feel("sleepy", "night");
  if (sleepMinutes !== null && sleepMinutes < 4 * 60) return feel("exhausted", "veryShortSleep");
  if (hour >= 22) return feel("tired", "late");
  if (sleepMinutes !== null && sleepMinutes < 6 * 60) return feel("tired", "shortSleep");
  if (stress !== null && stress >= 4) return feel("worried", "stress");
  // Behind on water: she drinks, still wearing her everyday face.
  if (hour >= 12 && input.waterMl < waterExpectedBy(hour, input.waterGoalMl) / 2) {
    return feel(fresh ? "happy" : "playful", "waterBehind", "drinking");
  }
  if (input.waterMl >= input.waterGoalMl) return feel("excited", "waterGoal");
  if (input.burnedKcal > 0) return feel("confident", "exercise");
  return fresh ? feel("happy", "inRange") : feel("playful", "calm");
}
