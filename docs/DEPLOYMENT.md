# Deployment topology

> **2026-11-24: the separate production server (`infra/prod`, CloudFront, WAL-G) was dropped by the owner to keep AWS to one server.** The live site https://slidesdone.app runs on the former QA server (`infra/tofu`, `infra/compose`, `infra/scripts/deploy.sh`); branches and releases: `docs/RELEASES.md`. The `infra/prod` parts below are kept as history only.

> **Going live?** The full list of checks (blockers, security, billing, pictures, performance, legal, launch day) is in [`PRODUCTION_RELEASE_CHECKLIST.md`](./PRODUCTION_RELEASE_CHECKLIST.md). Note: the production AI provider is still an open decision there — the catalogue serves OpenRouter models in production, not Vertex.

## Domains (example: `slidesdone.app`)

| Host | App | Hosting | Notes |
|---|---|---|---|
| `slidesdone.app` | `apps/web` (Next.js, `output: standalone`) | Container on ECS Fargate behind ALB + CloudFront | SSR/SSG, SEO |
| `app.slidesdone.app` | `apps/editor` (static SPA) | S3 + CloudFront | Needs SPA fallback: 403/404 → `/index.html` (200). Cheapest tier — no server |
| `api.slidesdone.app` | `services/api` (Hono) | Container on ECS Fargate behind ALB | Also hosts Better Auth at `/api/auth/*` |
| — | Postgres | RDS PostgreSQL (start small, single-AZ → Multi-AZ at launch) | See ADR-004 caveats |

One identity provider (the API). Web, editor and API are **same-site** (subdomains of one registrable domain), so a
single session cookie scoped to `.slidesdone.app` authenticates all three without tokens in `localStorage`.

## Environment matrix

| Var | Local | Production |
|---|---|---|
| `API_URL` | `http://localhost:4000` | `https://api.slidesdone.app` |
| `WEB_URL` | `http://localhost:3000` | `https://slidesdone.app` |
| `EDITOR_URL` | `http://localhost:3001` | `https://app.slidesdone.app` |
| `COOKIE_DOMAIN` | *(empty — cookies are shared across localhost ports)* | `.slidesdone.app` (**required**; API refuses to boot without it) |
| `TRUSTED_PROXY_HOPS` | `0` | `2` (CloudFront + ALB) — otherwise rate limiting keys on the wrong IP |
| `EDGE_SHARED_SECRET` | *(unset: only local development trusts country headers)* | **required** (≥24 chars): the same value CloudFront sends as the `X-Origin-Verify` origin header; without it anyone could spoof the country header and get the India price |
| `AUTH_SECRET` | any ≥32 chars | unique, from Secrets Manager; never share between envs |
| `AI_PROVIDER` | `gemini` (AI Studio) or `mock` | `gemini` (AI Studio, decided 2026-11-24), key `GEMINI_API_KEY` in Parameter Store |
| `AI_BACKUP_PROVIDER` | `none` | `openrouter`: the same Gemini models through OpenRouter when Gemini refuses or is too busy. The server scripts set it as soon as `OPENROUTER_API_KEY` is stored |
| `AI_KEY_TIER` | `free` (a free-tier Gemini key from a Google project with no billing; QA too) | `paid` (default; the API refuses `free` in production). See `docs/RELEASES.md` |
| `COOKIE_PREFIX` | *(default `better-auth`)* | default. QA sets `slidesdone-qa` so its login never mixes with production's |
| `SIGNUP_ALLOWED_EMAILS` | *(empty: everyone)* | empty. QA: the invited addresses / `@domains` |
| `DATABASE_URL` | local Postgres | RDS, from Secrets Manager |
| `SOURCE_PARSE_CONCURRENCY` / `SOURCE_PARSE_HEAP_MB` / `SOURCE_UPLOAD_BUDGET_MB` | `1` / `256` / `96` | **Size the API task for these** (see "Reading uploaded files" below). Defaults suit a **1 GB** task; with 2 GB use concurrency `2`–`3` and budget `192` |

