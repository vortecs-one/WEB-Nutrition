-- Water tracking: ml amount for kind="water" rows (nullable, backward-compatible).
ALTER TABLE "day_log_entries" ADD COLUMN IF NOT EXISTS "amount_ml" integer;
