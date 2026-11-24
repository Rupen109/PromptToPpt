-- A THEME made from a brand kit: a design (its layout style) in light or dark, with the kit's colours, fonts and logo. Only the INPUTS are kept (kit, design, mode);
-- the theme is worked out from them when it is used (packages/theme brand-theme.ts), so editing the kit changes every theme made from it.
CREATE TABLE IF NOT EXISTS "brand_theme" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "kit_id" text NOT NULL REFERENCES "brand_kit"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "design_id" text NOT NULL,
  "mode" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "brand_theme_mode_ok" CHECK ("mode" IN ('light', 'dark'))
);
CREATE INDEX IF NOT EXISTS "brand_theme_user_idx" ON "brand_theme" ("user_id", "created_at");
