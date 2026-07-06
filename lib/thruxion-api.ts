// lib/thruxion-api.ts
// Client for the external Thruxion "humans" API.
//
// Auth flow (see API docs):
//   1. POST /api/humans/auth/system-login  -> returns a system JWT bearer token
//   2. POST /api/humans/user/login         -> requires the bearer token from step 1
//
// The system bearer token is required on EVERY endpoint, so token acquisition,
// caching, and refresh live in `./thruxion-token` (server-only). Use the
// `thruxionFetch` helper below for any new authenticated endpoint — it injects
// the bearer token and transparently refreshes + retries once on a 401.
//
// Config via env vars (with sensible test defaults):
//   THRUXION_API_BASE_URL    default: https://thruxion.com
//   THRUXION_SYSTEM_USER     default: admin   (test only)
//   THRUXION_SYSTEM_PASSWORD default: admin   (test only)

import "server-only";
import {
  getSystemToken,
  invalidateSystemToken,
  BASE_URL,
} from "./thruxion-token";
import { PLATFORM } from "./platform";
import type { FoodProduct } from "./foods/types";

export type ThruxionUser = {
  id?: string | number;
  human_id?: string | number;
  email?: string;
  name?: string;
  role?: string;
  platform?: string;
  [key: string]: unknown;
};

// A "user account" linked to a human (from the `users` array on the record).
export type HumanUserAccount = {
  id?: number;
  email?: string;
  role?: string;
  status?: string;
  platform?: string;
  last_login?: string;
  created_at?: string;
};

// Full human record returned by GET /api/humans/human/<id>.
// Mirrors the `data` object from the API response.
export type HumanData = {
  id: number;
  unique_id?: string;
  legal_id?: string;
  name?: string;
  lastname?: string;
  birthdate?: string;
  gender?: string;
  created_at?: string;
  updated_at?: string;
  users?: HumanUserAccount[];
  skills?: unknown[];
  certificates?: unknown[];
  facial_recognitions?: unknown[];
  cards?: unknown[];
  space_time?: unknown[];
};

/**
 * Authenticated fetch against the Thruxion API.
 *
 * - Prepends BASE_URL to a path (e.g. "/api/humans/user/login").
 * - Injects `Authorization: Bearer <system token>`.
 * - On a 401, invalidates the cached token, refreshes once, and retries.
 *
 * Use this for ALL new authenticated endpoints so they share the same key
 * and refresh logic.
 */
export async function thruxionFetch(
  path: string,
  init: RequestInit = {},
  _retried = false,
): Promise<Response> {
  const token = await getSystemToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  // The system token was rejected (expired early / rotated remotely).
  // Refresh once and retry a single time.
  if (res.status === 401 && !_retried) {
    invalidateSystemToken();
    return thruxionFetch(path, init, true);
  }

  return res;
}

/**
 * Log a user in using their email/password.
 * Returns the user payload on success, or `null` on invalid credentials.
 */
export async function userLogin(
  email: string,
  password: string,
): Promise<ThruxionUser | null> {
  const res = await thruxionFetch("/api/humans/user/login", {
    method: "POST",
    // `platform` is required by the API and must match the value stored at
    // registration ("app-thruxion" for this system).
    body: JSON.stringify({ email, password, platform: PLATFORM }),
  });

  // Invalid USER credentials -> failed login (distinct from a system 401,
  // which thruxionFetch already retried). 403 = forbidden user.
  if (res.status === 401 || res.status === 403) {
    return null;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "<no body>");
    throw new Error(
      `user/login failed (${res.status} ${res.statusText}): ${detail}`,
    );
  }

  const data = (await res.json().catch(() => ({}))) as
    | ThruxionUser
    | { user?: ThruxionUser };

  // The API may return the user directly or nested under `user`.
  const user =
    (data as { user?: ThruxionUser })?.user ?? (data as ThruxionUser);
  return user ?? {};
}

/**
 * Fetch a full human record by id (the `human_id` returned at login).
 *
 * GET /api/humans/human/<humanId>
 * Returns the `data` object on success, or `null` if not found.
 */
