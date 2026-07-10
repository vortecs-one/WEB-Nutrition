-- Add LibreLinkUp as an alternative glucose data source.
-- The user chooses between "nightscout" (existing) and "librelinkup"
-- (direct connection to Abbott's LibreLinkUp follower API).

ALTER TABLE "glucose_settings" ALTER COLUMN "nightscout_url" DROP NOT NULL;

ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "source" varchar(20) NOT NULL DEFAULT 'nightscout';
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_email" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_password" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_region" varchar(10);
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_token" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_token_expires" timestamp with time zone;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_account_id" text;
ALTER TABLE "glucose_settings" ADD COLUMN IF NOT EXISTS "libre_patient_id" text;