Web: `NEXT_PUBLIC_*` are **build-time** (Docker build args). Editor: `VITE_*` are build-time too. Both are public — never put secrets in them.
The API validates its env with Zod at boot and exits with a readable error if anything is wrong or missing.

## Reading uploaded files (Word / Excel / CSV / email / PDF / PowerPoint) — memory and sizing
Files are read in short-lived worker threads (`services/api/src/sources/parse-pool.ts`, bundled as `dist/parse-worker.js` — it must be deployed next to `dist/index.js`, which the Dockerfile already does). Limits, all env-tunable: `SOURCE_PARSE_CONCURRENCY` (files read at once, default 1), `SOURCE_PARSE_QUEUE` (waiting line, 24), `SOURCE_PARSE_TIMEOUT_MS` (25 s per file), `SOURCE_PARSE_HEAP_MB` (256 per worker), `SOURCE_UPLOAD_BUDGET_MB` (uploads in flight are admitted by their declared size, 96 MB ≈ six 15 MB files) and `SOURCE_UPLOAD_INFLIGHT` (32). Beyond the limits a person gets "Lots of files are being read right now. Please try again in a few seconds." (503 + `Retry-After`) at once.

**Measured** (compiled build, `scripts/load-sources.ts`, 20 people uploading heavy and hostile files at once): the API never stalled more than ~0.15 s for other requests (the old in-process reading froze it for up to 2.3 s); peak process memory ≈ 0.75–0.9 GB under that deliberately hostile load, ≈ 0.6 GB sustained over a 40-round mixed soak, ~0.1–0.2 GB idle. **So a 1 GB task is the minimum and has little headroom under attack; use 2 GB for production**, or lower `SOURCE_PARSE_CONCURRENCY`/`SOURCE_UPLOAD_BUDGET_MB`. Worker threads live inside the same process, so their memory counts against the task limit (worst case ≈ concurrency × ~400 MB for the heaviest file the readers accept, plus ~3 × the upload budget for request bodies). Re-run `pnpm --filter @prompttoppt/api exec tsx scripts/load-sources.ts <label>` against a staging copy of the real task size before launch.

## Docker images (built and run for real on 2026-11-17)
Built on an Apple-silicon Mac (linux/arm64, the same CPU family as the t4g.small) with Colima + Docker 29, exactly as `infra/prod/deploy.sh` builds them: `docker build --platform linux/arm64 -f <Dockerfile> .` from the repo root. The proof (migrations from zero, boot refusals, sign-up with e-mail verification, deck create/fetch, template upload through sharp and the worker thread, S3 round trip, security headers, editor SPA fallback) is listed in `PRODUCTION_RELEASE_CHECKLIST.md` section 0.

| Image | Size (compressed) | Notes |
|---|---|---|
| `services/api/Dockerfile` | 146 MB (was 346 MB) | one image, three commands: API (`node dist/index.js`), worker (`node dist/worker.js`), migration task (`node dist/migrate.js`). Node 22.23.5 on Alpine 3.24 + ffmpeg 8 |
| `apps/web/Dockerfile` | 241 MB | Next.js standalone, runs as `node` |
| `infra/prod/images/caddy` | 41 MB | Caddy 2.11.7 with the Route 53 module (`caddy list-modules` shows `dns.providers.route53`). **The xcaddy step downloads about 400 Go modules and can fail on a flaky connection (it did once, `proxy.golang.org ... INTERNAL_ERROR`): run it again** |
| `infra/prod/images/postgres` | 177 MB | Postgres 16 + WAL-G 3.0.9 (the SHA-256 check passes) |

