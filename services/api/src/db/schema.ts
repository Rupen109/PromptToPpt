import { boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { PlanFeatures, Presentation } from '@prompttoppt/validation'

// ─── Better Auth tables (shape required by the better-auth drizzle adapter) ───

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  /** lower-cased, `+tag` stripped (and dots for gmail): the identity abuse checks use, so `a+1@gmail.com` and `a.2@googlemail.com` are the same person */
  emailCanonical: text('email_canonical').unique(),
  image: text('image'),
  /** 'user' | 'admin' | 'support' — server-controlled, never accepted from clients */
  role: text('role').notNull().default('user'),
  /** ISO-3166 alpha-2 from our edge's trusted header at signup; used for pricing + owner analytics, never for authorisation */
  country: text('country'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
)

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// ─── Prompt drafts: landing-page prompt → editor handoff ──────────────────────
// The landing page cannot safely put a prompt in a URL (length, logs, referrers,
// analytics). It stores it here, gets an unguessable id, and redirects with that id.
// The editor claims it after login. Single-use, short-lived, owned once claimed.

export const promptDraft = pgTable(
  'prompt_draft',
  {
    id: text('id').primaryKey(),
    prompt: text('prompt').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    claimedByUserId: text('claimed_by_user_id').references(() => user.id, { onDelete: 'cascade' }),
    claimedAt: timestamp('claimed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('prompt_draft_expires_idx').on(t.expiresAt)],
)

/**
 * Reference material a visitor attaches on the landing page BEFORE logging in: files are parsed (and links fetched, SSRF-guarded)
 * at upload so mistakes show up immediately; only the extracted text is kept. It becomes a real private `source_document` for the
 * user when they claim the draft after login. Short-lived and purged on expiry.
 */
export const draftAttachment = pgTable(
  'draft_attachment',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // pdf | pptx | text | url
    title: text('title').notNull(),
    url: text('url'),
    parts: jsonb('parts').$type<{ locator: string | null; text: string }[]>().notNull(),
    chars: integer('chars').notNull(),
    draftId: text('draft_id').references(() => promptDraft.id, { onDelete: 'cascade' }),
    sourceId: text('source_id'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('draft_attachment_draft_idx').on(t.draftId), index('draft_attachment_expires_idx').on(t.expiresAt)],
)

// ─── Presentations ────────────────────────────────────────────────────────────
// The document (slides/elements/theme) is canonical JSON in presentation_version.document.
// Every save creates a new version row → version recovery + autosave history (spec §9).

/** A named folder for presentations (Pro+). Deleting a project never deletes its decks — they become unassigned. */
export const project = pgTable(
  'project',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('project_user_idx').on(t.userId, t.createdAt)],
)

export const presentation = pgTable(
  'presentation',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    aspectRatio: text('aspect_ratio').notNull().default('16:9'),
    projectId: text('project_id').references(() => project.id, { onDelete: 'set null' }),
    latestVersion: integer('latest_version').notNull().default(0),
    /** optimistic-concurrency token: +1 on every save. A save must present the revision it was based on (409 otherwise) */
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('presentation_user_idx').on(t.userId, t.updatedAt)],
)

export const presentationVersion = pgTable(
  'presentation_version',
  {
    id: text('id').primaryKey(),
    presentationId: text('presentation_id').notNull().references(() => presentation.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    document: jsonb('document').$type<Presentation>().notNull(),
    createdBy: text('created_by').notNull(), // 'generation' | 'user' | 'ai_edit'
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('presentation_version_uq').on(t.presentationId, t.version)],
)

// ─── Generation jobs (async pipeline, spec §7) ────────────────────────────────

export const JOB_STATUSES = ['queued', 'analyzing', 'outlining', 'generating', 'rendering', 'validating', 'completed', 'failed', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const generationJob = pgTable(
  'generation_job',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    presentationId: text('presentation_id').references(() => presentation.id, { onDelete: 'set null' }),
    status: text('status').$type<JobStatus>().notNull().default('queued'),
    progress: integer('progress').notNull().default(0),
    prompt: text('prompt').notNull(),
    /** analysis + chosen direction + slide count + theme etc. — validated before insert */
    options: jsonb('options').$type<Record<string, unknown>>().notNull(),
    /** stage outputs (analysis, outline, slide contents) saved as we go: a retry resumes instead of re-paying for AI */
    checkpoint: jsonb('checkpoint').$type<Record<string, unknown>>().notNull().default({}),
    /** client-supplied; (user, key) is unique so a retried request cannot create a second deck or double-bill */
    idempotencyKey: text('idempotency_key').notNull(),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    runAfter: timestamp('run_after').notNull().defaultNow(),
    lockedUntil: timestamp('locked_until'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('generation_job_idem_uq').on(t.userId, t.idempotencyKey),
    index('generation_job_queue_idx').on(t.status, t.runAfter),
  ],
)

// ─── AI usage ledger — IMMUTABLE (trigger blocks UPDATE/DELETE; see migration) ─────

export const modelPricingSnapshot = pgTable(
  'model_pricing_snapshot',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputPerMTokUsd: numeric('input_per_mtok_usd', { precision: 14, scale: 6 }).notNull(),
    outputPerMTokUsd: numeric('output_per_mtok_usd', { precision: 14, scale: 6 }).notNull(),
    cachedInputPerMTokUsd: numeric('cached_input_per_mtok_usd', { precision: 14, scale: 6 }),
    perImageUsd: numeric('per_image_usd', { precision: 14, scale: 6 }),
    sourceUrl: text('source_url').notNull(),
    capturedAt: timestamp('captured_at').notNull().defaultNow(),
  },
  (t) => [index('pricing_lookup_idx').on(t.provider, t.model, t.capturedAt)],
)

/**
 * The model catalogue (DB-driven, spec §13): which models exist, who may use them (access tier), what they cost,
 * and where they run. Local dev serves Vertex/Gemini rows; production serves OpenRouter rows — same code path.
 * Editing a row (price, tier, enabled) takes effect within ~30s without a deploy.
 */
export const modelCatalog = pgTable(
  'model_catalog',
  {
    /** stable id users and jobs refer to: "<provider>:<modelId>" */
    id: text('id').primaryKey(),
    provider: text('provider').notNull(), // vertex | gemini | openrouter
    modelId: text('model_id').notNull(), // the provider's own id, e.g. anthropic/claude-sonnet-4.6
    displayName: text('display_name').notNull(),
    vendor: text('vendor').notNull(), // Anthropic | Google | Z.ai …
    description: text('description').notNull().default(''),
    accessTier: text('access_tier').notNull(), // starter | premium | frontier
    kind: text('kind').notNull().default('text'), // text | image
    contextWindow: integer('context_window').notNull().default(128000),
    inputPerMTokUsd: numeric('input_per_mtok_usd', { precision: 14, scale: 6 }).notNull(),
    outputPerMTokUsd: numeric('output_per_mtok_usd', { precision: 14, scale: 6 }).notNull(),
    cachedInputPerMTokUsd: numeric('cached_input_per_mtok_usd', { precision: 14, scale: 6 }),
    perImageUsd: numeric('per_image_usd', { precision: 14, scale: 6 }),
    pricingSourceUrl: text('pricing_source_url').notNull(),
    pricingVerifiedOn: text('pricing_verified_on').notNull(),
    pricingNote: text('pricing_note'),
    enabled: boolean('enabled').notNull().default(true),
    /** development | staging | production */
    environments: text('environments').array().notNull(),
    /** position in the internal "fast" (analysis/directions) / "quality" chains; null = not part of it */
    routeFast: integer('route_fast'),
    routeQuality: integer('route_quality'),
    sortOrder: integer('sort_order').notNull().default(100),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('model_catalog_provider_model_uq').on(t.provider, t.modelId)],
)

export const aiUsageEvent = pgTable(
  'ai_usage_event',
  {
    id: text('id').primaryKey(),
    /** deliberately NOT a foreign key: the ledger must outlive users (audit/invoices) and a SET NULL cascade would be an UPDATE */
    userId: text('user_id'),
    presentationId: text('presentation_id'),
    jobId: text('job_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    modelVersion: text('model_version'),
    requestType: text('request_type').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    reasoningTokens: integer('reasoning_tokens').notNull().default(0),
    imageCount: integer('image_count').notNull().default(0),
    latencyMs: integer('latency_ms').notNull(),
    status: text('status').$type<'success' | 'error'>().notNull(),
    errorCode: text('error_code'),
    /** USD computed by us from the pricing snapshot (auditable against the provider invoice) */
    providerCostUsd: numeric('provider_cost_usd', { precision: 14, scale: 8 }).notNull().default('0'),
    /** what the provider itself said it charged (OpenRouter reports this); kept beside our computed cost for reconciliation */
    providerReportedCostUsd: numeric('provider_reported_cost_usd', { precision: 14, scale: 8 }),
    pricingSnapshotId: text('pricing_snapshot_id').references(() => modelPricingSnapshot.id),
    /** credits charged to the user — filled by billing in Phase 5 (provider cost ≠ customer credit cost) */
    creditCost: numeric('credit_cost', { precision: 14, scale: 4 }).notNull().default('0'),
    environment: text('environment').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ai_usage_created_idx').on(t.createdAt),
    index('ai_usage_user_idx').on(t.userId, t.createdAt),
    index('ai_usage_job_idx').on(t.jobId),
  ],
)

// ─── Sources (spec §6): extracted text + citation-sized chunks ────────────────

export const sourceDocument = pgTable(
  'source_document',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // pdf | url | text …
    title: text('title').notNull(),
    url: text('url'),
    status: text('status').notNull().default('ready'), // ready | failed
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('source_user_idx').on(t.userId)],
)

export const sourceChunk = pgTable(
  'source_chunk',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull().references(() => sourceDocument.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    /** "p. 4", "section: Pricing", … for citations */
    locator: text('locator'),
    text: text('text').notNull(),
  },
  (t) => [index('source_chunk_idx').on(t.sourceId, t.ordinal)],
)

// ─── Plans, subscriptions, credits (spec §15) — configuration lives in the DB, not in code ─────────

export const plan = pgTable('plan', {
  id: text('id').primaryKey(), // 'starter' | 'pro' | 'gold'
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  monthlyCredits: integer('monthly_credits').notNull(),
  maxSlides: integer('max_slides').notNull(),
  /** null = unlimited */
  maxPresentationsPerMonth: integer('max_presentations_per_month'),
  maxImagesPerPresentation: integer('max_images_per_presentation').notNull().default(0),
  maxImagesPerMonth: integer('max_images_per_month').notNull().default(0),
  features: jsonb('features').$type<PlanFeatures>().notNull(),
  isActive: boolean('is_active').notNull().default(true),
})

export const planPrice = pgTable(
  'plan_price',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id').notNull().references(() => plan.id, { onDelete: 'cascade' }),
    currency: text('currency').notNull(), // INR | USD
    interval: text('interval').notNull(), // month | year
    /** minor units: cents / paise */
    amountMinor: integer('amount_minor').notNull(),
    /** id of the price at the payment provider (Razorpay plan / Stripe price) — set in the billing phase */
    providerPriceId: text('provider_price_id'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('plan_price_uq').on(t.planId, t.currency, t.interval)],
)

/** No row = Starter. One live subscription per user. */
export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull().references(() => plan.id),
    status: text('status').notNull(), // active | trialing | past_due | cancelled | incomplete
    currency: text('currency').notNull(),
    interval: text('interval').notNull(),
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    provider: text('provider').notNull().default('manual'), // manual | razorpay | stripe
    providerRef: text('provider_ref'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('subscription_user_uq').on(t.userId)],
)

/**
 * Money that actually moved (or failed to), written by verified payment webhooks / the verify endpoint. One row per
 * provider payment id, so replays are no-ops. Feeds the owner Sales/Margin sections; amounts are minor units (paise/cents).
 */
export const payment = pgTable(
  'payment',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    providerSubscriptionId: text('provider_subscription_id'),
    planId: text('plan_id'),
    interval: text('interval'),
    currency: text('currency').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    status: text('status').notNull(), // captured | failed | refunded
    method: text('method'),
    failureReason: text('failure_reason'),
    paidAt: timestamp('paid_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payment_provider_uq').on(t.provider, t.providerPaymentId), index('payment_user_idx').on(t.userId, t.paidAt)],
)

