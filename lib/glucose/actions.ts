"use server";

// Server-side proxy for glucose data sources.
//
// Three sources are supported (selected per user in glucose_settings.source):
//   - Nightscout: the user's own Nightscout instance (URL + token)
//   - LibreLinkUp: Abbott's follower API — real-time readings from the
//     LibreLink app on the same account ("patient" / main reading) or from
//     followed patients ("friend" / remote reading).
//   - CareLink (Medtronic, shown as the Guardian 3 sensor): no API — readings
//     come from the CareLink Personal CSV export, imported on the Insulin
//     pump page, parsed in the browser (see carelink-csv.ts) and stored in
//     carelink_readings.
//
// All secrets (Nightscout token, LibreLinkUp password, session tokens) live
// only in Neon and in this file's fetches — the browser/WebView never talks
// to Nightscout or LibreView directly (no CORS issues, secrets never exposed).

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { carelinkReadings, glucoseSettings } from "@/drizzle/schema";
import { auth } from "@/auth";
import { getGlucoseOwnerEmail, glucoseRoleForEmail } from "./access";
import type {
  GlucoseFetchResult,
  GlucoseReading,
  GlucoseRole,
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
import { CARELINK_IMPORT_CHUNK, isPlausibleReading, type CareLinkCsvReading } from "./carelink-csv";
import { estimateGuardianSensor, GUARDIAN3_LOOKBACK_MS } from "./guardian-sensor";
import {
  CareLinkError,
  buildAuthorizeUrl,
  createPkce,
  exchangeCode,
  getCareLinkConfig,
  getCareLinkPatients,
  getCareLinkUser,
  isCarePartnerRole,
  parseRedirectInput,
  usernameFromTokens,
  withRetry,
  type CareLinkRegion,
  type CareLinkSnapshot,
} from "./carelink";
import { careLinkSyncDue, isCareLinkLive, syncCareLink } from "./carelink-sync";
import { openSecret, sealSecret } from "./secret-box";

// The signed-in glucose user: their role (owner / watcher, see access.ts),
// their stable per-user key (same pattern as day-log: prefer the Thruxion
// human_id, fall back to the email) and their lowercased email.
type Viewer = { role: GlucoseRole; userKey: string; email: string };

async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  const user = session?.user as
    | { humanId?: string | null; email?: string | null }
    | undefined;
  const role = glucoseRoleForEmail(user?.email);
  const userKey = user?.humanId ?? user?.email ?? null;
  if (!role || !userKey || !user?.email) return null;
  return { role, userKey, email: user.email.trim().toLowerCase() };
}

