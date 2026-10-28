CREATE TABLE "presentation_member" (
	"id" text PRIMARY KEY NOT NULL,
	"presentation_id" text NOT NULL,
	"email" text NOT NULL,
	"email_canonical" text NOT NULL,
	"user_id" text,
	"role" text DEFAULT 'editor' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "presentation_member_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "share_link" (
	"id" text PRIMARY KEY NOT NULL,
	"presentation_id" text NOT NULL,
	"created_by" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "share_link_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "presentation_member" ADD CONSTRAINT "presentation_member_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_member" ADD CONSTRAINT "presentation_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_member" ADD CONSTRAINT "presentation_member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_presentation_id_presentation_id_fk" FOREIGN KEY ("presentation_id") REFERENCES "public"."presentation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_link" ADD CONSTRAINT "share_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_member_email_uq" ON "presentation_member" USING btree ("presentation_id","email_canonical");--> statement-breakpoint
CREATE INDEX "presentation_member_user_idx" ON "presentation_member" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "share_link_live_uq" ON "share_link" USING btree ("presentation_id") WHERE "share_link"."revoked_at" is null;