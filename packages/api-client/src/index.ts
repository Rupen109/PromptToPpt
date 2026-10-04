import { createAuthClient } from 'better-auth/react'
import type { Direction, Entitlements, ExportFormat, PlanId, PlanView, Presentation, PromptAnalysis, SlideContent, SubscriptionSummary, Theme } from '@prompttoppt/validation'

export interface ApiClientConfig {
  /** e.g. https://api.prompttoppt.app */
  apiUrl: string
}

export interface CurrentUser {
  id: string
  email: string
  name: string
  image: string | null
  role: 'user' | 'admin' | 'support'
}

export type JobStatus = 'queued' | 'analyzing' | 'outlining' | 'generating' | 'rendering' | 'validating' | 'completed' | 'failed' | 'cancelled'
export interface JobView {
  id: string
  status: JobStatus
  progress: number
  presentationId: string | null
  error: string | null
  /** what the generation quality gate found (present once the deck is composed) */
  quality?: { pictureSlots: number; picturesPlaced: number; openIssues: number } | null
}
export interface AnalyzeResult {
  mode: 'broad' | 'detailed'
  analysis: PromptAnalysis
  directions?: Direction[]
  suggestedSlideCount: number
  maxSlides: number
  creditBalance: number
}

export interface ModelOption {
  id: string
  displayName: string
  vendor: string
  description: string
  tier: 'starter' | 'premium' | 'frontier'
  /** false = shown with an upgrade badge */
  allowed: boolean
  /** price in CREDITS (never provider dollars) — display only; the server recomputes at job creation */
  creditsPerSlide: number
  /** price of one AI edit with this model, in credits */
  creditsPerEdit: number
  /** price of one picture with this (image) model, in credits */
  creditsPerImage: number
}
export interface CreateJobInput {
  /** template design to build with (omitted: chosen from the deck's category and your plan) */
  designId?: string
  /** rewrite this existing deck of yours instead of creating a new one */
  targetPresentationId?: string
  /** with targetPresentationId: keep every word, only re-pick the pictures */
  picturesOnly?: boolean
  prompt: string
  analysis?: PromptAnalysis
  direction?: Direction
  slideCount?: number
  model?: string
  sourceIds?: string[]
  idempotencyKey: string
}
export interface PresentationSummary {
  id: string
  title: string
  aspectRatio: string
  updatedAt: string
  projectId: string | null
  /** first slide + theme, for thumbnails (absent on very old rows) */
  cover?: unknown
  theme?: unknown
}
export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  decks: number
}
export interface LoadedPresentation {
  id: string
  title: string
  /** optimistic-concurrency token: send it back as baseRevision when saving */
  revision: number
  version: number
  document: Presentation
}
export interface SaveResult {
  revision: number
  version: number
}
export interface VersionSummary {
  version: number
  createdAt: string
  createdBy: 'generation' | 'user' | 'restore' | 'ai_edit'
  slides: number
}
export type AiEditCommand = 'rewrite' | 'shorten' | 'expand' | 'change_tone' | 'translate' | 'improve' | 'custom'
export interface AiEditResult {
  content: SlideContent
  creditsCharged: number
  model: string
}

export type AiImageProposal = AiAssistResult['images'][number]
export interface AiAssistResult {
  reply: string
  /** full replacement theme (null = unchanged) */
  theme: Theme | null
  edits: { slideId: string; content: SlideContent }[]
  /** pictures the user can confirm (generation is a separate, explicitly-paid step) */
  images: { slideId: string; slideNumber: number; placement: 'background' | 'beside' | 'floating'; prompt: string; alt: string }[]
  /** what was actually changed, human-readable */
  /** the user wants every slide rebuilt from their details: start a generation job with this brief (see createJob targetPresentationId) */
  rewrite?: { brief: string; picturesOnly?: boolean } | null
  /** sources attached to this message that the deck should now remember */
  sources?: { id: string; type: 'pdf' | 'url' | 'text'; title: string; url?: string }[]
  applied: string[]
  /** what was skipped or impossible (plan gates, locked slides, images…) */
  notes: string[]
  creditsCharged: number
  model: string
}

export type ImageStyle = 'photo' | 'illustration' | '3d' | 'minimal' | 'abstract' | 'watercolor'
export interface ImageUsage {
  enabled: boolean
  deck: { used: number; max: number }
  month: { used: number; max: number }
}
export interface GeneratedImage {
  assetId: string
  /** unguessable capability URL, safe to store in the document */
  url: string
  mime: string
  creditsCharged: number
  model: string
  usage: Omit<ImageUsage, 'enabled'>
}

export interface DraftAttachment {
  id: string
  kind: 'pdf' | 'pptx' | 'text' | 'url'
  title: string
  chars: number
}

