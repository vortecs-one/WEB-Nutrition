import { VIRTUAL_CHARACTERS } from "./characters";
import type {
  CharacterAction,
  CharacterMood,
  CharacterSpecies,
  CharacterState,
  Locale,
  VirtualCharacter,
} from "./types";

const NICKNAME_MAX_LENGTH = 24;

const charactersById = new Map(VIRTUAL_CHARACTERS.map((c) => [c.id, c]));

export function listCharacters(options?: {
  species?: CharacterSpecies;
  includeDisabled?: boolean;
}): VirtualCharacter[] {
  return VIRTUAL_CHARACTERS.filter(
    (c) =>
      (options?.includeDisabled || c.enabled) &&
      (!options?.species || c.species === options.species),
  );
}

export function getCharacter(id: string): VirtualCharacter | undefined {
  return charactersById.get(id);
}

/**
 * Only low-risk literary characters with original artwork can be adopted.
 * Studio characters stay listed but locked while their owners hold active
 * trademarks.
 */
export function isAvailableCharacter(id: string): boolean {
  const character = charactersById.get(id);
  return (
    character?.enabled === true &&
    character.rightsRisk === "low" &&
    character.artwork !== null
  );
}

/**
 * Whether this user can pick the character: available in the catalog, and —
 * for exclusive characters — only with exclusive access (decided server-side
 * in lib/pets/access.ts and passed down to the UI).
 */
export function isSelectableFor(id: string, exclusiveAccess: boolean): boolean {
  return isAvailableCharacter(id) && (charactersById.get(id)?.exclusive !== true || exclusiveAccess);
}

export const CHARACTER_MOODS = [
  "happy",
  "calm",
  "neutral",
  "worried",
  "sad",
  "proud",
  "sleepy",
] as const satisfies readonly CharacterMood[];

export function isCharacterMood(value: unknown): value is CharacterMood {
  return (
    typeof value === "string" &&
    (CHARACTER_MOODS as readonly string[]).includes(value)
  );
}

export function sanitizeNickname(input: string | null): string | null {
  if (input === null) return null;
  const cleaned = input
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NICKNAME_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : null;
}

export function displayName(state: CharacterState, locale: Locale): string {
  return state.nickname ?? getCharacter(state.characterId)?.name[locale] ?? "";
}

export function createCharacterState(
  characterId: string,
  at: string,
): CharacterState {
  if (!isAvailableCharacter(characterId)) {
    throw new Error(`Unknown or disabled character: ${characterId}`);
  }
  return {
    characterId,
    nickname: null,
    mood: "neutral",
    adoptedAt: at,
    updatedAt: at,
  };
}

/**
 * Pure state transition for the user's companion. Invalid actions return the
 * current state unchanged so callers can apply untrusted input safely.
 */
export function characterReducer(
  state: CharacterState | null,
  action: CharacterAction,
): CharacterState | null {
  switch (action.type) {
    case "adopt":
      if (!isAvailableCharacter(action.characterId)) return state;
      if (state?.characterId === action.characterId) return state;
      return createCharacterState(action.characterId, action.at);
    case "rename":
      if (!state) return state;
      return {
        ...state,
        nickname: sanitizeNickname(action.nickname),
        updatedAt: action.at,
      };
    case "setMood":
      if (!state || state.mood === action.mood) return state;
      return { ...state, mood: action.mood, updatedAt: action.at };
    case "release":
      return null;
  }
}
