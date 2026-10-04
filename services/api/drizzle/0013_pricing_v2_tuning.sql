-- Tuning after running the margin model (docs/PRICING_MODEL.md): Gold India worst-case and the premium/frontier image tiers were underwater.
UPDATE plan SET monthly_credits = 10000 WHERE id = 'gold';
--> statement-breakpoint
UPDATE credit_cost SET credits = 60  WHERE action = 'image' AND tier = 'premium';
--> statement-breakpoint
UPDATE credit_cost SET credits = 200 WHERE action = 'image' AND tier = 'frontier';
