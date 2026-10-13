import type { CharacterMood } from "./types";

export type IdleStyle = "default" | "bouncy" | "sleepy" | "low";
export type AmbientParticle = "leaf" | "zzz";

export interface PetAnimationProfile {
  idle: IdleStyle;
  particle: AmbientParticle | null;
}

const MOOD_PROFILES: Record<CharacterMood, PetAnimationProfile> = {
  happy: { idle: "bouncy", particle: "leaf" },
  proud: { idle: "bouncy", particle: "leaf" },
  calm: { idle: "default", particle: "leaf" },
  neutral: { idle: "default", particle: "leaf" },
  worried: { idle: "low", particle: null },
  sad: { idle: "low", particle: null },
  sleepy: { idle: "sleepy", particle: "zzz" },
};

/** Characters with an animated detail view. Others render statically. */
const ANIMATED_CHARACTERS = new Set(["bambi"]);

export function getAnimationProfile(
  characterId: string,
  mood: CharacterMood,
): PetAnimationProfile | null {
  if (!ANIMATED_CHARACTERS.has(characterId)) return null;
  return MOOD_PROFILES[mood];
}
