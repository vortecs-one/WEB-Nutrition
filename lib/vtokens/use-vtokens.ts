"use client";

import useSWR from "swr";
import { getVTokenBalance } from "./actions";
import { VTOKENS_WALLET_KEY, type VTokenBalance } from "./types";

// The user's v-healthy wallet balance. Replace the fetcher with a chain wallet
// read when the coin goes on-chain; keep the `VTokenBalance` shape.
export function useVTokens(): VTokenBalance {
  const { data, error, isLoading } = useSWR(
    VTOKENS_WALLET_KEY,
    () => getVTokenBalance(),
    { revalidateOnFocus: false },
  );

  return {
    amount: data ?? 0,
    source: "ledger",
    decimals: 0,
    loading: isLoading,
    error: Boolean(error) || (!isLoading && data == null),
  };
}
