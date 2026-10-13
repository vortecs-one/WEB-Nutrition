-- Daily AI photo-scan counter (per user + "__global__" row) to cap AI Gateway spend.
CREATE TABLE IF NOT EXISTS "ai_photo_scans" (
  "user_key" text NOT NULL,
  "day" date NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("user_key", "day")
);
