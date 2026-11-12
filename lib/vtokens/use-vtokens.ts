"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "@/lib/day-log/date-key";
import { useDayLog } from "@/lib/day-log/provider";
import { tokensFromBurnedKcal } from "./calculate";
import type { VTokenBalance } from "./types";

// Today's v-healthy token balance. Replace the body with a wallet / ledger
// read when the coin goes on-chain; keep the `VTokenBalance` shape.
export function useVTokens(): VTokenBalance {
  const { burnedFor } = useDayLog();
  const [todayKey, setTodayKey] = useState("");

  // Client-only: the server has no notion of the user's local day.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only init to avoid SSR/hydration mismatch
  useEffect(() => setTodayKey(localDateKey(new Date())), []);

  if (!todayKey) {
    return { amount: 0, source: "calories", decimals: 0, loading: true };
  }

  return {
    amount: tokensFromBurnedKcal(burnedFor(todayKey)),
    source: "calories",
    decimals: 0,
    loading: false,
  };
}