// Settings and the source connection belong to the sensor owner: every
// action that changes them resolves this key, which is null for watchers.
async function getOwnerKey(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer?.role === "owner" ? viewer.userKey : null;
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

// Watchers get the owner's settings without the connection details: the
// owner's Nightscout address and LibreLinkUp login stay on the server.
function toClientSettings(row: SettingsRow, role: GlucoseRole): GlucoseSettings {
  const isOwner = role === "owner";
  return {
    role,
    source:
      row.source === "librelinkup"
        ? "librelinkup"
        : row.source === "carelink"
          ? "carelink"
          : "nightscout",
    nightscoutUrl: isOwner ? row.nightscoutUrl : null,
    hasToken: isOwner && Boolean(row.nightscoutToken),
    libreEmail: isOwner ? row.libreEmail : null,
    hasLibreCredentials: isOwner && Boolean(row.libreEmail && row.librePassword),
    librePatientId: row.librePatientId,
    careLinkLastImportAt: row.carelinkLastImportAt ? row.carelinkLastImportAt.getTime() : null,
    careLinkReadingCount: row.carelinkReadingCount ?? 0,
    careLinkConnected: isCareLinkLive(row),
    careLinkNeedsReconnect: Boolean(row.carelinkRefreshToken) && row.carelinkNeedsReconnect,
    careLinkPatientName: row.carelinkPatientName,
    careLinkLastSyncAt: row.carelinkLastSyncAt ? row.carelinkLastSyncAt.getTime() : null,
    unit: (row.unit === "mmol" ? "mmol" : "mgdl") as GlucoseUnit,
    lowThreshold: row.lowThreshold,
    highThreshold: row.highThreshold,
    targetLow: row.targetLow,
    targetHigh: row.targetHigh,
    enabled: row.enabled,
  };
}

async function getSettingsRow(userKey: string): Promise<SettingsRow | null> {
  try {
    const [row] = await db
      .select()
      .from(glucoseSettings)
      .where(eq(glucoseSettings.userKey, userKey))
      .limit(1);
    return row ?? null;
  } catch (err) {
    // Drizzle's "Failed query" message hides the pg/network error; log it.
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    console.error("[glucose] settings read failed:", cause?.code, cause?.message);
    throw err;
  }
}

// The row whose readings the viewer sees. The owner reads their own row and
// stamps their email on it; watchers read the row stamped with the configured
// owner email (the most recently updated one, should there be several).
async function resolveReadRow(): Promise<{ row: SettingsRow | null; role: GlucoseRole } | null> {
  const viewer = await getViewer();
  if (!viewer) return null;

  if (viewer.role === "owner") {
    const row = await getSettingsRow(viewer.userKey);
    if (row && row.ownerEmail !== viewer.email) {
      await db
        .update(glucoseSettings)
        .set({ ownerEmail: viewer.email })
        .where(eq(glucoseSettings.id, row.id));
      return { row: { ...row, ownerEmail: viewer.email }, role: "owner" };
    }
    return { row, role: "owner" };
  }

  const ownerEmail = getGlucoseOwnerEmail();
  if (!ownerEmail) return { row: null, role: "watcher" };
  const [row] = await db
    .select()
    .from(glucoseSettings)
    .where(eq(glucoseSettings.ownerEmail, ownerEmail))
    .orderBy(desc(glucoseSettings.updatedAt))
    .limit(1);
  return { row: row ?? null, role: "watcher" };
}

/** Returns the viewer's client-safe glucose settings, or null if unconfigured. */
export async function fetchGlucoseSettings(): Promise<GlucoseSettings | null> {
  const resolved = await resolveReadRow();
  if (!resolved?.row) return null;
  return toClientSettings(resolved.row, resolved.role);
}

type Thresholds = {
  lowThreshold: number;
  highThreshold: number;
  targetLow: number;
  targetHigh: number;
};

// Used only when neither the glucose source nor the stored row supplies a
// value (e.g. a brand-new row before the first successful fetch).
const DEFAULT_THRESHOLDS: Thresholds = {
  lowThreshold: 70,
  highThreshold: 240,
  targetLow: 70,
  targetHigh: 180,
};

// Clamp thresholds to sane mg/dL bounds and keep them ordered. Any field the
// caller omits falls back to `fallback`, so this doubles as the merge step for
// partial threshold sets coming from a glucose source.
function clampThresholds(
  input: Partial<Thresholds>,
  fallback: Thresholds = DEFAULT_THRESHOLDS,
): Thresholds {
  const pick = (v: number | null | undefined, f: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : f;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Math.round(v)));
  const lowThreshold = clamp(pick(input.lowThreshold, fallback.lowThreshold), 40, 120);
  const highThreshold = clamp(pick(input.highThreshold, fallback.highThreshold), 140, 400);
  const targetLow = clamp(pick(input.targetLow, fallback.targetLow), 40, 150);
  const targetHigh = clamp(
    pick(input.targetHigh, fallback.targetHigh),
    Math.max(targetLow + 10, 100),
    300,
  );
  return { lowThreshold, highThreshold, targetLow, targetHigh };
}

/**
 * Overlays thresholds reported by the glucose source itself onto the stored
 * ones. The source is authoritative — that's where the user actually
 * configures their ranges (LibreLink app / Nightscout settings) — and the
 * stored values only fill in whatever it doesn't report.
 */
function withSourceThresholds(
  settings: GlucoseSettings,
  source: Partial<Thresholds> | null,
): GlucoseSettings {
  if (!source) return settings;
  return { ...settings, ...clampThresholds(source, settings) };
}

