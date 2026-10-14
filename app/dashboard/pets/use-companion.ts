"use client";

import useSWR from "swr";
import {
  adoptCompanion,
  getCompanion,
  getExclusivePetAccess,
  releaseCompanion,
  renameCompanion,
  type CompanionResult,
} from "@/lib/pets/actions";
import type { CharacterState } from "@/lib/pets/types";

const COMPANION_KEY = "pet-companion";
const EXCLUSIVE_ACCESS_KEY = "pet-exclusive-access";

async function fetchCompanion(): Promise<CharacterState | null> {
  const result = await getCompanion();
  if (!result.ok) throw new Error(result.error);
  return result.companion;
}

export function useCompanion() {
  const { data, error, isLoading, mutate } = useSWR(
    COMPANION_KEY,
    fetchCompanion,
    { revalidateOnFocus: false },
  );
  // Whether this account can choose exclusive companions (server-checked).
  const { data: exclusiveAccess } = useSWR(EXCLUSIVE_ACCESS_KEY, () => getExclusivePetAccess(), {
    revalidateOnFocus: false,
  });

  async function apply(run: () => Promise<CompanionResult>): Promise<boolean> {
    const result = await run();
    if (!result.ok) return false;
    await mutate(result.companion, { revalidate: false });
    return true;
  }

  return {
    companion: data ?? null,
    exclusiveAccess: exclusiveAccess ?? false,
    isLoading,
    error,
    adopt: (characterId: string) => apply(() => adoptCompanion(characterId)),
    rename: (nickname: string | null) => apply(() => renameCompanion(nickname)),
    release: () => apply(() => releaseCompanion()),
  };
}
