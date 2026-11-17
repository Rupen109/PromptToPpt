-- "Use a file's design" (upload a PowerPoint, build decks in its look) is a plan feature: on for Pro, Gold and Premium, off for Starter. One value per plan, editable by the owner.
-- Seeds never overwrite, so existing databases get the value here.
UPDATE "plan" SET "features" = "features" || jsonb_build_object('templateFromFile', "id" IN ('pro', 'gold', 'premium'));
