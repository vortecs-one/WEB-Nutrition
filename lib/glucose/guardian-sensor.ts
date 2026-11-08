// lib/glucose/guardian-sensor.ts
//
// Guardian 3 sensor lifecycle, estimated from imported CareLink readings.
// The CSV export carries no device status (sensor start, transmitter
// battery, calibrations), but a sensor change always leaves a visible hole
// in the readings: the old sensor stops, the new one is inserted and warms
// up for up to two hours before its first value. The first reading after
// the most recent such gap marks the current sensor.

import type { SensorInfo } from "./types";

/** Guardian 3 sensors are approved for 7 days of wear. */
export const GUARDIAN3_LIFETIME_MS = 7 * 24 * 3600_000;
/** Guardian 3 warm-up before the first reading. */
export const GUARDIAN3_WARMUP_MINUTES = 120;
/**
 * Smallest gap treated as a sensor change. Shorter gaps are signal loss
 * (pump out of range, swimming), which a warm-up alone already exceeds.
 */
export const GUARDIAN3_CHANGE_GAP_MS = 90 * 60_000;
/** How far back to look: one full wear period plus margin. */
export const GUARDIAN3_LOOKBACK_MS = GUARDIAN3_LIFETIME_MS + 24 * 3600_000;

/**
 * Estimates the current Guardian 3 sensor from reading timestamps (epoch ms,
 * ascending). Returns null when the window holds no sensor-change gap — the
 * start would be a guess, and a wrong expiry is worse than none.
 */
export function estimateGuardianSensor(dates: number[]): SensorInfo | null {
  for (let i = dates.length - 1; i > 0; i--) {
    const previous = dates[i - 1];
    const first = dates[i];
    if (first - previous < GUARDIAN3_CHANGE_GAP_MS) continue;
    // Inserted at most one warm-up before its first value, and never before
    // the old sensor's last reading.
    const activatedAt = Math.max(previous, first - GUARDIAN3_WARMUP_MINUTES * 60_000);
    return {
      serialNumber: null,
      activatedAt,
      warmUpMinutes: Math.round((first - activatedAt) / 60_000),
      productType: null,
      lifetimeMs: GUARDIAN3_LIFETIME_MS,
      estimated: true,
    };
  }
  return null;
}
