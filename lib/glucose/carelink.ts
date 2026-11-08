// Medtronic CareLink "CarePartner" cloud client (unofficial).
//
// This is the API behind the MiniMed / CareLink Connect apps, the same one
// used by nightscout-connect ("minimedcarelink"), xDrip+ and
// carelink-python-client. It is undocumented and can change without notice.
//
// Flow (verified against the live discovery endpoint — Chile maps to EU):
//   1. discovery  → per-region base URLs + Auth0 SSO config
//   2. Auth0 authorization-code + PKCE sign-in, done once by the owner in
//      their browser (captcha). The redirect goes to the app's custom scheme
//      `com.medtronic.carepartner:/sso?code=…`, which the owner pastes back.
//   3. refresh_token grant keeps the session alive (cron + on demand).
//   4. GET  {baseUrlCareLink}/users/me         → role (patient / care partner)
//      GET  {baseUrlCareLink}/links/patients   → followed patients
//      POST {baseUrlCumulus}/display/message   → live pump + sensor data

import { createHash, randomBytes } from "node:crypto";
import type { TrendDirection } from "./types";

export type CareLinkRegion = "EU" | "US";

// The discovery path version selects the Cumulus API version (3.6–3.8 → v13).
const DISCOVERY_URL = "https://clcloud.minimed.eu/connect/carepartner/v13/discover/android/3.8";
// display/message rejects clients older than 3.7 with HTTP 206 "Upgrade application".
const APP_VERSION = "3.8.0";

export type CareLinkConfig = {
  region: CareLinkRegion;
  authBase: string;
  clientId: string;
  scope: string;
  audience: string;
  redirectUri: string;
  baseUrlCareLink: string;
  baseUrlCumulus: string;
};

export type CareLinkErrorCode =
  | "invalid-grant"
  | "unauthorized"
  | "upgrade-required"
  | "unreachable"
  | "bad-response";

export class CareLinkError extends Error {
  constructor(
    public code: CareLinkErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "CareLinkError";
  }
}

const configCache = new Map<CareLinkRegion, { config: CareLinkConfig; at: number }>();
const CONFIG_TTL_MS = 6 * 3600_000;

// Medtronic's CDN sometimes answers datacenter requests (e.g. Vercel gru1)
// with a non-JSON page. These are the values the live discovery returned on
// 2026-11-08 and are used when discovery is unusable.
const FALLBACK_CONFIG: Record<CareLinkRegion, CareLinkConfig> = {
  EU: {
    region: "EU",
    authBase: "https://carelink-login.minimed.eu",
    clientId: "PeAhkbhQWlQRxJiQxWfcFBiGus1lxfe9",
    scope: "profile openid offline_access",
    audience: "carepartner.patient.ous",
    redirectUri: "com.medtronic.carepartner:/sso",
    baseUrlCareLink: "https://carelink.minimed.eu/api/carepartner/v2",
    baseUrlCumulus: "https://clcloud.minimed.eu/connect/carepartner/v13",
  },
  US: {
    region: "US",
    authBase: "https://carelink-login.minimed.com",
    clientId: "",
    scope: "profile openid offline_access",
    audience: "carepartner.patient.us",
    redirectUri: "com.medtronic.carepartner:/sso",
    baseUrlCareLink: "https://carelink.minimed.com/api/carepartner/v2",
    baseUrlCumulus: "https://clcloud.minimed.com/connect/carepartner/v13",
  },
};

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 14; Pixel 7 Build/UQ1A.240205.004) CarePartner/3.8.0",
};

function describe(body: unknown): string {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return (text ?? "").slice(0, 160).replace(/\s+/g, " ");
}

