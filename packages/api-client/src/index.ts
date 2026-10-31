import { createAuthClient } from 'better-auth/react'
import type { Direction, Entitlements, ExportFormat, PlanId, PlanView, Presentation, PromptAnalysis, SlideContent, SubscriptionSummary, Theme } from '@prompttoppt/validation'

export interface ApiClientConfig {
  /** e.g. https://api.slidesdone.app */
  apiUrl: string
  /** the account id this tab believes is signed in; sent on every write so the server can refuse it if another tab switched accounts */
  sessionUser?: () => string | null
  /** called when the server says the session changed under this tab (409 SESSION_CHANGED) */
  onSessionChanged?: () => void
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
  /** build a new deck in this brand kit's colours, fonts and logo (Pro/Gold) */
  brandKitId?: string
  /** remix this deck of yours into a NEW deck with the same look (Pro/Gold); its text comes in as `sourceIds` from remixSource() */
  remixOf?: string
  sourceIds?: string[]
  /** language the person chose for the deck (code from DECK_LANGUAGES); omitted → detected from the request */
  language?: string
  idempotencyKey: string
}
export interface AskDeckAnswer { answer: string; slides: { n: number; id: string }[]; creditsCharged: number; model: string }
export interface SitemapRequest { url: string; maxPages?: number; lastmod?: boolean; changefreq?: 'none' | 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'; priority?: boolean }
export interface SitemapResponse {
  site: string
  urls: { loc: string; depth: number; lastmod?: string }[]
  xml: string
  stats: { found: number; crawled: number; skipped: { robots: number; noindex: number; other: number }; failed: number; truncated: boolean; slow: boolean; ms: number; foundSitemap: boolean }
}
export interface ResearchResult { sources: (SourceSummary & { url?: string })[]; creditsCharged: number }
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
  /** `editor` = a collaborator on someone else's deck (no export / share / delete; AI is charged to the owner) */
  role?: 'owner' | 'editor'
}
export interface MemberView { id: string; email: string; status: 'pending' | 'active'; role: 'editor'; createdAt: string; expiresAt: string | null }
export interface InvitePreview { title: string; from: string; status: 'pending' | 'active'; forThisAccount: boolean; presentationId: string | null }
export interface SharedDeck { id: string; title: string; updatedAt: string; aspectRatio: string; owner: string }
export interface LivePeer { clientId: string; userId: string; name: string; color: string; slideId: string | null; selection: string[]; editing: string | null; cursor: { x: number; y: number } | null; at: number }
export interface ShareLinkView { url: string | null; hasPassword: boolean; expiresAt: string | null; /** all-time visits recorded for the deck (every plan) and when the last one was */ views?: number; lastViewedAt?: string | null }
/** Share-link analytics (C7). `detail: false` = a plan without the dashboard: only the total. */
export interface ShareAnalyticsBasic { detail: false; totalViews: number; lastViewedAt: string | null }
export interface ShareAnalyticsFull {
  detail: true; days: 7 | 30 | 90; totalViews: number; lastViewedAt: string | null; capped: boolean
  totals: { views: number; visitors: number; avgSeconds: number; completionPct: number; avgSlidesSeen: number }
  daily: { date: string; views: number; visitors: number }[]
  slides: { slideId: string; index: number; reachPct: number; avgSeconds: number; leftHerePct: number; views: number }[]
  removedSlidesSeconds: number
  devices: { name: string; views: number; pct: number }[]; sources: { name: string; views: number; pct: number }[]; countries: { name: string; views: number; pct: number }[]
  recent: { at: string; device: 'phone' | 'tablet' | 'computer'; country: string | null; source: string; seconds: number; slidesReached: number; slideCount: number; completed: boolean }[]
}
export type ShareAnalytics = ShareAnalyticsBasic | ShareAnalyticsFull
export type ShareExpiry = 1 | 7 | 30 | 90 | null
export interface PublicDeck { title: string; document: Presentation; watermark: boolean }
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
  /** new slides to insert (afterSlideId null = at the end) */
  additions?: { afterSlideId: string | null; content: SlideContent }[]
  /** the assistant is asking which slide (or what) you mean; the reply is the question */
  ask?: boolean
  /** new background colours for single slides (applied with the editor's setSlideBackground, so the text stays readable) */
  backgrounds?: { slideId: string; color: string }[]
  /** slides whose text must be made readable on what is behind it (the editor recolours only the text that does not read) */
  readability?: string[]
  /** earlier assistant changes to put back (the editor holds the "before" of each) */
  reverts?: { change: number; part: 'all' | 'theme' | 'slide'; slideId?: string }[]
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
export interface StockPhoto { id: string; provider: 'unsplash' | 'pexels'; thumb: string; full: string; alt: string; author: string; authorUrl?: string; pageUrl: string; trackUrl?: string; attribution: { source: string; license: string; url?: string } }
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