export type SaveGlucoseSettingsInput = {
  source: "nightscout" | "librelinkup" | "carelink";
  // Nightscout fields (required when source === "nightscout")
  nightscoutUrl?: string;
  /** New token; empty string clears it; undefined keeps the stored one. */
  nightscoutToken?: string;
  // LibreLinkUp fields (required when source === "librelinkup", except that
  // an empty/undefined password keeps the stored one)
  libreEmail?: string;
  librePassword?: string;
  // Shared display settings. The unit is toggled from the chart header (see
  // setGlucoseUnit) and thresholds are read from the glucose source, so the
  // settings form sends none of them. Omitted fields keep the stored value.
  unit?: GlucoseUnit;
  lowThreshold?: number;
  highThreshold?: number;
  targetLow?: number;
  targetHigh?: number;
};

export type SaveGlucoseSettingsResult =
  | { ok: true; settings: GlucoseSettings; patients?: LibrePatientInfo[] }
  | { ok: false; error: string };

/** Upserts the user's settings. Returns the saved client-safe settings. */
export async function saveGlucoseSettings(
  input: SaveGlucoseSettingsInput,
): Promise<SaveGlucoseSettingsResult> {
  const viewer = await getViewer();
  if (viewer?.role !== "owner") return { ok: false, error: "unauthenticated" };
  const { userKey } = viewer;

  const existing = await getSettingsRow(userKey);
  // Omitted unit/thresholds keep whatever is already stored for this user —
  // the unit is toggled from the chart header, not from this form.
  const unit: GlucoseUnit =
    input.unit === "mmol" || input.unit === "mgdl"
      ? input.unit
      : existing?.unit === "mmol"
        ? "mmol"
        : "mgdl";
  const thresholds = clampThresholds(input, existing ?? DEFAULT_THRESHOLDS);

  const shared = {
    userKey,
    ownerEmail: viewer.email,
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

    return { ok: true, settings: toClientSettings(row, "owner") };
  }

  // --- CareLink source (Guardian 3 sensor) ---
  // No credentials to validate here (CSV import only, for now — see
  // importCareLinkReadings, which stores the readings but leaves the active
  // source alone). This branch is how the owner makes Guardian 3 the active
  // sensor, before or after importing a file.
  if (input.source === "carelink") {
    const values = {
      ...shared,
      source: "carelink" as const,
    };

    const [row] = await db
      .insert(glucoseSettings)
      .values(values)
      .onConflictDoUpdate({ target: glucoseSettings.userKey, set: values })
      .returning();

    return { ok: true, settings: toClientSettings(row, "owner") };
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

  return { ok: true, settings: toClientSettings(row, "owner"), patients };
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
  const userKey = await getOwnerKey();
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

/**
 * Switches the display unit (mg/dL ↔ mmol/L). Kept separate from
 * saveGlucoseSettings so the chart header can flip it without re-submitting
 * credentials or re-validating the connection.
 */
export async function setGlucoseUnit(
  unit: GlucoseUnit,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userKey = await getOwnerKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };

  const row = await getSettingsRow(userKey);
  if (!row) return { ok: false, error: "not-configured" };

  await db
    .update(glucoseSettings)
    .set({ unit: unit === "mmol" ? "mmol" : "mgdl", updatedAt: new Date() })
    .where(eq(glucoseSettings.id, row.id));
  return { ok: true };
}

/**
 * Switches which already-configured sensor feeds the readings, keeping every
 * source's stored credentials so the owner can flip back and forth without
 * re-entering them. Only sources that are actually set up can be selected.
 */
export async function setGlucoseSource(
  source: GlucoseSettings["source"],
): Promise<{ ok: true; settings: GlucoseSettings } | { ok: false; error: string }> {
  const userKey = await getOwnerKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };

  const row = await getSettingsRow(userKey);
  if (!row) return { ok: false, error: "not-configured" };

  const configured =
    source === "librelinkup"
      ? Boolean(row.libreEmail && row.librePassword)
      : source === "nightscout"
        ? Boolean(row.nightscoutUrl)
        : source === "carelink"
          ? isCareLinkLive(row) || (row.carelinkReadingCount ?? 0) > 0
          : false;
  if (!configured) return { ok: false, error: "not-configured" };

  const [updated] = await db
    .update(glucoseSettings)
    .set({ source, updatedAt: new Date() })
    .where(eq(glucoseSettings.id, row.id))
    .returning();
  return { ok: true, settings: toClientSettings(updated, "owner") };
}

