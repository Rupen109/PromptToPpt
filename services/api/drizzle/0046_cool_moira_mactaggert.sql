CREATE TABLE "morph_match_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"prompt_hash" text NOT NULL,
	"topic" text NOT NULL,
	"category" text,
	"language" text DEFAULT 'en' NOT NULL,
	"mode" text NOT NULL,
	"template_id" text,
	"confidence" numeric(4, 2) NOT NULL,
	"reason" text NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"used_template" text,
	"used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "morph_match_log" ADD CONSTRAINT "morph_match_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "morph_match_log_created_idx" ON "morph_match_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "morph_match_log_user_hash_idx" ON "morph_match_log" USING btree ("user_id","prompt_hash","created_at");