/** Webhook deliveries already processed (provider event id) — deliveries are at-least-once. */
export const webhookEvent = pgTable('webhook_event', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at').notNull().defaultNow(),
})

export const creditBalance = pgTable(
  'credit_balance',
  {
    userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
    balance: integer('balance').notNull(),
    /** which allowance period the last grant was for (YYYY-MM for Starter, period-start date for paid) */
    periodKey: text('period_key').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  // Defence in depth: even a buggy query cannot take a balance negative.
  (t) => [check('credit_balance_non_negative', sql`${t.balance} >= 0`)],
)

/** Append-only (trigger). `idempotencyKey` makes every grant/reserve/refund safe to retry. */
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    delta: integer('delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason').notNull(), // plan_grant | reserve | refund | clawback | adjustment | topup
    refType: text('ref_type'),
    refId: text('ref_id'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('credit_ledger_user_idx').on(t.userId, t.createdAt)],
)

/** Customer-facing credit price per action × model tier (spec: configurable; separate from raw provider cost). */
export const creditCost = pgTable(
  'credit_cost',
  {
    id: text('id').primaryKey(),
    action: text('action').notNull(), // generate_slide | ai_edit | image
    tier: text('tier').notNull(), // starter | premium | frontier
    credits: integer('credits').notNull(),
  },
  (t) => [uniqueIndex('credit_cost_uq').on(t.action, t.tier)],
)

