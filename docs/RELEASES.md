# Branches, the live site and releases

**Decided 2026-11-24 (owner): ONE site on AWS, https://slidesdone.app.** There is no QA server: the `qa` branch is tested on the owner's own machine, and `master` is what
the live site runs. The server that used to be QA (Sydney, AWS names keep `test`) became the live site; the separate production server plan (`infra/prod`, CloudFront) was
dropped to keep the AWS bill to one server.

## Local and the live site

| | Local | Live site |
|---|---|---|
| Address | localhost (web 3100, editor 3001, API 4000) | **https://slidesdone.app** (`www.` sends on to it), `app.` (editor), `api.` |
| Branch | `qa` (and any work branch) | **`master`**: a merge deploys after the owner approves |
| Server | your Mac | EC2 t4g.small in Sydney (`infra/tofu`, `infra/compose`, `infra/scripts/deploy.sh`) |
| AI key | `GEMINI_API_KEY` = the free key "SlidesDone Local" (`AI_KEY_TIER=free`) | the PAID AI Studio key (Parameter Store `/prompttoppt/test/GEMINI_API_KEY`, `AI_KEY_TIER=paid`); OpenRouter backup off until a real key is checked |
| Who can sign up | anyone | **until the public launch**: only `SIGNUP_ALLOWED_EMAILS` (see below) |
| Payments | simulator / Razorpay test | **until the public launch**: Razorpay **test** keys (`APP_ENV=staging`; production mode refuses test keys) |
| Data | your local database | the data made while this server was QA, kept on purpose (owner's own content) |
| Search engines, analytics | kept out | listed; Google Analytics on |

### The public launch (later, owner's go)
1. A database backup (the deploy takes one; also `infra/compose/backup.sh`), then a FRESH database.
2. Razorpay **live** keys + webhook secret in Parameter Store, and `APP_ENV=production` in `infra/compose/render-env.sh` (production mode then also requires the paid key and email settings, and refuses test keys).
3. Remove `SIGNUP_ALLOWED_EMAILS` from Parameter Store (open sign-up), the legal pages' owner fields filled in (`apps/web/lib/legal.ts`), and the variable `PROD_RELEASE_CHECK = true`.
4. The checklist: `docs/PRODUCTION_RELEASE_CHECKLIST.md`.

## Free AI on local

Each key is made in AI Studio inside a Google project with **no billing account linked**, so Google cannot charge it (probed 2026-11-24: its quota names say `FreeTier`; Gemini 3.1 Pro answers `limit: 0`). 

With `AI_KEY_TIER=free` the API:
- offers only the models marked `free_tier` in `model_catalog` (3.1 Flash-Lite, 3.6 Flash, 3.8 Flash). **Gemini 3.1 Pro and AI pictures are off**: the picture button answers "AI pictures are not available on this server" and charges nothing;
- ends each route with the other route's free models (writing: 3.6 → 3.8 → Flash-Lite; quick tasks: Flash-Lite → 3.6 → 3.8). The free tier allows about 20 calls a day on each Flash model and about 500 on Flash-Lite (Google's AI Studio rate-limit page shows the project's exact numbers), and Google turns free traffic away first when a model is busy;
- passes a model over for the rest of its day as soon as Google says its **daily** quota is used up (`exhaustedForMs` on the error, packages/ai/src/gemini.ts) instead of asking it again on every call, so decks keep going on Flash-Lite;
- waits its turn under the free per-minute limits (`FREE_TIER_LIMITS` in services/api/src/ai/gateway.ts; `AI_LIMITS` overrides them).

Limits to know:
- **Google may use free-tier requests to improve its products.** Never put real customer content on local.
- Free-tier answers are slower than paid ones, and **at Google's busy hours the free tier can refuse every model for a while** ("This model is currently experiencing high demand"; seen 2026-11-24 around 12:30 UTC, all three free models at once, ). The person then sees "The AI service is busy or unavailable. Please try again in a moment." Try again later; nothing is charged. Real speed, cost and reliability are measured only on the live site's paid key.
- When every free model has used up its day, AI on local stops until Google's reset (midnight Pacific time). Unit tests never need AI (mock); the e2e suites do, so run a few at a time on local.


## Day to day

1. I build a feature and push it to **`qa`**. GitHub runs CI on the push (type check, lint, unit tests, build, dependency audit, secret scan). Nothing is deployed.
2. You test it on your machine (`qa` branch, local servers).
3. **Release**: on GitHub, a **pull request `qa` → `master`**. CI runs on it; merge when green.
4. The merge starts **"Deploy (slidesdone.app)"**: CI again, then the job **waits for your approval** (environment `production`): open the run → **Review deployments → Approve**.
5. It backs up the database, builds, publishes, restarts and checks that the three addresses answer.

Each deploy's images are tagged by commit, and the server keeps the last 5. Going back: Actions → "Deploy (slidesdone.app)" → **Run workflow** on an older commit, or
`git revert` the bad change and release again. Redeploying one part by hand: Run workflow → `api`, `web`, `editor` or `config`. From your Mac: `infra/scripts/deploy.sh [api] [web] [editor] [config]`.

## One-time GitHub setup (owner)

`gh` is not installed on this Mac, so these are clicks on github.com → the repository → **Settings**.

1. **Push the branches.** Commit the work on `master` and push it. Then create `qa` from it: `git switch -c qa && git push -u origin qa`.
2. **Environment** (Settings → Environments → `production`): **Required reviewers → you**; Deployment branches: *Selected branches* → `master`. The deploy uses the secrets
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (the limited `slidesdone-test-github-deploy` user): keep them as **repository** secrets, or put them in this environment.
   The environment `qa` and the secrets `AWS_PROD_ACCESS_KEY_ID` / `AWS_PROD_SECRET_ACCESS_KEY` are no longer used and can be deleted.
3. **Branch rules** (Settings → Rules → Rulesets → New branch ruleset):
   - `master`: require a pull request before merging (0 approvals: the deploy approval is the gate), require status checks **verify** and **secrets**, block force pushes, restrict deletions.
   - `qa`: block force pushes, restrict deletions.
4. **Google sign-in**: Google Cloud → APIs & Services → Credentials → the OAuth client: redirect URI `https://api.slidesdone.app/api/auth/callback/google`, JavaScript origins `https://slidesdone.app` and `https://app.slidesdone.app`.
5. The variable `PROD_READY` is no longer used (it can be deleted).

## Inviting someone (until the public launch)

```bash
aws ssm put-parameter --profile goldenhour --region ap-southeast-2 --name /prompttoppt/test/SIGNUP_ALLOWED_EMAILS \
  --type String --overwrite --value "rupenbhimani109@gmail.com,blackcodes109@gmail.com,new.person@example.com"
infra/scripts/deploy.sh config        # or Actions -> Deploy (slidesdone.app) -> Run workflow -> config
```
Addresses and whole domains (`@company.com`) work. People who already have an account keep it.

## Where the pieces are

| What | Where |
|---|---|
| Workflows | `.github/workflows/ci.yml` (pull requests, pushes to `qa`), `deploy.yml` (`master`) |
| Addresses | `infra/tofu/dns.tf` (`site_prefix = ""`: the bare domain, `www`, `app.`, `api.`), `infra/scripts/deploy.sh` (`DOMAIN`) |
| Server settings | `infra/compose/render-env.sh` + Parameter Store `/prompttoppt/test/` |
| Web server, HTTPS, the editor's security headers | `infra/compose/Caddyfile` (+ `editor-headers.caddy`, written by the deploy from `scripts/csp.mjs`) |
| Backups | `infra/compose/backup.sh` (twice a day and before every deploy) → the assets bucket, `db-backups/`, 30 days |
| Free-tier models (local) | `model_catalog.free_tier` (migration 0049), `services/api/src/ai/registry-db.ts` |
| Daily-quota handling | `packages/ai/src/gemini.ts` (`exhaustedFor`), `packages/ai/src/gateway.ts`; tests `packages/ai/src/quota.test.ts` |
| Invite-only sign-up | `services/api/src/auth.ts`, `services/api/src/security/email.ts`; tests `services/api/src/security/qa-site.test.ts` |
