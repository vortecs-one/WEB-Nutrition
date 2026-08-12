// lib/glucose/types.ts
// Shared types + pure helpers for the Nightscout glucose feature.
// All values are handled internally in mg/dL; conversion to mmol/L happens
// only at display time.

// Nightscout trend directions (from the `direction` field on SGV entries).
export type TrendDirection =
  | "DoubleUp"
  | "SingleUp"
  | "FortyFiveUp"
  | "Flat"
  | "FortyFiveDown"
  | "SingleDown"
  | "DoubleDown"
  | "NOT COMPUTABLE"
  | "RATE OUT OF RANGE"
  | "NONE";

// A single normalized glucose reading (always mg/dL).
export type GlucoseReading = {
  /** Sensor glucose value in mg/dL. */
  sgv: number;
  /** Epoch milliseconds of the reading. */
  date: number;
  /** Nightscout trend direction. */
  direction: TrendDirection;
};

export type GlucoseUnit = "mgdl" | "mmol";

// Where the readings come from:
// - "nightscout": the user's own Nightscout instance
// - "librelinkup": Abbott's LibreLinkUp follower API (same data the
//   LibreLink / LibreLinkUp apps show, main sensor + followed patients)
export type GlucoseSource = "nightscout" | "librelinkup";

// A patient connection visible to the LibreLinkUp account (client-safe).
export type LibrePatientInfo = {
  patientId: string;
  name: string;
  /** Latest mg/dL value from the connections list, if available. */
  currentMgdl: number | null;
};

// Metadata about the physical sensor currently worn by the selected patient.
// LibreLinkUp only — Nightscout entries carry no sensor block.
export type SensorInfo = {
  /** Sensor serial number, if reported. */
  serialNumber: string | null;
  /** Epoch ms when the sensor was activated (applied to the skin). */
  activatedAt: number;
  /** Warm-up period in minutes; no readings are produced until it elapses. */
  warmUpMinutes: number;
  /** Abbott's undocumented per-model code (`pt` in the API), if reported. */
  productType: number | null;
};

// A single glucose alarm as configured in the patient's LibreLink app.
export type LibreAlarm = {
  enabled: boolean;
  /** Trigger threshold in mg/dL. */
  threshold: number;
};

// Target range + alarm thresholds read from the patient's own LibreLink app.
// Read-only reference data: these are shown alongside, and never silently
// override, the display thresholds the user configures in GlucoseSettings.
export type LibreThresholds = {
  /** Target range in mg/dL, or null when not reported. */
  targetLow: number | null;
  targetHigh: number | null;
  highAlarm: LibreAlarm | null;
  lowAlarm: LibreAlarm | null;
};

// Client-safe settings (secrets intentionally excluded — Nightscout tokens
// and LibreLinkUp passwords never leave the server; we only tell the client
// whether they are stored).
export type GlucoseSettings = {
  source: GlucoseSource;
  nightscoutUrl: string | null;
  hasToken: boolean;
  /** LibreLinkUp account email (shown in settings; not a secret). */
  libreEmail: string | null;
  hasLibreCredentials: boolean;
  /** Currently selected LibreLinkUp patient connection. */
  librePatientId: string | null;
  unit: GlucoseUnit;
  lowThreshold: number;
  highThreshold: number;
  targetLow: number;
  targetHigh: number;
  enabled: boolean;
};

export type GlucoseStatus = "low" | "in-range" | "high" | "urgent";

export type GlucoseData = {
  /** Most recent reading, or null if the source returned nothing. */
  current: GlucoseReading | null;
  /** Readings for the requested window, oldest first. */
  readings: GlucoseReading[];
  settings: GlucoseSettings;
  /** Name of the patient the readings belong to (LibreLinkUp only). */
  patientName: string | null;
  /** All patient connections on the account (LibreLinkUp only). */
  patients: LibrePatientInfo[];
  /** Worn sensor's activation/expiry metadata (LibreLinkUp only). */
  sensor: SensorInfo | null;
  /** Target range + alarms from the patient's LibreLink app (LibreLinkUp only). */
  libreThresholds: LibreThresholds | null;
};

export type GlucoseFetchError =
  | "not-configured"
  | "unauthorized"
  | "invalid-credentials"
  | "terms"
  | "no-connections"
  | "unreachable"
  | "unknown";

