// v-healthy tokens: the reward earned by being active.
//
// Phase 1 (now): derived locally, 1 token per kcal burned in logged workouts.
// Phase 2 (later): backed by the team's own on-chain coin. The UI only reads
// a `VTokenBalance`, so swapping the source (a wallet / ledger API) means
// changing `use-vtokens.ts` alone.

export type VTokenSource = "calories" | "chain";

export type VTokenBalance = {
  /** Tokens earned today. */
  amount: number;
  /** How `amount` was produced. */
  source: VTokenSource;
  /** Decimal places the UI should show (0 now; chain tokens are fractional). */
  decimals: number;
  /** The balance is still being read (client date / day log not ready). */
  loading: boolean;
};
