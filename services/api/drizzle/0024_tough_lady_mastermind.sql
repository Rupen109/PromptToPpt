ALTER TABLE "share_link" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "share_link" ADD COLUMN "expires_at" timestamp;