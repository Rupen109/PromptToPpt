-- "Which of these best describes you?" (asked once on the first visit; owner, 2026-11-26)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "persona" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "persona_at" timestamp;
