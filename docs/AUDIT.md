# Repository audit — 2026-10-02

Baseline = commit `cc44444 initial setup`. Status after Phase 1a is in the right-hand column.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `.gitignore` did not exclude `.env*` — one `git add .` away from committing secrets | High | Fixed |
| 2 | Turborepo could not run: no `packageManager` in root `package.json` | High | Fixed |
| 3 | Two diverging design-token sources: `apps/web/globals.css` (Figma-accurate cobalt) vs `packages/theme/tokens.css` (placeholder indigo, unused) | Medium | Fixed — theme package is the single source; both apps import it |
| 4 | `/login` and `/signup` linked from the header but did not exist (404) | High | Fixed |
| 5 | API `src/index.ts` exported `{port, fetch}` with no Node server — would never listen | High | Fixed (`@hono/node-server`) |
| 6 | API deps pinned to old majors (`better-auth ^0.7`, `drizzle-orm ^0.32`) and unused ones (S3, ioredis, Sentry) | Medium | Fixed — upgraded; unused deps removed (re-add with the feature) |
| 7 | Workspace packages ship TS source (`main: ./src/index.ts`): fine for Next/Vite, would break a plain `tsc` Node build | High (deploy) | Fixed — API bundled with tsup (`noExternal @prompttoppt/*`) |
| 8 | Packages had no `tsconfig.json` → `pnpm typecheck` failed | Medium | Fixed |
| 9 | `analytics` read `process.env` — package also runs in the browser | Low | Fixed — environment passed in |
| 10 | Redis in docker-compose + README with no consumer (spec: "only if needed") | Low | Removed |
| 11 | Hardcoded `https://prompttoppt.com` in layout/sitemap/robots; README said Next 14 (actual: 16.3.8) | Low | Fixed — driven by `NEXT_PUBLIC_SITE_URL` |
| 12 | Landing copy contains unverifiable claims: "Over 140,000 Decks Synthesized", "Solguruz Edition 3.0 Live", "142% net dollar retention" sample text, fake "trusted by" logos | **Business/legal** | **Open — needs your call before launch** (spec forbids fabricated stats/logos) |
| 13 | `figma_data.json` (16 MB) committed in repo root; spec PDF at root | Low | Moved under `docs/` (still in git history) |
| 14 | ADR cost tables (ADR-004) have no cited sources; Aurora Serverless v2 has a higher cost floor than a small RDS instance | Medium | Open — revisit in cost-model task |
| 15 | `apps/editor` did not exist | — | Created (Vite + React 19) |
| 16 | Next 16 `AGENTS.md` warns APIs differ from training data | Info | Followed: checked bundled docs for `output: standalone`, tracing root |

## Layout after audit

```
apps/web        Next.js 16 — marketing/SEO, login/signup      → prompttoppt.app
apps/editor     Vite + React 19 SPA — the product             → app.prompttoppt.app
services/api    Hono + Better Auth + Drizzle/Postgres         → api.prompttoppt.app
services/worker generation worker (Phase 2 — scaffold only)
packages/       api-client · theme · types · validation · ai · billing · analytics · config
docs/           AUDIT · DEPLOYMENT · adr/ · product/ (spec PDF) · design/figma/
```
