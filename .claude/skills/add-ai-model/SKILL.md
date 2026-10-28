---
name: add-ai-model
description: How to add, tier, price, enable or retire an AI model in SlidesDone's DB-driven model catalogue (local Vertex/Gemini vs production OpenRouter), including verification steps. Use when the owner asks for a new model or a pricing/plan-tier change for models.
---

# Add or change a model

Models live in the `model_catalog` table (DB-driven; edits go live within ~30 s, cache in `ai/registry-db.ts`). Seed defaults are in `services/api/src/ai/catalog-seed.ts` (insert-if-missing — owner edits survive restarts).

## Fields that matter
`id` = `<provider>:<modelId>` · `provider` = `vertex|gemini|openrouter` · `accessTier` = `starter|premium|frontier` (which plan may use it: Starter→starter, Pro→+premium, Gold→+frontier) · `inputPerMTokUsd/outputPerMTokUsd` · `environments` (`development|staging|production`) · `routeFast/routeQuality` (position in internal chains; null = user-selectable only) · `kind` (`text|image`) · `enabled`.
Only one backend serves a deployment (`AI_PROVIDER`); rows on other providers are simply not offered.

## Steps
1. **Verify it exists and its price** — OpenRouter: `curl https://openrouter.ai/api/v1/models` (public) or `pnpm --filter @prompttoppt/api catalog:sync` (dry run diff). Gemini/Vertex: official pricing page + `pnpm ... ai:check`. Never trust memory for IDs or prices.
2. **Probe availability for the actual key/region** (Vertex models differ per project; `gemini-2.5-pro` 404s in ours).
3. Add the row to `catalog-seed.ts` (new installs) and/or insert/update in the table (existing DBs). Record `pricingSourceUrl` + `pricingVerifiedOn` + a `pricingNote` if it's an estimate or promo.
4. Choose the tier deliberately — it controls plan access AND the credit price (`credit_cost`: starter 2 / premium 5 / frontier 12 per slide). Check margin: provider cost per slide must stay well under credits × revenue-per-credit.
5. Run `pnpm --filter @prompttoppt/api test` (models.test.ts covers locks, charging, ledger attribution).
6. Production: `pnpm catalog:sync -- --apply` periodically; it disables rows that vanished from OpenRouter.

## Gotchas
- Gemini 3.6 Flash/3.8 Flash prices are promotional until 2026-12-31 (rise 2027-01-01) — re-verify then.
- Image models (`kind=image`) stay `enabled=false` until the image-generation task exists.
- OpenRouter returns real cost in `usage.cost` — it's stored as `provider_reported_cost_usd` beside our computed cost.
- Live OpenRouter calls have **not** been verified yet (no key supplied) — unit-tested with fixtures only.
