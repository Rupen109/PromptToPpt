# Deployment topology

## Domains (example: `prompttoppt.app`)

| Host | App | Hosting | Notes |
|---|---|---|---|
| `prompttoppt.app` | `apps/web` (Next.js, `output: standalone`) | Container on ECS Fargate behind ALB + CloudFront | SSR/SSG, SEO |
| `app.prompttoppt.app` | `apps/editor` (static SPA) | S3 + CloudFront | Needs SPA fallback: 403/404 → `/index.html` (200). Cheapest tier — no server |
| `api.prompttoppt.app` | `services/api` (Hono) | Container on ECS Fargate behind ALB | Also hosts Better Auth at `/api/auth/*` |
| — | Postgres | RDS PostgreSQL (start small, single-AZ → Multi-AZ at launch) | See ADR-004 caveats |

One identity provider (the API). Web, editor and API are **same-site** (subdomains of one registrable domain), so a
single session cookie scoped to `.prompttoppt.app` authenticates all three without tokens in `localStorage`.

## Environment matrix

| Var | Local | Production |
|---|---|---|
| `API_URL` | `http://localhost:4000` | `https://api.prompttoppt.app` |
| `WEB_URL` | `http://localhost:3000` | `https://prompttoppt.app` |
| `EDITOR_URL` | `http://localhost:3001` | `https://app.prompttoppt.app` |
| `COOKIE_DOMAIN` | *(empty — cookies are shared across localhost ports)* | `.prompttoppt.app` (**required**; API refuses to boot without it) |
| `TRUSTED_PROXY_HOPS` | `0` | `2` (CloudFront + ALB) — otherwise rate limiting keys on the wrong IP |
| `AUTH_SECRET` | any ≥32 chars | unique, from Secrets Manager; never share between envs |
| `AI_PROVIDER` | `vertex` or `mock` | `vertex` (or `gemini`); key from Secrets Manager. Prefer an IAM-bound service account over a long-lived key in production |
| `DATABASE_URL` | local Postgres | RDS, from Secrets Manager |

Web: `NEXT_PUBLIC_*` are **build-time** (Docker build args). Editor: `VITE_*` are build-time too. Both are public — never put secrets in them.
The API validates its env with Zod at boot and exits with a readable error if anything is wrong or missing.

## Release sequence
1. CI (`.github/workflows/ci.yml`): migrate → typecheck → lint → test → build.
2. Build + push images (`services/api/Dockerfile`, `apps/web/Dockerfile`, build from repo root); `vite build` → sync `apps/editor/dist` to S3, invalidate CloudFront.
3. Run `pnpm db:migrate` as a one-off ECS task **before** rolling the API (migrations must stay backward-compatible for one release).
4. Roll the API, then web.

## Not yet verified (be honest)
- Dockerfiles are written but **not built** — Docker isn't installed on the dev machine. First CI/Docker run may need small fixes.
- No IaC yet (Terraform/CDK arrives in Phase 8 with the cost model); nothing has been deployed.
- Email (verification / password reset) needs a provider (Resend) — `requireEmailVerification` is off until then.
- Rate limiting is in-process (single API task). Move to WAF or a shared store before scaling out.
