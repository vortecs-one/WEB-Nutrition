-- Generic integer value for day-log entries that are not meals/water:
--   kind = 'sleep'  -> minutes slept (0-1440)
--   kind = 'stress' -> self-reported level (1-5)
-- Ranges are enforced in lib/day-log/actions.ts and by this CHECK.
ALTER TABLE "day_log_entries" ADD COLUMN IF NOT EXISTS "value" integer;

ALTER TABLE "day_log_entries" DROP CONSTRAINT IF EXISTS "day_log_entries_value_check";
ALTER TABLE "day_log_entries" ADD CONSTRAINT "day_log_entries_value_check" CHECK (
  "value" IS NULL
  OR ("kind" = 'sleep' AND "value" BETWEEN 0 AND 1440)
  OR ("kind" = 'stress' AND "value" BETWEEN 1 AND 5)
);