/** Who did what in the owner/admin area (spec §18: audit admin actions). Append-only by convention + trigger in migration. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').notNull(),
    action: text('action').notNull(), // e.g. admin.usage.summary
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('audit_log_actor_idx').on(t.actorUserId, t.createdAt)],
)

/**
 * AI-generated (and later uploaded) images. The row id is the unguessable URL token: assets are served by
 * capability URL (128+ bits) so slides render for share-link viewers and exports without an auth round trip.
 * Counts here drive the per-deck / per-month image limits, so a row exists even if the user discards the picture
 * (it still cost money).
 */
export const generatedAsset = pgTable(
  'generated_asset',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    presentationId: text('presentation_id'),
    kind: text('kind').notNull().default('image'),
    /** pending = quota slot reserved while the model runs (so parallel requests can't exceed limits); ready = stored */
    status: text('status').notNull().default('ready'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    prompt: text('prompt').notNull(),
    /** client idempotency key: retrying the same request returns the same picture instead of generating (and charging) twice */
    requestId: text('request_id'),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    storageKey: text('storage_key').notNull(),
    providerCostUsd: numeric('provider_cost_usd', { precision: 14, scale: 8 }).notNull().default('0'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [index('generated_asset_user_idx').on(t.userId, t.createdAt), index('generated_asset_deck_idx').on(t.presentationId), uniqueIndex('generated_asset_request_uq').on(t.userId, t.requestId)],
)

/**
 * One row per export request (owner "Exports" section). PPTX is built on the server (status/bytes/duration are exact);
 * PDF/PNG/JPG/HTML render in the browser, which reports back through PATCH /exports/events/:id.
 */
export const exportEvent = pgTable(
  'export_event',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    presentationId: text('presentation_id').notNull(),
    format: text('format').notNull(), // pptx | pdf | png | jpg | html
    mode: text('mode').notNull(), // server | client
    status: text('status').notNull().default('started'), // started | success | failed
    slideCount: integer('slide_count'),
    bytes: integer('bytes'),
    durationMs: integer('duration_ms'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('export_event_created_idx').on(t.createdAt), index('export_event_user_idx').on(t.userId, t.createdAt)],
)

/** Owner-controlled switches. A missing row means the code default (see flags/registry.ts); `rolloutPercent` buckets users by a stable hash of their id. */
export const featureFlag = pgTable('feature_flag', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull(),
  rolloutPercent: integer('rollout_percent').notNull().default(100),
  /** optional plan restriction: only these plan ids get the flag (empty = everyone) */
  plans: jsonb('plans').$type<string[]>().notNull().default([]),
  note: text('note'),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

/**
 * Owner-entered readings of the cloud provider's own balance (e.g. Google Cloud "Free trial status" credit left, in INR).
 * Google has no public API for the trial-credit balance, so reconciliation compares the burn between two readings with what
 * our usage ledger recorded in the same window — the gap is spend we did not see (scripts, console use, other apps on the project).
 */
export const cloudBalanceCheckin = pgTable(
  'cloud_balance_checkin',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull().default('google'),
    currency: text('currency').notNull().default('INR'),
    /** remaining credit (or, for kind=spent, cumulative spend) exactly as the provider console shows it */
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    kind: text('kind').notNull().default('credit_remaining'), // credit_remaining | cumulative_spend
    /** when the console was read (not when the row was typed in) */
    readAt: timestamp('read_at').notNull().defaultNow(),
    note: text('note'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('cloud_checkin_read_idx').on(t.provider, t.readAt)],
)

/** The AI-assistant conversation of one presentation (survives reloads and devices). `body` is the message exactly as the editor renders it. */
export const aiChatMessage = pgTable(
  'ai_chat_message',
  {
    id: text('id').primaryKey(),
    presentationId: text('presentation_id').notNull().references(() => presentation.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull(), // user | ai | error
    body: jsonb('body').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('ai_chat_deck_idx').on(t.presentationId, t.createdAt)],
)


/**
 * Every sign-up / failed sign-in / reset / verification request, kept briefly. Rate limits and lockouts are COUNTED from this table, so
 * they hold across API instances and restarts (an in-memory limiter resets on deploy and multiplies by the number of tasks).
 */
export const authAttempt = pgTable(
  'auth_attempt',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // signup | signin_fail | reset | verify
    ip: text('ip').notNull(),
    /** canonical email (or empty) */
    subject: text('subject').notNull().default(''),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('auth_attempt_ip_idx').on(t.kind, t.ip, t.createdAt), index('auth_attempt_subject_idx').on(t.kind, t.subject, t.createdAt)],
)
