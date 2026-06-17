CREATE TABLE IF NOT EXISTS "handoff_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "email" text NOT NULL,
  "user_id" text,
  "human_id" text,
  "name" text,
  "role" text,
  "platform" varchar(100),
  "used" boolean NOT NULL DEFAULT false,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "handoff_tokens_expires_at_idx" ON "handoff_tokens" ("expires_at");
