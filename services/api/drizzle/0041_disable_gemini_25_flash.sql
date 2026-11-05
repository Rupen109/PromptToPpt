-- Gemini 2.5 Flash is closed to new Google accounts: every call to it failed with NOT_FOUND and was retried on the next model (1,041 wasted calls in the real-Gemini load test)
UPDATE "model_catalog" SET "enabled" = false WHERE "id" = 'vertex:gemini-2.5-flash';
