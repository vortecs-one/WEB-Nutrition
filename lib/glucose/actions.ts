"use server";

// Server-side proxy for glucose data sources.
//
// Two sources are supported (selected per user in glucose_settings.source):
//   - Nightscout: the user's own Nightscout instance (URL + token)
//   - LibreLinkUp: Abbott's follower API — real-time readings from the
//     LibreLink app on the same account ("patient" / main reading) or from
//     followed patients ("friend" / remote reading).
//
// All secrets (Nightscout token, LibreLinkUp password, session tokens) live
// only in Neon and in this file's fetches — the browser/WebView never talks
// to Nightscout or LibreView directly (no CORS issues, secrets never exposed).

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { glucoseSettings } from "@/drizzle/schema";
import { auth } from "@/auth";
import type {
  GlucoseFetchResult,
  GlucoseReading,
  GlucoseSettings,
  GlucoseUnit,
  LibrePatientInfo,
  TrendDirection,
} from "./types";
import {
  LibreError,
  libreGetConnections,
  libreGetGraph,
  libreLogin,
  type LibreSession,
} from "./librelinkup";

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

type SettingsRow = typeof glucoseSettings.$inferSelect;

function toClientSettings(row: SettingsRow): GlucoseSettings {
  return {
    source: row.source === "librelinkup" ? "librelinkup" : "nightscout",
    nightscoutUrl: row.nightscoutUrl,
    hasToken: Boolean(row.nightscoutToken),
    libreEmail: row.libreEmail,
    hasLibreCredentials: Boolean(row.libreEmail && row.librePassword),
    librePatientId: row.librePatientId,
    unit: (row.unit === "mmol" ? "mmol" : "mgdl") as GlucoseUnit,
    lowThreshold: row.lowThreshold,
    highThreshold: row.highThreshold,
    targetLow: row.targetLow,
    targetHigh: row.targetHigh,
    enabled: row.enabled,
  };
}

async function getSettingsRow(userKey: string): Promise<SettingsRow | null> {
  const [row] = await db
    .select()
    .from(glucoseSettings)
    .where(eq(glucoseSettings.userKey, userKey))
    .limit(1);
  return row ?? null;
}

/** Returns the user's client-safe glucose settings, or null if unconfigured. */
export async function fetchGlucoseSettings(): Promise<GlucoseSettings | null> {
  const userKey = await getUserKey();
  if (!userKey) return null;
  const row = await getSettingsRow(userKey);
  return row ? toClientSettings(row) : null;
}

// Clamp thresholds to sane mg/dL bounds and keep them ordered.
function clampThresholds(input: {
  lowThreshold: number;
  highThreshold: number;
  targetLow: number;
  targetHigh: number;
}) {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  const lowThreshold = clamp(input.lowThreshold, 40, 120);
  const highThreshold = clamp(input.highThreshold, 140, 400);
  const targetLow = clamp(input.targetLow, 40, 150);
  const targetHigh = clamp(input.targetHigh, Math.max(targetLow + 10, 100), 300);
  return { lowThreshold, highThreshold, targetLow, targetHigh };
}

export type SaveGlucoseSettingsInput = {
  source: "nightscout" | "librelinkup";
  // Nightscout fields (required when source === "nightscout")
  nightscoutUrl?: string;
  /** New token; empty string clears it; undefined keeps the stored one. */
  nightscoutToken?: string;
  // LibreLinkUp fields (required when source === "librelinkup", except that
  // an empty/undefined password keeps the stored one)
  libreEmail?: string;
  librePassword?: string;
  // Shared display settings
  unit: GlucoseUnit;
  lowThreshold: number;
  highThreshold: number;
  targetLow: number;
  targetHigh: number;
};

export type SaveGlucoseSettingsResult =
  | { ok: true; settings: GlucoseSettings; patients?: LibrePatientInfo[] }
  | { ok: false; error: string };