What the Dockerfiles do now, and why (every point was a real finding):
* **Node version is pinned to an exact version** in one `ARG NODE_IMAGE=node:22.23.5-alpine3.24` at the top of both Dockerfiles. The API needs **Node >= 22.19** (undici 8 uses `zlib.createZstdDecompress`); the floating `node:22-alpine` resolved to 22.23.5 on the day of the test (same digest as the pin), but a floating tag would change the runtime silently between two deploys. The API build stops if Node is older (`scripts/docker-check.mjs`). **To upgrade Node:** change the tag in both files, rebuild, run the API tests in that image (below) and `docker-check`, then deploy. Do it on purpose, a few times a year (Node 22 is in maintenance until April 2027: plan the move to Node 24).
* **Alpine (musl) stays.** sharp 0.35 (libvips 8.18.7) ships a musl build and was exercised for real (resize/webp in the build, the template import and the picture upload in the stack). `@napi-rs/canvas` is only an optional peer of `unpdf` and is **not** used (the PDF readers parse with pdf.js and never draw), so the missing glibc/canvas question does not exist. ffmpeg/ffprobe come from `apk add ffmpeg`.
* **`.dockerignore` now excludes `**/.data`.** The first image shipped `services/api/.data`: 274 MB of the developer's generated pictures **and the local mail outbox (`outbox.jsonl`, with e-mail addresses and sign-in links)**, because only `**/.local` was excluded. Anything pushed to ECR from before this fix contains it: nothing was deployed, but never push an image built from the old files.
* **The API image holds only what runs:** `node_modules` (third-party only), `dist/` without source maps, `drizzle/`, `package.json`. No `src/`, tests, `.env.example`, scripts. The workspace packages are bundled into `dist` (tsup `noExternal`), so they are removed from the deploy copy of the manifest. `better-auth` lists next, react, vite, vue, solid-js and vitest as *optional* peers and pnpm installs them anyway (about 450 MB, none imported): they are deleted in the Dockerfile, and `scripts/docker-check.mjs` imports every package that `dist` imports inside the final image so a wrong deletion fails the **build**, not the deploy. The glibc builds of sharp/canvas are removed too (musl only). Structural alternative if you want to drop the deletion list: `auto-install-peers=false` plus a regenerated lockfile.
* **The web image runs as `node` with `--chown`.** Without it Next could not write `apps/web/.next/server/route-cache` (`EACCES: Failed to update prerender cache`): blog/news refreshes (`/api/revalidate-content`) would not have persisted.
* **Health checks:** the image-level `HEALTHCHECK` is for the API (`127.0.0.1:4000/health`) and the web (`/`); the **worker uses the same image**, so `infra/prod/server/docker-compose.yml` overrides it with `:4100/healthz` (keep that override, or the worker shows "unhealthy" forever).
* **Legal release guard** (web image): see "Legal release guard" below.

### Running the API tests in the production Node
The dev machine runs Node 25, the server runs 22: run the tests in the real runtime before an upgrade or a doubtful change:
```
docker build --platform linux/arm64 --target build -f services/api/Dockerfile -t slidesdone-api-build .
docker network create sd-t && docker run -d --name sd-pg --network sd-t -e POSTGRES_USER=pt -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=pt postgres:16-alpine
docker run --rm --network sd-t -e DATABASE_URL=postgres://pt:pw@sd-pg:5432/pt -e API_URL=http://localhost:4000 -e WEB_URL=http://localhost:3000 -e EDITOR_URL=http://localhost:3001 \
  -e AUTH_SECRET=ci-only-secret-ci-only-secret-ci-only-secret -e NODE_ENV=test -v "$PWD/apps/web/public:/repo/apps/web/public:ro" -w /repo/services/api slidesdone-api-build \
  sh -c 'apk add --no-cache ffmpeg >/dev/null; npx vitest run'
```
(`ffmpeg` is needed by the video tests; the `apps/web/public` mount by the Morph artwork test. On 2026-11-17: **1239 tests, all passing** after the two fixes below.) Colima shares only `/Users` with its VM: mount from inside your home folder.