export interface SourceSummary {
  id: string
  type: 'text' | 'url' | 'pdf' | 'pptx'
  title: string
  chunks: number
}

export type { Entitlements, PlanView, SubscriptionSummary }
export interface CheckoutSession {
  /** public Razorpay key id (the secret never leaves the server) */
  keyId: string
  subscriptionId: string
  currency: 'INR' | 'USD'
  amountMinor: number
  planName: string
  interval: 'month' | 'year'
  testMode: boolean
  prefill: { name: string; email: string }
}
export interface PaymentSummary { id: string; amountMinor: number; currency: string; status: string; paidAt: string; planId: string | null }
export interface BillingOverview { subscription: SubscriptionSummary | null; payments: PaymentSummary[]; billingEnabled: boolean; testMode: boolean }
export interface RazorpayResult { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }
export interface PlansResponse {
  currency: 'INR' | 'USD'
  country: string | null
  plans: PlanView[]
}

export interface UsageFilters {
  from?: string
  to?: string
  provider?: string
  model?: string
  requestType?: string
  environment?: 'development' | 'staging' | 'production'
  status?: 'success' | 'error'
  userId?: string
  country?: string
}
export interface UsageSummary {
  calls: number; successCalls: number; failedCalls: number; failureRate: number
  inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens: number; totalTokens: number; images: number
  costUsd: number; reportedCostUsd: number; reportedCalls: number
  p50LatencyMs: number; p95LatencyMs: number; activeUsers: number; jobs: number; avgTokensPerJob: number; costPerJobUsd: number
}
export interface UsagePoint { t: string; calls: number; inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens: number; costUsd: number; failed: number }
export type UsageDimension = 'model' | 'provider' | 'requestType' | 'user' | 'country' | 'status' | 'environment'
export interface UsageRow { key: string; label: string | null; calls: number; inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens: number; totalTokens: number; costUsd: number; failed: number; avgLatencyMs: number }

const qs = (o: object) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

type Envelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string; details?: Record<string, unknown> } }

/** Plan/credit refusals the UI should answer with an upgrade or top-up prompt. */
export const isGateError = (e: unknown): e is ApiError => e instanceof ApiError && ['UPGRADE_REQUIRED', 'INSUFFICIENT_CREDITS', 'LIMIT_REACHED'].includes(e.code)

