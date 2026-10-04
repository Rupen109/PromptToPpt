import { Link } from 'react-router'
import { api } from '@/lib/api'
import { pct } from '@/lib/format'
import { useAsync } from '../useUsage'

/** Warns on cost pages when the ledger explains less than ~90% of what Google's console showed between the owner's readings. */
export function CoverageBanner() {
  const r = useAsync(() => api.admin.get<{ totals: { coverage: number | null; windows: number } }>('/cloud'), 'coverage-banner')
  const t = r.data?.totals
  if (!t || t.coverage === null || t.coverage >= 0.9) return null
  return (
    <p role="status" className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 mb-5">
      Heads up: these AI costs cover about <b>{pct(t.coverage)}</b> of what Google billed between your last readings, so real spend is higher. <Link to="/admin/cloud" className="underline font-semibold">See the reconciliation</Link>
    </p>
  )
}
