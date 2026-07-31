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

/** Every current FreeStyle Libre sensor (2 / 3 / 14-day) runs for 14 days. */
export const SENSOR_LIFETIME_MS = 14 * 24 * 3600_000;

/** Epoch ms at which the sensor stops producing readings. */
export function sensorExpiresAt(sensor: SensorInfo): number {
  return sensor.activatedAt + SENSOR_LIFETIME_MS;
}

/** Epoch ms at which warm-up ends and the first reading becomes available. */
export function sensorWarmUpEndsAt(sensor: SensorInfo): number {
  return sensor.activatedAt + sensor.warmUpMinutes * 60_000;
}

/** Sensor life left in ms; 0 once expired. */
export function sensorRemainingMs(sensor: SensorInfo, now: number = Date.now()): number {
  return Math.max(0, sensorExpiresAt(sensor) - now);
}

/** Fraction of the sensor's life still remaining, 0..1. */
export function sensorRemainingFraction(sensor: SensorInfo, now: number = Date.now()): number {
  return sensorRemainingMs(sensor, now) / SENSOR_LIFETIME_MS;
}

/** True while the sensor is still warming up (worn, but not yet reading). */
export function sensorIsWarmingUp(sensor: SensorInfo, now: number = Date.now()): boolean {
  return now < sensorWarmUpEndsAt(sensor);
}

/** Start warning about an upcoming sensor change this far ahead of expiry. */
export const SENSOR_WARN_MS = 2 * 24 * 3600_000;

/** True once the sensor is expired or close enough that a change is due. */
export function sensorNeedsAttention(sensor: SensorInfo, now: number = Date.now()): boolean {
  return sensorRemainingMs(sensor, now) <= SENSOR_WARN_MS;
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
