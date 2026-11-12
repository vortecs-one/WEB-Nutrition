// v-healthy tokens: the wallet balance a user accumulates by being active.
//
// Phase 1 (now): a database ledger (`vtoken_ledger`). Workouts credit 1 token
// per kcal burned, one reward row per day; spends and transfers will be extra
// ledger rows. Phase 2 (later): backed by the team's own on-chain coin. The UI
// only reads a `VTokenBalance`, so swapping the source (a chain wallet API)
// means changing `use-vtokens.ts` alone.

export type VTokenSource = "ledger" | "chain";

export type VTokenBalance = {
  /** Tokens currently in the wallet (lifetime earnings minus spends). */
  amount: number;
  /** Where `amount` comes from. */
  source: VTokenSource;
  /** Decimal places the UI should show (0 now; chain tokens are fractional). */
  decimals: number;
  /** The balance is still being read. */
  loading: boolean;
  /** The balance could not be read, so `amount` must not be shown. */
  error: boolean;
};

/** SWR cache key of the wallet balance; revalidate it after a reward changes. */
export const VTOKENS_WALLET_KEY = "vtokens-wallet";
