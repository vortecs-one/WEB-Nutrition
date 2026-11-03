-- Add Medtronic CareLink as a third glucose data source.
--
-- CareLink has no API (unlike Nightscout/LibreLinkUp): the only official way
-- to get data out is the CSV export from CareLink Personal's reports page
-- (see the "CareLink Personal: Guia rapida de descarga" manual, p.4/12-13).
-- So, unlike the other two sources — never persisted, always fetched live on
-- each poll — imported CareLink readings ARE stored here, in
-- carelink_readings. The unique (user_key, date) constraint makes
-- re-uploading an export with overlapping dates a safe no-op.
--
-- carelink_username / carelink_patient_id are reserved, unused placeholders
-- for a possible future automated-polling source (see project plan — it
-- would mirror the Nightscout project's own nightscout-connect
-- "minimedcarelink" source, and only if MFA allows it on the account used).
-- No login code exists yet, so no password/token column is added until then.

ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_username" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_patient_id" text;
-- Cached on the settings row (rather than queried from carelink_readings on
-- every settings read) so toClientSettings stays a synchronous row mapper
-- like it is for the other two sources. Updated by importCareLinkCsv.
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_last_import_at" timestamp with time zone;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "carelink_reading_count" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "carelink_readings" (
  "id" serial PRIMARY KEY,
  "user_key" text NOT NULL,
  "date" timestamp with time zone NOT NULL,
  "sgv" integer NOT NULL,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "carelink_readings_user_date_unique" UNIQUE ("user_key", "date")
);
