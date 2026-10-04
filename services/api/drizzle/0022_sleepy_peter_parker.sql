CREATE TABLE "auth_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ip" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_canonical" text;--> statement-breakpoint
CREATE INDEX "auth_attempt_ip_idx" ON "auth_attempt" USING btree ("kind","ip","created_at");--> statement-breakpoint
CREATE INDEX "auth_attempt_subject_idx" ON "auth_attempt" USING btree ("kind","subject","created_at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_email_canonical_unique" UNIQUE("email_canonical");--> statement-breakpoint
-- backfill: canonical form of every existing email (first account per canonical address wins; later look-alikes stay NULL so the unique index cannot fail)
WITH canon AS (
  SELECT id, created_at,
    CASE WHEN split_part(lower(email), '@', 2) IN ('gmail.com', 'googlemail.com')
      THEN replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
      ELSE split_part(split_part(lower(email), '@', 1), '+', 1) || '@' || split_part(lower(email), '@', 2)
    END AS c
  FROM "user"
), ranked AS (
  SELECT id, c, row_number() OVER (PARTITION BY c ORDER BY created_at, id) AS rn FROM canon
)
UPDATE "user" u SET email_canonical = r.c FROM ranked r WHERE u.id = r.id AND r.rn = 1;
