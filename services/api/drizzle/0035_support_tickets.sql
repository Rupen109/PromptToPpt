CREATE TABLE "support_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "support_ticket_status_ok" CHECK ("support_ticket"."status" IN ('new','resolved'))
);
--> statement-breakpoint
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_ticket_status_idx" ON "support_ticket" USING btree ("status","created_at");
