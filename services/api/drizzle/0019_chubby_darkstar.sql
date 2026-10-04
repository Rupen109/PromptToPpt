CREATE TABLE "export_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"presentation_id" text NOT NULL,
	"format" text NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"slide_count" integer,
	"bytes" integer,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"rollout_percent" integer DEFAULT 100 NOT NULL,
	"plans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "export_event_created_idx" ON "export_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "export_event_user_idx" ON "export_event" USING btree ("user_id","created_at");