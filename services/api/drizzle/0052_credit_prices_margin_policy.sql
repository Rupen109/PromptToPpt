-- Credit prices and plan prices from docs/MARGIN_POLICY.md (owner, 2026-11-26): credits = ceil(measured cost / $0.00115),
-- so a plan spent in full keeps its margin (Pro about 50%, Gold and Premium about 63% on INR prices).
UPDATE "credit_cost" SET "credits" = 3 WHERE "action" = 'generate_slide' AND "tier" = 'starter';--> statement-breakpoint
UPDATE "credit_cost" SET "credits" = 12 WHERE "action" = 'generate_slide' AND "tier" = 'premium';--> statement-breakpoint
UPDATE "credit_cost" SET "credits" = 4 WHERE "action" = 'ai_edit' AND "tier" = 'starter';--> statement-breakpoint
UPDATE "credit_cost" SET "credits" = 12 WHERE "action" = 'ai_edit' AND "tier" = 'premium';--> statement-breakpoint
UPDATE "credit_cost" SET "credits" = 30 WHERE "action" = 'image' AND "tier" = 'starter';--> statement-breakpoint
INSERT INTO "credit_cost" ("id", "action", "tier", "credits") VALUES
  ('ai_write_slide-starter', 'ai_write_slide', 'starter', 3),
  ('ai_write_slide-premium', 'ai_write_slide', 'premium', 12),
  ('ai_write_slide-frontier', 'ai_write_slide', 'frontier', 12)
ON CONFLICT ("id") DO UPDATE SET "credits" = EXCLUDED."credits";--> statement-breakpoint
UPDATE "plan" SET "monthly_credits" = 150 WHERE "id" = 'starter';--> statement-breakpoint
UPDATE "plan" SET "monthly_credits" = 1150 WHERE "id" = 'pro';--> statement-breakpoint
-- a changed amount makes a new Razorpay plan on the next checkout (subscriptions.ts compares provider_amount_minor); people already subscribed keep their plan until they change it
UPDATE "plan_price" SET "amount_minor" = 70000 WHERE "plan_id" = 'gold' AND "currency" = 'INR' AND "interval" = 'month';--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 672000 WHERE "plan_id" = 'gold' AND "currency" = 'INR' AND "interval" = 'year';--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 130000 WHERE "plan_id" = 'premium' AND "currency" = 'INR' AND "interval" = 'month';--> statement-breakpoint
UPDATE "plan_price" SET "amount_minor" = 1248000 WHERE "plan_id" = 'premium' AND "currency" = 'INR' AND "interval" = 'year';
