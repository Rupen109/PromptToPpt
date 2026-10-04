---
name: verify-phase
description: The definition-of-done checklist for any promptToPpt change or phase — typecheck, lint, tests, build, migrations, secret scan, real-browser E2E, and honest reporting. Use before declaring work finished or committing.
---

# Verify before you say "done"

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```
(API tests need Postgres running: `pnpm db:local`. They use their own DB `prompttoppt_test`; dev data is untouched.)

1. **Migrations**: `pnpm db:generate` after schema edits (check the SQL), custom SQL via `drizzle-kit generate --custom --name=…`; `pnpm db:migrate` applies + seeds. Append-only tables keep their triggers.
2. **Secret scan** (must print 0): `git add -A && git diff --cached | grep -cE 'figd_[A-Za-z0-9]|AQ[.]Ab8[A-Za-z0-9]|GOCSP[X]-|sk-or-v[1]-[a-z0-9]{20}|AIza[A-Za-z0-9_-]{30}'` (patterns are bracketed so this very line can't match itself); also `git ls-files | grep -E '(^|/)\.env($|\.local)'` must be empty. Add the pattern for any new provider's key format.
3. **Real runtime, not just tests**: start `pnpm dev` and drive the flow in a headless browser (Playwright from the scratchpad, not the repo). Tests under vitest once hid an ESM export bug that only `tsx` exposed.
4. **Kill stale servers by port** before E2E; confirm `AI_PROVIDER` is what you think (a stale mock process once made a "real Gemini" run fake).
5. **Report honestly**: what ran, what didn't, what is unverified (e.g. live OpenRouter), estimates vs facts (Vertex prices are estimates).
6. Update docs/ADRs for decisions; don't commit unless asked.

Known gaps to keep stating until fixed: sitemap lists pages that don't exist; landing page has unverifiable marketing claims; INR prices are placeholders; no real payments/export yet.
