CREATE TABLE "ai_assist_request" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"presentation_id" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"expectations" jsonb NOT NULL,
	"reservations" jsonb NOT NULL,
	"base_version" integer NOT NULL,
	"results" jsonb,
	"refunded_refs" jsonb,
	"client_report" jsonb,
	"mismatches" integer DEFAULT 0 NOT NULL,
	"trigger" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "ai_assist_request_status_idx" ON "ai_assist_request" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ai_assist_request_pres_idx" ON "ai_assist_request" USING btree ("presentation_id");