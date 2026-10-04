CREATE TABLE "model_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text NOT NULL,
	"vendor" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"access_tier" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"context_window" integer DEFAULT 128000 NOT NULL,
	"input_per_mtok_usd" numeric(14, 6) NOT NULL,
	"output_per_mtok_usd" numeric(14, 6) NOT NULL,
	"cached_input_per_mtok_usd" numeric(14, 6),
	"per_image_usd" numeric(14, 6),
	"pricing_source_url" text NOT NULL,
	"pricing_verified_on" text NOT NULL,
	"pricing_note" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"environments" text[] NOT NULL,
	"route_fast" integer,
	"route_quality" integer,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD COLUMN "provider_reported_cost_usd" numeric(14, 8);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "country" text;--> statement-breakpoint
CREATE UNIQUE INDEX "model_catalog_provider_model_uq" ON "model_catalog" USING btree ("provider","model_id");