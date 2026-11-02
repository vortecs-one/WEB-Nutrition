-- Body data for the calorie formulas (lib/health-formulas.ts): one row per
-- user, same `user_key` as day_log_entries. Birth date and sex are prefilled
-- from Thruxion until the user saves their own. Weight is not stored here:
-- it's the latest weigh-in in day_log_entries (kind = 'weight').
CREATE TABLE IF NOT EXISTS "body_profiles" (
  "id" serial PRIMARY KEY,
  "user_key" text NOT NULL UNIQUE,
  "sex" varchar(10) CHECK ("sex" IN ('male', 'female')),
  "birth_date" date,
  "height_cm" integer CHECK ("height_cm" BETWEEN 100 AND 250),
  "activity_level" varchar(20) NOT NULL DEFAULT 'light'
    CHECK ("activity_level" IN ('sedentary', 'light', 'moderate', 'active', 'veryActive')),
  "goal" varchar(10) NOT NULL DEFAULT 'maintain'
    CHECK ("goal" IN ('lose', 'maintain', 'gain')),
  -- Weekly weight change aimed for, in grams (250, 500 or 750).
  "weekly_rate_g" integer NOT NULL DEFAULT 250
    CHECK ("weekly_rate_g" IN (250, 500, 750)),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Daily weigh-ins: kind = 'weight', value = grams (20–400 kg).
ALTER TABLE "day_log_entries" DROP CONSTRAINT IF EXISTS "day_log_entries_value_check";
ALTER TABLE "day_log_entries" ADD CONSTRAINT "day_log_entries_value_check" CHECK (
  "value" IS NULL
  OR ("kind" = 'sleep' AND "value" BETWEEN 0 AND 1440)
  OR ("kind" = 'stress' AND "value" BETWEEN 1 AND 5)
  OR ("kind" = 'weight' AND "value" BETWEEN 20000 AND 400000)
);
