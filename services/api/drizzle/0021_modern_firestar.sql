CREATE TABLE "ai_chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"presentation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chat_message" ADD CONSTRAINT "ai_chat_message_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chat_deck_idx" ON "ai_chat_message" USING btree ("presentation_id","created_at");