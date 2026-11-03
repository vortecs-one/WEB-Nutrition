-- LibreView user fields that drizzle/schema.ts has selected since commit
-- 641d681 but that no earlier migration created. Without them every
-- select() on glucose_settings fails with "column ... does not exist".
-- IF NOT EXISTS keeps this safe on databases where they were added by hand.

-- Raw LibreView user id — equals the patientId for "pat" (sensor-wearer) accounts.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_user_id" text;
-- "pat" = sensor wearer, "llu" = follower.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_account_type" varchar(10);
-- First + last name from the LibreView user object, used as display label.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_display_name" text;
