"use server";

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { petCompanions } from "@/drizzle/schema";
import { canUseExclusivePets } from "./access";
import { isSelectableFor, sanitizeNickname } from "./manager";
import type { CharacterState } from "./types";

export type CompanionResult =
  | { ok: true; companion: CharacterState | null }
  | { ok: false; error: "unauthenticated" | "invalid" | "failed" };

async function getUserKey(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as
    | { humanId?: string | null; email?: string | null }
    | undefined;
  return user?.humanId ?? user?.email ?? null;
}

type CompanionRow = typeof petCompanions.$inferSelect;

function toState(row: CompanionRow, exclusiveAccess: boolean): CharacterState | null {
  // A stored character can become unavailable (catalog change, or exclusive
  // access removed); treat it as no companion rather than surfacing a
  // locked character.
  if (!isSelectableFor(row.characterId, exclusiveAccess)) return null;
  return {
    characterId: row.characterId,
    nickname: row.nickname,
    adoptedAt: row.adoptedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getCompanion(): Promise<CompanionResult> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };
  try {
    const [row] = await db
      .select()
      .from(petCompanions)
      .where(eq(petCompanions.userKey, userKey))
      .limit(1);
    return { ok: true, companion: row ? toState(row, await canUseExclusivePets()) : null };
  } catch (err) {
    console.error("[pets] getCompanion failed:", (err as Error).message);
    return { ok: false, error: "failed" };
  }
}

export async function adoptCompanion(
  characterId: unknown,
): Promise<CompanionResult> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };
  const exclusiveAccess = await canUseExclusivePets();
  if (typeof characterId !== "string" || !isSelectableFor(characterId, exclusiveAccess)) {
    return { ok: false, error: "invalid" };
  }
  try {
    const now = new Date();
    const [row] = await db
      .insert(petCompanions)
      .values({
        userKey,
        characterId,
        nickname: null,
        adoptedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: petCompanions.userKey,
        set: {
          characterId,
          nickname: null,
          adoptedAt: now,
          updatedAt: now,
        },
      })
      .returning();
    return { ok: true, companion: toState(row, exclusiveAccess) };
  } catch (err) {
    console.error("[pets] adoptCompanion failed:", (err as Error).message);
    return { ok: false, error: "failed" };
  }
}

export async function renameCompanion(
  nickname: unknown,
): Promise<CompanionResult> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };
  if (nickname !== null && typeof nickname !== "string") {
    return { ok: false, error: "invalid" };
  }
  try {
    const [row] = await db
      .update(petCompanions)
      .set({ nickname: sanitizeNickname(nickname), updatedAt: new Date() })
      .where(eq(petCompanions.userKey, userKey))
      .returning();
    if (!row) return { ok: false, error: "invalid" };
    return { ok: true, companion: toState(row, await canUseExclusivePets()) };
  } catch (err) {
    console.error("[pets] renameCompanion failed:", (err as Error).message);
    return { ok: false, error: "failed" };
  }
}

export async function releaseCompanion(): Promise<CompanionResult> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };
  try {
    await db.delete(petCompanions).where(eq(petCompanions.userKey, userKey));
    return { ok: true, companion: null };
  } catch (err) {
    console.error("[pets] releaseCompanion failed:", (err as Error).message);
    return { ok: false, error: "failed" };
  }
}

// Whether the signed-in user may choose exclusive companions; the gallery
// uses it to show them unlocked. Adoption re-checks on the server.
export async function getExclusivePetAccess(): Promise<boolean> {
  return canUseExclusivePets();
}
