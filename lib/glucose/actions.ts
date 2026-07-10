"use server";

// Server-side proxy for the user's Nightscout instance.
// The Nightscout URL + token live only in Neon and in this file's fetches —
// the browser/WebView never talks to Nightscout directly (no CORS issues,
// token never exposed to the client).

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { glucoseSettings } from "@/drizzle/schema";
import { auth } from "@/auth";
import type {
  GlucoseFetchResult,
  GlucoseReading,
  GlucoseSettings,
  GlucoseUnit,
  TrendDirection,
} from "./types";

// Resolve a stable per-user key from the session (same pattern as day-log):
// prefer the Thruxion human_id, fall back to the email.
async function getUserKey(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as
    | { humanId?: string | null; email?: string | null }
    | undefined;
  return user?.humanId ?? user?.email ?? null;
}

// --- URL / auth helpers -----------------------------------------------------

// Normalize + validate a Nightscout base URL. Returns null when invalid.
function normalizeUrl(raw: string): string | null {
  let input = raw.trim();
  if (!input) return null;
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    // Strip trailing slashes and any path/query the user pasted by accident
    // beyond the base (keep pathname if they host under a subpath).
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return null;
  }
}

// Build a Nightscout API URL with token auth when available.
function nsUrl(base: string, path: string, token: string | null, params: Record<string, string> = {}): string {
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

// SHA-1 hash for the legacy `api-secret` header (users sometimes paste their
// API_SECRET instead of an access token — support both transparently).
async function sha1Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function nsFetch(
  base: string,
  path: string,
  token: string | null,
  params: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["api-secret"] = await sha1Hex(token);
  return fetch(nsUrl(base, path, token, params), {
    headers,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
}

// --- Settings CRUD ----------------------------------------------------------

function toClientSettings(row: typeof glucoseSettings.$inferSelect): GlucoseSettings {
  return {
    nightscoutUrl: row.nightscoutUrl,
    hasToken: Boolean(row.nightscoutToken),
    unit: (row.unit === "mmol" ? "mmol" : "mgdl") as GlucoseUnit,
    lowThreshold: row.lowThreshold,
    highThreshold: row.highThreshold,
    targetLow: row.targetLow,
    targetHigh: row.targetHigh,
    enabled: row.enabled,
  };
}

/** Returns the user's client-safe glucose settings, or null if unconfigured. */
export async function fetchGlucoseSettings(): Promise<GlucoseSettings | null> {
  const userKey = await getUserKey();
  if (!userKey) return null;

  const [row] = await db
    .select()
    .from(glucoseSettings)
    .where(eq(glucoseSettings.userKey, userKey))
    .limit(1);

  return row ? toClientSettings(row) : null;
}

export type SaveGlucoseSettingsInput = {
  nightscoutUrl: string;
  /** New token; empty string clears it; undefined keeps the stored one. */
  nightscoutToken?: string;
  unit: GlucoseUnit;
  lowThreshold: number;
  highThreshold: number;
  targetLow: number;
  targetHigh: number;
};

/** Upserts the user's settings. Returns the saved client-safe settings. */
export async function saveGlucoseSettings(
  input: SaveGlucoseSettingsInput,
): Promise<{ ok: true; settings: GlucoseSettings } | { ok: false; error: string }> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };

  const url = normalizeUrl(input.nightscoutUrl);
  if (!url) return { ok: false, error: "invalid-url" };

  // Clamp thresholds to sane mg/dL bounds and keep them ordered.
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  const lowThreshold = clamp(input.lowThreshold, 40, 120);
  const highThreshold = clamp(input.highThreshold, 140, 400);
  const targetLow = clamp(input.targetLow, 40, 150);
  const targetHigh = clamp(input.targetHigh, Math.max(targetLow + 10, 100), 300);
  const unit: GlucoseUnit = input.unit === "mmol" ? "mmol" : "mgdl";

  const [existing] = await db
    .select({ id: glucoseSettings.id, token: glucoseSettings.nightscoutToken })
    .from(glucoseSettings)
    .where(eq(glucoseSettings.userKey, userKey))
    .limit(1);

  // undefined -> keep stored token; "" -> clear; string -> replace.
  const token =
    input.nightscoutToken === undefined
      ? (existing?.token ?? null)
      : input.nightscoutToken.trim() || null;

  const values = {
    userKey,
    nightscoutUrl: url,
    nightscoutToken: token,
    unit,
    lowThreshold,
    highThreshold,
    targetLow,
    targetHigh,
    enabled: true,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(glucoseSettings)
    .values(values)
    .onConflictDoUpdate({ target: glucoseSettings.userKey, set: values })
    .returning();

  return { ok: true, settings: toClientSettings(row) };
}

// --- Nightscout proxy -------------------------------------------------------

/**
 * Tests a Nightscout connection with the given URL/token without saving.
 * Pass `useSavedToken: true` to test against the token already stored
 * (e.g. when the token field is left untouched in the form).
 */
export async function testNightscoutConnection(input: {
  nightscoutUrl: string;
  nightscoutToken?: string;
  useSavedToken?: boolean;
}): Promise<{ ok: true; serverName: string } | { ok: false; error: string }> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };

  const url = normalizeUrl(input.nightscoutUrl);
  if (!url) return { ok: false, error: "invalid-url" };

  let token = input.nightscoutToken?.trim() || null;
  if (!token && input.useSavedToken) {
    const [row] = await db
      .select({ token: glucoseSettings.nightscoutToken })
      .from(glucoseSettings)
      .where(eq(glucoseSettings.userKey, userKey))
      .limit(1);
    token = row?.token ?? null;
  }

  try {
    console.log("[v0] testNightscoutConnection: fetching", `${url}/api/v1/status.json`);
    const res = await nsFetch(url, "/api/v1/status.json", token);
    console.log("[v0] testNightscoutConnection: status", res.status);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "unauthorized" };
    }
    if (!res.ok) return { ok: false, error: "unreachable" };
    const status = (await res.json()) as { name?: string; version?: string };
    return { ok: true, serverName: status.name ?? "Nightscout" };
  } catch (err) {
    console.log("[v0] testNightscoutConnection: error", (err as Error).message, (err as { cause?: Error }).cause?.message);
    return { ok: false, error: "unreachable" };
  }
}

