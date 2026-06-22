"use server";

import { auth } from "@/auth";
import { getFoodByBarcode } from "@/lib/thruxion-api";
import type { FoodLookupResult } from "./types";

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