export interface FreeOutline { title: string; slides: { title: string; points: string[] }[] }
export interface FreeTranscript { title: string; words: number; timed: boolean; parts: { locator: string | null; text: string }[]; attachmentId: string }
export interface PublicReviews { count: number; average: number | null; items: { id: string; rating: number; body: string; name: string; role: string | null; createdAt: string }[] }
export interface MyReview { rating: number; body: string; displayName: string; role: string | null; status: 'pending' | 'approved' | 'rejected' }
export interface FreePdfResult extends FreeOutline { summary: string; keyPoints: string[]; mode: string; pages: number; attachmentId: string; truncated: boolean }

export interface DraftAttachment {
  id: string
  kind: 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'csv' | 'email' | 'text' | 'url' | 'transcript'
  title: string
  chars: number
}

/** Comments on slides (C6). */
export interface CommentItem { id: string; authorId: string; authorName: string; body: string; createdAt: string; editedAt: string | null; mine: boolean }
export interface CommentThread { id: string; slideId: string; x: number | null; y: number | null; status: 'open' | 'resolved'; createdAt: string; resolvedAt: string | null; resolvedByName: string | null; comments: CommentItem[] }
export interface CommentPerson { id: string; name: string; role: 'owner' | 'editor' }
export interface CommentsData { threads: CommentThread[]; people: CommentPerson[]; unread: number; seenAt: string }

export interface SourceSummary {
  id: string
  type: 'text' | 'url' | 'pdf' | 'pptx' | 'docx' | 'xlsx' | 'csv' | 'email' | 'image' | 'transcript'
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
  /** true = show OUR test payment window instead of Razorpay's (the server runs with PAYMENTS_SIMULATOR) */
  simulated?: boolean
  prefill: { name: string; email: string }
}
export interface PaymentSummary { id: string; amountMinor: number; currency: string; status: string; paidAt: string; planId: string | null }
/** What "use my brand" found on a company website. */
export interface BrandProfile {
  sourceUrl: string
  name: string | null
  colors: { primary: string | null; accent: string | null; accentDerived: boolean; palette: string[] }
  fonts: { heading: { family: string; original: string; exact: boolean } | null; body: { family: string; original: string; exact: boolean } | null; detected: string[] }
  /** saved on our side; width ÷ height */
  logo: { url: string; aspect: number } | null
  /** low = few brand signals on the page: check the result before applying */
  confidence: 'high' | 'low'
}
/** A saved brand kit: colours, fonts, logo and pictures that "Apply" puts on a deck and new decks can be built in. */
export interface BrandKit {
  id: string
  name: string
  colors: { primary: string | null; accent: string | null; extra: string[] }
  fonts: { heading: string | null; body: string | null }
  logo: { url: string; aspect: number } | null
  images: { id: string; name: string; url: string; aspect: number }[]
  sourceUrl: string | null
  isDefault: boolean
  updatedAt: string
}
export interface BrandKitInput {
  name?: string
  primary?: string | null
  accent?: string | null
  extra?: string[]
  headingFont?: string | null
  bodyFont?: string | null
  sourceUrl?: string | null
  /** one of our own asset URLs, e.g. the logo a website lookup saved */
  logoUrl?: string
}
export interface BillingOverview { subscription: SubscriptionSummary | null; payments: PaymentSummary[]; billingEnabled: boolean; testMode: boolean; simulator?: boolean }
export type SimulatorPayResult = ({ outcome: 'paid' } & RazorpayResult) | { outcome: 'failed'; message: string }
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

