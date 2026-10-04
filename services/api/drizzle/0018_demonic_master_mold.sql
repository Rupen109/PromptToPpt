CREATE TABLE "draft_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"parts" jsonb NOT NULL,
	"chars" integer NOT NULL,
	"draft_id" text,
	"source_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_attachment" ADD CONSTRAINT "draft_attachment_draft_id_prompt_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."prompt_draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_attachment_draft_idx" ON "draft_attachment" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "draft_attachment_expires_idx" ON "draft_attachment" USING btree ("expires_at");