import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePulse } from './estimate.ts';

function generate(value, hz = 25) {
  return Array.from({ length: 17 * hz }, (_, i) => {
    const ms = 1000 * i / hz + 2 * Math.sin(i);
    return { ms, value: value(ms / 1000, i) };
  });
}
const wave = (bpm, s) => Math.sin(2 * Math.PI * bpm * s / 60);
for (const bpm of [52, 72, 105, 148]) {
  test(`recovers ${bpm} BPM despite drift and variable frame timing`, () => {
    const samples = generate(s => 40 + 0.3 * s + wave(bpm, s) + 0.2 * wave(2 * bpm, s), 24);
    assert.ok(Math.abs(estimatePulse(samples) - bpm) <= 1);
  });
}
test('withholds a result on flat, irregular, missing or interrupted input', () => {
  let seed = 17;
  const noise = generate(() => (seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const samples of [[], noise, generate(() => 30), generate(s => wave(s < 8.5 ? 67 : 100, s)),
    generate(s => wave(75, s)).filter(s => s.ms < 7000 || s.ms > 7400)]) {
    assert.equal(estimatePulse(samples), null);
  }
});
