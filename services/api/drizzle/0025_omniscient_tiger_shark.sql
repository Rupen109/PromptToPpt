CREATE TABLE "brand_kit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"primary_color" text,
	"accent_color" text,
	"extra_colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"heading_font" text,
	"body_font" text,
	"logo_asset_id" text,
	"logo_aspect" numeric(8, 3),
	"source_url" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kit_image" (
	"id" text PRIMARY KEY NOT NULL,
	"kit_id" text NOT NULL,
	"user_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"name" text NOT NULL,
	"aspect" numeric(8, 3) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit_image" ADD CONSTRAINT "brand_kit_image_kit_id_brand_kit_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."brand_kit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_kit_user_idx" ON "brand_kit" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_kit_default_uq" ON "brand_kit" USING btree ("user_id") WHERE "brand_kit"."is_default";--> statement-breakpoint
CREATE INDEX "brand_kit_image_kit_idx" ON "brand_kit_image" USING btree ("kit_id");