/** Switches the selected LibreLinkUp patient connection. */
export async function setLibrePatient(
  patientId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userKey = await getOwnerKey();
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
  const userKey = await getOwnerKey();
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

// Nightscout publishes the thresholds configured on the site under
// settings.thresholds in status.json, always in mg/dL.
type NightscoutStatus = {
  name?: string;
  settings?: {
    thresholds?: {
      bgHigh?: number;
      bgTargetTop?: number;
      bgTargetBottom?: number;
      bgLow?: number;
    };
  };
};

/**
 * Reads the site's own alert/target thresholds. Returns null on any failure —
 * thresholds are a nicety, so a status.json problem must never break the
 * readings fetch; the caller just falls back to the stored values.
 */
async function fetchNightscoutThresholds(
  base: string,
  token: string | null,
): Promise<Partial<Thresholds> | null> {
  try {
    const res = await nsFetch(base, "/api/v1/status.json", token);
    if (!res.ok) return null;
    const status = (await res.json()) as NightscoutStatus;
    const t = status.settings?.thresholds;
    if (!t) return null;
    return {
      lowThreshold: t.bgLow,
      targetLow: t.bgTargetBottom,
      targetHigh: t.bgTargetTop,
      highThreshold: t.bgHigh,
    };
  } catch {
    return null;
  }
}

// --- Unified data fetch -------------------------------------------------------

/**
 * Fetches the user's glucose readings for the last `hours` hours from their
 * configured source. Values are returned in mg/dL (client converts for
 * mmol/L display). Secrets never leave the server.
 */
export async function fetchGlucoseData(hours: number): Promise<GlucoseFetchResult> {
  const resolved = await resolveReadRow();
  if (!resolved) return { ok: false, error: "unknown" };

  const { row, role } = resolved;
  if (!row || !row.enabled) return { ok: false, error: "not-configured" };

  const windowHours = Math.min(48, Math.max(1, Math.round(hours) || 12));

  if (row.source === "librelinkup") {
    return fetchFromLibre(row, role, windowHours);
  }
  if (row.source === "carelink") {
    return fetchFromCareLinkImport(row, role, windowHours);
  }
  return fetchFromNightscout(row, role, windowHours);
}

/**
 * CareLink has no live endpoint to call — "fetching" here means reading
 * back whatever importCareLinkReadings has previously written to
 * carelinkReadings. The window ends at the newest stored reading rather
 * than at now: imports are periodic snapshots, so a window ending now would
 * come back empty whenever the last import is older than the selected
 * range. Always ok:true once the source is configured (even with zero
 * rows): that's a legitimate "picked CareLink, haven't imported a file yet"
 * state, not a configuration error.
 */
async function fetchFromCareLinkImport(
  initialRow: SettingsRow,
  role: GlucoseRole,
  windowHours: number,
): Promise<GlucoseFetchResult> {
  let row = initialRow;
  // Live connection: pull from Medtronic when the stored data is older than
  // one upload cycle. Failures fall back to what's already stored.
  if (isCareLinkLive(row) && careLinkSyncDue(row)) {
    try {
      row = (await syncCareLink(row)).row;
    } catch (err) {
      const code = err instanceof CareLinkError ? err.code : "unknown";
      console.error("[carelink] live sync failed:", code, (err as Error).message);
      if (code === "invalid-grant") {
        row = (await getSettingsRow(row.userKey)) ?? row;
      }
    }
  }

  const [latest] = await db
    .select({ date: carelinkReadings.date })
    .from(carelinkReadings)
    .where(eq(carelinkReadings.userKey, row.userKey))
    .orderBy(desc(carelinkReadings.date))
    .limit(1);

  const rows = latest
    ? await db
        .select({ date: carelinkReadings.date, sgv: carelinkReadings.sgv })
        .from(carelinkReadings)
        .where(
          and(
            eq(carelinkReadings.userKey, row.userKey),
            gte(carelinkReadings.date, new Date(latest.date.getTime() - windowHours * 3600_000)),
          ),
        )
        .orderBy(carelinkReadings.date)
    : [];

  // Stored readings carry no trend; the live snapshot provides it for the
  // latest reading only.
  const snapshot = (isCareLinkLive(row) ? row.carelinkSnapshot : null) as CareLinkSnapshot | null;
  const readings: GlucoseReading[] = rows.map((r) => ({
    sgv: r.sgv,
    date: r.date.getTime(),
    direction: (snapshot?.lastSgAt === r.date.getTime() ? snapshot.trend : "NONE") as TrendDirection,
  }));

  // The sensor panel needs a full wear period of timestamps, which is
  // usually longer than the chart window.
  const sensorDates = latest
    ? await db
        .select({ date: carelinkReadings.date })
        .from(carelinkReadings)
        .where(
          and(
            eq(carelinkReadings.userKey, row.userKey),
            gte(carelinkReadings.date, new Date(latest.date.getTime() - GUARDIAN3_LOOKBACK_MS)),
          ),
        )
        .orderBy(carelinkReadings.date)
    : [];
  const sensor = estimateGuardianSensor(sensorDates.map((r) => r.date.getTime()));

  return {
    ok: true,
    data: {
      current: readings.length > 0 ? readings[readings.length - 1] : null,
      readings,
      settings: toClientSettings(row, role),
      patientName: snapshot ? row.carelinkPatientName : null,
      patients: [],
      // Estimated from reading gaps; only used when no live CareLink status exists.
      sensor: snapshot ? null : sensor,
      libreThresholds: null,
      careLinkStatus: snapshot
        ? {
            sensorHoursLeft: snapshot.sensorHoursLeft,
            sensorState: snapshot.sensorState,
            activeInsulin: snapshot.activeInsulin,
            reservoirUnits: snapshot.reservoirUnits,
            pumpBatteryPercent: snapshot.pumpBatteryPercent,
            lowLimit: snapshot.lowLimit,
            highLimit: snapshot.highLimit,
            // Older snapshots predate these fields; the next sync fills them.
            sensorMinutesLeft:
              snapshot.sensorMinutesLeft ??
              (snapshot.sensorHoursLeft !== null ? snapshot.sensorHoursLeft * 60 : null),
            transmitterBatteryPercent: snapshot.transmitterBatteryPercent ?? null,
            calibrationMinutesLeft: snapshot.calibrationMinutesLeft ?? null,
            reservoirPercent: snapshot.reservoirPercent ?? null,
            autoMode: snapshot.autoMode ?? null,
            fetchedAt: snapshot.fetchedAt,
          }
        : null,
    },
  };
}

// --- CareLink live connection (owner only) -----------------------------------

const PENDING_LOGIN_TTL_MS = 15 * 60_000;

export type StartCareLinkConnectResult =
  | { ok: true; authorizeUrl: string }
  | { ok: false; error: "unauthenticated" | "unreachable" };

/**
 * Step 1: create a PKCE pair and return Medtronic's sign-in URL. The owner
 * opens it in their own browser (Medtronic shows a captcha).
 */
export async function startCareLinkConnect(region: CareLinkRegion = "EU"): Promise<StartCareLinkConnectResult> {
  const viewer = await getViewer();
  if (viewer?.role !== "owner") return { ok: false, error: "unauthenticated" };
  const safeRegion: CareLinkRegion = region === "US" ? "US" : "EU";

  let config;
  try {
    config = await getCareLinkConfig(safeRegion);
  } catch (err) {
    console.error("[carelink] discovery failed:", (err as Error).message);
    return { ok: false, error: "unreachable" };
  }

  const pkce = createPkce();
  const existing = await getSettingsRow(viewer.userKey);
  const values = {
    userKey: viewer.userKey,
    ownerEmail: viewer.email,
    source: existing?.source ?? "carelink",
    unit: existing?.unit ?? "mgdl",
    ...(existing
      ? {
          lowThreshold: existing.lowThreshold,
          highThreshold: existing.highThreshold,
          targetLow: existing.targetLow,
          targetHigh: existing.targetHigh,
        }
      : DEFAULT_THRESHOLDS),
    enabled: true,
    carelinkRegion: safeRegion,
    carelinkPendingState: pkce.state,
    carelinkPendingVerifier: sealSecret(pkce.verifier),
    carelinkPendingAt: new Date(),
  };
  await db
    .insert(glucoseSettings)
    .values(values)
    .onConflictDoUpdate({ target: glucoseSettings.userKey, set: values });

  return { ok: true, authorizeUrl: buildAuthorizeUrl(config, pkce.state, pkce.challenge) };
}

export type CompleteCareLinkConnectResult =
  | { ok: true; settings: GlucoseSettings; patientName: string | null; readingsAdded: number }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "invalid-input"
        | "expired"
        | "state-mismatch"
        | "invalid-grant"
        | "no-username"
        | "no-patients"
        | "upgrade-required"
        | "unreachable";
      /** Which step failed and why, e.g. "token: bad-response: token 403 …". Owner-only. */
      detail?: string;
    };