type NightscoutEntry = {
  sgv?: number;
  date?: number;
  dateString?: string;
  direction?: string;
};

/**
 * Fetches the user's glucose readings for the last `hours` hours from their
 * Nightscout instance. Values are returned in mg/dL (client converts for
 * mmol/L display). The token never leaves the server.
 */
export async function fetchGlucoseData(hours: number): Promise<GlucoseFetchResult> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unknown" };

  const [row] = await db
    .select()
    .from(glucoseSettings)
    .where(eq(glucoseSettings.userKey, userKey))
    .limit(1);

  if (!row || !row.enabled) return { ok: false, error: "not-configured" };

  const windowHours = Math.min(48, Math.max(1, Math.round(hours) || 12));
  const since = Date.now() - windowHours * 3600_000;
  // Libre uploads roughly every 1-5 min → ~12/hour covers the worst case.
  const count = String(windowHours * 60);

  try {
    const res = await nsFetch(row.nightscoutUrl, "/api/v1/entries/sgv.json", row.nightscoutToken, {
      count,
      "find[date][$gte]": String(since),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "unauthorized" };
    }
    if (!res.ok) return { ok: false, error: "unreachable" };

    const entries = (await res.json()) as NightscoutEntry[];

    const readings: GlucoseReading[] = entries
      .filter((e) => typeof e.sgv === "number" && e.sgv > 0)
      .map((e) => ({
        sgv: e.sgv as number,
        date: e.date ?? (e.dateString ? Date.parse(e.dateString) : 0),
        direction: (e.direction ?? "NONE") as TrendDirection,
      }))
      .filter((e) => e.date > 0)
      .sort((a, b) => a.date - b.date);

    return {
      ok: true,
      data: {
        current: readings.length > 0 ? readings[readings.length - 1] : null,
        readings,
        settings: toClientSettings(row),
      },
    };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}
