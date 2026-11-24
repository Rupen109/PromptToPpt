import type { SegmentationProvider } from '../types'
import { createMockProvider } from './mock'
import { serverProvider } from './server'

/**
 * Which providers the editor may use, and the ONLY place that names one: replacing the model (a commercial API, a browser model) means adding a module next to `server.ts` and listing
 * it here; the dialog and everything else only know `SegmentationProvider`.
 *
 * Approval gate: a production build offers a provider only if it carries an `approval` record (who, when, where the licence/terms review is written down). Development-only providers have
 * none, so they are not even compiled into a production build: they are listed only inside `import.meta.env.DEV`, which the build replaces with `false`. Nothing is approved yet, so a
 * production build offers no provider at all, and the server independently refuses to run an unapproved one (services/api/src/media/bg-providers.ts).
 *
 * Which listed provider is used: `?bgprovider=<id>` in development (e.g. `mock` for tests); otherwise the first one.
 */
// one object per provider for the life of the page: the dialog's effects compare providers by identity
// (the extra mocks fail or stall on purpose, for the editor's own tests: ?bgprovider=mock-busy, mock-no-subject, mock-slow)
const development: SegmentationProvider[] = import.meta.env.DEV ? [serverProvider, createMockProvider(), createMockProvider({ id: 'mock-no-subject', fail: 'no-subject' }), createMockProvider({ id: 'mock-busy', fail: 'busy' }), createMockProvider({ id: 'mock-slow', delayMs: 60_000 })] : []
// add approved providers here (each with its `approval` record) when one is chosen
const approved: SegmentationProvider[] = []
const candidates = (): SegmentationProvider[] => [...approved, ...development]

/** Providers a build may offer: in production only those with an approval record. */
export function usableProviders(inProduction: boolean, list: SegmentationProvider[] = candidates()): SegmentationProvider[] {
  return list.filter((p) => !inProduction || (!!p.approval && !!p.approval.evidence && !!p.approval.approvedAt && !!p.approval.approvedBy))
}

export function backgroundRemovalProvider(): SegmentationProvider | null {
  const list = usableProviders(!import.meta.env.DEV)
  if (list.length === 0) return null
  if (import.meta.env.DEV) {
    const want = new URLSearchParams(globalThis.location?.search ?? '').get('bgprovider')
    const found = want ? list.find((p) => p.id === want) : undefined
    if (found) return found
  }
  return list[0]!
}
