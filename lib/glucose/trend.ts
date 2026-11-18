import type { GlucoseReading, TrendDirection } from "./types";

// Directions a source can report when it has no real trend to give.
const NO_TREND: ReadonlySet<TrendDirection> = new Set([
  "NONE",
  "NOT COMPUTABLE",
  "RATE OUT OF RANGE",
]);

// Rate of change is measured over ~15 minutes, like the CGM apps do. Readings
// closer than 5 minutes are too noisy to call a trend; a gap of more than 20
// minutes means data is missing and no trend should be claimed.
const LOOKBACK_MS = 15 * 60_000;
const MIN_SPAN_MS = 5 * 60_000;
const MAX_SPAN_MS = 20 * 60_000;

// mg/dL per minute → direction, using the Dexcom/Nightscout bands that the
// LibreLink and CareLink arrows follow too.
function directionForRate(rate: number): TrendDirection {
  if (rate > 3) return "DoubleUp";
  if (rate > 2) return "SingleUp";
  if (rate > 1) return "FortyFiveUp";
  if (rate >= -1) return "Flat";
  if (rate >= -2) return "FortyFiveDown";
  if (rate >= -3) return "SingleDown";
  return "DoubleDown";
}

export function hasTrend(direction: TrendDirection): boolean {
  return !NO_TREND.has(direction);
}

/**
 * Fills in a trend direction for every reading the source sent without one
 * (CareLink exports never carry it), from the change against the reading
 * ~15 minutes earlier. Directions reported by the source are kept as-is.
 * Expects readings sorted oldest → newest.
 */
export function withDerivedTrends(readings: GlucoseReading[]): GlucoseReading[] {
  let base = 0;
  return readings.map((r, i) => {
    while (base < i && r.date - readings[base].date > LOOKBACK_MS) base++;
    if (hasTrend(r.direction)) return r;

    // Prefer the reading just inside the lookback window; fall back to the
    // one just outside it when the window holds nothing old enough.
    let ref = base < i ? readings[base] : null;
    if ((!ref || r.date - ref.date < MIN_SPAN_MS) && base > 0) ref = readings[base - 1];
    if (!ref) return r;

    const span = r.date - ref.date;
    if (span < MIN_SPAN_MS || span > MAX_SPAN_MS) return r;

    const rate = (r.sgv - ref.sgv) / (span / 60_000);
    return { ...r, direction: directionForRate(rate) };
  });
}
