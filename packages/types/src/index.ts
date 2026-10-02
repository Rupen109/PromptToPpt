// ─────────────────────────────────────────────
// Core Domain Types — promptToPpt
// ─────────────────────────────────────────────

// ---- User & Auth ----

export type UserRole = 'user' | 'admin' | 'support'

export interface User {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}

// ---- Plans & Billing ----

export type PlanSlug = 'free' | 'pro' | 'gold'

export interface Plan {
  id: string
  slug: PlanSlug
  name: string
  monthlyCredits: number
  maxSlidesPerDeck: number
  maxSources: number
  maxUploadMb: number
  features: string[]
  priceInrMonthly: number
  priceInrAnnual: number
  priceUsdMonthly: number
  priceUsdAnnual: number
}

export type Currency = 'INR' | 'USD'

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'incomplete'

export interface Subscription {
  id: string
  userId: string
  planId: string
  status: SubscriptionStatus
  currency: Currency
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

// ---- Credits ----

export interface CreditBalance {
  userId: string
  balance: number
  updatedAt: string
}

export type CreditEventType =
  | 'grant_plan'
  | 'grant_topup'
  | 'consume_generation'
  | 'consume_ai_edit'
  | 'consume_export'
  | 'refund'

export interface CreditLedgerEntry {
  id: string
  userId: string
  type: CreditEventType
  amount: number // positive = credit, negative = debit
  balanceAfter: number
  relatedJobId?: string
  createdAt: string
}

// ---- Presentations ----

export type AspectRatio = '16:9' | '4:3' | '1:1'

export interface PresentationMeta {
  id: string
  userId: string
  title: string
  aspectRatio: AspectRatio
  themeId: string
  language: string
  slideCount: number
  createdAt: string
  updatedAt: string
}

// ---- Slides ----

export type SlideLayoutId =
  | 'title'
  | 'title-body'
  | 'split-image-text'
  | 'image-full'
  | 'quote'
  | 'timeline'
  | 'process'
  | 'comparison'
  | 'metrics'
  | 'chart'
  | 'table'
  | 'roadmap'
  | 'architecture'
  | 'case-study'
  | 'section-divider'
  | 'thank-you'
  | 'blank'

export type ElementType = 'text' | 'image' | 'icon' | 'chart' | 'table' | 'shape' | 'diagram'

export interface SlideElement {
  id: string
  type: ElementType
  x: number
  y: number
  width: number
  height: number
  locked: boolean
  zIndex: number
  data: Record<string, unknown>
}

export interface SlideBackground {
  type: 'color' | 'gradient' | 'image'
  value: string
}

export type ValidationStatus = 'pending' | 'passed' | 'warning' | 'failed'

export interface SlideValidation {
  status: ValidationStatus
  issues: string[]
}

export interface Slide {
  id: string
  presentationId: string
  position: number
  layoutId: SlideLayoutId
  locked: boolean
  background: SlideBackground
  elements: SlideElement[]
  speakerNotes: string
  sources: string[]
  validation: SlideValidation
}

// ---- Themes ----

export interface ThemeTypography {
  headingFont: string
  bodyFont: string
  monoFont?: string
}

export interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  border: string
}

export interface Theme {
  id: string
  name: string
  colors: ThemeColors
  typography: ThemeTypography
  borderRadius: string
  isBuiltIn: boolean
}

// ---- Generation Jobs ----

export type JobStatus =
  | 'queued'
  | 'analyzing'
  | 'outlining'
  | 'generating'
  | 'rendering'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface GenerationJob {
  id: string
  userId: string
  presentationId?: string
  status: JobStatus
  prompt: string
  analysisResult?: PromptAnalysis
  progress: number // 0-100
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

// ---- Prompt Analysis ----

export interface PromptAnalysis {
  topic: string
  objective?: string
  audience?: string
  tone?: string
  language: string
  slideCount?: number
  durationMinutes?: number
  requiredSections?: string[]
  visualStyle?: string
  outputFormat?: AspectRatio
  isDetailed: boolean
  suggestedDirections?: string[]
}

// ---- AI Usage ----

export type AIRequestType =
  | 'prompt_analysis'
  | 'direction_suggestion'
  | 'outline_generation'
  | 'slide_content'
  | 'image_generation'
  | 'ai_edit'
  | 'source_analysis'
  | 'validation'

export interface AIUsageEvent {
  id: string
  userId: string
  presentationId?: string
  jobId?: string
  provider: string
  model: string
  modelVersion?: string
  requestType: AIRequestType
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  reasoningTokens: number
  imageCount: number
  latencyMs: number
  status: 'success' | 'error'
  providerCostUsd: number
  internalCreditCost: number
  environment: 'development' | 'staging' | 'production'
  createdAt: string
}

// ---- Source Documents ----

export type SourceType = 'pdf' | 'pptx' | 'url' | 'youtube' | 'audio' | 'text' | 'image'

export interface SourceDocument {
  id: string
  jobId: string
  type: SourceType
  originalName: string
  s3Key: string
  parseStatus: 'pending' | 'processing' | 'completed' | 'failed'
  extractedText?: string
  pageCount?: number
  createdAt: string
}

// ---- Exports ----

export type ExportFormat = 'pptx' | 'pdf' | 'png' | 'jpg'

export interface ExportJob {
  id: string
  userId: string
  presentationId: string
  format: ExportFormat
  status: 'queued' | 'processing' | 'completed' | 'failed'
  downloadUrl?: string
  expiresAt?: string
  createdAt: string
}

// ---- Share Links ----

export type SharePermission = 'view' | 'edit'

export interface ShareLink {
  id: string
  token: string
  presentationId: string
  permission: SharePermission
  passwordProtected: boolean
  expiresAt?: string
  createdAt: string
}

// ---- API Response Wrappers ----

export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError

// ---- Analytics Events ----

export type ProductEventName =
  | 'signup_completed'
  | 'prompt_submitted'
  | 'clarification_shown'
  | 'clarification_completed'
  | 'source_uploaded'
  | 'generation_started'
  | 'generation_completed'
  | 'generation_failed'
  | 'slide_added'
  | 'slide_deleted'
  | 'slide_duplicated'
  | 'slide_reordered'
  | 'ai_edit_used'
  | 'theme_changed'
  | 'template_changed'
  | 'share_created'
  | 'presentation_started'
  | 'export_started'
  | 'export_completed'
  | 'paywall_viewed'
  | 'checkout_started'
  | 'subscription_started'
  | 'subscription_cancelled'