/**
 * Step 2: the owner pastes the `com.medtronic.carepartner:/sso?code=…`
 * redirect. Exchange the code, detect the account role (patient or care
 * partner), pick the followed patient and run the first sync.
 */
export async function completeCareLinkConnect(redirect: string): Promise<CompleteCareLinkConnectResult> {
  const viewer = await getViewer();
  if (viewer?.role !== "owner") return { ok: false, error: "unauthenticated" };

  const parsed = parseRedirectInput(String(redirect ?? "").slice(0, 4000));
  if (!parsed) return { ok: false, error: "invalid-input" };

  const row = await getSettingsRow(viewer.userKey);
  const verifier = openSecret(row?.carelinkPendingVerifier);
  if (
    !row ||
    !verifier ||
    !row.carelinkPendingAt ||
    Date.now() - row.carelinkPendingAt.getTime() > PENDING_LOGIN_TTL_MS
  ) {
    return { ok: false, error: "expired" };
  }
  if (parsed.state && parsed.state !== row.carelinkPendingState) return { ok: false, error: "state-mismatch" };

  const region: CareLinkRegion = row.carelinkRegion === "US" ? "US" : "EU";
  let step: "config" | "token" | "profile" | "patients" | "save" = "config";
  try {
    const config = await getCareLinkConfig(region);
    step = "token";
    const tokens = await exchangeCode(config, parsed.code, verifier);
    if (!tokens.refreshToken) return { ok: false, error: "invalid-grant", detail: "token: no refresh_token returned" };

    // The code is spent now, so transient hiccups below get a retry.
    step = "profile";
    const user = await withRetry(() => getCareLinkUser(config, tokens.accessToken));
    const username = user.username ?? usernameFromTokens(tokens);
    if (!username) return { ok: false, error: "no-username" };

    let patientId: string | null = null;
    let patientName = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
    if (isCarePartnerRole(user.role)) {
      step = "patients";
      const patients = await withRetry(() => getCareLinkPatients(config, tokens.accessToken));
      const patient = patients[0];
      if (!patient) return { ok: false, error: "no-patients" };
      patientId = patient.username;
      patientName = [patient.firstName, patient.lastName].filter(Boolean).join(" ") || patient.username;
    }

    step = "save";
    const [connected] = await db
      .update(glucoseSettings)
      .set({
        source: "carelink",
        carelinkUsername: username,
        carelinkPatientId: patientId,
        carelinkPatientName: patientName,
        carelinkRole: user.role,
        carelinkClientId: config.clientId,
        carelinkAccessToken: sealSecret(tokens.accessToken),
        carelinkRefreshToken: sealSecret(tokens.refreshToken),
        carelinkTokenExpires: tokens.expiresAt,
        carelinkLastRefreshAt: new Date(),
        carelinkNeedsReconnect: false,
        carelinkRefreshLockUntil: null,
        carelinkPendingState: null,
        carelinkPendingVerifier: null,
        carelinkPendingAt: null,
        updatedAt: new Date(),
      })
      .where(eq(glucoseSettings.id, row.id))
      .returning();

    let finalRow = connected;
    let readingsAdded = 0;
    try {
      const synced = await syncCareLink(connected);
      finalRow = synced.row;
      readingsAdded = synced.added;
    } catch (err) {
      // Connected, but the first pull failed — the next poll retries.
      console.error("[carelink] first sync failed:", (err as Error).message);
      if (err instanceof CareLinkError && err.code === "upgrade-required") {
        return { ok: false, error: "upgrade-required" };
      }
    }

    return { ok: true, settings: toClientSettings(finalRow, "owner"), patientName, readingsAdded };
  } catch (err) {
    const code = err instanceof CareLinkError ? err.code : "unknown";
    const detail = `${step}: ${code}: ${(err as Error).message}`.slice(0, 220);
    console.error("[carelink] connect failed:", detail);
    // Only the token step can mean "bad code"; a 401 later is a different problem.
    if (code === "invalid-grant" || (code === "unauthorized" && step === "token")) {
      return { ok: false, error: "invalid-grant", detail };
    }
    if (code === "upgrade-required") return { ok: false, error: "upgrade-required", detail };
    return { ok: false, error: "unreachable", detail };
  }
}