export function createApiClient({ apiUrl }: ApiClientConfig) {
  const base = apiUrl.replace(/\/$/, '')

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      credentials: 'include', // session cookie (httpOnly) travels cross-origin
      // FormData sets its own multipart boundary header; everything else is JSON
      headers: { ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(init.headers as Record<string, string> | undefined) },
    })
    const body = (await res.json().catch(() => null)) as Envelope<T> | null
    if (!res.ok || !body || !body.success) {
      const err = body && !body.success ? body.error : { code: 'HTTP_ERROR', message: res.statusText }
      throw new ApiError(res.status, err.code, err.message, 'details' in err ? err.details : undefined)
    }
    return body.data
  }

  return {
    /** Better Auth client: signIn.email, signUp.email, signIn.social, signOut, useSession */
    auth: createAuthClient({ baseURL: base }),

    /** Returns null when anonymous instead of throwing. */
    async me(): Promise<CurrentUser | null> {
      try {
        return await request<CurrentUser>('/api/v1/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },

    /** Landing page → stores the prompt server-side; returns an opaque id to put in the redirect URL. */
    createDraft: (prompt: string, attachmentIds: string[] = []) =>
      request<{ id: string; expiresInSeconds: number }>('/api/v1/drafts', { method: 'POST', body: JSON.stringify({ prompt, attachmentIds }) }),
    /** Landing page, before login: attach a PDF / PowerPoint (.pptx) / text file. Parsed immediately; bad files are rejected with a reason. */
    addDraftFile: (file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<DraftAttachment>('/api/v1/drafts/attachments', { method: 'POST', body })
    },
    /** Landing page, before login: a reference website (fetched and read immediately). */
    addDraftLink: (url: string) => request<DraftAttachment>('/api/v1/drafts/attachments/link', { method: 'POST', body: JSON.stringify({ url }) }),

    /** Editor → after login, exchanges the draft id for the prompt (single use, owner-bound). */
    analyze: (prompt: string, sourceIds: string[] = []) =>
      request<AnalyzeResult>('/api/v1/generation/analyze', { method: 'POST', body: JSON.stringify({ prompt, sourceIds }) }),
    createJob: (input: CreateJobInput) => request<JobView>('/api/v1/generation/jobs', { method: 'POST', body: JSON.stringify(input) }),
    getJob: (id: string) => request<JobView>(`/api/v1/generation/jobs/${encodeURIComponent(id)}`),
    cancelJob: (id: string) => request<JobView>(`/api/v1/generation/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
    listPresentations: (projectId?: string) => request<PresentationSummary[]>(`/api/v1/presentations${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
    /** New deck from a template design (or blank when templateId is omitted). Premium designs need Pro (server-enforced). */
    createPresentation: (body: { templateId?: string; title?: string; aspectRatio?: '16:9' | '4:3' | '1:1'; projectId?: string }) =>
      request<{ id: string }>('/api/v1/presentations', { method: 'POST', body: JSON.stringify(body) }),
    moveToProject: (deckId: string, projectId: string | null) => request<{ id: string; projectId: string | null }>(`/api/v1/presentations/${encodeURIComponent(deckId)}/project`, { method: 'PUT', body: JSON.stringify({ projectId }) }),
    listProjects: () => request<ProjectSummary[]>('/api/v1/projects'),
    createProject: (name: string) => request<ProjectSummary>('/api/v1/projects', { method: 'POST', body: JSON.stringify({ name }) }),
    renameProject: (id: string, name: string) => request<{ id: string; name: string }>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    deleteProject: (id: string) => request<null>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getPresentation: (id: string) => request<LoadedPresentation>(`/api/v1/presentations/${encodeURIComponent(id)}`),

    addTextSource: (text: string, title?: string) => request<SourceSummary>('/api/v1/sources/text', { method: 'POST', body: JSON.stringify({ text, ...(title ? { title } : {}) }) }),
    addUrlSource: (url: string) => request<SourceSummary>('/api/v1/sources/url', { method: 'POST', body: JSON.stringify({ url }) }),
    addPdfSource: (file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<SourceSummary>('/api/v1/sources/pdf', { method: 'POST', body })
    },
    /** PDF, PowerPoint (.pptx) or text (.txt/.md): the server decides by content, not file name. */
    addFileSource: (file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<SourceSummary>('/api/v1/sources/file', { method: 'POST', body })
    },
    deleteSource: (id: string) => request<null>(`/api/v1/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    models: (kind: 'text' | 'image' = 'text') => request<{ default: string | null; models: ModelOption[] }>(`/api/v1/models${kind === 'image' ? '?kind=image' : ''}`),
    /** Remaining AI-picture allowance for a deck / the month — show it BEFORE the user spends anything. */
    imageUsage: (deckId: string) => request<ImageUsage>(`/api/v1/presentations/${encodeURIComponent(deckId)}/images/usage`),
    /** One picture. Charged once per requestId (retries return the same picture); refunded on any failure. */
    generateImage: (deckId: string, body: { prompt: string; style?: ImageStyle; aspect: '16:9' | '4:3' | '1:1' | '3:4' | '9:16'; model?: string; requestId: string }) =>
      request<GeneratedImage>(`/api/v1/presentations/${encodeURIComponent(deckId)}/images`, { method: 'POST', body: JSON.stringify(body) }),
    /** Conflict-safe save: 409 CONFLICT (details.currentRevision) if someone else saved since `baseRevision`. */
    savePresentation: (id: string, baseRevision: number, document: Presentation, snapshot = false) =>
      request<SaveResult>(`/api/v1/presentations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ baseRevision, document, snapshot }) }),
    listVersions: (id: string) => request<VersionSummary[]>(`/api/v1/presentations/${encodeURIComponent(id)}/versions`),
    restoreVersion: (id: string, version: number, baseRevision: number) =>
      request<SaveResult & { document: Presentation }>(`/api/v1/presentations/${encodeURIComponent(id)}/versions/${version}/restore`, { method: 'POST', body: JSON.stringify({ baseRevision }) }),
    deletePresentation: (id: string) => request<null>(`/api/v1/presentations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    /** Pro+. Returns validated replacement content for ONE slide; apply it as a command. */
    aiEdit: (id: string, body: { slideId: string; command: AiEditCommand; argument?: string; model?: string; requestId: string }) =>
      request<AiEditResult>(`/api/v1/presentations/${encodeURIComponent(id)}/ai-edit`, { method: 'POST', body: JSON.stringify(body) }),
    /** Chat-style assistant: free-form instruction → validated theme/animation/content changes to apply as ONE undoable step. */
    aiAssist: (id: string, body: { instruction: string; scope: 'deck' | 'slide'; slideId?: string; model?: string; requestId: string; sourceIds?: string[] }) =>
      request<AiAssistResult>(`/api/v1/presentations/${encodeURIComponent(id)}/ai-assist`, { method: 'POST', body: JSON.stringify(body) }),
    /** The assistant conversation of this presentation (persisted server-side; survives reloads and devices). */
    aiChat: (id: string) => request<Record<string, unknown>[]>(`/api/v1/presentations/${encodeURIComponent(id)}/chat`),
    saveAiChat: (id: string, messages: Record<string, unknown>[]) => request<{ saved: boolean }>(`/api/v1/presentations/${encodeURIComponent(id)}/chat`, { method: 'POST', body: JSON.stringify({ messages }) }),
    clearAiChat: (id: string) => request<{ cleared: boolean }>(`/api/v1/presentations/${encodeURIComponent(id)}/chat`, { method: 'DELETE' }),
    plans: () => request<PlansResponse>('/api/v1/plans'),
    entitlements: () => request<Entitlements>('/api/v1/me/entitlements'),
    flags: () => request<Record<string, boolean>>('/api/v1/flags'),
    /** Server-gated: Starter gets UPGRADE_REQUIRED. Real export arrives in the export phase. */
    /** PPTX comes back as a file (`{ blob, filename }`); the other formats are rendered in the browser after the server authorises them (`{ mode: 'client' }`). */
    async requestExport(presentationId: string, format: ExportFormat): Promise<{ mode: 'file'; blob: Blob; filename: string } | { mode: 'client'; format: ExportFormat; title: string; eventId: string }> {
      const res = await fetch(`${base}/api/v1/exports`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId, format }) })
      if ((res.headers.get('Content-Type') ?? '').includes('application/json')) {
        const body = (await res.json().catch(() => null)) as Envelope<{ mode: 'client'; format: ExportFormat; title: string; eventId: string }> | null
        if (!res.ok || !body || !body.success) {
          const err = body && !body.success ? body.error : { code: 'HTTP_ERROR', message: res.statusText }
          throw new ApiError(res.status, err.code, err.message, 'details' in err ? err.details : undefined)
        }
        return body.data
      }
      if (!res.ok) throw new ApiError(res.status, 'HTTP_ERROR', res.statusText)
      const filename = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `presentation.${format}`
      return { mode: 'file', blob: await res.blob(), filename }
    },
    /** Browser-rendered exports report their outcome for the owner's Exports section (best effort). */
    reportExport: (eventId: string, body: { ok: boolean; durationMs?: number; bytes?: number; slideCount?: number; error?: string }) => request<{ updated: boolean }>(`/api/v1/exports/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => null),
    /** Server picks price + currency; the browser then opens Razorpay Checkout with the returned subscription. */
    startCheckout: (planId: 'pro' | 'gold', interval: 'month' | 'year') => request<CheckoutSession>('/api/v1/billing/checkout', { method: 'POST', body: JSON.stringify({ planId, interval }) }),
    /** Send Razorpay's success payload; the server verifies the signature before activating the plan. */
    verifyPayment: (r: RazorpayResult) => request<Entitlements>('/api/v1/billing/verify', { method: 'POST', body: JSON.stringify(r) }),
    billing: () => request<BillingOverview>('/api/v1/billing/subscription'),
    cancelSubscription: () => request<Omit<BillingOverview, 'billingEnabled'>>('/api/v1/billing/cancel', { method: 'POST' }),
    /** Development/staging only (404 in production): switch plans without payment to exercise gating. */

    /** Owner analytics (server returns 403 unless role=admin). Source: the immutable AI usage ledger. */
    admin: {
      /** Generic owner-section access: `api.admin.get('/sales/summary', {from})`, `api.admin.send('PUT','/flags/images',{...})`. Paths are relative to /api/v1/admin. */
      get: <T>(path: string, query: Record<string, string | number | undefined> = {}) => request<T>(`/api/v1/admin${path}${qs(query)}`),
      send: <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => request<T>(`/api/v1/admin${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
      summary: (f: UsageFilters) => request<UsageSummary>(`/api/v1/admin/usage/summary${qs(f)}`),
      timeseries: (f: UsageFilters, bucket: 'hour' | 'day' | 'week' | 'month' = 'day') => request<UsagePoint[]>(`/api/v1/admin/usage/timeseries${qs({ ...f, bucket })}`),
      breakdown: (f: UsageFilters, by: UsageDimension, limit = 20) => request<UsageRow[]>(`/api/v1/admin/usage/breakdown${qs({ ...f, by, limit })}`),
    },

    claimDraft: (id: string) => request<{ prompt: string; sources: { id: string; type: string; title: string; chunks: number }[]; sourceIds: string[] }>(`/api/v1/drafts/${encodeURIComponent(id)}/claim`, { method: 'POST' }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

/**
 * Open-redirect guard for `?next=`. Accepts only same-app relative paths or absolute URLs whose
 * origin is explicitly allowed; anything else (protocol-relative, javascript:, other hosts) → fallback.
 */
export function safeRedirect(next: string | null | undefined, allowedOrigins: string[], fallback: string): string {
  if (!next) return fallback
  if (next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) return next
  try {
    const url = new URL(next)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && allowedOrigins.includes(url.origin)) return url.toString()
  } catch {
    /* not a URL */
  }
  return fallback
}
export * from './plans'
