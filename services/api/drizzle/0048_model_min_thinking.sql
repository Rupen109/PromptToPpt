ALTER TABLE "model_catalog" ADD COLUMN "min_thinking_budget" integer;--> statement-breakpoint
-- Owner decision 2026-11-24: customers get Gemini models only. Google AI Studio (direct) is the main route; OpenRouter serves the SAME Gemini models as a backup (AI_BACKUP_PROVIDER).
-- Gemini direct rows (AI Studio; filed under "vertex", same model ids) now serve production. Prices re-checked on the AI Studio pricing page 2026-11-24.
UPDATE "model_catalog" SET "environments" = ARRAY['development','staging','production'], "pricing_source_url" = 'https://aistudio.google.com/docs/pricing', "pricing_verified_on" = '2026-11-24', "updated_at" = now()
  WHERE "id" IN ('vertex:gemini-3.1-flash-lite','vertex:gemini-3.6-flash','vertex:gemini-3.8-flash','vertex:gemini-3.1-pro-preview','vertex:gemini-3.1-flash-lite-image','vertex:gemini-3.1-flash-image','vertex:gemini-3-pro-image');
--> statement-breakpoint
-- Gemini 3.1 Pro: Premium's "Pro AI model". Credit class premium (5 credits a slide, 2.5x Flash; it costs about 3x Flash per token). It refuses thinking 0 (probed: "only works in thinking mode"), 128 works.
UPDATE "model_catalog" SET "access_tier" = 'premium', "min_thinking_budget" = 128, "description" = 'Google''s most capable model: deeper reasoning for complex decks.', "updated_at" = now()
  WHERE "id" IN ('vertex:gemini-3.1-pro-preview','openrouter:google/gemini-3.1-pro-preview');
--> statement-breakpoint
-- Not offered to customers any more (rows kept for a later decision, switched off). Gemini 2.5 Flash: Google routes it to another model from 2026-12-01.
UPDATE "model_catalog" SET "enabled" = false, "pricing_note" = 'Switched off 2026-11-24: customers get Gemini models only (owner decision); kept for a later decision.', "updated_at" = now()
  WHERE "id" IN ('openrouter:anthropic/claude-haiku-4.5','openrouter:anthropic/claude-sonnet-4.6','openrouter:anthropic/claude-sonnet-5.5','openrouter:anthropic/claude-opus-4.6','openrouter:anthropic/claude-opus-4.8','openrouter:anthropic/claude-opus-5.5','openrouter:z-ai/glm-5.2','openrouter:z-ai/glm-5.3-flash','openrouter:google/gemini-2.5-flash');
--> statement-breakpoint
-- The backup twins (the same Gemini models through OpenRouter) are listed everywhere: they are only used where AI_BACKUP_PROVIDER=openrouter is configured (rows of a provider without a key are never offered).
UPDATE "model_catalog" SET "environments" = ARRAY['development','staging','production'], "updated_at" = now()
  WHERE "id" IN ('openrouter:google/gemini-3.1-flash-lite','openrouter:google/gemini-3.6-flash','openrouter:google/gemini-3.8-flash','openrouter:google/gemini-3.1-pro-preview','openrouter:google/gemini-3.1-flash-lite-image','openrouter:google/gemini-3.1-flash-image','openrouter:google/gemini-3-pro-image');
--> statement-breakpoint
UPDATE "credit_cost" SET "credits" = 5 WHERE "id" = 'generate_slide-premium';
--> statement-breakpoint
-- Premium writes with Gemini 3.6 Flash unless the person picks Gemini 3.1 Pro (the picker shows the credits of each).
UPDATE "plan" SET "features" = jsonb_set("features"::jsonb, '{fixedModels}', '["gemini-3.6-flash","gemini-3.8-flash"]'::jsonb) WHERE "id" = 'premium';
