import { int } from '@/lib/format'

/** Small helpers shared by the Images / Exports / Presentations sections. */

export interface Paged<T> { total: number; page: number; pageSize: number; rows: T[] }

export function Pager({ page, pageSize, total, onPage, label }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; label: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const btn = 'px-3 py-1.5 text-sm rounded-lg border border-border bg-white hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white'
  return (
    <nav aria-label={`${label} pagination`} className="flex items-center justify-between gap-3 mt-3 text-sm">
      <span role="status" className="text-slate-600 tabular-nums">Page {int(page)} of {int(pages)} · {int(total)} total</span>
      <span className="flex gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </span>
    </nav>
  )
}

export const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