async function getJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...DEFAULT_HEADERS, ...(init?.headers as Record<string, string> | undefined) },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (err) {
    throw new CareLinkError("unreachable", (err as Error).message);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

export async function getCareLinkConfig(region: CareLinkRegion): Promise<CareLinkConfig> {
  const cached = configCache.get(region);
  if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return cached.config;

  try {
    return await discoverCareLinkConfig(region);
  } catch (err) {
    const fallback = FALLBACK_CONFIG[region];
    if (!fallback.clientId) throw err;
    console.warn("[carelink] discovery unusable, using built-in config:", (err as Error).message);
    configCache.set(region, { config: fallback, at: Date.now() - CONFIG_TTL_MS + 15 * 60_000 });
    return fallback;
  }
}

async function discoverCareLinkConfig(region: CareLinkRegion): Promise<CareLinkConfig> {
  const discovery = await getJson(DISCOVERY_URL);
  const cp = (discovery.body as { CP?: Record<string, string>[] } | null)?.CP;
  const entry = cp?.find((c) => c.region === region);
  const ssoUrl = entry ? entry[entry.UseSSOConfiguration] : undefined;
  if (!entry || !ssoUrl || !entry.baseUrlCareLink || !entry.baseUrlCumulus) {
    throw new CareLinkError(
      "bad-response",
      `discovery: region not found (HTTP ${discovery.status}: ${describe(discovery.body)})`,
    );
  }

  const ssoResponse = await getJson(ssoUrl);
  const sso = ssoResponse.body as {
    server?: { hostname?: string; port?: number; prefix?: string };
    client?: { client_id?: string; scope?: string; audience?: string; redirect_uri?: string };
  } | null;
  if (!sso?.server?.hostname || !sso.client?.client_id || !sso.client.redirect_uri) {
    throw new CareLinkError(
      "bad-response",
      `discovery: invalid SSO config (HTTP ${ssoResponse.status}: ${describe(ssoResponse.body)})`,
    );
  }

  const port = sso.server.port && sso.server.port !== 443 ? `:${sso.server.port}` : "";
  const config: CareLinkConfig = {
    region,
    authBase: `https://${sso.server.hostname}${port}${sso.server.prefix ?? ""}`,
    clientId: sso.client.client_id,
    scope: sso.client.scope ?? "profile openid offline_access",
    audience: sso.client.audience ?? "",
    redirectUri: sso.client.redirect_uri,
    baseUrlCareLink: entry.baseUrlCareLink,
    baseUrlCumulus: entry.baseUrlCumulus,
  };
  configCache.set(region, { config, at: Date.now() });
  return config;
}

// --- Auth0 sign-in (PKCE) ---------------------------------------------------

export function createPkce(): { state: string; verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state: randomBytes(16).toString("base64url"), verifier, challenge };
}

export function buildAuthorizeUrl(config: CareLinkConfig, state: string, challenge: string): string {
  const url = new URL(`${config.authBase}/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("redirect_uri", config.redirectUri);
  if (config.audience) url.searchParams.set("audience", config.audience);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Extracts code/state from what the owner pastes: the full
 * `com.medtronic.carepartner:/sso?code=…&state=…` redirect, a URL copied
 * from DevTools, or just the bare code.
 */
export function parseRedirectInput(input: string): { code: string; state: string | null } | null {
  const raw = input.trim();
  if (!raw) return null;
  // Chrome's console wraps it in quotes: Failed to launch '…?code=…&state=…'
  const code = /[?&]code=([^&#\s'"<>]+)/.exec(raw)?.[1];
  const state = /[?&]state=([^&#\s'"<>]+)/.exec(raw)?.[1];
  if (code) return { code: decodeURIComponent(code), state: state ? decodeURIComponent(state) : null };
  if (/^[\w.-]{10,}$/.test(raw)) return { code: raw, state: null };
  return null;
}

export type CareLinkTokens = {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  expiresAt: Date;
};

async function tokenRequest(config: CareLinkConfig, params: Record<string, string>): Promise<CareLinkTokens> {
  const { status, body } = await getJson(`${config.authBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: config.clientId, ...params }).toString(),
  });
  const data = body as {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } | null;
  // A 403 without an OAuth error body is a firewall/WAF block, not a bad code.
  if ((status === 400 || status === 401 || status === 403) && data?.error) {
    throw new CareLinkError(
      data.error === "invalid_grant" || data.error === "access_denied" ? "invalid-grant" : "unauthorized",
      `${data.error}: ${data.error_description ?? ""}`,
    );
  }
  if (status !== 200 || !data?.access_token) throw new CareLinkError("bad-response", `token ${status}`);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    idToken: data.id_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

export function exchangeCode(config: CareLinkConfig, code: string, verifier: string) {
  return tokenRequest(config, {
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });
}

export function refreshTokens(config: CareLinkConfig, refreshToken: string) {
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken });
}

export function decodeJwtPayload(token: string | null): Record<string, unknown> | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// --- CarePartner API ----------------------------------------------------------

async function apiRequest(url: string, accessToken: string, body?: unknown): Promise<unknown> {
  const { status, body: data } = await getJson(url, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (status === 401 || status === 403) throw new CareLinkError("unauthorized");
  if (status === 206) throw new CareLinkError("upgrade-required");
  if (status !== 200) throw new CareLinkError("bad-response", `${url} → ${status}`);
  return data;
}

export type CareLinkUser = { role: string; username: string | null; firstName: string | null; lastName: string | null };

export async function getCareLinkUser(config: CareLinkConfig, accessToken: string): Promise<CareLinkUser> {
  const data = (await apiRequest(`${config.baseUrlCareLink}/users/me`, accessToken)) as Record<string, unknown> | null;
  if (!data || typeof data.role !== "string") throw new CareLinkError("bad-response", "users/me");
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    role: data.role,
    username: str(data.username) ?? str(data.loginName) ?? str(data.userName),
    firstName: str(data.firstName),
    lastName: str(data.lastName),
  };
}

