-- Email of the sensor owner a glucose_settings row belongs to, so health
-- watchers (read-only remote access) can find the owner's row. The app stamps
-- it on the owner's next settings load or save; existing rows start NULL.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "owner_email" text;
