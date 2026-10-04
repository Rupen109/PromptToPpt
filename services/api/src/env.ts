import { z } from 'zod'

// local development and tests hammer the sign-up form from one address, so per-IP limits default to generous values there; production defaults are strict
const PROD = process.env['NODE_ENV'] === 'production'

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)
const optional = <T extends z.ZodType>(s: T) => z.preprocess(emptyToUndefined, s.optional())

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    API_URL: z.url(),
    WEB_URL: z.url(),
    EDITOR_URL: z.url(),
    GENERATION_DAILY_LIMIT: z.coerce.number().int().min(1).default(20),
    /** run the generation worker inside the API process (fine for 1 task; split into services/worker to scale) */
    RUN_WORKER: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    COOKIE_DOMAIN: optional(z.string().regex(/^\.[a-z0-9.-]+$/i, 'must start with a dot, e.g. .prompttoppt.app')),
    DATABASE_URL: z.string().startsWith('postgres'),
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_CLIENT_SECRET: optional(z.string()),
    /** AI Studio key (AI_PROVIDER=gemini) or Vertex AI / Agent Platform express key (AI_PROVIDER=vertex) */
    GEMINI_API_KEY: optional(z.string()),
    OPENROUTER_API_KEY: optional(z.string()),
    /** 'mock' runs the deterministic MockProvider (no key needed; used by tests and key-less dev) */
    /** which backend serves the model catalogue: gemini (AI Studio) | vertex | openrouter (production) | mock (all, deterministic) */
    AI_PROVIDER: z.enum(['gemini', 'vertex', 'openrouter', 'mock']).default('gemini'),
    /** Razorpay (test keys start rzp_test_). Key id is public (sent to checkout.js); the secret and webhook secret never leave the server. */
    RAZORPAY_KEY_ID: optional(z.string().regex(/^rzp_(test|live)_/, 'must look like rzp_test_… or rzp_live_…')),
    RAZORPAY_KEY_SECRET: optional(z.string().min(8)),
    RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(16, 'use a long random string (openssl rand -hex 24)')),
    /** USD checkout needs international payments enabled on the Razorpay account */
    RAZORPAY_INTERNATIONAL: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    /** dev/testing: bill in this currency regardless of the visitor's country */
    /** FX used ONLY for owner revenue-vs-cost reporting (provider costs are USD, Razorpay INR test payments are paise) */
    /** Google Cloud billing export in BigQuery, `project.dataset.gcp_billing_export_v1_XXXXXX` — enables the live "Google-billed" panel (see docs/GOOGLE_CLOUD_BILLING.md) */
    GCP_BILLING_EXPORT_TABLE: optional(z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/)),
    /** service-account key JSON (raw or base64) with BigQuery Job User + Data Viewer on that dataset */
    GCP_SERVICE_ACCOUNT_JSON: optional(z.string()),
    /** free key from pexels.com/api — enables relevant stock pictures for generated decks (without it the tagged library is used) */
    PEXELS_API_KEY: optional(z.string().min(10)),
    /** Unsplash API "Access Key" (search needs only this one; the secret key is not used). `UNPLASH_*` is accepted too — that is how the keys were first named. */
    UNSPLASH_ACCESS_KEY: optional(z.string().min(10)),
    UNPLASH_ACCESS_KEY: optional(z.string().min(10)),
    INR_PER_USD: z.coerce.number().positive().default(84),
    BILLING_FORCE_CURRENCY: optional(z.enum(['INR', 'USD'])),
    /** where generated pictures live: local disk (dev) or S3 (production; the container filesystem is ephemeral) */
    ASSET_STORAGE: z.enum(['local', 's3']).default('local'),
    ASSET_DIR: z.string().default('.data/assets'),
    ASSET_BUCKET: optional(z.string()),
    ASSET_REGION: optional(z.string()),
    /** kill switch: set false to stop all picture generation instantly (cost control) */
    IMAGES_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    // ── spend circuit breaker (USD, from the usage ledger) ──
    AI_BUDGET_USD_HOUR: z.coerce.number().positive().default(15),
    AI_BUDGET_USD_DAY: z.coerce.number().positive().default(75),
    /** per account, rolling 24 h: stops one abuser spending the shared budget */
    AI_USER_USD_DAY: z.coerce.number().positive().default(6),
    // ── account abuse protection ──
    /** unverified emails can't sign in (so can't spend anything). Needs a mailer. Production requires it. */
    REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    /** transactional email via Resend (https://resend.com): verification + password reset */
    RESEND_API_KEY: optional(z.string().min(10)),
    EMAIL_FROM: optional(z.string().min(5)),
    /** Cloudflare Turnstile secret: when set, sign-up (and sign-in after repeated failures) require a solved challenge */
    TURNSTILE_SECRET_KEY: optional(z.string().min(10)),
    /** extra throwaway-mail domains to refuse, comma separated */
    EXTRA_BLOCKED_EMAIL_DOMAINS: z.string().default('').transform((v) => v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)),
    /** only for tests / closed betas */
    ALLOW_DISPOSABLE_EMAILS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    AUTH_SIGNUPS_PER_IP_HOUR: z.coerce.number().int().min(1).default(PROD ? 5 : 100),
    AUTH_SIGNUPS_PER_IP_DAY: z.coerce.number().int().min(1).default(PROD ? 15 : 500),
    /** failed password attempts per email in 15 minutes before that email is locked for the rest of the window */
    AUTH_SIGNIN_FAILS_PER_EMAIL: z.coerce.number().int().min(1).default(5),
    AUTH_SIGNIN_FAILS_PER_IP: z.coerce.number().int().min(1).default(PROD ? 30 : 300),
    AUTH_RESET_PER_EMAIL_HOUR: z.coerce.number().int().min(1).default(3),
    AUTH_RESET_PER_IP_HOUR: z.coerce.number().int().min(1).default(PROD ? 10 : 100),
    /** label stored on every ledger row: development | staging | production */
    APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  })
  .refine((e) => !!e.GOOGLE_CLIENT_ID === !!e.GOOGLE_CLIENT_SECRET, {
    message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together',
  })
  .refine((e) => !!e.RAZORPAY_KEY_ID === !!e.RAZORPAY_KEY_SECRET, { message: 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set together' })
  .refine((e) => e.NODE_ENV !== 'production' || !e.RAZORPAY_KEY_ID || (e.RAZORPAY_KEY_ID.startsWith('rzp_live_') === (e.APP_ENV === 'production')), {
    message: 'APP_ENV=production needs rzp_live_ keys, and non-production environments must use rzp_test_ keys',
  })
  .refine((e) => e.NODE_ENV !== 'production' || !e.RAZORPAY_KEY_ID || !!e.RAZORPAY_WEBHOOK_SECRET, { message: 'production Razorpay requires RAZORPAY_WEBHOOK_SECRET' })
  .refine((e) => e.ASSET_STORAGE !== 's3' || (!!e.ASSET_BUCKET && !!e.ASSET_REGION), { message: 'ASSET_STORAGE=s3 requires ASSET_BUCKET and ASSET_REGION' })
  .refine((e) => e.NODE_ENV !== 'production' || e.ASSET_STORAGE === 's3', { message: 'production requires ASSET_STORAGE=s3 (local disk is lost on every deploy)' })
  // ── production safety net: refuse to boot in a configuration that is known to be exploitable ──
  .refine((e) => e.NODE_ENV !== 'production' || !!process.env['APP_ENV'], { message: 'production must set APP_ENV explicitly (it defaults to development, which enables dev-only behaviour)' })
  .refine((e) => e.NODE_ENV !== 'production' || e.APP_ENV !== 'development', { message: 'NODE_ENV=production cannot run with APP_ENV=development' })
  .refine((e) => e.NODE_ENV !== 'production' || e.TRUSTED_PROXY_HOPS >= 1, { message: 'production runs behind a proxy: set TRUSTED_PROXY_HOPS (ALB only = 1, CloudFront + ALB = 2) or every user shares one rate-limit bucket' })
  .refine((e) => e.NODE_ENV !== 'production' || e.AI_PROVIDER !== 'mock', { message: 'AI_PROVIDER=mock must never run in production' })
  .refine((e) => e.NODE_ENV !== 'production' || (new Set(e.AUTH_SECRET).size >= 12 && !/(ci-only|change-?me|secret|password|example|test)/i.test(e.AUTH_SECRET)), { message: 'AUTH_SECRET looks like a placeholder: generate one with `openssl rand -base64 48`' })
  .refine((e) => e.NODE_ENV !== 'production' || (e.REQUIRE_EMAIL_VERIFICATION && !!e.RESEND_API_KEY && !!e.EMAIL_FROM), { message: 'production requires REQUIRE_EMAIL_VERIFICATION=true with RESEND_API_KEY and EMAIL_FROM (unverified accounts would be unlimited free-credit farms)' })
  .refine((e) => e.AI_PROVIDER !== 'openrouter' || !!e.OPENROUTER_API_KEY, { message: 'AI_PROVIDER=openrouter requires OPENROUTER_API_KEY' })
  .refine((e) => e.NODE_ENV !== 'production' || (e.API_URL.startsWith('https://') && !!e.COOKIE_DOMAIN), {
    message: 'production requires https URLs and COOKIE_DOMAIN',
  })

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error))
  process.exit(1)
}
export const env = parsed.data
export const isProd = env.NODE_ENV === 'production'
