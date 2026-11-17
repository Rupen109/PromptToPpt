/**
 * Everything the owner must decide or fill in for the legal pages lives in THIS file (see docs/LEGAL_PAGES.md).
 *
 * `TODO` means "the owner has not filled this in yet". While a field is TODO the pages show it visibly marked ("[Owner to add: ...]"),
 * and a production build / release check FAILS (see `assertLegalReady`, `scripts/check-legal.mjs`), so a placeholder can never ship silently.
 *
 * Keep this file free of imports and of TypeScript-only runtime features: `scripts/check-legal.mjs` loads it directly with Node.
 */

export const TODO = 'TODO'

export const LEGAL = {
  productName: 'SlidesDone',
  websiteHost: 'slidesdone.app',

  // ── Owner fields: replace every 'TODO' ───────────────────────────────────
  /** full legal name of the company / proprietorship / person that runs SlidesDone (as on the GST and Razorpay registration) */
  entityName: TODO,
  /** registered office or principal place of business, one line */
  registeredAddress: TODO,
  /** GST registration number (needed on invoices for Indian customers) */
  gstin: TODO,
  /** Grievance Officer (India IT Rules, Consumer Protection E-Commerce Rules, DPDP Act) */
  grievanceOfficerName: TODO,
  grievanceOfficerEmail: TODO,
  /** where privacy / data requests (access, export, deletion) go; may be the same address as support */
  dataProtectionEmail: TODO,
  /** city whose courts have jurisdiction, e.g. "Mumbai, Maharashtra" */
  governingLawCity: TODO,
  /** date these texts take effect, YYYY-MM-DD */
  effectiveDate: TODO,
  /** write the date (YYYY-MM-DD) you confirmed the refund rules below are the ones you want to offer */
  refundPolicyConfirmed: TODO,
  /** write the date you checked that the production AI keys are paid-tier / data-not-used-for-training terms with every AI provider in use */
  aiNoTrainingConfirmed: TODO,

  // ── Defaults that are policy decisions (documented in docs/LEGAL_PAGES.md; change here if you decide otherwise) ──
  /** public support address; defaults to the same address the support page shows */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@slidesdone.app',
  /** first-payment refund window and the share of credits that may be used (docs/PRICING_PLANS_V4.md suggestion, not yet owner-approved) */
  refundWindowDays: 7,
  refundMaxCreditsUsedPercent: 20,
  /** how fast we act on an account-deletion or data-export request */
  dataRequestDays: 30,
  /** grievance handling times (Consumer Protection (E-Commerce) Rules, 2020: acknowledge in 48 hours, resolve within one month) */
  grievanceAcknowledgeHours: 48,
  grievanceResolveDays: 30,
  /** minimum age to hold an account */
  minimumAge: 18,
}

export type LegalConfig = typeof LEGAL
export type OwnerField = 'entityName' | 'registeredAddress' | 'gstin' | 'grievanceOfficerName' | 'grievanceOfficerEmail' | 'dataProtectionEmail' | 'governingLawCity' | 'effectiveDate' | 'refundPolicyConfirmed' | 'aiNoTrainingConfirmed'

/** The fields that block a release while they are TODO, with the wording used in the visible marker. */
export const OWNER_FIELDS: readonly { key: OwnerField; label: string }[] = [
  { key: 'entityName', label: 'legal entity name' },
  { key: 'registeredAddress', label: 'registered address' },
  { key: 'gstin', label: 'GSTIN' },
  { key: 'grievanceOfficerName', label: 'grievance officer name' },
  { key: 'grievanceOfficerEmail', label: 'grievance officer email' },
  { key: 'dataProtectionEmail', label: 'data protection contact email' },
  { key: 'governingLawCity', label: 'governing-law city' },
  { key: 'effectiveDate', label: 'effective date' },
  { key: 'refundPolicyConfirmed', label: 'refund policy confirmation date' },
  { key: 'aiNoTrainingConfirmed', label: 'AI provider no-training confirmation date' },
]

const isMissing = (v: unknown) => typeof v !== 'string' || v.trim() === '' || v.trim().toUpperCase() === TODO

/** Owner fields that are still unfilled (empty, or TODO in any case). */
export function missingOwnerFields(legal: LegalConfig = LEGAL): OwnerField[] {
  return OWNER_FIELDS.filter((f) => isMissing(legal[f.key])).map((f) => f.key)
}

type Env = Record<string, string | undefined>

/** Is this a real release? Production environment, or the release check was asked for explicitly. */
export function isReleaseCheck(env: Env = process.env): boolean {
  return env.APP_ENV === 'production' || env.NEXT_PUBLIC_APP_ENV === 'production' || env.RELEASE_CHECK === '1'
}

/** Human-readable problems that must block a release (empty list = fine, or not a release). */
export function legalReleaseProblems(env: Env = process.env, legal: LegalConfig = LEGAL): string[] {
  if (!isReleaseCheck(env)) return []
  return missingOwnerFields(legal).map((k) => `apps/web/lib/legal.ts: "${k}" is still TODO (${OWNER_FIELDS.find((f) => f.key === k)?.label})`)
}

/** Called while the legal pages render: a production build with an unfilled owner field fails instead of publishing a placeholder. */
export function assertLegalReady(env: Env = process.env, legal: LegalConfig = LEGAL): void {
  const problems = legalReleaseProblems(env, legal)
  if (problems.length) throw new Error(`Legal pages are not ready for release:\n  ${problems.join('\n  ')}`)
}

/** The text to print for an owner field: the value, or a clearly visible marker while it is TODO (never shipped, see assertLegalReady). */
export function ownerText(key: OwnerField, legal: LegalConfig = LEGAL): string {
  const v = legal[key]
  return isMissing(v) ? `[Owner to add: ${OWNER_FIELDS.find((f) => f.key === key)?.label ?? key}]` : v
}
