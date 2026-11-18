-- Live CareLink (Medtronic) connection — the CarePartner cloud API used by
-- the MiniMed / CareLink Connect apps (unofficial, same approach as
-- nightscout-connect "minimedcarelink" and carelink-python-client).
--
-- Login is a one-time Auth0 sign-in done by the owner in their own browser
-- (Medtronic shows a captcha, so it can't be automated). After that we only
-- keep a rotating refresh token, encrypted at rest (AES-GCM, key derived from
-- NEXTAUTH_SECRET). The cron routes refresh it twice a day so it never goes
-- idle long enough to expire.
--
-- Live readings are upserted into the existing carelink_readings table, so
-- history keeps building past CareLink's 24 h window and coexists with CSV
-- imports (`origin` tells them apart).

ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_access_token" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_refresh_token" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_token_expires" timestamp with time zone;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_client_id" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_region" varchar(10);
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_role" varchar(30);
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_patient_name" text;
-- One-time PKCE state for the pending sign-in (cleared once completed).
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_pending_state" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_pending_verifier" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_pending_at" timestamp with time zone;
-- Short lease so concurrent polls never refresh (and burn) the same
-- rotating refresh token twice.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_refresh_lock_until" timestamp with time zone;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_last_sync_at" timestamp with time zone;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_last_refresh_at" timestamp with time zone;
-- Set when Medtronic rejects the refresh token: the owner must sign in again.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_needs_reconnect" boolean NOT NULL DEFAULT false;
-- Latest live status (trend, sensor life, limits, pump) so polls inside the
-- 5-minute upload cycle are served from the DB instead of Medtronic.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_snapshot" jsonb;

ALTER TABLE "carelink_readings" ADD COLUMN IF NOT EXISTS "origin" varchar(10) NOT NULL DEFAULT 'csv';
