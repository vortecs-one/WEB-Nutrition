export type PulseSample = { ms: number; value: number };
export const CAPTURE_MS = 16_000;

// Use elapsed time, not a nominal camera FPS: mobile cameras vary their frame rate.
function dominantBpm(samples: PulseSample[]) {
  const step = 40;
  const values: number[] = [];
  let right = 1;
  for (let ms = samples[0].ms; ms < samples.at(-1)!.ms; ms += step) {
    while (samples[right].ms < ms) right++;
    const a = samples[right - 1], b = samples[right];
    if (b.ms - a.ms > 180 || b.ms <= a.ms) return null;
    values.push(a.value + (b.value - a.value) * (ms - a.ms) / (b.ms - a.ms));
  }
  // Remove the slowly changing baseline from exposure and finger pressure.
  const centered = values.slice(12, -12).map((v, i) =>
    v - values.slice(i, i + 25).reduce((sum, x) => sum + x, 0) / 25,
  );
  const power = centered.reduce((sum, x) => sum + x * x, 0);
  if (!centered.length || power / centered.length < 0.025 ** 2) return null;
  let best = 0, strength = 0;
  for (let bpm = 45; bpm <= 180; bpm++) {
    const omega = 2 * Math.PI * bpm * step / 60_000;
    let sin = 0, cos = 0;
    for (let i = 0; i < centered.length; i++) {
      sin += centered[i] * Math.sin(omega * i);
      cos += centered[i] * Math.cos(omega * i);
    }
    const fraction = 2 * (sin * sin + cos * cos) / (centered.length * power);
    if (fraction > strength) { best = bpm; strength = fraction; }
  }
  return strength >= 0.5 ? best : null;
}

export function estimatePulse(samples: PulseSample[]): number | null {
  if (samples.length < 180) return null;
  const start = samples[0].ms, span = samples.at(-1)!.ms - start;
  if (span < CAPTURE_MS) return null;
  const middle = start + span / 2;
  const halves = [samples.filter(s => s.ms < middle), samples.filter(s => s.ms >= middle)];
  if (halves.some(half => half.length < 2)) return null;
  const [first, second] = halves.map(dominantBpm);
  if (!first || !second || Math.abs(first - second) > 6) return null;
  return dominantBpm(samples);
}