Two bugs only the Linux/Node 22 run could show, both fixed:
1. **`src/media/store.ts` `writePart` opened the upload file with the `a+` flag and then wrote at a position.** On Linux append mode ignores the position (a re-sent part would be added twice) and Node 22 refuses it with `ENOTSUP`: **every part of a big video upload would have failed with a 503 in production** (macOS accepts it). Now `O_RDWR|O_CREAT`. The 6 tests of `routes/media-jobs.test.ts` caught it.
2. **E-mail charsets (`src/sources/eml.ts`).** `office-sources.test.ts` "D4 quoted-printable, base64, charsets..." failed on Node 22.23.5 too (not only on Node 25): `TextDecoder('iso-8859-1')` follows the WHATWG standard and reads the label as **windows-1252** (`0x82` becomes `‚`, the euro sign sits at `0x80`), which is what browsers and mail apps do, and Node's Latin-1 label has changed behaviour between releases. The test expected an invisible control character (`\u0082`). The decoder now decodes the whole Latin-1 family (`iso-8859-1`, `latin1`, `us-ascii`, `windows-1252`, ...) with its own windows-1252 table, so the result is the same on every Node, and the test asserts the real behaviour plus a new case with the euro sign, curly quotes and a dash.

## Legal release guard
`apps/web/lib/legal.ts` holds the owner's legal details; while one is `TODO`, a **release build fails** (`docs/LEGAL_PAGES.md`). Proven with real image builds on 2026-11-17:
* `docker build ... --build-arg APP_ENV=production --build-arg RELEASE_CHECK=1` (what `RELEASE=1 infra/prod/deploy.sh web` passes) **fails in 0.3 s**, before the install, listing the 10 TODO fields (`node scripts/check-legal.mjs` is the first `RUN` of the web build).
* Second line of defence, with that step removed and only `APP_ENV=production`: `next build` itself fails while prerendering `/cookies` ("Legal pages are not ready for release", the same list).
* With every field filled (a throwaway Dockerfile copy that `sed`s the values in the image only; the repo was not touched) and the production build args, the build **passes** and the pages serve.
* A normal build (no build args: CI, staging) only prints what is still open and passes.
The ARGs `APP_ENV`, `NEXT_PUBLIC_APP_ENV`, `RELEASE_CHECK` are declared in `apps/web/Dockerfile`; `.dockerignore` lets `scripts/check-legal.mjs` into the context. **Release builds:** `RELEASE=1 infra/prod/deploy.sh web` (or the "release" checkbox of the *Deploy (production)* workflow, which also runs `RELEASE_CHECK=1 node scripts/check-legal.mjs` before building anything). CI (`ci.yml`, manual) always runs `pnpm test:legal` and runs the release check only when started with "release" ticked. Root scripts: `pnpm check:legal`, `pnpm test:legal`. Staging deploys (`APP_ENV=staging`, test keys) leave it off.

## Release sequence
1. CI (`.github/workflows/ci.yml`): migrate → typecheck → lint → test → build.
2. Build + push images (`services/api/Dockerfile`, `apps/web/Dockerfile`, build from repo root); `vite build` → sync `apps/editor/dist` to S3, invalidate CloudFront.
3. Run `pnpm db:migrate` as a one-off ECS task **before** rolling the API (migrations must stay backward-compatible for one release).
4. Roll the API, then web.

## Not yet verified (be honest)
- ~~Dockerfiles are not built~~ Built and run on 2026-11-17 (section "Docker images"). Still unproven: the real Route 53 certificate flow of Caddy, CloudFront in front, the S3 bucket and IAM role (a stub S3 was used), real AI (OpenRouter) and Razorpay, WAL-G archiving to S3, and `docker compose` with the production compose file (the Mac has no compose plugin: run `docker compose --env-file .env --env-file images.env config` on the server).
- No IaC yet (Terraform/CDK arrives in Phase 8 with the cost model); nothing has been deployed.
- Email (verification / password reset) needs a provider (Resend) — `requireEmailVerification` is off until then.
- Rate limiting is in-process (single API task). Move to WAF or a shared store before scaling out.
