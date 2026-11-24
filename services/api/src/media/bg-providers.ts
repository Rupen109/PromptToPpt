/**
 * Which background removal providers exist and which of them may run in PRODUCTION.
 *
 * The approval lives HERE, in code, in a committed change that carries the evidence of the licence/terms review (docs/BACKGROUND_REMOVAL_PRODUCTION_AUDIT.md section 7.2). An environment
 * variable can only CHOOSE among approved providers, never approve one: setting BACKGROUND_REMOVAL_PROVIDER to a provider that is not in APPROVED_FOR_PRODUCTION does nothing in production.
 * Development-only providers can never be approved (a test enforces that).
 */
export interface ProviderInfo { kind: 'self-hosted' | 'commercial-api' | 'browser-onnx' | 'mock'; label: string; devOnly: boolean; /** the environment variable that must hold the provider's key, or the provider is not available */ needsKey?: string }
export interface ProviderApproval { approvedBy: string; approvedAt: string; /** where the review is written down (a path in docs/ or a URL) */ evidence: string }

export const PROVIDERS: Record<string, ProviderInfo> = {
  /** BiRefNet (lite) in a child process of this API. Training-data licensing is unresolved: never for production. */
  'server-dev': { kind: 'self-hosted', label: 'Our server model (development only)', devOnly: true },
  /** Deterministic stand-in for tests; computed in the browser, never on the server. */
  mock: { kind: 'mock', label: 'Mock provider (development only)', devOnly: true },
  /** Photoroom's Remove Background API (a paid, hosted service: $0.02 a picture on its Basic plan). See docs/BACKGROUND_REMOVAL_PROVIDER_DECISION.md. */
  photoroom: { kind: 'commercial-api', label: 'Photoroom Remove Background API', devOnly: false, needsKey: 'PHOTOROOM_API_KEY' },
}

/** EMPTY ON PURPOSE: nothing is approved. Adding an entry is the act of approving a provider for production and needs the owner's sign-off recorded in `evidence`. */
export const APPROVED_FOR_PRODUCTION: Record<string, ProviderApproval> = {
  photoroom: { approvedBy: 'the owner (chosen as the production provider in chat)', approvedAt: '2026-11-20', evidence: 'docs/BACKGROUND_REMOVAL_PROVIDER_DECISION.md' },
}

export const DEFAULT_DEV_PROVIDER = 'server-dev'

/** The provider that may run now, or null. Development and tests: the chosen one (default: the development server model) if it is a known provider. Production: only an approved, non-development-only one. */
export function activeBackgroundProvider(nodeEnv: string, selected: string | undefined, vars: Record<string, string | undefined> = process.env): string | null {
  const id = selected?.trim() || (nodeEnv === 'production' ? 'photoroom' : DEFAULT_DEV_PROVIDER)
  if (!id || !PROVIDERS[id]) return null
  const key = PROVIDERS[id]!.needsKey
  if (key && !vars[key]?.trim()) return null // a hosted provider without its key is not available (nothing is promised that cannot run)
  if (nodeEnv === 'production') return APPROVED_FOR_PRODUCTION[id] && !PROVIDERS[id]!.devOnly ? id : null
  return id
}