/** Upserts the user's settings. Returns the saved client-safe settings. */
export async function saveGlucoseSettings(
  input: SaveGlucoseSettingsInput,
): Promise<SaveGlucoseSettingsResult> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };

  const thresholds = clampThresholds(input);
  const unit: GlucoseUnit = input.unit === "mmol" ? "mmol" : "mgdl";
  const existing = await getSettingsRow(userKey);

  const shared = {
    userKey,
    unit,
    ...thresholds,
    enabled: true,
    updatedAt: new Date(),
  };

  if (input.source === "nightscout") {
    const url = normalizeUrl(input.nightscoutUrl ?? "");
    if (!url) return { ok: false, error: "invalid-url" };

    // undefined -> keep stored token; "" -> clear; string -> replace.
    const token =
      input.nightscoutToken === undefined
        ? (existing?.nightscoutToken ?? null)
        : input.nightscoutToken.trim() || null;

    const values = {
      ...shared,
      source: "nightscout" as const,
      nightscoutUrl: url,
      nightscoutToken: token,
    };

    const [row] = await db
      .insert(glucoseSettings)
      .values(values)
      .onConflictDoUpdate({ target: glucoseSettings.userKey, set: values })
      .returning();

    return { ok: true, settings: toClientSettings(row) };
  }

  // --- LibreLinkUp source ---
  const email = (input.libreEmail ?? existing?.libreEmail ?? "").trim().toLowerCase();
  // Empty/undefined password keeps the stored one.
  const password = input.librePassword?.trim() || existing?.librePassword || "";
  if (!email || !password) return { ok: false, error: "missing-credentials" };

  const credentialsChanged =
    email !== existing?.libreEmail || password !== existing?.librePassword;

  let session: LibreSession;
  let patients: LibrePatientInfo[];
  try {
    session = await libreLogin(email, password);
    patients = (await libreGetConnections(session)).map((p) => ({
      patientId: p.patientId,
      name: [p.firstName, p.lastName].filter(Boolean).join(" "),
      currentMgdl: p.currentMgdl,
    }));
  } catch (err) {
    const code = err instanceof LibreError ? err.code : "unknown";
    return { ok: false, error: code };
  }

  if (patients.length === 0) return { ok: false, error: "no-connections" };

  // Keep the previously selected patient when it still exists and the
  // credentials didn't change; otherwise default to the first connection.
  const keepPatient =
    !credentialsChanged &&
    existing?.librePatientId &&
    patients.some((p) => p.patientId === existing.librePatientId);
  const patientId = keepPatient ? (existing!.librePatientId as string) : patients[0].patientId;

  // libreGetConnections synthesizes a self-entry for "pat" (sensor-wearer)
  // accounts even when no real LibreLinkUp share exists, so "patients.length
  // > 0" above doesn't guarantee the connection actually works. Probe the
  // graph endpoint once here so a non-working synthesized entry is reported
  // honestly now, rather than saving settings that will silently show no
  // readings later.
  try {
    await libreGetGraph(session, patientId);
  } catch (err) {
    if (err instanceof LibreError && err.code === "not-connected") {
      return { ok: false, error: "no-connections" };
    }
    // Any other error here (rate limit, transient network) shouldn't block
    // saving — fetchGlucoseData will surface it on the next poll.
  }

  const values = {
    ...shared,
    source: "librelinkup" as const,
    libreEmail: email,
    librePassword: password,
    libreRegion: session.region,
    libreToken: session.token,
    libreTokenExpires: new Date(session.expires),
    libreAccountId: session.accountIdHash,
    librePatientId: patientId,
    libreUserId: session.userId,
    libreAccountType: session.accountType,
    libreDisplayName: session.displayName,
  };

  const [row] = await db
    .insert(glucoseSettings)
    .values(values)
    .onConflictDoUpdate({ target: glucoseSettings.userKey, set: values })
    .returning();

  return { ok: true, settings: toClientSettings(row), patients };
}

// --- LibreLinkUp session management ------------------------------------------

// Refresh the token 5 minutes before it actually expires.
const TOKEN_SAFETY_MS = 5 * 60_000;

