CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "review_rating_range" CHECK ("review"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_user_uq" ON "review" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_status_idx" ON "review" USING btree ("status","created_at");