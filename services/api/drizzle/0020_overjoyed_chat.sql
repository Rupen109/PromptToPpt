CREATE TABLE "cloud_balance_checkin" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"kind" text DEFAULT 'credit_remaining' NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cloud_checkin_read_idx" ON "cloud_balance_checkin" USING btree ("provider","read_at");