/** Forgets the Medtronic session. Stored readings stay. */
export async function disconnectCareLink(): Promise<{ ok: true; settings: GlucoseSettings | null } | { ok: false }> {
  const userKey = await getOwnerKey();
  if (!userKey) return { ok: false };
  const [row] = await db
    .update(glucoseSettings)
    .set({
      carelinkAccessToken: null,
      carelinkRefreshToken: null,
      carelinkTokenExpires: null,
      carelinkUsername: null,
      carelinkPatientId: null,
      carelinkPatientName: null,
      carelinkRole: null,
      carelinkSnapshot: null,
      carelinkNeedsReconnect: false,
      carelinkPendingState: null,
      carelinkPendingVerifier: null,
      carelinkPendingAt: null,
      updatedAt: new Date(),
    })
    .where(eq(glucoseSettings.userKey, userKey))
    .returning();
  return { ok: true, settings: row ? toClientSettings(row, "owner") : null };
}

// --- CareLink CSV import -----------------------------------------------------

export type ImportCareLinkReadingsResult =
  | { ok: true; added: number; totalStored: number; settings: GlucoseSettings }
  | { ok: false; error: string };

/**
 * Stores one chunk of the readings parseCareLinkCsv pulled out of a CareLink
 * export in the browser (see carelink-csv.ts for why parsing happens there).
 * The import form sends a file's readings in chunks of at most
 * CARELINK_IMPORT_CHUNK, one call each, and every reading is re-checked here
 * since anything can arrive from the client. Doesn't change the owner's
 * active sensor: while Guardian 3 and LibreLinkUp are both in use, importing
 * must not turn the live feed off — the sensor is picked in the glucose
 * settings (or the pump page's "Use Guardian 3" button). Only an owner with
 * no settings row yet gets "carelink", since there's nothing else to use.
 * Re-importing a file with overlapping dates is a safe no-op (the (userKey,
 * date) unique constraint on carelinkReadings skips duplicates).
 */
