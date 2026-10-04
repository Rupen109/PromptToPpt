# promptToPpt — Developer Setup

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker Desktop **or** nothing — `pnpm db:local` runs an embedded Postgres

## Quick Start

```bash
pnpm install

# Database — pick one
docker compose up -d        # Docker
pnpm db:local               # no Docker (leave running in its own terminal)

# Env files (all gitignored). Generate AUTH_SECRET with: openssl rand -base64 32
cp services/api/.env.example services/api/.env      # fill AUTH_SECRET (+ GEMINI_API_KEY later)
cp apps/web/.env.example apps/web/.env.local
cp apps/editor/.env.example apps/editor/.env.local

pnpm db:migrate
pnpm dev                    # web :3000 · editor :3001 · api :4000
```

Flow to try: type a prompt on http://localhost:3000 → Generate → sign up → you land in the editor at `/create` with your prompt.

Useful commands:

```bash
pnpm --filter @prompttoppt/api ai:check          # ping every catalogue model with your key (no DB writes)
pnpm --filter @prompttoppt/api catalog:sync      # OpenRouter price refresh (dry run; add -- --apply)
pnpm --filter @prompttoppt/api make-admin you@x.com   # owner dashboard access → /admin on the editor
pnpm db:reset                                    # recreate the LOCAL *_dev database
```

Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (API tests need the database running + migrated).

## Individual Apps

```bash
# Next.js public website (localhost:3000)
pnpm --filter @prompttoppt/web dev

# React editor (localhost:3001)
pnpm --filter @prompttoppt/editor dev

# API server (localhost:4000)
pnpm --filter @prompttoppt/api dev
```

## Monorepo Structure

```
apps/web         → Next.js 16 SEO website + login/signup
apps/editor      → React + Vite presentation editor
services/api     → Hono API server + Better Auth
services/worker  → Async generation worker
packages/types   → Shared TypeScript types
packages/validation → Zod schemas
packages/theme   → Design tokens + CSS variables
packages/ai      → AI provider abstraction
packages/billing → Payment provider abstraction
packages/analytics → Event definitions
packages/config  → Shared configs
```

## Environment Variables

See `.env.example` files in each app/service directory.

## Tech Stack

| Layer | Technology |
|---|---|
| Public Website | Next.js 16 (App Router) |
| Editor | React 19 + Vite |
| API | Hono on Node.js |
| Database | PostgreSQL 16 (Drizzle ORM) |
| Queue | AWS SQS |
| Storage | AWS S3 |
| AI (dev) | Google Gemini API |
| AI (prod) | OpenRouter (abstracted) |
| Payments (India) | Razorpay |
| Payments (International) | Stripe |
| Auth | Better Auth |
| Email | Resend |
| Monitoring | Sentry |

See `docs/AUDIT.md`, `docs/DEPLOYMENT.md` and `docs/adr/`.
