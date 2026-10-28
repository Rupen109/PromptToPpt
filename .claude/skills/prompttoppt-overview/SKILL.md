---
name: prompttoppt-overview
description: Orientation for the SlidesDone monorepo — what each app/package does, how the three apps share one login, the non-negotiable invariants, and the commands to run everything. Load first when starting any task in this repo.
---

# SlidesDone — orientation

AI presentation SaaS: prompt → analysis → outline → slides → editor → export. pnpm + turbo monorepo, TypeScript strict.

## Layout
| Path | What | Host (prod) |
|---|---|---|
| `apps/web` | Next.js 16 marketing/SEO site + `/login` `/signup` `/pricing` | `slidesdone.app` |
| `apps/editor` | Vite + React 19 SPA: create flow, deck viewer/editor, owner dashboard (`/admin`, lazy) | `app.` |
| `services/api` | Hono API + Better Auth + Drizzle/Postgres + in-process generation worker | `api.` |
| `packages/validation` | **Zod schemas = single source of truth**: presentation document, slide content, plans/entitlements | |
| `packages/theme` | design tokens (CSS), themes, deterministic **layout engine**, validators | |
| `packages/ai` | `AIProvider` interface, Gemini/Vertex/OpenRouter/Mock providers, `ModelRegistry`, `AIGateway` | |
| `packages/api-client` | typed API + auth client used by web AND editor, plan copy helpers | |
| `docs/` | `AUDIT`, `ERD`, `DEPLOYMENT`, `PHASE*_PLAN`, `adr/decisions.md` (ADR-001…) | |

Next.js 16 differs from older versions — read `apps/web/node_modules/next/dist/docs/` before touching Next APIs.

## Invariants (never break these)
1. **Presentation JSON is canonical.** Rendered HTML/canvas is a view. Models never emit coordinates — they emit semantic `SlideContent`; `composeSlide()` lays it out.
2. **Every model call goes through `AIGateway`** → one immutable `ai_usage_event` row per attempt (even failures). See skill `ai-gateway-and-ledger`.
3. **Server decides everything paid**: plan, credits, model tier, export, limits. Client flags are display only. See `plans-and-entitlements`.
4. **Secrets never reach the browser or git.** `NEXT_PUBLIC_*` / `VITE_*` are public. `.env*` are gitignored; only `.env.example` is tracked.
5. **Untrusted text is data**: user prompts and source text are wrapped/neutralised (`ai/prompts.ts`); URL fetching is SSRF-guarded (`sources/ssrf.ts`).
6. **Append-only tables** (DB triggers): `ai_usage_event`, `credit_ledger`, `audit_log`. Don't add UPDATE/DELETE paths.
7. Zod schemas and exported types live in `packages/validation` — don't redefine them elsewhere.

## Run it
```bash
pnpm install
pnpm db:local        # embedded Postgres on :5432 (or: docker compose up -d)
cp services/api/.env.example services/api/.env   # set AUTH_SECRET, AI_PROVIDER, key
pnpm db:migrate      # migrates + seeds plans/credit costs/model catalogue
pnpm dev             # web :3000 · editor :3001 · api :4000
```
Local AI: `AI_PROVIDER=vertex` + `GEMINI_API_KEY` (Vertex express key) or `mock` (no key). Production: `openrouter`.
Gotcha: stale dev servers hold ports — kill by port (`kill $(lsof -nP -tiTCP:4000 -sTCP:LISTEN)`), not by name; a stale process once made a "real" test run silently use the mock.
Owner dashboard needs an admin: `pnpm --filter @prompttoppt/api make-admin you@example.com`.
