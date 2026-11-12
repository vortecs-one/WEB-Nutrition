/** Tokens minted per kilocalorie burned (1:1 for now). */
export const TOKENS_PER_KCAL = 1;

/** Tokens earned for `burnedKcal` of logged workouts. Never negative. */
export function tokensFromBurnedKcal(burnedKcal: number): number {
  if (!Number.isFinite(burnedKcal) || burnedKcal <= 0) return 0;
  return burnedKcal * TOKENS_PER_KCAL;
}
