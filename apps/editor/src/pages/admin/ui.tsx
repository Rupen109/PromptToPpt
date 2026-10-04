import type { ReactNode } from 'react'
import { api } from '@/lib/api'
import { compact } from '@/lib/format'
import { useAsync, useFilters } from './useUsage'

/** Shared building blocks for the owner sections, so every section looks and behaves the same. */

export const Stat = ({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: 'good' | 'bad' }) => (
  <div className="bg-white border border-border rounded-xl p-4">
    <div className="text-xs font-semibold text-slate-600">{title}</div>
    <div className={`text-2xl font-bold mt-1 tabular-nums ${tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-green-700' : ''}`}>{value}</div>
    {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
  </div>
)

export const Stats = ({ children }: { children: ReactNode }) => <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">{children}</div>

export const Panel = ({ title, children, right, note }: { title: string; children: ReactNode; right?: ReactNode; note?: string }) => (
  <section className="bg-white border border-border rounded-xl p-5 mb-6">
    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="font-semibold">{title}</h2>{right}</div>
    {note && <p className="text-xs text-slate-600 -mt-2 mb-3">{note}</p>}
    {children}
  </section>
)

export const ErrorBox = ({ message }: { message: string }) => <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{message}</p>
export const EmptyNote = ({ children = 'Nothing to show in this range.' }: { children?: ReactNode }) => <p className="py-8 text-center text-sm text-slate-600">{children}</p>

/** Page frame: title, subtitle, date-range buttons, loading + error handling. */
export function SectionPage({ title, subtitle, error, loading, noRange, actions, children }: { title: string; subtitle: string; error?: string | null; loading?: boolean; noRange?: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div><h1 className="font-heading font-bold text-2xl">{title}</h1><p className="text-slate-600 text-sm mb-5">{subtitle}</p></div>
        {actions}
      </div>
      {!noRange && <RangeBar />}
      {error && <ErrorBox message={error} />}
      {loading && !error ? <p role="status" className="py-10 text-center text-sm text-slate-600">Loading…</p> : children}
    </>
  )
}

export function RangeBar() {
  const { range, set } = useFilters()
  return (
    <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-border overflow-hidden mb-6 bg-white">
      {(['today', '7d', '30d', '90d'] as const).map((k) => (
        <button key={k} onClick={() => set({ range: k, from: undefined, to: undefined })} aria-pressed={range === k} className={`px-3 py-1.5 text-sm ${range === k ? 'bg-foreground text-white' : 'hover:bg-slate-50'}`}>{k === 'today' ? 'Today' : k === '7d' ? '7 days' : k === '30d' ? '30 days' : '90 days'}</button>
      ))}
    </div>
  )
}

/** Fetch `/api/v1/admin${path}` with the page's date range (and any extra query), refetching when either changes. */
export function useSection<T>(path: string, extra: Record<string, string | number | undefined> = {}) {
  const { filters } = useFilters()
  const query = { from: filters.from, to: filters.to, ...extra }
  return useAsync(() => api.admin.get<T>(path, query), `${path}${JSON.stringify(query)}`)
}

export interface Column<T> { header: string; cell: (row: T) => ReactNode; align?: 'right'; className?: string }
export function DataTable<T>({ rows, columns, rowKey, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T, i: number) => string; empty?: string }) {
  if (rows.length === 0) return <EmptyNote>{empty}</EmptyNote>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-slate-600 border-b border-border">{columns.map((c) => <th key={c.header} scope="col" className={`py-2 pr-4 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-b border-slate-100 last:border-0">
              {columns.map((c) => <td key={c.header} className={`py-2 pr-4 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.className ?? ''}`}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Single-series column chart over time. Values go in <title> and a summary in aria-label (screen-reader friendly). */
export function TimeBars({ points, format = compact, label, color = '#0B3DD0' }: { points: { t: string; v: number }[]; format?: (n: number) => string; label: string; color?: string }) {
  const W = 900, H = 220, pad = { l: 56, r: 12, t: 10, b: 26 }
  if (points.length === 0) return <EmptyNote />
  const max = Math.max(1e-9, ...points.map((p) => p.v))
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b
  const bw = Math.min(40, (iw / points.length) * 0.7)
  const y = (v: number) => pad.t + ih - (v / max) * ih
  const every = Math.ceil(points.length / 10)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, ${points.length} periods`} className="w-full h-auto">
      {[0, 0.5, 1].map((f) => (<g key={f}><line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="#E2E8F0" /><text x={pad.l - 8} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#475569">{format(max * f)}</text></g>))}
      {points.map((p, i) => {
        const x = pad.l + (iw / points.length) * i + (iw / points.length - bw) / 2
        const d = new Date(p.t)
        return (
          <g key={p.t}>
            <title>{`${d.toLocaleDateString()} — ${format(p.v)}`}</title>
            <rect x={x} y={y(p.v)} width={bw} height={Math.max(0, (p.v / max) * ih)} fill={color} rx="2" />
            {i % every === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#475569">{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text>}
          </g>
        )
      })}
    </svg>
  )
}

export const Badge = ({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${{ slate: 'bg-slate-100 text-slate-700', green: 'bg-green-100 text-green-800', red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-900', blue: 'bg-blue-100 text-blue-800' }[tone]}`}>{children}</span>
)

export const money = (minor: number, currency: string) => new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100)
export const dateTime = (s: string | Date) => new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