export async function importCareLinkReadings(
  readings: CareLinkCsvReading[],
): Promise<ImportCareLinkReadingsResult> {
  const viewer = await getViewer();
  if (viewer?.role !== "owner") return { ok: false, error: "unauthenticated" };
  if (!Array.isArray(readings) || readings.length > CARELINK_IMPORT_CHUNK) {
    return { ok: false, error: "invalid" };
  }
  const { userKey, email } = viewer;

  const now = new Date();
  const values = readings
    .filter((r) => isPlausibleReading(r, now.getTime()))
    .map((r) => ({ userKey, date: new Date(r.date), sgv: r.sgv }));
  if (values.length === 0) return { ok: false, error: "no-readings" };

  const inserted = await db
    .insert(carelinkReadings)
    .values(values)
    .onConflictDoNothing({ target: [carelinkReadings.userKey, carelinkReadings.date] })
    .returning({ id: carelinkReadings.id });

  // Counted rather than added up, so the cached total can't drift.
  const totalStored = await db.$count(carelinkReadings, eq(carelinkReadings.userKey, userKey));

  const existing = await getSettingsRow(userKey);
  const unit: GlucoseUnit = existing?.unit === "mmol" ? "mmol" : "mgdl";

  const settingsValues = {
    ...(existing
      ? {
          lowThreshold: existing.lowThreshold,
          highThreshold: existing.highThreshold,
          targetLow: existing.targetLow,
          targetHigh: existing.targetHigh,
        }
      : DEFAULT_THRESHOLDS),
    userKey,
    ownerEmail: email,
    source: existing?.source ?? "carelink",
    unit,
    enabled: true,
    carelinkLastImportAt: now,
    carelinkReadingCount: totalStored,
    updatedAt: now,
  };

  const [row] = await db
    .insert(glucoseSettings)
    .values(settingsValues)
    .onConflictDoUpdate({ target: glucoseSettings.userKey, set: settingsValues })
    .returning();

  return {
    ok: true,
    added: inserted.length,
    totalStored,
    settings: toClientSettings(row, "owner"),
  };
}

