-- Gemini 2.5 Flash is closed to new Google accounts: Starter's second model becomes Gemini 3.1 Flash Lite
UPDATE "plan" SET "features" = jsonb_set("features", '{fixedModels}', '["gemini-3.6-flash","gemini-3.1-flash-lite"]'::jsonb) WHERE "id" = 'starter';
