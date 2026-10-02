# promptToPpt — Developer Setup

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm install -g pnpm`)
- Docker Desktop (for local PostgreSQL + Redis)

## Quick Start

```bash
# 1. Install all dependencies
pnpm install

# 2. Start local services (PostgreSQL + Redis)
docker-compose up -d

# 3. Copy environment variables
cp apps/web/.env.example apps/web/.env.local
cp services/api/.env.example services/api/.env

# 4. Run database migrations (Phase 1 onwards)
# pnpm --filter @prompttoppt/api db:migrate

# 5. Start all apps in dev mode
pnpm dev
```

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
apps/web         → Next.js 14 SEO website
apps/editor      → React + Vite presentation editor
services/api     → Hono API server
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
| Public Website | Next.js 14 (App Router) |
| Editor | React 18 + Vite |
| API | Hono on Node.js |
| Database | PostgreSQL 16 (Drizzle ORM) |
| Cache | Redis 7 |
| Queue | AWS SQS |
| Storage | AWS S3 |
| AI (dev) | Google Gemini API |
| AI (prod) | OpenRouter (abstracted) |
| Payments (India) | Razorpay |
| Payments (International) | Stripe |
| Auth | Better Auth |
| Email | Resend |
| Monitoring | Sentry |
