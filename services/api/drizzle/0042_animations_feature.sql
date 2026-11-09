-- Object animations + Morph are a Gold and Premium feature (flag `animations`). Seeds never overwrite, so an existing database gets the flag here; every other plan is off.
UPDATE "plan" SET "features" = jsonb_set("features", '{animations}', 'true'::jsonb) WHERE "id" IN ('gold', 'premium');
--> statement-breakpoint
UPDATE "plan" SET "features" = jsonb_set("features", '{animations}', 'false'::jsonb) WHERE "id" NOT IN ('gold', 'premium');
