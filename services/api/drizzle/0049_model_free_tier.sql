-- Local dev and QA run on FREE-tier Gemini keys (projects with no billing, so nothing can ever be charged). Only the models Google serves on that tier
-- are offered there (AI_KEY_TIER=free). Probed 2026-11-24 with both keys: 3.1 Flash-Lite, 3.6 Flash and 3.8 Flash answer; 3.1 Pro is refused with limit 0.
ALTER TABLE "model_catalog" ADD COLUMN IF NOT EXISTS "free_tier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "model_catalog" SET "free_tier" = true WHERE "id" IN ('vertex:gemini-3.1-flash-lite', 'vertex:gemini-3.6-flash', 'vertex:gemini-3.8-flash');
