-- Pricing v2 (2026-10-02): owner-confirmed prices, re-balanced credits/tiers, image limits.
-- Seeds are insert-if-missing, so existing databases need this one-time data migration (fresh databases get the same values from the seed; every statement here must therefore also run cleanly on an EMPTY database).

UPDATE plan SET monthly_credits = 100,  max_slides = 20, max_presentations_per_month = NULL, max_images_per_presentation = 3,  max_images_per_month = 6,
  features = features || '{"aiEdits": true, "advancedSharing": false}'::jsonb WHERE id = 'starter';
--> statement-breakpoint
UPDATE plan SET monthly_credits = 3000, max_slides = 40, max_presentations_per_month = 50, max_images_per_presentation = 10, max_images_per_month = 60,
  features = features || '{"advancedSharing": true}'::jsonb WHERE id = 'pro';
--> statement-breakpoint
UPDATE plan SET monthly_credits = 12000, max_slides = 60, max_presentations_per_month = NULL, max_images_per_presentation = 20, max_images_per_month = 100,
  features = features || '{"advancedSharing": true}'::jsonb WHERE id = 'gold';
--> statement-breakpoint
INSERT INTO plan_price (id, plan_id, currency, interval, amount_minor, is_active)
SELECT v.id, v.plan_id, v.currency, v.interval, v.amount_minor, v.is_active FROM (VALUES
  ('starter-USD-month','starter','USD','month',0,true), ('starter-USD-year','starter','USD','year',0,true),
  ('starter-INR-month','starter','INR','month',0,true), ('starter-INR-year','starter','INR','year',0,true),
  ('pro-USD-month','pro','USD','month',1500,true),      ('pro-USD-year','pro','USD','year',14400,true),
  ('pro-INR-month','pro','INR','month',49900,true),     ('pro-INR-year','pro','INR','year',479000,true),
  ('gold-USD-month','gold','USD','month',3000,true),    ('gold-USD-year','gold','USD','year',28800,true),
  ('gold-INR-month','gold','INR','month',120000,true),  ('gold-INR-year','gold','INR','year',1152000,true)
) AS v(id, plan_id, currency, interval, amount_minor, is_active)
WHERE EXISTS (SELECT 1 FROM plan p WHERE p.id = v.plan_id) -- a fresh database has no plans yet when migrations run (the seed creates them, with these same prices)
ON CONFLICT (plan_id, currency, interval) DO UPDATE SET amount_minor = EXCLUDED.amount_minor, is_active = true;
--> statement-breakpoint
INSERT INTO credit_cost (id, action, tier, credits) VALUES
  ('image-starter','image','starter',20), ('image-premium','image','premium',50), ('image-frontier','image','frontier',150)
ON CONFLICT (action, tier) DO UPDATE SET credits = EXCLUDED.credits;
--> statement-breakpoint
-- Opus-class ($5/$25) models move Pro → Gold: 5 credits/slide does not cover them on India Pro pricing.
UPDATE model_catalog SET access_tier = 'frontier', sort_order = 33 WHERE id = 'openrouter:anthropic/claude-opus-4.6';
--> statement-breakpoint
UPDATE model_catalog SET access_tier = 'frontier', sort_order = 34 WHERE id = 'openrouter:anthropic/claude-opus-4.8';
--> statement-breakpoint
-- Image models on (probed OK on the local Vertex key; per-image USD is a conservative 1K estimate).
INSERT INTO model_catalog (id, provider, model_id, display_name, vendor, description, access_tier, kind, context_window, input_per_mtok_usd, output_per_mtok_usd, per_image_usd, pricing_source_url, pricing_verified_on, pricing_note, enabled, environments, sort_order) VALUES
  ('vertex:gemini-3.1-flash-lite-image','vertex','gemini-3.1-flash-lite-image','Fast images','Google','Quick, clean illustrations. Cheapest.','starter','image',32000,0.25,1.5,0.0336,'https://ai.google.dev/gemini-api/docs/pricing','2026-10-02','ESTIMATE: conservative 1K per-image price; Google prices by resolution.',true,ARRAY['development','staging'],90),
  ('vertex:gemini-3.1-flash-image','vertex','gemini-3.1-flash-image','Balanced images','Google','Sharper detail and better prompt-following.','premium','image',131000,0.5,3,0.067,'https://ai.google.dev/gemini-api/docs/pricing','2026-10-02','ESTIMATE: conservative 1K per-image price; Google prices by resolution.',true,ARRAY['development','staging'],91),
  ('vertex:gemini-3-pro-image','vertex','gemini-3-pro-image','Studio images (Nano Banana Pro)','Google','Highest quality, best text and detail.','frontier','image',131000,2,12,0.134,'https://ai.google.dev/gemini-api/docs/pricing','2026-10-02','ESTIMATE: conservative 1K per-image price; Google prices by resolution.',true,ARRAY['development','staging'],92),
  ('openrouter:google/gemini-3.1-flash-lite-image','openrouter','google/gemini-3.1-flash-lite-image','Fast images','Google','Quick, clean illustrations. Cheapest.','starter','image',65536,0.25,1.5,0.0336,'https://openrouter.ai/api/v1/models','2026-10-02','OpenRouter reports the real cost per call (stored beside this estimate).',true,ARRAY['staging','production'],90),
  ('openrouter:google/gemini-3.1-flash-image','openrouter','google/gemini-3.1-flash-image','Balanced images','Google','Sharper detail and better prompt-following.','premium','image',131072,0.5,3,0.067,'https://openrouter.ai/api/v1/models','2026-10-02','OpenRouter reports the real cost per call (stored beside this estimate).',true,ARRAY['staging','production'],91),
  ('openrouter:google/gemini-3-pro-image','openrouter','google/gemini-3-pro-image','Studio images (Nano Banana Pro)','Google','Highest quality, best text and detail.','frontier','image',131072,2,12,0.134,'https://openrouter.ai/api/v1/models','2026-10-02','OpenRouter reports the real cost per call (stored beside this estimate).',true,ARRAY['staging','production'],92)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, access_tier = EXCLUDED.access_tier, kind = 'image', per_image_usd = EXCLUDED.per_image_usd, enabled = true, pricing_note = EXCLUDED.pricing_note, sort_order = EXCLUDED.sort_order;
