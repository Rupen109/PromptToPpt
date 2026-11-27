-- Credit top-ups (owner, 2026-11-27): when the plan's credits run out, the customer buys their plan's credits again
-- at their plan's monthly price, without waiting for the renewal.
--  · credit_balance.extra  = credits BOUGHT. The period reset never touches them; they are spent only after the plan's own credits.
--  · credit_ledger.extra_delta = how much of a row's delta came from that pot, so a refund gives each credit back to the pot it came from.
ALTER TABLE "credit_balance" ADD COLUMN IF NOT EXISTS "extra" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN IF NOT EXISTS "extra_delta" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "credit_balance" ADD CONSTRAINT "credit_balance_extra_non_negative" CHECK ("extra" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_top_up" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "plan_id" text NOT NULL,
  "credits" integer NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text NOT NULL,
  "provider" text NOT NULL,
  "provider_order_id" text NOT NULL,
  "provider_payment_id" text,
  "status" text DEFAULT 'created' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "paid_at" timestamp
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_top_up_order_uq" ON "credit_top_up" ("provider","provider_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_top_up_user_idx" ON "credit_top_up" ("user_id","created_at");
