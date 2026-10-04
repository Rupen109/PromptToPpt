CREATE TABLE "ai_usage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"presentation_id" text,
	"job_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"model_version" text,
	"request_type" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"provider_cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"pricing_snapshot_id" text,
	"credit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"environment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"presentation_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"run_after" timestamp DEFAULT now() NOT NULL,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_pricing_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_per_mtok_usd" numeric(14, 6) NOT NULL,
	"output_per_mtok_usd" numeric(14, 6) NOT NULL,
	"cached_input_per_mtok_usd" numeric(14, 6),
	"per_image_usd" numeric(14, 6),
	"source_url" text NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"aspect_ratio" text DEFAULT '16:9' NOT NULL,
	"latest_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "presentation_version" (
	"id" text PRIMARY KEY NOT NULL,
	"presentation_id" text NOT NULL,
	"version" integer NOT NULL,
	"document" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"locator" text,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_document" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"status" text DEFAULT 'ready' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_pricing_snapshot_id_model_pricing_snapshot_id_fk" FOREIGN KEY ("pricing_snapshot_id") REFERENCES "public"."model_pricing_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation" ADD CONSTRAINT "presentation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_version" ADD CONSTRAINT "presentation_version_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_chunk" ADD CONSTRAINT "source_chunk_source_id_source_document_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document" ADD CONSTRAINT "source_document_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_job_idx" ON "ai_usage_event" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_job_idem_uq" ON "generation_job" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "generation_job_queue_idx" ON "generation_job" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "pricing_lookup_idx" ON "model_pricing_snapshot" USING btree ("provider","model","captured_at");--> statement-breakpoint
CREATE INDEX "presentation_user_idx" ON "presentation" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_version_uq" ON "presentation_version" USING btree ("presentation_id","version");--> statement-breakpoint
CREATE INDEX "source_chunk_idx" ON "source_chunk" USING btree ("source_id","ordinal");--> statement-breakpoint
CREATE INDEX "source_user_idx" ON "source_document" USING btree ("user_id");