export type Locale = "es" | "en";

export type Localized = Record<Locale, string>;

export type CharacterSpecies =
  | "dog"
  | "cat"
  | "deer"
  | "bear"
  | "mouse"
  | "human"
  | "puppet";

export type CharacterTemperament =
  | "loyal"
  | "mischievous"
  | "gentle"
  | "cheerful"
  | "tough"
  | "curious"
  | "adventurous";

export type CharacterMood =
  | "happy"
  | "calm"
  | "neutral"
  | "worried"
  | "sad"
  | "proud"
  | "sleepy";

export interface PublicDomainInfo {
  sourceWork: string;
  author: string;
  firstPublished: number;
  publicDomainSince: number;
  jurisdiction: "US";
  usageNotes: Localized;
}

/**
 * `low`: literary source, long in the public domain, no active studio claim on
 * the original design. `high`: animation-studio character whose owner still
 * holds active trademarks — artwork stays withheld until legal review.
 */
export type RightsRisk = "low" | "high";

export interface VirtualCharacter {
  id: string;
  name: Localized;
  species: CharacterSpecies;
  temperament: CharacterTemperament;
  description: Localized;
  rights: PublicDomainInfo;
  rightsRisk: RightsRisk;
  /** Original artwork drawn from the public-domain source; null while withheld. */
  artwork: string | null;
  /**
   * Same artwork with the background removed (see scripts/cutout-pet.mjs),
   * shown animated in the companion detail popup. Thumbnails keep `artwork`.
   */
  cutout?: string;
  /**
   * The cut-out split into two aligned layers (same canvas): `body` moves,
   * `ground` (grass, clovers…) stays still. Preferred over `cutout`.
   */
  layers?: { body: string; ground: string };
  enabled: boolean;
}

export interface CharacterState {
  characterId: string;
  nickname: string | null;
  mood: CharacterMood;
  adoptedAt: string;
  updatedAt: string;
}

export type CharacterAction =
  | { type: "adopt"; characterId: string; at: string }
  | { type: "rename"; nickname: string | null; at: string }
  | { type: "setMood"; mood: CharacterMood; at: string }
  | { type: "release" };
