import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dayLogEntries, vtokenLedger } from "@/drizzle/schema";
import { tokensFromBurnedKcal } from "./calculate";

// Server-only ledger helpers. The balance is the sum of a user's ledger rows;
// workout rewards are one "earn_activity" row per day.

const earnRef = (dateKey: string) => `activity:${dateKey}`;

// The server doesn't know the user's timezone, so allow one day past UTC today
// and refuse rewards for workouts logged further into the future.
function latestRewardableDate(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Brings the workout-reward rows in line with the burned kcal currently logged
// (1 token per kcal). Pass `dateKeys` to sync only those days, or omit it to
// sync every day (backfill + self-healing). Idempotent: only differences are
// written. Removing a workout lowers that day's reward.
export async function syncActivityEarnings(
  userKey: string,
  dateKeys?: string[],
): Promise<void> {
  const scoped = dateKeys && dateKeys.length > 0 ? dateKeys : undefined;
  if (dateKeys && !scoped) return;

  const burned = await db
    .select({
      logDate: dayLogEntries.logDate,
      kcal: sql<string>`coalesce(sum(${dayLogEntries.calories}), 0)`,
    })
    .from(dayLogEntries)
    .where(
      and(
        eq(dayLogEntries.userKey, userKey),
        eq(dayLogEntries.kind, "activity"),
        scoped ? inArray(dayLogEntries.logDate, scoped) : undefined,
      ),
    )
    .groupBy(dayLogEntries.logDate);

  const existing = await db
    .select({ ref: vtokenLedger.ref, amount: vtokenLedger.amount })
    .from(vtokenLedger)
    .where(
      and(
        eq(vtokenLedger.userKey, userKey),
        eq(vtokenLedger.kind, "earn_activity"),
        scoped
          ? inArray(vtokenLedger.ref, scoped.map(earnRef))
          : undefined,
      ),
    );

  const cutoff = latestRewardableDate();
  const target = new Map<string, number>();
  for (const row of burned) {
    const tokens = tokensFromBurnedKcal(Number(row.kcal));
    if (tokens > 0 && row.logDate <= cutoff) {
      target.set(earnRef(row.logDate), tokens);
    }
  }

  const current = new Map<string, number>();
  for (const row of existing) {
    if (row.ref) current.set(row.ref, Number(row.amount));
  }

  const toUpsert = [...target].filter(([ref, tokens]) => current.get(ref) !== tokens);
  const toDelete = [...current.keys()].filter((ref) => !target.has(ref));
  if (toUpsert.length === 0 && toDelete.length === 0) return;

  await db.transaction(async (tx) => {
    if (toUpsert.length > 0) {
      await tx
        .insert(vtokenLedger)
        .values(
          toUpsert.map(([ref, tokens]) => ({
            userKey,
            amount: String(tokens),
            kind: "earn_activity",
            ref,
          })),
        )
        .onConflictDoUpdate({
          target: [vtokenLedger.userKey, vtokenLedger.ref],
          set: { amount: sql`excluded.amount`, updatedAt: sql`now()` },
        });
    }
    if (toDelete.length > 0) {
      await tx
        .delete(vtokenLedger)
        .where(
          and(
            eq(vtokenLedger.userKey, userKey),
            inArray(vtokenLedger.ref, toDelete),
          ),
        );
    }
  });
}

export async function getLedgerBalance(userKey: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${vtokenLedger.amount}), 0)` })
    .from(vtokenLedger)
    .where(eq(vtokenLedger.userKey, userKey));
  return Number(row?.total ?? 0);
}
