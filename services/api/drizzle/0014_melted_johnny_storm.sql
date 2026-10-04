CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"provider_subscription_id" text,
	"plan_id" text,
	"interval" text,
	"currency" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"status" text NOT NULL,
	"method" text,
	"failure_reason" text,
	"paid_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_uq" ON "payment" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE INDEX "payment_user_idx" ON "payment" USING btree ("user_id","paid_at");