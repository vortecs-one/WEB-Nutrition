-- v-healthy token wallet. Append-style ledger: a user's balance is the sum of
-- their rows, so spending, transfers and the future on-chain bridge are just
-- more rows (negative amount = tokens leaving the wallet).
--
-- Workout rewards use kind = 'earn_activity' with ref = 'activity:YYYY-MM-DD',
-- one row per day, kept equal to that day's logged burned kcal (1 token/kcal).
-- (user_key, ref) is unique so re-syncing a day is an idempotent upsert; rows
-- with a NULL ref (spends, transfers) never conflict.
CREATE TABLE IF NOT EXISTS "vtoken_ledger" (
  "id" serial PRIMARY KEY,
  "user_key" text NOT NULL,
  "amount" numeric(24, 8) NOT NULL CHECK ("amount" <> 0),
  "kind" varchar(20) NOT NULL
    CHECK ("kind" IN ('earn_activity', 'spend', 'transfer_in', 'transfer_out', 'adjustment')),
  "ref" text,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "vtoken_ledger_user_ref_unique" UNIQUE ("user_key", "ref")
);

CREATE INDEX IF NOT EXISTS "vtoken_ledger_user_created_idx"
  ON "vtoken_ledger" ("user_key", "created_at" DESC);
