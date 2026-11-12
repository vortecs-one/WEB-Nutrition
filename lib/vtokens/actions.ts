"use server";

import { auth } from "@/auth";
import { getLedgerBalance, syncActivityEarnings } from "./ledger";

// Same per-user key as the day log: Thruxion human_id, falling back to email.
async function getUserKey(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as
    | { humanId?: string | null; email?: string | null }
    | undefined;
  return user?.humanId ?? user?.email ?? null;
}

// The signed-in user's wallet balance. Re-syncs workout rewards first so
// history logged before the wallet existed is credited and drift self-heals.
export async function getVTokenBalance(): Promise<number | null> {
  const userKey = await getUserKey();
  if (!userKey) return null;

  await syncActivityEarnings(userKey);
  return getLedgerBalance(userKey);
}
