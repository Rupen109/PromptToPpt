import { useCallback, useEffect, useState } from 'react'
import { ApiError, type ShareAnalytics, type ShareAnalyticsFull } from '@prompttoppt/api-client'
import { Portal } from '@/components/Portal'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useDialog } from '@/lib/useDialog'

const dur = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`)
const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
const DEVICE = { phone: '📱 Phone', tablet: '📟 Tablet', computer: '💻 Computer' } as const
const region = (code: string) => { try { return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) ?? code } catch { return code } }

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border border-border p-3"><div className="text-xs text-slate-600">{label}</div><div className="font-heading font-bold text-2xl mt-0.5" data-kpi={label}>{value}</div>{hint && <div className="text-[11px] text-slate-600 mt-0.5">{hint}</div>}</div>
}
function Share({ title, rows, empty }: { title: string; rows: { name: string; views: number; pct: number }[]; empty: string }) {
  return (
    <section aria-label={title} className="rounded-xl border border-border p-3">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {rows.length === 0 ? <p className="text-xs text-slate-600">{empty}</p> : (
        <ul className="space-y-1.5">{rows.map((r) => (
          <li key={r.name} className="text-sm"><div className="flex justify-between gap-2"><span className="truncate">{title === 'Countries' ? region(r.name) : r.name in DEVICE ? DEVICE[r.name as keyof typeof DEVICE] : r.name}</span><span className="tabular-nums text-slate-700">{r.views} · {r.pct}%</span></div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-0.5" aria-hidden><div className="h-full bg-primary" style={{ width: `${r.pct}%` }} /></div></li>
        ))}</ul>
      )}
    </section>
  )
}

/** Views per day as bars, with the same numbers in a visually hidden table (and a one-line summary) for screen readers. */
function DailyChart({ daily }: { daily: ShareAnalyticsFull['daily'] }) {
  const top = Math.max(1, ...daily.map((d) => d.views))
  const W = 600, H = 120, gap = daily.length > 40 ? 1 : 3
  const bw = (W - gap * (daily.length - 1)) / daily.length
  const total = daily.reduce((n, d) => n + d.views, 0)
  return (
    <figure className="rounded-xl border border-border p-3">
      <figcaption className="text-sm font-semibold mb-2">Views per day <span className="font-normal text-xs text-slate-600">(UTC days)</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={`Views per day over ${daily.length} days: ${total} in total, busiest day ${top}`} className="w-full h-auto" data-testid="daily-chart">
        {daily.map((d, i) => { const h = d.views === 0 ? 1 : Math.max(3, (d.views / top) * H); return <rect key={d.date} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={2} className={d.views ? 'fill-primary' : 'fill-slate-200'} data-views={d.views}><title>{`${d.date}: ${d.views} view${d.views === 1 ? '' : 's'}, ${d.visitors} visitor${d.visitors === 1 ? '' : 's'}`}</title></rect> })}
        <text x={0} y={H + 14} fontSize={11} className="fill-slate-600">{daily[0]?.date.slice(5)}</text>
        <text x={W} y={H + 14} fontSize={11} textAnchor="end" className="fill-slate-600">{daily.at(-1)?.date.slice(5)}</text>
      </svg>
      <table className="sr-only"><caption>Views per day</caption><thead><tr><th>Day</th><th>Views</th><th>Visitors</th></tr></thead><tbody>{daily.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.views}</td><td>{d.visitors}</td></tr>)}</tbody></table>
    </figure>
  )
}

/** Owner only: how a shared deck is being viewed. Pro / Gold see everything; other plans see the total and an upgrade prompt. */
export function AnalyticsDialog({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const { upgrade } = useEntitlements()
  const [days, setDays] = useState<7 | 30 | 90>(30)
  const [data, setData] = useState<ShareAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => { setError(null); api.getShareAnalytics(deckId, days).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the analytics. Please try again.')) }, [deckId, days])
  useEffect(() => { load() }, [load])
  async function clear() {
    if (!confirm('Delete all recorded views of this presentation? This cannot be undone.')) return
    try { await api.clearShareAnalytics(deckId); load() } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not clear the analytics.') }
  }
  const full = data?.detail ? data : null
  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-3 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Link analytics" className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-xl outline-none">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h2 className="font-heading font-bold text-xl">Link analytics</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-600 hover:text-slate-900 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-slate-600 mb-4">How people view your shared link. Your own views and your collaborators' are not counted. Nothing personal is recorded — no names, e-mail addresses, IP addresses or cookies.</p>
        {error && <p role="alert" className="text-sm font-medium text-red-700 mb-3">{error} <button onClick={load} className="underline">Try again</button></p>}
        {!data && !error && <p className="text-sm text-slate-600">Loading…</p>}

        {data && !data.detail && (
          <div className="rounded-xl border border-border bg-slate-50 p-4 space-y-2" aria-label="Views summary">
            <div className="text-sm"><span className="font-heading font-bold text-3xl" data-kpi="Total views">{data.totalViews}</span> <span className="text-slate-700">{data.totalViews === 1 ? 'view' : 'views'} so far · last viewed {ago(data.lastViewedAt)}</span></div>
            <p className="text-sm text-slate-700">See who is reading, how long each slide holds attention and where people stop with Pro or Gold.</p>
            <button onClick={() => { onClose(); upgrade.show('Detailed link analytics are available on Pro and Gold.') }} className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold">See plans</button>
          </div>
        )}

        {full && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Time range" className="flex gap-1">
                {([7, 30, 90] as const).map((d) => <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={`px-3 py-1.5 rounded-full text-sm ${days === d ? 'bg-foreground text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{d} days</button>)}
              </div>
              <span className="text-xs text-slate-600 ml-auto">Last viewed {ago(full.lastViewedAt)} · {full.totalViews} view{full.totalViews === 1 ? '' : 's'} all time</span>
            </div>
            {full.capped && <p role="status" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This presentation has reached 20,000 recorded views, so new views are not recorded. Clear the analytics to start again.</p>}
            {full.totals.views === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center" aria-label="No views yet">
                <p className="font-semibold">No views in the last {days} days</p>
                <p className="text-sm text-slate-600 mt-1">Share the link — views appear here within seconds of someone opening it.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2" aria-label="Key numbers">
                  <Kpi label="Views" value={String(full.totals.views)} />
                  <Kpi label="Visitors" value={String(full.totals.visitors)} hint="different browsers" />
                  <Kpi label="Average time" value={dur(full.totals.avgSeconds)} />
                  <Kpi label="Finished" value={`${full.totals.completionPct}%`} hint="reached the last slide" />
                  <Kpi label="Slides seen" value={String(full.totals.avgSlidesSeen)} hint="on average" />
                </div>
                <DailyChart daily={full.daily} />
                <section aria-label="Slides" className="rounded-xl border border-border p-3 overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-2">Slide by slide</h3>
                  <table className="w-full text-sm sm:min-w-[480px]">
                    <thead><tr className="text-left text-xs text-slate-600"><th className="font-medium py-1 pr-2">Slide</th><th className="font-medium pr-2">Reached</th><th className="font-medium pr-2">Avg. time</th><th className="font-medium">Left here</th></tr></thead>
                    <tbody>
                      {full.slides.map((s) => (
                        <tr key={s.slideId} data-slide-row={s.index + 1} className="border-t border-border">
                          <td className="py-1.5 pr-2 font-medium">{s.index + 1}</td>
                          <td className="pr-2"><div className="flex items-center gap-2"><div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden max-sm:hidden" aria-hidden><div className="h-full bg-primary" style={{ width: `${s.reachPct}%` }} /></div><span className="tabular-nums">{s.reachPct}%</span></div></td>
                          <td className="pr-2 tabular-nums">{s.avgSeconds ? dur(s.avgSeconds) : '–'}</td>
                          <td className="tabular-nums">{s.leftHerePct ? `${s.leftHerePct}%` : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {full.removedSlidesSeconds > 0 && <p className="text-xs text-slate-600 mt-2">Plus {dur(full.removedSlidesSeconds)} spent on slides you have since removed.</p>}
                </section>
                <div className="grid sm:grid-cols-3 gap-3">
                  <Share title="Devices" rows={full.devices} empty="No data yet." />
                  <Share title="Where from" rows={full.sources} empty="No data yet." />
                  <Share title="Countries" rows={full.countries} empty="Not available for these views." />
                </div>
                <section aria-label="Recent views" className="rounded-xl border border-border p-3 overflow-x-auto">
                  <h3 className="text-sm font-semibold mb-2">Recent views</h3>
                  <table className="w-full text-sm min-w-[520px]">
                    <thead><tr className="text-left text-xs text-slate-600"><th className="font-medium py-1 pr-2">When</th><th className="font-medium pr-2">Device</th><th className="font-medium pr-2">From</th><th className="font-medium pr-2">Time</th><th className="font-medium">Slides</th></tr></thead>
                    <tbody>{full.recent.map((r, i) => (
                      <tr key={i} className="border-t border-border"><td className="py-1.5 pr-2"><time dateTime={r.at}>{ago(r.at)}</time></td><td className="pr-2">{DEVICE[r.device]}</td><td className="pr-2 truncate max-w-[10rem]">{r.source}{r.country ? ` · ${region(r.country)}` : ''}</td><td className="pr-2 tabular-nums">{dur(r.seconds)}</td><td className="tabular-nums">{r.slidesReached}/{r.slideCount}{r.completed ? ' ✓' : ''}</td></tr>
                    ))}</tbody>
                  </table>
                </section>
              </>
            )}
            <div className="pt-1"><button onClick={() => void clear()} className="text-sm text-red-700 underline">Clear analytics for this presentation</button></div>
          </div>
        )}
      </div>
    </div></Portal>
  )
}
