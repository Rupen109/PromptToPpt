-- Audio & video to slides (2026-10-29): transcribing a recording costs 6 credits per started 4 MB, on every tier.
-- Seeds are insert-if-missing, so existing databases need this one-time row; a fresh database gets the same rows from the seed.
INSERT INTO credit_cost (id, action, tier, credits) VALUES
  ('read_media-starter', 'read_media', 'starter', 6), ('read_media-premium', 'read_media', 'premium', 6), ('read_media-frontier', 'read_media', 'frontier', 6)
ON CONFLICT DO NOTHING;
