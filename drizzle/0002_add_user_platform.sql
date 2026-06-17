ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "platform" varchar(100) NOT NULL DEFAULT 'app-thruxion';
