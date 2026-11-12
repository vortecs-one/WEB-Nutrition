// Placeholder for the H2H token wallet. There is no earning logic yet, so the
// balance is always 0. When the real logic exists, replace this hook's body
// (mirroring `lib/vtokens/use-vtokens.ts`) and the UI will not need changes.
export interface H2HTokensState {
  amount: number;
  decimals: number;
  loading: boolean;
  error: boolean;
}

const EMPTY_WALLET: H2HTokensState = {
  amount: 0,
  decimals: 0,
  loading: false,
  error: false,
};

export function useH2HTokens(): H2HTokensState {
  return EMPTY_WALLET;
}
