# Deployment topology

> **Going live?** The full list of checks (blockers, security, billing, pictures, performance, legal, launch day) is in [`PRODUCTION_RELEASE_CHECKLIST.md`](./PRODUCTION_RELEASE_CHECKLIST.md). Note: the production AI provider is still an open decision there — the catalogue serves OpenRouter models in production, not Vertex.

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
| `EDGE_SHARED_SECRET` | *(unset: only local development trusts country headers)* | **required** (≥24 chars): the same value CloudFront sends as the `X-Origin-Verify` origin header; without it anyone could spoof the country header and get the India price |
| `AUTH_SECRET` | any ≥32 chars | unique, from Secrets Manager; never share between envs |
| `AI_PROVIDER` | `vertex` or `mock` | `vertex` (or `gemini`); key from Secrets Manager. Prefer an IAM-bound service account over a long-lived key in production |
| `DATABASE_URL` | local Postgres | RDS, from Secrets Manager |
| `SOURCE_PARSE_CONCURRENCY` / `SOURCE_PARSE_HEAP_MB` / `SOURCE_UPLOAD_BUDGET_MB` | `1` / `256` / `96` | **Size the API task for these** (see "Reading uploaded files" below). Defaults suit a **1 GB** task; with 2 GB use concurrency `2`–`3` and budget `192` |

Web: `NEXT_PUBLIC_*` are **build-time** (Docker build args). Editor: `VITE_*` are build-time too. Both are public — never put secrets in them.
The API validates its env with Zod at boot and exits with a readable error if anything is wrong or missing.

## Reading uploaded files (Word / Excel / CSV / email / PDF / PowerPoint) — memory and sizing
Files are read in short-lived worker threads (`services/api/src/sources/parse-pool.ts`, bundled as `dist/parse-worker.js` — it must be deployed next to `dist/index.js`, which the Dockerfile already does). Limits, all env-tunable: `SOURCE_PARSE_CONCURRENCY` (files read at once, default 1), `SOURCE_PARSE_QUEUE` (waiting line, 24), `SOURCE_PARSE_TIMEOUT_MS` (25 s per file), `SOURCE_PARSE_HEAP_MB` (256 per worker), `SOURCE_UPLOAD_BUDGET_MB` (uploads in flight are admitted by their declared size, 96 MB ≈ six 15 MB files) and `SOURCE_UPLOAD_INFLIGHT` (32). Beyond the limits a person gets "Lots of files are being read right now. Please try again in a few seconds." (503 + `Retry-After`) at once.

**Measured** (compiled build, `scripts/load-sources.ts`, 20 people uploading heavy and hostile files at once): the API never stalled more than ~0.15 s for other requests (the old in-process reading froze it for up to 2.3 s); peak process memory ≈ 0.75–0.9 GB under that deliberately hostile load, ≈ 0.6 GB sustained over a 40-round mixed soak, ~0.1–0.2 GB idle. **So a 1 GB task is the minimum and has little headroom under attack; use 2 GB for production**, or lower `SOURCE_PARSE_CONCURRENCY`/`SOURCE_UPLOAD_BUDGET_MB`. Worker threads live inside the same process, so their memory counts against the task limit (worst case ≈ concurrency × ~400 MB for the heaviest file the readers accept, plus ~3 × the upload budget for request bodies). Re-run `pnpm --filter @prompttoppt/api exec tsx scripts/load-sources.ts <label>` against a staging copy of the real task size before launch.

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
