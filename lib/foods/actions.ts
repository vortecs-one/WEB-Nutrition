"use server";

import { and, eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { savedFoods } from "@/drizzle/schema";
import { getFoodByBarcode } from "@/lib/thruxion-api";
import type { FoodLookupResult, FoodProduct, SavedFoodProduct } from "./types";

// Resolve a stable per-user key from the session: prefer the Thruxion
// human_id, fall back to the email. Returns null when unauthenticated.
async function getUserKey(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as
    | { humanId?: string | null; email?: string | null }
    | undefined;
  return user?.humanId ?? user?.email ?? null;
}

// Looks up a food product by barcode via the Thruxion foods API.
//
// Runs on the server so the Thruxion client (and its system token) never reach
// the browser. Requires an authenticated session, mirroring the rest of the
// dashboard, and returns a discriminated result so the UI can render the right
// state without exposing raw errors.
export async function lookupFoodByBarcode(
  barcode: string,
): Promise<FoodLookupResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, reason: "unauthenticated" };
  }

  // Barcodes are digits only; strip whitespace and any stray characters.
  const clean = (barcode ?? "").replace(/\D+/g, "");
  if (!clean) {
    return { ok: false, reason: "not-found" };
  }

  try {
    const product = await getFoodByBarcode(clean);
    if (!product) {
      return { ok: false, reason: "not-found" };
    }
    return { ok: true, product };
  } catch (error) {
    console.error(
      "[v0] lookupFoodByBarcode failed:",
      (error as Error).message,
    );
    return { ok: false, reason: "error" };
  }
}

// Fetch all saved foods for the current user, ordered by most recently saved.
export async function fetchUserSavedFoods(): Promise<SavedFoodProduct[]> {
  const userKey = await getUserKey();
  if (!userKey) return [];

  const rows = await db
    .select()
    .from(savedFoods)
    .where(eq(savedFoods.userKey, userKey))
    .orderBy(desc(savedFoods.savedAt));

  return rows.map((row) => ({
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    image: row.image,
    nutrition: JSON.parse(row.nutritionData),
    savedAt: row.savedAt,
  }));
}

// Save a food product for the current user. If already saved, this is a no-op.
export async function saveFoodProduct(product: FoodProduct): Promise<boolean> {
  const userKey = await getUserKey();
  if (!userKey) return false;

  try {
    // Upsert: try to insert, ignore if barcode already exists for this user.
    await db
      .insert(savedFoods)
      .values({
        userKey,
        barcode: product.barcode,
        name: product.name,
        brand: product.brand ?? null,
        image: product.image ?? null,
        nutritionData: JSON.stringify(product.nutrition),
      })
      .onConflictDoNothing();

    return true;
  } catch (error) {
    console.error("[v0] saveFoodProduct failed:", (error as Error).message);
    return false;
  }
}

// Remove a saved food product by barcode for the current user.
export async function removeSavedFood(barcode: string): Promise<boolean> {
  const userKey = await getUserKey();
  if (!userKey) return false;

  try {
    await db
      .delete(savedFoods)
      .where(
        and(
          eq(savedFoods.userKey, userKey),
          eq(savedFoods.barcode, barcode),
        ),
      );
    return true;
  } catch (error) {
    console.error("[v0] removeSavedFood failed:", (error as Error).message);
    return false;
  }
}
