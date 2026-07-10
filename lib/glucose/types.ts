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

// Client-safe settings (token intentionally excluded — it never leaves the
// server; we only tell the client whether one is stored).
export type GlucoseSettings = {
  nightscoutUrl: string;
  hasToken: boolean;
  unit: GlucoseUnit;
  lowThreshold: number;
  highThreshold: number;
  targetLow: number;
  targetHigh: number;
  enabled: boolean;
};

export type GlucoseStatus = "low" | "in-range" | "high" | "urgent";

export type GlucoseData = {
  /** Most recent reading, or null if Nightscout returned nothing. */
  current: GlucoseReading | null;
  /** Readings for the requested window, oldest first. */
  readings: GlucoseReading[];
  settings: GlucoseSettings;
};

export type GlucoseFetchResult =
  | { ok: true; data: GlucoseData }
  | { ok: false; error: "not-configured" | "unauthorized" | "unreachable" | "unknown" };

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