/**
 * Returns a valid LibreLinkUp session for the row, re-logging in with the
 * stored credentials when the cached token is missing or about to expire.
 * Persists the refreshed token so subsequent polls reuse it.
 */
async function getLibreSession(row: SettingsRow): Promise<LibreSession> {
  const cachedValid =
    row.libreToken &&
    row.libreAccountId &&
    row.libreTokenExpires &&
    row.libreTokenExpires.getTime() - TOKEN_SAFETY_MS > Date.now();

  if (cachedValid) {
    return {
      token: row.libreToken as string,
      expires: (row.libreTokenExpires as Date).getTime(),
      accountIdHash: row.libreAccountId as string,
      region: row.libreRegion,
      userId: row.libreUserId ?? "",
      accountType: row.libreAccountType ?? "llu",
      displayName: row.libreDisplayName ?? "",
    };
  }

  if (!row.libreEmail || !row.librePassword) throw new LibreError("invalid-credentials");

  const session = await libreLogin(row.libreEmail, row.librePassword);
  await db
    .update(glucoseSettings)
    .set({
      libreToken: session.token,
      libreTokenExpires: new Date(session.expires),
      libreAccountId: session.accountIdHash,
      libreRegion: session.region,
      libreUserId: session.userId,
      libreAccountType: session.accountType,
      libreDisplayName: session.displayName,
      updatedAt: new Date(),
    })
    .where(eq(glucoseSettings.id, row.id));
  return session;
}

/**
 * Tests LibreLinkUp credentials without saving and returns the patient
 * connections found on the account. Pass `useSavedPassword: true` to test
 * with the stored password (when the password field is left untouched).
 */
export async function testLibreConnection(input: {
  libreEmail: string;
  librePassword?: string;
  useSavedPassword?: boolean;
}): Promise<{ ok: true; patients: LibrePatientInfo[] } | { ok: false; error: string }> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };

  const email = input.libreEmail.trim().toLowerCase();
  let password = input.librePassword?.trim() || "";
  if (!password && input.useSavedPassword) {
    const row = await getSettingsRow(userKey);
    password = row?.librePassword ?? "";
  }
  if (!email || !password) return { ok: false, error: "missing-credentials" };

  try {
    const session = await libreLogin(email, password);
    const rawPatients = await libreGetConnections(session);
    const patients = rawPatients.map((p) => ({
      patientId: p.patientId,
      name: [p.firstName, p.lastName].filter(Boolean).join(" "),
      currentMgdl: p.currentMgdl,
    }));
    if (patients.length === 0) return { ok: false, error: "no-connections" };
    return { ok: true, patients };
  } catch (err) {
    const code = err instanceof LibreError ? err.code : "unknown";
    return { ok: false, error: code };
  }
}

/** Switches the selected LibreLinkUp patient connection. */
export async function setLibrePatient(
  patientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };

  const row = await getSettingsRow(userKey);
  if (!row || row.source !== "librelinkup") return { ok: false, error: "not-configured" };

  // Validate against the live connections list so a stale/forged id can't be saved.
  try {
    const session = await getLibreSession(row);
    const patients = await libreGetConnections(session);
    if (!patients.some((p) => p.patientId === patientId)) {
      return { ok: false, error: "unknown-patient" };
    }
  } catch (err) {
    const code = err instanceof LibreError ? err.code : "unknown";
    return { ok: false, error: code };
  }

  await db
    .update(glucoseSettings)
    .set({ librePatientId: patientId, updatedAt: new Date() })
    .where(eq(glucoseSettings.id, row.id));
  return { ok: true };
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
    const row = await getSettingsRow(userKey);
    token = row?.nightscoutToken ?? null;
  }

  try {
    const res = await nsFetch(url, "/api/v1/status.json", token);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "unauthorized" };
    }
    if (!res.ok) return { ok: false, error: "unreachable" };
    const status = (await res.json()) as { name?: string; version?: string };
    return { ok: true, serverName: status.name ?? "Nightscout" };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