export type GlucoseFetchResult =
  | { ok: true; data: GlucoseData }
  | { ok: false; error: GlucoseFetchError };

// --- Unit helpers -----------------------------------------------------------

const MGDL_PER_MMOL = 18.0182;

export function mgdlToMmol(mgdl: number): number {
  return Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10;
}

/** Format a mg/dL value in the requested display unit. */
export function formatGlucose(mgdl: number, unit: GlucoseUnit): string {
  return unit === "mmol" ? mgdlToMmol(mgdl).toFixed(1) : String(Math.round(mgdl));
}

export function unitLabel(unit: GlucoseUnit): string {
  return unit === "mmol" ? "mmol/L" : "mg/dL";
}

// --- Trend helpers ----------------------------------------------------------

/** Arrow glyph for each Nightscout trend direction. */
export function trendArrow(direction: TrendDirection): string {
  switch (direction) {
    case "DoubleUp":
      return "↑↑";
    case "SingleUp":
      return "↑";
    case "FortyFiveUp":
      return "↗";
    case "Flat":
      return "→";
    case "FortyFiveDown":
      return "↘";
    case "SingleDown":
      return "↓";
    case "DoubleDown":
      return "↓↓";
    default:
      return "";
  }
}

// --- Status helpers ---------------------------------------------------------

/** Classify a mg/dL value against the user's thresholds. */
export function glucoseStatus(
  mgdl: number,
  settings: Pick<GlucoseSettings, "lowThreshold" | "highThreshold" | "targetLow" | "targetHigh">,
): GlucoseStatus {
  if (mgdl < settings.lowThreshold || mgdl > settings.highThreshold) return "urgent";
  if (mgdl < settings.targetLow) return "low";
  if (mgdl > settings.targetHigh) return "high";
  return "in-range";
}

/** Minutes elapsed since a reading. */
export function minutesAgo(dateMs: number): number {
  return Math.max(0, Math.round((Date.now() - dateMs) / 60000));
}

/** A reading older than this is considered stale (sensor/upload gap). */
export const STALE_MINUTES = 15;

// --- Sensor lifecycle helpers -----------------------------------------------

/** Most FreeStyle Libre sensors (2 / 3, standard) run for 14 days. */
export const DEFAULT_SENSOR_LIFETIME_MS = 14 * 24 * 3600_000;

/**
 * Abbott doesn't document what its `pt` (product type) codes mean, so this
 * map only carries entries we've confirmed against a real sensor's actual
 * expiry (cross-checked against the official LibreLinkUp app). Anything not
 * listed here is resolved from live readings instead — see sensorLifetimeMs.
 */
export const SENSOR_LIFETIME_BY_PRODUCT_TYPE: Record<number, number> = {
  // pt: <confirmed Libre 2 Plus code> -> 15 * 24 * 3600_000,
};

/**
 * The only wear durations Abbott ships: 14 days (Libre 2 / 3) and 15 days for
 * the extended-wear "Plus" models. Ascending — sensorLifetimeMs walks this.
 */
export const SENSOR_LIFETIME_CANDIDATES_MS = [14 * 24 * 3600_000, 15 * 24 * 3600_000];

/**
 * How far past a candidate duration readings must continue before we accept
 * them as proof of a longer-wearing model. A 14-day sensor legitimately
 * reports right up to its final minute, so without this margin an ordinary
 * last reading would promote it to 15 days and invent a day of life it
 * doesn't have.
 */
export const SENSOR_LIFETIME_PROMOTION_GRACE_MS = 60 * 60_000;

/**
 * How long this sensor actually runs for.
 *
 * Without a calibrated `pt` we can't know the model up front, so we let the
 * sensor tell us: a reading produced at day 14+ disproves the 14-day guess and
 * promotes it to the next candidate. That self-corrects within one poll of
 * crossing the boundary and never claims a sensor is dead while it's still
 * reporting.
 */
