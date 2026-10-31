CREATE TABLE "post" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cover_url" text,
	"cover_alt" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"section" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_name" text,
	"source_url" text,
	"trending" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"author_name" text DEFAULT 'SlidesDone team' NOT NULL,
	"author_user_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"reading_minutes" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_kind_ok" CHECK ("post"."kind" IN ('blog','news','guide')),
	CONSTRAINT "post_status_ok" CHECK ("post"."status" IN ('draft','published'))
);
--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_kind_slug_uq" ON "post" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "post_public_idx" ON "post" USING btree ("kind","status","published_at");