type NightscoutEntry = {
  sgv?: number;
  date?: number;
  dateString?: string;
  direction?: string;
};

// --- Unified data fetch -------------------------------------------------------

/**
 * Fetches the user's glucose readings for the last `hours` hours from their
 * configured source. Values are returned in mg/dL (client converts for
 * mmol/L display). Secrets never leave the server.
 */
export async function fetchGlucoseData(hours: number): Promise<GlucoseFetchResult> {
  const userKey = await getUserKey();
  if (!userKey) return { ok: false, error: "unknown" };

  const row = await getSettingsRow(userKey);
  if (!row || !row.enabled) return { ok: false, error: "not-configured" };

  const windowHours = Math.min(48, Math.max(1, Math.round(hours) || 12));

  if (row.source === "librelinkup") {
    return fetchFromLibre(row, windowHours);
  }
  return fetchFromNightscout(row, windowHours);
}

async function fetchFromNightscout(
  row: SettingsRow,
  windowHours: number,
): Promise<GlucoseFetchResult> {
  if (!row.nightscoutUrl) return { ok: false, error: "not-configured" };

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
        patientName: null,
        patients: [],
      },
    };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

async function fetchFromLibre(
  row: SettingsRow,
  windowHours: number,
): Promise<GlucoseFetchResult> {
  if (!row.libreEmail || !row.librePassword) return { ok: false, error: "not-configured" };

  try {
    let session = await getLibreSession(row);

    // Fetch graph + connections in parallel: the graph powers the chart and
    // live reading; connections power the patient switcher.
    const patientId = row.librePatientId;
    const runFetches = async (s: LibreSession) => {
      const connectionsPromise = libreGetConnections(s);
      const targetId = patientId ?? (await connectionsPromise)[0]?.patientId;
      if (!targetId) throw new LibreError("unknown", "no connections");
      const [graph, connections] = await Promise.all([
        libreGetGraph(s, targetId),
        connectionsPromise,
      ]);
      return { graph, connections, targetId };
    };

    let result;
    try {
      result = await runFetches(session);
    } catch (err) {
      // Cached token can be revoked server-side → force one re-login retry.
      if (err instanceof LibreError && err.code === "unauthorized") {
        session = await libreLogin(row.libreEmail, row.librePassword);
        await db
          .update(glucoseSettings)
          .set({
            libreToken: session.token,
            libreTokenExpires: new Date(session.expires),
            libreAccountId: session.accountIdHash,
            libreRegion: session.region,
            updatedAt: new Date(),
          })
          .where(eq(glucoseSettings.id, row.id));
        result = await runFetches(session);
      } else {
        throw err;
      }
    }

    // Persist the auto-selected patient so it sticks across polls.
    if (!patientId && result.targetId) {
      await db
        .update(glucoseSettings)
        .set({ librePatientId: result.targetId, updatedAt: new Date() })
        .where(eq(glucoseSettings.id, row.id));
    }

    // LibreLinkUp's graph covers ~12h; trim to the requested window.
    const since = Date.now() - windowHours * 3600_000;
    const readings = result.graph.readings.filter((r) => r.date >= since);

    return {
      ok: true,
      data: {
        current: result.graph.current,
        readings,
        settings: toClientSettings({ ...row, librePatientId: result.targetId }),
        patientName: result.graph.patientName || null,
        patients: result.connections.map((p) => ({
          patientId: p.patientId,
          name: [p.firstName, p.lastName].filter(Boolean).join(" "),
          currentMgdl: p.currentMgdl,
        })),
      },
    };
  } catch (err) {
    const code = err instanceof LibreError ? err.code : "unknown";
    console.log("[v0] fetchFromLibre failed:", code, (err as Error).message);
    if (code === "invalid-credentials" || code === "terms") return { ok: false, error: code };
    if (code === "unauthorized") return { ok: false, error: "unauthorized" };
    if (code === "not-connected") return { ok: false, error: "no-connections" };
    return { ok: false, error: "unreachable" };
  }
}
