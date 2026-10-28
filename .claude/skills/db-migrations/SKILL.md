---
name: db-migrations
description: Drizzle/Postgres workflow for SlidesDone — schema changes, migrations, seeding, append-only ledgers, local/test DB handling, and the gotchas hit so far. Use when changing services/api/src/db/schema.ts or any table.
---

# DB workflow

- Schema: `services/api/src/db/schema.ts`. Generate: `pnpm db:generate` (writes `drizzle/NNNN_*.sql` — read it). Apply: `pnpm db:migrate` (also runs `seedBilling()` → plans, prices, credit costs, model catalogue; all insert-if-missing).
- Custom SQL (triggers/functions): `pnpm --filter @prompttoppt/api exec drizzle-kit generate --custom --name=<name>` then write the SQL.
- **Append-only**: `ai_usage_event`, `credit_ledger`, `audit_log` have BEFORE UPDATE/DELETE triggers. Don't make them FK targets with `ON DELETE SET NULL/CASCADE` (that's an UPDATE/DELETE and would be blocked or break user deletion) — keep `user_id` as plain text. `TRUNCATE` bypasses row triggers: the production app role must not hold `TRUNCATE`/`DROP`.
- Seeds don't overwrite: changing a seed value doesn't change existing DBs — write a data migration/UPDATE too.
- **Local DB**: `pnpm db:local` (embedded Postgres, no Docker) on :5432. `pnpm db:reset` drops/recreates the local `*_dev` DB (refuses anything else). Tests auto-create `prompttoppt_test`.
- Money: `numeric` columns return strings in Drizzle — convert deliberately. Credits are integers. Never store floats for balances.
- Concurrency: balance changes use a row lock (`for('update')`) in a transaction + idempotency keys; see `billing/credits.ts`.
- `drizzle-kit generate` can look hung when it's just slow — wait before killing; and don't run it inside `&&` chains after a failing command (the rest silently skips).
- Embedded Postgres can be mid-shutdown after a hard kill: stop it, remove `.local/pg/postmaster.pid`, restart.
