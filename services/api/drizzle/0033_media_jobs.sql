CREATE TABLE "media_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"bytes" integer NOT NULL,
	"parts_total" integer NOT NULL,
	"parts_received" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"stage" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"duration_sec" integer,
	"has_video" boolean DEFAULT false NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"title" text,
	"source_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_job" ADD CONSTRAINT "media_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_job_user_idx" ON "media_job" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_job_status_idx" ON "media_job" USING btree ("status","updated_at");
--> statement-breakpoint
-- Video to slides (2026-10-29): 3 credits per started minute of video or audio, on every tier (read_video). Seeds are insert-if-missing, so existing databases need this row.
INSERT INTO credit_cost (id, action, tier, credits) VALUES
  ('read_video-starter', 'read_video', 'starter', 3), ('read_video-premium', 'read_video', 'premium', 3), ('read_video-frontier', 'read_video', 'frontier', 3)
ON CONFLICT DO NOTHING;
