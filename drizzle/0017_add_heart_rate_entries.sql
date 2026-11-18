-- Daily heart rate typed in by the user: kind = 'heart_rate', value = bpm
-- (30–250). One row per day, replaced on each save like sleep and stress.
ALTER TABLE "day_log_entries" DROP CONSTRAINT IF EXISTS "day_log_entries_value_check";
ALTER TABLE "day_log_entries" ADD CONSTRAINT "day_log_entries_value_check" CHECK (
  "value" IS NULL
  OR ("kind" = 'sleep' AND "value" BETWEEN 0 AND 1440)
  OR ("kind" = 'stress' AND "value" BETWEEN 1 AND 5)
  OR ("kind" = 'weight' AND "value" BETWEEN 20000 AND 400000)
  OR ("kind" = 'heart_rate' AND "value" BETWEEN 30 AND 250)
);