export function sensorLifetimeMs(sensor: SensorInfo, lastReadingAt: number | null = null): number {
  if (sensor.productType !== null && sensor.productType in SENSOR_LIFETIME_BY_PRODUCT_TYPE) {
    return SENSOR_LIFETIME_BY_PRODUCT_TYPE[sensor.productType];
  }
  if (lastReadingAt === null) return DEFAULT_SENSOR_LIFETIME_MS;
  // Smallest candidate the sensor hasn't clearly outlived.
  const provenAge = lastReadingAt - sensor.activatedAt - SENSOR_LIFETIME_PROMOTION_GRACE_MS;
  return (
    SENSOR_LIFETIME_CANDIDATES_MS.find((candidate) => candidate > provenAge) ??
    SENSOR_LIFETIME_CANDIDATES_MS[SENSOR_LIFETIME_CANDIDATES_MS.length - 1]
  );
}

/** Epoch ms at which the sensor stops producing readings. */
export function sensorExpiresAt(sensor: SensorInfo, lastReadingAt: number | null = null): number {
  return sensor.activatedAt + sensorLifetimeMs(sensor, lastReadingAt);
}

/** Epoch ms at which warm-up ends and the first reading becomes available. */
export function sensorWarmUpEndsAt(sensor: SensorInfo): number {
  return sensor.activatedAt + sensor.warmUpMinutes * 60_000;
}

/** Sensor life left in ms; 0 once expired. */
export function sensorRemainingMs(
  sensor: SensorInfo,
  lastReadingAt: number | null = null,
  now: number = Date.now(),
): number {
  return Math.max(0, sensorExpiresAt(sensor, lastReadingAt) - now);
}

/** Fraction of the sensor's life still remaining, 0..1. */
export function sensorRemainingFraction(
  sensor: SensorInfo,
  lastReadingAt: number | null = null,
  now: number = Date.now(),
): number {
  return sensorRemainingMs(sensor, lastReadingAt, now) / sensorLifetimeMs(sensor, lastReadingAt);
}

/** True while the sensor is still warming up (worn, but not yet reading). */
export function sensorIsWarmingUp(sensor: SensorInfo, now: number = Date.now()): boolean {
  return now < sensorWarmUpEndsAt(sensor);
}

/** Start warning about an upcoming sensor change this far ahead of expiry. */
export const SENSOR_WARN_MS = 2 * 24 * 3600_000;

/** True once the sensor is expired or close enough that a change is due. */
export function sensorNeedsAttention(
  sensor: SensorInfo,
  lastReadingAt: number | null = null,
  now: number = Date.now(),
): boolean {
  return sensorRemainingMs(sensor, lastReadingAt, now) <= SENSOR_WARN_MS;
}

/** Everything the sensor panel needs, resolved against the same lifetime. */
export type SensorStatus = {
  /** Best-known expiry: exact when `pt` is calibrated, inferred otherwise. */
  expiresAt: number;
  remainingMs: number;
  /** Life left as 0..1, for the progress bar. */
  fraction: number;
  /** Only true when the sensor is both past expiry AND no longer reporting. */
  expired: boolean;
  /** Still reporting despite outliving every known wear duration. */
  pastEstimate: boolean;
  needsAttention: boolean;
  warmingUp: boolean;
};

/**
 * Resolves the sensor panel's state in one pass.
 *
 * `lastReadingAt` is the authority here: a sensor that is still producing
 * fresh readings is by definition not expired, no matter what the computed
 * expiry says. That keeps the widget from contradicting the live value shown
 * right next to it.
 */
export function sensorStatus(
  sensor: SensorInfo,
  lastReadingAt: number | null,
  now: number = Date.now(),
): SensorStatus {
  const expiresAt = sensorExpiresAt(sensor, lastReadingAt);
  const remainingMs = Math.max(0, expiresAt - now);
  const readingIsFresh =
    lastReadingAt !== null && now - lastReadingAt <= STALE_MINUTES * 60_000;
  const pastExpiry = remainingMs <= 0;
  return {
    expiresAt,
    remainingMs,
    fraction: remainingMs / sensorLifetimeMs(sensor, lastReadingAt),
    expired: pastExpiry && !readingIsFresh,
    pastEstimate: pastExpiry && readingIsFresh,
    needsAttention: remainingMs <= SENSOR_WARN_MS,
    warmingUp: sensorIsWarmingUp(sensor, now),
  };
}

/** Break a duration into whole days / hours / minutes for display. */
export function splitDuration(ms: number): { days: number; hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
  };
}
