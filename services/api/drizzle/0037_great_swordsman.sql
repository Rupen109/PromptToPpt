ALTER TABLE "plan_price" ADD COLUMN "provider_amount_minor" integer;
--> statement-breakpoint
-- Plans v5 (the owner's spec, 2026-11-03; docs/PLANS_AND_FEATURES_V5.md). Seeds never overwrite, so an existing database gets the new values here; a NEW plan (premium) and new catalogue rows are inserted by the seed that runs after migrations.
-- 1. plans: limits, credits and features
UPDATE "plan" SET "name" = 'Starter', "sort_order" = 0, "monthly_credits" = 100, "max_slides" = 10, "max_presentations_per_month" = 5, "max_images_per_presentation" = 0, "max_images_per_month" = 0, "features" = '{"watermark":true,"exportFormats":[],"aiEdits":false,"advancedEditor":true,"premiumTemplates":false,"advancedSharing":false,"modelTiers":["starter"],"brandKit":false,"knowledgeBase":false,"support":"community","speed":"standard","projects":false,"askDeck":false,"webData":"none","livePreview":false,"modelChoice":false,"fixedModels":["gemini-3.6-flash","gemini-2.5-flash"]}'::jsonb WHERE "id" = 'starter';
--> statement-breakpoint
UPDATE "plan" SET "name" = 'Pro', "sort_order" = 1, "monthly_credits" = 900, "max_slides" = 15, "max_presentations_per_month" = 15, "max_images_per_presentation" = 10, "max_images_per_month" = 60, "features" = '{"watermark":false,"exportFormats":["pdf","pptx","jpg"],"aiEdits":true,"advancedEditor":true,"premiumTemplates":true,"advancedSharing":true,"modelTiers":["starter"],"brandKit":false,"knowledgeBase":false,"support":"whatsapp","speed":"fast","projects":true,"askDeck":true,"webData":"wikipedia","livePreview":true,"modelChoice":false,"fixedModels":["gemini-3.6-flash","gemini-3.8-flash"]}'::jsonb WHERE "id" = 'pro';
--> statement-breakpoint
UPDATE "plan" SET "name" = 'Gold', "sort_order" = 2, "monthly_credits" = 2000, "max_slides" = 25, "max_presentations_per_month" = 50, "max_images_per_presentation" = 20, "max_images_per_month" = 100, "features" = '{"watermark":false,"exportFormats":["pptx","pdf","png","jpg","html"],"aiEdits":true,"advancedEditor":true,"premiumTemplates":true,"advancedSharing":true,"modelTiers":["starter"],"brandKit":true,"knowledgeBase":true,"support":"whatsapp","speed":"ultra","projects":true,"askDeck":true,"webData":"web","livePreview":true,"modelChoice":false,"fixedModels":["gemini-3.6-flash","gemini-3.8-flash"]}'::jsonb WHERE "id" = 'gold';
--> statement-breakpoint
-- 2. prices: new amounts; the provider (Razorpay) plan of a changed price is forgotten, so checkout creates a new one for the new amount instead of charging the old one
UPDATE "plan_price" SET "amount_minor" = 0, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'starter' AND "currency" = 'USD' AND "interval" = 'month' AND "amount_minor" <> 0;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 0, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'starter' AND "currency" = 'USD' AND "interval" = 'year' AND "amount_minor" <> 0;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 0, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'starter' AND "currency" = 'INR' AND "interval" = 'month' AND "amount_minor" <> 0;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 0, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'starter' AND "currency" = 'INR' AND "interval" = 'year' AND "amount_minor" <> 0;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 1000, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'pro' AND "currency" = 'USD' AND "interval" = 'month' AND "amount_minor" <> 1000;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 9600, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'pro' AND "currency" = 'USD' AND "interval" = 'year' AND "amount_minor" <> 9600;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 30000, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'pro' AND "currency" = 'INR' AND "interval" = 'month' AND "amount_minor" <> 30000;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 288000, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'pro' AND "currency" = 'INR' AND "interval" = 'year' AND "amount_minor" <> 288000;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 1900, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'gold' AND "currency" = 'USD' AND "interval" = 'month' AND "amount_minor" <> 1900;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 18240, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'gold' AND "currency" = 'USD' AND "interval" = 'year' AND "amount_minor" <> 18240;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 65000, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'gold' AND "currency" = 'INR' AND "interval" = 'month' AND "amount_minor" <> 65000;
--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 624000, "provider_price_id" = NULL, "provider_amount_minor" = NULL WHERE "plan_id" = 'gold' AND "currency" = 'INR' AND "interval" = 'year' AND "amount_minor" <> 624000;
--> statement-breakpoint
-- 3. credits: a slide on the premium credit class (Haiku, GLM) costs 3
UPDATE "credit_cost" SET "credits" = 2 WHERE "action" = 'generate_slide' AND "tier" = 'starter';
--> statement-breakpoint
UPDATE "credit_cost" SET "credits" = 3 WHERE "action" = 'generate_slide' AND "tier" = 'premium';
--> statement-breakpoint
UPDATE "credit_cost" SET "credits" = 12 WHERE "action" = 'generate_slide' AND "tier" = 'frontier';
--> statement-breakpoint
-- 4. models: the Gemini Flash models are the starter credit class (2 a slide); Sonnet 4.6 is frontier (12 a slide) and no longer the default of the internal 'quality' route (Gemini 3.6 is, then 3.8)
UPDATE "model_catalog" SET "access_tier" = 'starter', "updated_at" = now() WHERE "model_id" IN ('gemini-3.6-flash', 'gemini-3.8-flash', 'google/gemini-3.6-flash', 'google/gemini-3.8-flash') AND "access_tier" <> 'starter';
--> statement-breakpoint
UPDATE "model_catalog" SET "access_tier" = 'frontier', "route_quality" = NULL, "updated_at" = now() WHERE "id" = 'openrouter:anthropic/claude-sonnet-4.6';
--> statement-breakpoint
UPDATE "model_catalog" SET "route_quality" = 0, "updated_at" = now() WHERE "id" = 'openrouter:google/gemini-3.6-flash';
