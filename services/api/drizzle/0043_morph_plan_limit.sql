-- Morph animation is a Gold and Premium feature with a monthly allowance of AI-built Morph decks (Gold 10, Premium 30). It replaces the single `animations` flag:
-- object effects and the basic transitions are now on every plan. Seeds never overwrite, so existing databases are updated here.
UPDATE "plan" SET "features" = ("features" - 'animations') || jsonb_build_object('morph', "id" IN ('gold', 'premium'), 'morphDecksPerMonth', CASE "id" WHEN 'gold' THEN 10 WHEN 'premium' THEN 30 ELSE 0 END);
