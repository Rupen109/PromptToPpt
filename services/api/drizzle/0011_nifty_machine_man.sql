CREATE TABLE "generated_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"presentation_id" text,
	"kind" text DEFAULT 'image' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"provider_cost_usd" numeric(14, 8) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "max_images_per_presentation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "max_images_per_month" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "generated_asset_user_idx" ON "generated_asset" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "generated_asset_deck_idx" ON "generated_asset" USING btree ("presentation_id");