export function createApiClient({ apiUrl, sessionUser, onSessionChanged }: ApiClientConfig) {
  const base = apiUrl.replace(/\/$/, '')

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase()
    const expected = method === 'GET' || method === 'HEAD' ? null : (sessionUser?.() ?? null)
    const res = await fetch(`${base}${path}`, {
      ...init,
      credentials: 'include', // session cookie (httpOnly) travels cross-origin
      // FormData sets its own multipart boundary header; everything else is JSON
      headers: { ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(expected ? { 'X-Session-User': expected } : {}), ...(init.headers as Record<string, string> | undefined) },
    })
    const body = (await res.json().catch(() => null)) as Envelope<T> | null
    if (!res.ok || !body || !body.success) {
      const err = body && !body.success ? body.error : { code: 'HTTP_ERROR', message: res.statusText }
      if (err.code === 'SESSION_CHANGED') onSessionChanged?.()
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

    /** Public free tools (no login; rate- and spend-limited server-side). */
    freeOutline: (b: { topic: string; kind?: string; audience?: string; slides?: number }) =>
      request<FreeOutline>('/api/v1/free-tools/outline', { method: 'POST', body: JSON.stringify(b) }),
    /** Support page: a message (with up to 3 screenshots) for the owner; no sign-in needed. `website` is a hidden field real people leave empty. */
    sendSupport: (b: { email: string; message: string; files: File[]; website?: string }) => {
      const body = new FormData()
      body.set('email', b.email); body.set('message', b.message); body.set('website', b.website ?? '')
      for (const f of b.files) body.append('files', f)
      return request<{ id: string }>('/api/v1/support', { method: 'POST', body })
    },
    /** Free tool: crawl a public website and get its sitemap.xml (no sign-in, no AI). */
    freeSitemap: (b: SitemapRequest) => request<SitemapResponse>('/api/v1/free-tools/sitemap', { method: 'POST', body: JSON.stringify(b) }),
    /** Free tool: clean a transcript the visitor pasted from YouTube (or a caption file's text) and keep it for the editor hand-off. */
    freeTranscript: (body: { text: string; title?: string }) =>
      request<FreeTranscript>('/api/v1/free-tools/transcript', { method: 'POST', body: JSON.stringify(body) }),
    /** Approved customer reviews for the website (public). */
    reviews: () => request<PublicReviews>('/api/v1/reviews'),
    myReview: () => request<MyReview | null>('/api/v1/reviews/mine'),
    /** Needs at least one presentation; new and edited reviews wait for the owner's approval before they are shown. */
    saveMyReview: (b: { rating: number; body: string; displayName: string; role?: string }) => request<{ status: 'pending' }>('/api/v1/reviews/mine', { method: 'PUT', body: JSON.stringify(b) }),
    deleteMyReview: () => request<null>('/api/v1/reviews/mine', { method: 'DELETE' }),
    /** Free tool: a small recording of the visitor's own is transcribed (no account; a few a day). */
    freeMedia: (file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<FreeTranscript>('/api/v1/free-tools/media', { method: 'POST', body })
    },
    /** Free tool: a video / Reel script becomes a slide outline (and is kept for an hour for the editor hand-off). */
    freeScript: (b: { script: string; kind?: 'reel' | 'youtube' | 'talk' | 'podcast' }) =>
      request<FreeOutline & { attachmentId: string }>('/api/v1/free-tools/script', { method: 'POST', body: JSON.stringify(b) }),
    freePdf: (file: File, mode: string) => {
      const body = new FormData()
      body.set('file', file)
      body.set('mode', mode)
      return request<FreePdfResult>('/api/v1/free-tools/pdf', { method: 'POST', body })
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
    analyze: (prompt: string, sourceIds: string[] = [], language?: string) =>
      request<AnalyzeResult>('/api/v1/generation/analyze', { method: 'POST', body: JSON.stringify({ prompt, sourceIds, ...(language ? { language } : {}) }) }),
    createJob: (input: CreateJobInput) => request<JobView>('/api/v1/generation/jobs', { method: 'POST', body: JSON.stringify(input) }),
    getJob: (id: string) => request<JobView>(`/api/v1/generation/jobs/${encodeURIComponent(id)}`),
    cancelJob: (id: string) => request<JobView>(`/api/v1/generation/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
    listPresentations: (projectId?: string) => request<PresentationSummary[]>(`/api/v1/presentations${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
    /** New deck from a template design (or blank when templateId is omitted). Premium designs need Pro (server-enforced). */
    createPresentation: (body: { templateId?: string; title?: string; aspectRatio?: '16:9' | '4:3' | '1:1'; projectId?: string; blank?: boolean }) =>
      request<{ id: string }>('/api/v1/presentations', { method: 'POST', body: JSON.stringify(body) }),
    moveToProject: (deckId: string, projectId: string | null) => request<{ id: string; projectId: string | null }>(`/api/v1/presentations/${encodeURIComponent(deckId)}/project`, { method: 'PUT', body: JSON.stringify({ projectId }) }),
    listProjects: () => request<ProjectSummary[]>('/api/v1/projects'),
    createProject: (name: string) => request<ProjectSummary>('/api/v1/projects', { method: 'POST', body: JSON.stringify({ name }) }),
    renameProject: (id: string, name: string) => request<{ id: string; name: string }>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    deleteProject: (id: string) => request<null>(`/api/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    /** Server-Sent Events URL for live editing of one deck (EventSource must be opened with `withCredentials`). */
    liveUrl: (id: string, clientId: string) => `${base}/api/v1/presentations/${encodeURIComponent(id)}/live?client=${encodeURIComponent(clientId)}`,
    sendPresence: (id: string, body: { clientId: string; slideId: string | null; selection: string[]; editing: string | null; cursor: { x: number; y: number } | null }) =>
      request<{ ok: true }>(`/api/v1/presentations/${encodeURIComponent(id)}/live/presence`, { method: 'POST', body: JSON.stringify(body), keepalive: true }),
    /** View-only link (any plan) and collaborators (Pro / Gold). Owner-only. */
    getShareAnalytics: (id: string, days: 7 | 30 | 90 = 30) => request<ShareAnalytics>(`/api/v1/presentations/${encodeURIComponent(id)}/analytics?days=${days}`),
    clearShareAnalytics: (id: string) => request<{ cleared: number }>(`/api/v1/presentations/${encodeURIComponent(id)}/analytics`, { method: 'DELETE' }),
    /** viewer page: a visit began (never throws into the page: callers swallow errors) */
    shareViewStart: (token: string, body: { vid: string; referrer?: string; vw?: number }, access?: string) => request<{ viewId: string | null; ignored?: string }>(`/api/v1/public/share/${encodeURIComponent(token)}/analytics/start`, { method: 'POST', body: JSON.stringify(body), ...(access ? { headers: { 'X-Share-Access': access } } : {}) }),
    /** viewer page: seconds spent per slide since the last report; `keepalive` lets it finish while the tab closes */
    shareViewPing: (token: string, body: { viewId: string; vid: string; slides: { id: string; ms: number }[] }, access?: string) => request<{ ok: boolean }>(`/api/v1/public/share/${encodeURIComponent(token)}/analytics/ping`, { method: 'POST', body: JSON.stringify(body), keepalive: true, ...(access ? { headers: { 'X-Share-Access': access } } : {}) }),
    /** the last report of a visit, sent while the tab closes: a plain-text body needs no preflight, so the browser delivers it. Returns false when the browser would not queue it. */
    shareViewBeacon: (token: string, body: { viewId: string; vid: string; slides: { id: string; ms: number }[]; access?: string }): boolean => {
      try { return typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(`${base}/api/v1/public/share/${encodeURIComponent(token)}/analytics/ping`, new Blob([JSON.stringify(body)], { type: 'text/plain;charset=UTF-8' })) } catch { return false }
    },
    getShareLink: (id: string) => request<ShareLinkView>(`/api/v1/presentations/${encodeURIComponent(id)}/share`),
    createShareLink: (id: string, opts: { password?: string; expiresInDays?: ShareExpiry } = {}) => request<ShareLinkView>(`/api/v1/presentations/${encodeURIComponent(id)}/share`, { method: 'POST', body: JSON.stringify(opts) }),
    emailShareLink: (id: string, emails: string[], message?: string) => request<{ sent: number; failed: number }>(`/api/v1/presentations/${encodeURIComponent(id)}/share/email`, { method: 'POST', body: JSON.stringify({ emails, ...(message ? { message } : {}) }) }),
    /** Pro / Gold: set or remove the password (`null` removes), set or clear the expiry (`null` clears). */
    updateShareLink: (id: string, body: { password?: string | null; expiresInDays?: ShareExpiry }) => request<ShareLinkView>(`/api/v1/presentations/${encodeURIComponent(id)}/share`, { method: 'PATCH', body: JSON.stringify(body) }),
    revokeShareLink: (id: string) => request<ShareLinkView>(`/api/v1/presentations/${encodeURIComponent(id)}/share`, { method: 'DELETE' }),
    listMembers: (id: string) => request<{ members: MemberView[]; limit: number }>(`/api/v1/presentations/${encodeURIComponent(id)}/members`),
    inviteMember: (id: string, email: string) => request<MemberView>(`/api/v1/presentations/${encodeURIComponent(id)}/members`, { method: 'POST', body: JSON.stringify({ email }) }),
    removeMember: (id: string, memberId: string) => request<unknown>(`/api/v1/presentations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }),
    leaveDeck: (id: string) => request<unknown>(`/api/v1/presentations/${encodeURIComponent(id)}/members/me`, { method: 'DELETE' }),
    getInvite: (token: string) => request<InvitePreview>(`/api/v1/invites/${encodeURIComponent(token)}`),
    acceptInvite: (token: string) => request<{ presentationId: string }>(`/api/v1/invites/${encodeURIComponent(token)}/accept`, { method: 'POST' }),
    listShared: () => request<SharedDeck[]>('/api/v1/shared'),
    /** Public (no login): what a share link shows. */
    getPublicDeck: (token: string, access?: string) => request<PublicDeck>(`/api/v1/public/share/${encodeURIComponent(token)}`, access ? { headers: { 'X-Share-Access': access } } : {}),
    unlockPublicDeck: (token: string, password: string) => request<{ access: string | null }>(`/api/v1/public/share/${encodeURIComponent(token)}/unlock`, { method: 'POST', body: JSON.stringify({ password }) }),
    getPresentation: (id: string) => request<LoadedPresentation>(`/api/v1/presentations/${encodeURIComponent(id)}`),

    comments: (id: string) => request<CommentsData>(`/api/v1/presentations/${encodeURIComponent(id)}/comments`),
    addComment: (id: string, body: { slideId: string; x?: number; y?: number; body: string }) => request<{ threadId: string; commentId: string }>(`/api/v1/presentations/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify(body) }),
    replyComment: (id: string, threadId: string, body: string) => request<{ commentId: string }>(`/api/v1/presentations/${encodeURIComponent(id)}/comments/${encodeURIComponent(threadId)}/replies`, { method: 'POST', body: JSON.stringify({ body }) }),
    setThreadStatus: (id: string, threadId: string, status: 'open' | 'resolved') => request<{ status: string }>(`/api/v1/presentations/${encodeURIComponent(id)}/comments/${encodeURIComponent(threadId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    editComment: (id: string, commentId: string, body: string) => request<{ ok: boolean }>(`/api/v1/presentations/${encodeURIComponent(id)}/comments/items/${encodeURIComponent(commentId)}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    deleteComment: (id: string, commentId: string) => request<{ deleted: boolean }>(`/api/v1/presentations/${encodeURIComponent(id)}/comments/items/${encodeURIComponent(commentId)}`, { method: 'DELETE' }),
    markCommentsSeen: (id: string) => request<{ seenAt: string }>(`/api/v1/presentations/${encodeURIComponent(id)}/comments/seen`, { method: 'POST', body: '{}' }),
    addTextSource: (text: string, title?: string) => request<SourceSummary>('/api/v1/sources/text', { method: 'POST', body: JSON.stringify({ text, ...(title ? { title } : {}) }) }),
    /** Wikipedia (Pro/Gold, free) or live web search (Gold, costs credits): the facts come back as ready-made sources. */
    research: (body: { query: string; mode: 'wikipedia' | 'web'; language?: string; requestId: string }) =>
      request<ResearchResult>('/api/v1/sources/research', { method: 'POST', body: JSON.stringify(body) }),
    /** Image to deck: a JPG / PNG / WebP is read by AI into a text source (4 credits; refunded if it fails). The picture itself is not stored. */
    addImageSource: (file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<SourceSummary & { creditsCharged: number }>('/api/v1/sources/image', { method: 'POST', body })
    },
    /** A video transcript (YouTube "Show transcript" text) or the text of a caption file; the optional YouTube link is kept so slides can cite the video. */
    addTranscriptSource: (body: { text: string; title?: string; url?: string }) =>
      request<SourceSummary>('/api/v1/sources/transcript', { method: 'POST', body: JSON.stringify(body) }),
    /** Video to slides: the person's own audio / video recording is transcribed by AI into a timed source (6 credits per started 4 MB, refunded if it fails). The file itself is not stored. */
    addMediaSource: (file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<SourceSummary & { creditsCharged: number }>('/api/v1/sources/media', { method: 'POST', body })
    },
    /**
     * Video to slides for big recordings (up to 200 MB / 90 min, signed in, 3 credits per started minute, refunded if it fails):
     * sent in 8 MB parts (each retried), then the server works in the background while this polls. `onNote` gets plain progress text.
     */
    async addVideoSource(file: File, onNote?: (note: string) => void, signal?: AbortSignal): Promise<SourceSummary & { creditsCharged: number }> {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const stop = () => { if (signal?.aborted) throw new ApiError(0, 'CANCELLED', 'Cancelled.') }
      const made = await request<{ id: string; partBytes: number; partsTotal: number }>('/api/v1/media/uploads', { method: 'POST', body: JSON.stringify({ filename: file.name, bytes: file.size }) })
      const enc = encodeURIComponent(made.id)
      try {
        for (let n = 0; n < made.partsTotal; n++) {
          stop()
          onNote?.(`Uploading ${Math.round((n / made.partsTotal) * 100)}%`)
          const piece = file.slice(n * made.partBytes, (n + 1) * made.partBytes)
          for (let attempt = 0; ; attempt++) {
            try { await request(`/api/v1/media/uploads/${enc}/parts/${n}`, { method: 'PUT', body: piece, headers: { 'Content-Type': 'application/octet-stream' } }); break }
            catch (e) { if ((e instanceof ApiError && e.status < 500 && e.status !== 429) || attempt >= 3) throw e; await wait(1000 * (attempt + 1)) }
          }
        }
        onNote?.('Checking the recording')
        const done = await request<{ credits: number }>(`/api/v1/media/uploads/${enc}/complete`, { method: 'POST', body: '{}' })
        let misses = 0
        for (;;) {
          stop()
          await wait(2000)
          let j: { status: string; stage: string | null; progress: number; error: string | null; source: SourceSummary | null }
          try { j = await request(`/api/v1/media/jobs/${enc}`); misses = 0 } catch (e) { if (e instanceof ApiError && e.status < 500 && e.status !== 429) throw e; if (++misses > 15) throw e; continue }
          if (j.status === 'completed' && j.source) return { ...j.source, creditsCharged: done.credits }
          if (j.status === 'failed') throw new ApiError(422, 'MEDIA_FAILED', j.error ?? 'This recording could not be read. You were not charged.')
          onNote?.(`${j.stage ?? 'Working'} ${j.progress}%`)
        }
      } catch (e) {
        void request(`/api/v1/media/jobs/${enc}`, { method: 'DELETE' }).catch(() => undefined) // cancel + refund if still waiting; no-op once processing
        throw e
      }
    },
    addUrlSource: (url: string) => request<SourceSummary>('/api/v1/sources/url', { method: 'POST', body: JSON.stringify({ url }) }),
    addPdfSource: (file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<SourceSummary>('/api/v1/sources/pdf', { method: 'POST', body })
    },
    /** PDF, Word, PowerPoint, Excel, CSV, email (.eml) or text (.txt/.md): the server decides by content, not file name. */
    addFileSource: (file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<SourceSummary>('/api/v1/sources/file', { method: 'POST', body })
    },
    deleteSource: (id: string) => request<null>(`/api/v1/sources/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    models: (kind: 'text' | 'image' = 'text') => request<{ default: string | null; models: ModelOption[] }>(`/api/v1/models${kind === 'image' ? '?kind=image' : ''}`),
    /** Remaining AI-picture allowance for a deck / the month — show it BEFORE the user spends anything. */
    /** "Image URL": the server downloads the picture and keeps its own copy; returns the address of that copy. */
    importImage: (deckId: string, url: string) => request<{ assetId: string; url: string; mime: string; aspect: number }>(`/api/v1/presentations/${encodeURIComponent(deckId)}/images/import`, { method: 'POST', body: JSON.stringify({ url }) }),
    /** Add a picture from the computer (PNG or JPEG, up to 8 MB). */
    uploadImage: (deckId: string, file: File) => {
      const body = new FormData()
      body.set('file', file)
      return request<{ assetId: string; url: string; mime: string; aspect: number; name: string }>(`/api/v1/presentations/${encodeURIComponent(deckId)}/images/upload`, { method: 'POST', body })
    },
    myUploads: () => request<{ items: { id: string; url: string; name: string; createdAt: string }[] }>('/api/v1/media/mine'),
    deleteUpload: (assetId: string) => request<{ deleted: boolean }>(`/api/v1/media/mine/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
    searchStock: (q: string, page = 1) => request<{ photos: StockPhoto[]; page: number; hasMore: boolean }>(`/api/v1/media/search?${new URLSearchParams({ q, page: String(page) })}`),
    templateLibrary: (q: string) => request<{ items: { key: string; url: string; alt: string }[] }>(`/api/v1/media/library?${new URLSearchParams({ q })}`),
    /** Use a stock photo: the server keeps its own copy and returns the credit line. */
    useStockPhoto: (deckId: string, p: StockPhoto) => request<{ assetId: string; url: string; mime: string; aspect: number; alt: string; attribution: { source: string; license: string; url?: string } }>(`/api/v1/presentations/${encodeURIComponent(deckId)}/images/stock`, { method: 'POST', body: JSON.stringify({ provider: p.provider, imageUrl: p.full, ...(p.trackUrl ? { trackUrl: p.trackUrl } : {}), alt: p.alt, author: p.author, pageUrl: p.pageUrl }) }),
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
    /** Pro/Gold. A question about the deck's own text: a short answer that points at slides. Read-only. */
    askDeck: (id: string, body: { question: string; history?: { role: 'user' | 'ai'; text: string }[]; model?: string; requestId: string }) =>
      request<AskDeckAnswer>(`/api/v1/presentations/${encodeURIComponent(id)}/ask`, { method: 'POST', body: JSON.stringify(body) }),
    /** Chat-style assistant: free-form instruction → validated theme/animation/content changes to apply as ONE undoable step. */
    aiAssist: (id: string, body: { instruction: string; scope: 'deck' | 'slide'; slideId?: string; activeSlideId?: string; model?: string; requestId: string; sourceIds?: string[]; recent?: { theme: boolean; slideIds: string[]; summary: string[] }[]; conversation?: { role: 'user' | 'assistant'; text: string }[] }) =>
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
    /** test payments only (the server answers 404 unless PAYMENTS_SIMULATOR is on) */
    simulatorPay: (subscriptionId: string, outcome: 'success' | 'failure') => request<SimulatorPayResult>('/api/v1/billing/simulator/pay', { method: 'POST', body: JSON.stringify({ subscriptionId, outcome }) }),
    simulatorRenew: () => request<Entitlements>('/api/v1/billing/simulator/renew', { method: 'POST', body: '{}' }),
    simulatorRefund: () => request<Entitlements>('/api/v1/billing/simulator/refund', { method: 'POST', body: '{}' }),
    /** Reads a website's colours, fonts and logo (Pro and Gold). */
    /** An exact copy of one of your decks, saved as a new deck. */
    duplicatePresentation: (id: string) => request<{ id: string; title: string }>(`/api/v1/presentations/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: '{}' }),
    /** Step 1 of remix (Pro/Gold): your deck's text as a private source; then createJob({ remixOf, sourceIds: [sourceId], … }). */
    remixSource: (id: string) => request<{ sourceId: string; title: string; slideCount: number; aspectRatio: string; skipped: number }>(`/api/v1/presentations/${encodeURIComponent(id)}/remix-source`, { method: 'POST', body: '{}' }),
    /** Your brand kits and how many your plan allows (0 = not on your plan). */
    brandKits: () => request<{ kits: BrandKit[]; limit: number }>('/api/v1/brand/kits'),
    brandKitCreate: (body: BrandKitInput) => request<BrandKit>('/api/v1/brand/kits', { method: 'POST', body: JSON.stringify(body) }),
    brandKitUpdate: (id: string, body: BrandKitInput & { isDefault?: boolean; removeLogo?: boolean }) => request<BrandKit>(`/api/v1/brand/kits/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    brandKitDelete: (id: string) => request<{ deleted: true }>(`/api/v1/brand/kits/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    brandKitLogo: (id: string, file: File) => { const f = new FormData(); f.append('file', file); return request<BrandKit>(`/api/v1/brand/kits/${encodeURIComponent(id)}/logo`, { method: 'POST', body: f }) },
    brandKitImageAdd: (id: string, file: File, name?: string) => { const f = new FormData(); f.append('file', file); if (name) f.append('name', name); return request<BrandKit>(`/api/v1/brand/kits/${encodeURIComponent(id)}/images`, { method: 'POST', body: f }) },
    brandKitImageRemove: (id: string, imageId: string) => request<BrandKit>(`/api/v1/brand/kits/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`, { method: 'DELETE' }),
    brandExtract: (url: string) => request<BrandProfile>('/api/v1/brand/extract', { method: 'POST', body: JSON.stringify({ url }) }),
    cancelSubscription: () => request<Omit<BillingOverview, 'billingEnabled'>>('/api/v1/billing/cancel', { method: 'POST' }),
    /** Development/staging only (404 in production): switch plans without payment to exercise gating. */

    /** Owner analytics (server returns 403 unless role=admin). Source: the immutable AI usage ledger. */
    admin: {
      /** Generic owner-section access: `api.admin.get('/sales/summary', {from})`, `api.admin.send('PUT','/flags/images',{...})`. Paths are relative to /api/v1/admin. */
      get: <T>(path: string, query: Record<string, string | number | undefined> = {}) => request<T>(`/api/v1/admin${path}${qs(query)}`),
      send: <T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => request<T>(`/api/v1/admin${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
      /** owner uploads (a picture for a post): multipart, field "file" */
      upload: <T>(path: string, file: File) => { const body = new FormData(); body.set('file', file); return request<T>(`/api/v1/admin${path}`, { method: 'POST', body }) },
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
