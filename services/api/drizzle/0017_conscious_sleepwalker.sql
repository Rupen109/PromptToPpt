CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "presentation" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_user_idx" ON "project" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "presentation" ADD CONSTRAINT "presentation_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- feature flag data for existing databases (the seed only inserts missing plans): Pro and Gold may use projects, Starter may not
UPDATE "plan" SET "features" = jsonb_set("features", '{projects}', 'true'::jsonb) WHERE "id" IN ('pro', 'gold');--> statement-breakpoint
UPDATE "plan" SET "features" = jsonb_set("features", '{projects}', 'false'::jsonb) WHERE "id" = 'starter';
