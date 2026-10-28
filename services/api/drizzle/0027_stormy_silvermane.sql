CREATE TABLE "share_view" (
	"id" text PRIMARY KEY NOT NULL,
	"presentation_id" text NOT NULL,
	"link_id" text NOT NULL,
	"visitor_hash" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"max_slide" integer DEFAULT 0 NOT NULL,
	"slide_count" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"slide_ms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"device" text DEFAULT 'computer' NOT NULL,
	"country" text,
	"referrer_host" text
);
--> statement-breakpoint
ALTER TABLE "share_view" ADD CONSTRAINT "share_view_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_view" ADD CONSTRAINT "share_view_link_id_share_link_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."share_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_view_deck_idx" ON "share_view" USING btree ("presentation_id","started_at");--> statement-breakpoint
CREATE INDEX "share_view_visitor_idx" ON "share_view" USING btree ("link_id","visitor_hash","last_seen_at");