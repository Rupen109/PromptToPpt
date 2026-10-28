-- Plan features v3 (2026-10-28): "Chat with your presentation" (Pro, Gold) and Wikipedia / web data (Wikipedia on Pro, plus live web search on Gold).
-- Seeds are insert-if-missing, so existing databases need this one-time data migration; every statement also runs cleanly on an EMPTY database.
UPDATE plan SET features = features || '{"askDeck": false, "webData": "none"}'::jsonb WHERE id = 'starter';
--> statement-breakpoint
UPDATE plan SET features = features || '{"askDeck": true, "webData": "wikipedia"}'::jsonb WHERE id = 'pro';
--> statement-breakpoint
UPDATE plan SET features = features || '{"askDeck": true, "webData": "web"}'::jsonb WHERE id = 'gold';
--> statement-breakpoint
INSERT INTO credit_cost (id, action, tier, credits) VALUES
  ('ask_deck-starter', 'ask_deck', 'starter', 1), ('ask_deck-premium', 'ask_deck', 'premium', 2), ('ask_deck-frontier', 'ask_deck', 'frontier', 5),
  ('web_research-starter', 'web_research', 'starter', 60), ('web_research-premium', 'web_research', 'premium', 60), ('web_research-frontier', 'web_research', 'frontier', 60)
ON CONFLICT DO NOTHING;
