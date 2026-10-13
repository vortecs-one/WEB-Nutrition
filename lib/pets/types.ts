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

export interface VirtualCharacter {
  id: string;
  name: Localized;
  species: CharacterSpecies;
  temperament: CharacterTemperament;
  description: Localized;
  rights: PublicDomainInfo;
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