export async function getHuman(
  humanId: string | number,
): Promise<HumanData | null> {
  const res = await thruxionFetch(
    `/api/humans/human/${encodeURIComponent(String(humanId))}`,
    { method: "GET" },
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "<no body>");
    throw new Error(
      `human/${humanId} failed (${res.status} ${res.statusText}): ${detail}`,
    );
  }

  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: HumanData;
  };

  return json?.data ?? null;
}

// Coerce an unknown JSON value to a finite number, or null. Accepts numeric
// strings too (the foods API occasionally returns values as strings).
function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Coerce an unknown JSON value to a trimmed non-empty string, or null.
function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Coerce common truthy/falsy representations to a boolean, or null when the
// flag is absent/unknown (the API uses "yes"/"no" for vegan/vegetarian).
function asBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["yes", "true", "1"].includes(s)) return true;
    if (["no", "false", "0"].includes(s)) return false;
  }
  return null;
}

/**
 * Look up a food product by its barcode.
 *
 * GET /api/foods/barcode/<barcode>
 * Returns a normalized `FoodProduct` on success, or `null` if no product was
 * found for the barcode. The raw response exposes many nutriment keys (per
 * serving and per 100g); we pick the calories + macro fields the app logs.
 */
export async function getFoodByBarcode(
  barcode: string,
): Promise<FoodProduct | null> {
  const clean = barcode.trim();
  if (!clean) return null;

  const res = await thruxionFetch(
    `/api/foods/barcode/${encodeURIComponent(clean)}`,
    { method: "GET" },
  );

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "<no body>");
    throw new Error(
      `foods/barcode/${clean} failed (${res.status} ${res.statusText}): ${detail}`,
    );
  }

  const data = (await res.json().catch(() => null)) as
    | {
        barcode?: string;
        name?: string;
        brand?: string;
        image?: string;
        ingredients?: string;
        quantity?: string;
        serving_size?: string;
        vegan?: unknown;
        vegetarian?: unknown;
        nutriments?: Record<string, unknown>;
      }
    | null;

  // Treat an empty / shape-less body as "not found".
  if (!data || (!data.name && !data.nutriments)) {
    return null;
  }

  const n = data.nutriments ?? {};
  const name =
    typeof data.name === "string" && data.name.trim() ? data.name.trim() : clean;

  // Serving size can live on the record or inside the nutriments block.
  const servingSize =
    asString(data.serving_size) ?? asString(n["serving_size"]);

  return {
    barcode: typeof data.barcode === "string" ? data.barcode : clean,
    name,
    brand: asString(data.brand),
    image: asString(data.image),
    nutrition: {
      caloriesServing: asNumber(n["energy-kcal_serving"]),
      calories100g: asNumber(n["energy-kcal_100g"]),
      energyKjServing: asNumber(n["energy-kj_serving"]),
      energyKj100g: asNumber(n["energy-kj_100g"]),
      proteinServing: asNumber(n["proteins_serving"]),
      protein100g: asNumber(n["proteins_100g"]),
      carbsServing: asNumber(n["carbohydrates_serving"]),
      carbs100g: asNumber(n["carbohydrates_100g"]),
      fatServing: asNumber(n["fat_serving"]),
      fat100g: asNumber(n["fat_100g"]),
      saturatedFatServing: asNumber(n["saturated-fat_serving"]),
      saturatedFat100g: asNumber(n["saturated-fat_100g"]),
      sugarsServing: asNumber(n["sugars_serving"]),
      sugars100g: asNumber(n["sugars_100g"]),
      addedSugarsServing: asNumber(n["added-sugars_serving"]),
      addedSugars100g: asNumber(n["added-sugars_100g"]),
      fiberServing: asNumber(n["fiber_serving"]),
      fiber100g: asNumber(n["fiber_100g"]),
      saltServing: asNumber(n["salt_serving"]),
      salt100g: asNumber(n["salt_100g"]),
      sodiumServing: asNumber(n["sodium_serving"]),
      sodium100g: asNumber(n["sodium_100g"]),
    },
    meta: {
      servingSize,
      quantity: asString(data.quantity),
      novaGroup: asNumber(n["nova-group"]),
      vegan: asBool(data.vegan),
      vegetarian: asBool(data.vegetarian),
      ingredients: asString(data.ingredients),
    },
  };
}

// Re-export the token accessor for callers that need the raw bearer token.
export { getSystemToken } from "./thruxion-token";