export const isCarePartnerRole = (role: string | null | undefined) =>
  role === "CARE_PARTNER" || role === "CARE_PARTNER_OUS";

export type CareLinkPatient = { username: string; firstName: string | null; lastName: string | null };

export async function getCareLinkPatients(config: CareLinkConfig, accessToken: string): Promise<CareLinkPatient[]> {
  const data = await apiRequest(`${config.baseUrlCareLink}/links/patients`, accessToken);
  if (!Array.isArray(data)) return [];
  return data
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p.username === "string")
    .map((p) => ({
      username: p.username as string,
      firstName: typeof p.firstName === "string" ? p.firstName : null,
      lastName: typeof p.lastName === "string" ? p.lastName : null,
    }));
}

/** The CareLink username, wherever this token flavour carries it. */
export function usernameFromTokens(tokens: { accessToken: string; idToken: string | null }): string | null {
  const access = decodeJwtPayload(tokens.accessToken);
  const id = decodeJwtPayload(tokens.idToken);
  const details = access?.token_details as Record<string, unknown> | undefined;
  for (const v of [
    details?.preferred_username,
    access?.preferred_username,
    id?.preferred_username,
    id?.nickname,
    access?.["https://carelink.minimed.com/username"],
  ]) {
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export async function getDisplayMessage(
  config: CareLinkConfig,
  accessToken: string,
  who: { username: string; role: string; patientId: string | null },
): Promise<Record<string, unknown>> {
  const carePartner = isCarePartnerRole(who.role);
  const body: Record<string, string> = {
    username: who.username,
    role: carePartner ? "carepartner" : "patient",
    appVersion: APP_VERSION,
  };
  if (carePartner && who.patientId) body.patientId = who.patientId;
  const data = (await apiRequest(`${config.baseUrlCumulus}/display/message`, accessToken, body)) as
    | Record<string, unknown>
    | null;
  // v13 nests everything under patientData; older payloads had it at the root.
  const patientData = (data?.patientData ?? data) as Record<string, unknown> | null;
  if (!patientData || typeof patientData !== "object") throw new CareLinkError("bad-response", "display/message");
  return patientData;
}

// --- Payload parsing ---------------------------------------------------------

/** Latest live status, persisted as glucose_settings.carelink_snapshot. */
export type CareLinkSnapshot = {
  lastSgAt: number | null;
  lastSg: number | null;
  trend: TrendDirection;
  sensorState: string | null;
  /** Hours of sensor life left, as reported by the pump. */
  sensorHoursLeft: number | null;
  activeInsulin: number | null;
  reservoirUnits: number | null;
  pumpBatteryPercent: number | null;
  /** Alert limits configured on the pump (mg/dL). */
  lowLimit: number | null;
  highLimit: number | null;
  /** Minutes of sensor life left (finer than sensorHoursLeft). */
  sensorMinutesLeft?: number | null;
  /** Guardian transmitter battery, 0–100. */
  transmitterBatteryPercent?: number | null;
  /** Minutes until the next calibration is due. */
  calibrationMinutesLeft?: number | null;
  reservoirPercent?: number | null;
  /** SmartGuard state, e.g. AUTO_BASAL, SAFE_BASAL, FEATURE_OFF. */
  autoMode?: string | null;
  timeZone: string | null;
  fetchedAt: number;
};

const TREND_MAP: Record<string, TrendDirection> = {
  UP_TRIPLE: "DoubleUp",
  UP_DOUBLE: "DoubleUp",
  UP: "SingleUp",
  DOWN: "SingleDown",
  DOWN_DOUBLE: "DoubleDown",
  DOWN_TRIPLE: "DoubleDown",
  NONE: "Flat",
};

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;

function wallClockAsUtc(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = WALL_RE.exec(value);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)) : null;
}

const isIanaZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Pump wall-clock minus UTC. clientTimeZoneName is often a display label
 * ("Chile Summer Time") rather than an IANA id, so derive the offset from
 * pairs the payload sends in both wall-clock and server-epoch form.
 */
export function deriveWallClockOffsetMs(pd: Record<string, unknown>): number | null {
  const pairs: [number | null, number | null][] = [
    [wallClockAsUtc(pd.lastConduitDateTime), num(pd.lastConduitUpdateServerDateTime)],
    [num(pd.medicalDeviceTime), num(pd.lastMedicalDeviceDataUpdateServerTime)],
  ];
  for (const [wall, utc] of pairs) {
    if (wall === null || utc === null || wall <= 0 || utc <= 0) continue;
    const quarterHour = 15 * 60_000;
    const offset = Math.round((wall - utc) / quarterHour) * quarterHour;
    if (Math.abs(offset) <= 14 * 3600_000) return offset;
  }
  return null;
}

