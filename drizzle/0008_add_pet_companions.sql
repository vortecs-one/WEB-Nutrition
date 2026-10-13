-- One virtual companion per user. character_id is validated server-side
-- against the public-domain catalog in lib/pets/characters.ts.
CREATE TABLE IF NOT EXISTS "pet_companions" (
  "user_key" text PRIMARY KEY,
  "character_id" varchar(40) NOT NULL,
  "nickname" varchar(24),
  "mood" varchar(16) NOT NULL DEFAULT 'neutral',
  "adopted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pet_companions_mood_check" CHECK (
    "mood" IN ('happy', 'calm', 'neutral', 'worried', 'sad', 'proud', 'sleepy')
  )
);
