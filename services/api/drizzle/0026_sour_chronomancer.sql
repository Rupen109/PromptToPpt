CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "comment_seen" (
	"user_id" text NOT NULL,
	"presentation_id" text NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	"last_mention_mail_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "comment_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"presentation_id" text NOT NULL,
	"slide_id" text NOT NULL,
	"x" numeric(6, 5),
	"y" numeric(6, 5),
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_thread_id_comment_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."comment_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_seen" ADD CONSTRAINT "comment_seen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_seen" ADD CONSTRAINT "comment_seen_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_thread" ADD CONSTRAINT "comment_thread_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_thread_idx" ON "comment" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_seen_uq" ON "comment_seen" USING btree ("user_id","presentation_id");--> statement-breakpoint
CREATE INDEX "comment_thread_deck_idx" ON "comment_thread" USING btree ("presentation_id","status");