/**
 * v13 timestamps are the patient's wall-clock time with no offset. Convert
 * using the derived offset, then a valid IANA zone, then as a last resort
 * whatever the string itself says.
 */
export function parseCareLinkTimestamp(
  value: unknown,
  zone: { offsetMs: number | null; timeZone: string | null },
): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const wall = wallClockAsUtc(value);
  const hasExplicitOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  if (wall === null || hasExplicitOffset) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (zone.offsetMs !== null) return wall - zone.offsetMs;
  if (zone.timeZone && isIanaZone(zone.timeZone)) {
    const first = wall - tzOffsetMs(wall, zone.timeZone);
    return wall - tzOffsetMs(first, zone.timeZone);
  }
  return wall;
}

export function parsePatientData(pd: Record<string, unknown>): {
  readings: { date: number; sgv: number }[];
  snapshot: CareLinkSnapshot;
} {
  const timeZone = typeof pd.clientTimeZoneName === "string" ? pd.clientTimeZoneName : null;
  const zone = { offsetMs: deriveWallClockOffsetMs(pd), timeZone };
  const futureLimit = Date.now() + 10 * 60_000;

  const readings: { date: number; sgv: number }[] = [];
  for (const sg of Array.isArray(pd.sgs) ? pd.sgs : []) {
    const value = num((sg as Record<string, unknown>)?.sg);
    const date = parseCareLinkTimestamp(
      (sg as Record<string, unknown>)?.timestamp ?? (sg as Record<string, unknown>)?.datetime,
      zone,
    );
    // sg 0 = no value (warm-up, calibration, signal loss).
    if (value && value > 0 && date && date <= futureLimit) readings.push({ date, sgv: Math.round(value) });
  }
  readings.sort((a, b) => a.date - b.date);

  const last = (pd.lastSG ?? {}) as Record<string, unknown>;
  const lastSg = num(last.sg);
  const lastSgAt = parseCareLinkTimestamp(last.timestamp ?? last.datetime, zone);
  if (lastSg && lastSg > 0 && lastSgAt && lastSgAt <= futureLimit && !readings.some((r) => r.date === lastSgAt)) {
    readings.push({ date: lastSgAt, sgv: Math.round(lastSg) });
    readings.sort((a, b) => a.date - b.date);
  }

  const activeInsulin = pd.activeInsulin as Record<string, unknown> | undefined;
  const algorithm = pd.therapyAlgorithmState as Record<string, unknown> | undefined;
  const limits = (Array.isArray(pd.limits) ? pd.limits[0] : null) as Record<string, unknown> | null;
  // Medtronic sends 255 / negative values as "unknown" sentinels.
  const pct = (v: unknown) => {
    const n = num(v);
    return n !== null && n >= 0 && n <= 100 ? n : null;
  };
  const minutes = (hours: unknown, mins: unknown) => {
    const m = num(mins);
    if (m !== null && m >= 0 && m < 255 * 60) return m;
    const h = num(hours);
    return h !== null && h >= 0 && h < 255 ? h * 60 : null;
  };
  const sensorMinutesLeft = minutes(pd.sensorDurationHours, pd.sensorDurationMinutes);
  return {
    readings,
    snapshot: {
      lastSgAt: lastSg && lastSg > 0 ? lastSgAt : null,
      lastSg: lastSg && lastSg > 0 ? Math.round(lastSg) : null,
      trend: TREND_MAP[String(pd.lastSGTrend ?? "")] ?? "NONE",
      sensorState: typeof last.sensorState === "string" ? last.sensorState : null,
      sensorHoursLeft: sensorMinutesLeft !== null ? Math.floor(sensorMinutesLeft / 60) : null,
      sensorMinutesLeft,
      activeInsulin: num(activeInsulin?.amount),
      reservoirUnits: num(pd.reservoirRemainingUnits) ?? num(pd.reservoirAmount),
      reservoirPercent: pct(pd.reservoirLevelPercent),
      pumpBatteryPercent: pct(pd.pumpBatteryLevelPercent) ?? pct(pd.medicalDeviceBatteryLevelPercent),
      transmitterBatteryPercent: pct(pd.gstBatteryLevel),
      calibrationMinutesLeft: minutes(pd.timeToNextCalibHours, pd.timeToNextCalibrationMinutes),
      autoMode: typeof algorithm?.autoModeShieldState === "string" ? algorithm.autoModeShieldState : null,
      lowLimit: num(pd.sgBelowLimit) ?? num(limits?.lowLimit),
      highLimit: num(pd.sgAboveLimit) ?? num(limits?.highLimit),
      timeZone,
      fetchedAt: Date.now(),
    },
  };
}