export type ClearCareLinkReadingsResult =
  | { ok: true; settings: GlucoseSettings | null }
  | { ok: false; error: string };

/**
 * Deletes every CareLink reading imported for the owner — the undo for an
 * import that came out wrong. The CSV export stays the source of truth, so
 * importing it again restores everything. The active source is left as it
 * is; switching sensors is the settings form's job.
 */
export async function clearCareLinkReadings(): Promise<ClearCareLinkReadingsResult> {
  const userKey = await getOwnerKey();
  if (!userKey) return { ok: false, error: "unauthenticated" };

  await db.delete(carelinkReadings).where(eq(carelinkReadings.userKey, userKey));
  const [row] = await db
    .update(glucoseSettings)
    .set({ carelinkReadingCount: 0, carelinkLastImportAt: null, updatedAt: new Date() })
    .where(eq(glucoseSettings.userKey, userKey))
    .returning();

  return { ok: true, settings: row ? toClientSettings(row, "owner") : null };
}

async function fetchFromNightscout(
  row: SettingsRow,
  role: GlucoseRole,
  windowHours: number,
): Promise<GlucoseFetchResult> {
  if (!row.nightscoutUrl) return { ok: false, error: "not-configured" };

  const since = Date.now() - windowHours * 3600_000;
  // Libre uploads roughly every 1-5 min → ~12/hour covers the worst case.
  const count = String(windowHours * 60);

  try {
    // Thresholds come from the site's own settings; fetched alongside the
    // readings and never allowed to fail the request (see the helper).
    const [res, sourceThresholds] = await Promise.all([
      nsFetch(row.nightscoutUrl, "/api/v1/entries/sgv.json", row.nightscoutToken, {
        count,
        "find[date][$gte]": String(since),
      }),
      fetchNightscoutThresholds(row.nightscoutUrl, row.nightscoutToken),
    ]);

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
        settings: withSourceThresholds(toClientSettings(row, role), sourceThresholds),
        patientName: null,
        patients: [],
        // Nightscout entries carry no sensor or LibreLink threshold data.
        sensor: null,
        libreThresholds: null,
        careLinkStatus: null,
      },
    };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

async function fetchFromLibre(
  row: SettingsRow,
  role: GlucoseRole,
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

    // TEMP: calibrating SENSOR_LIFETIME_BY_PRODUCT_TYPE (see lib/glucose/types.ts) —
    // remove once the productType -> wear-duration mapping is confirmed and filled in.
    if (result.graph.sensor) {
      console.log(
        "[v0] sensor productType calibration:",
        JSON.stringify({
          serialNumber: result.graph.sensor.serialNumber,
          productType: result.graph.sensor.productType,
          activatedAt: new Date(result.graph.sensor.activatedAt).toISOString(),
        }),
      );
    }

    // Abbott's own target range + alarm thresholds drive the in-range colors
    // and chart bands. The alarm threshold is used whether or not the alarm is
    // enabled — it's still the configured bound, and the detail view shows the
    // on/off state separately.
    const libre = result.graph.thresholds;
    const sourceThresholds: Partial<Thresholds> | null = libre
      ? {
          targetLow: libre.targetLow ?? undefined,
          targetHigh: libre.targetHigh ?? undefined,
          lowThreshold: libre.lowAlarm?.threshold,
          highThreshold: libre.highAlarm?.threshold,
        }
      : null;

    return {
      ok: true,
      data: {
        current: result.graph.current,
        readings,
        settings: withSourceThresholds(
          toClientSettings({ ...row, librePatientId: result.targetId }, role),
          sourceThresholds,
        ),
        patientName: result.graph.patientName || null,
        patients: result.connections.map((p) => ({
          patientId: p.patientId,
          name: [p.firstName, p.lastName].filter(Boolean).join(" "),
          currentMgdl: p.currentMgdl,
        })),
        sensor: result.graph.sensor,
        libreThresholds: result.graph.thresholds,
        careLinkStatus: null,
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
