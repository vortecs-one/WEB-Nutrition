-- Extended nutrients for logged meals (nullable, backward-compatible).
-- Grams, except sodium which is stored in milligrams.
ALTER TABLE "day_log_entries" ADD COLUMN IF NOT EXISTS "saturated_fat" integer;
ALTER TABLE "day_log_entries" ADD COLUMN IF NOT EXISTS "sugars" integer;
ALTER TABLE "day_log_entries" ADD COLUMN IF NOT EXISTS "fiber" integer;
ALTER TABLE "day_log_entries" ADD COLUMN IF NOT EXISTS "sodium" integer;
