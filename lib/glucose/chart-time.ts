// lib/glucose/chart-time.ts
//
// X-axis ticks for the glucose charts. The axis spans a fixed window that ends
// at the current time (see GlucoseTracker), so its labels are round local-clock
// times (5:00 PM, 7:00 PM, ...) plus one last label at the window's end.
// Pure functions only — safe to import from server and client code.

const MINUTE_MS = 60_000;

// Candidate spacings between round ticks, finest first.
const STEP_MINUTES = [15, 30, 60, 120, 180, 240, 360, 480, 720];

// A round tick this close to the end (as a fraction of the window) is dropped:
// its label would run into the end label. The end label is centered on the
// end, so half of it plus half of the neighbouring label (about a label-width
// together) must fit between them: roughly a quarter of a phone-width plot.
const END_CLEARANCE = 0.24;

// Round ticks inside [startMs, limitMs], aligned on the local clock (so zones
// with a half-hour offset still get :00 / :30 labels). The offset is taken at
// the end of the window; across a DST change the older ticks may sit an hour
// off the round marks for steps over an hour — still correct times.
function alignedTicks(startMs: number, limitMs: number, stepMs: number, offsetMs: number): number[] {
  const ticks: number[] = [];
  for (let t = Math.ceil((startMs + offsetMs) / stepMs) * stepMs - offsetMs; t <= limitMs; t += stepMs) {
    ticks.push(t);
  }
  return ticks;
}

/**
 * Tick positions (epoch ms, ascending) for a time axis over [startMs, endMs]:
 * round local-time ticks, then `endMs` itself as the final tick. The spacing
 * is the finest one for which the round ticks across the whole window (plus
 * the end tick) stay within `maxTicks` — chosen before the ticks crowding the
 * end are dropped, so the labels that remain never sit closer together than
 * that spacing.
 */
export function chartTimeTicks(startMs: number, endMs: number, maxTicks: number): number[] {
  const span = endMs - startMs;
  if (!(span > 0)) return [endMs];

  const offsetMs = -new Date(endMs).getTimezoneOffset() * MINUTE_MS;

  let stepMs = STEP_MINUTES[STEP_MINUTES.length - 1] * MINUTE_MS;
  for (const minutes of STEP_MINUTES) {
    const candidate = minutes * MINUTE_MS;
    if (alignedTicks(startMs, endMs, candidate, offsetMs).length + 1 <= maxTicks) {
      stepMs = candidate;
      break;
    }
  }
  return [...alignedTicks(startMs, endMs - span * END_CLEARANCE, stepMs, offsetMs), endMs];
}
