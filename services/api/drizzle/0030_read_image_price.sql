-- Image → deck (2026-10-28): reading one picture with a vision model costs 4 credits on every tier.
-- Seeds are insert-if-missing, so existing databases need this one-time row; a fresh database gets the same rows from the seed.
INSERT INTO credit_cost (id, action, tier, credits) VALUES
  ('read_image-starter', 'read_image', 'starter', 4), ('read_image-premium', 'read_image', 'premium', 4), ('read_image-frontier', 'read_image', 'frontier', 4)
ON CONFLICT DO NOTHING;
