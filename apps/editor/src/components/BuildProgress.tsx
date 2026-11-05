import { Check } from '@prompttoppt/ui/icons'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { buildRows, currentRow, type BuildRow } from '@/lib/buildRows'

/**
 * The "your slides" list of the progress screen: the deck being written, one line per slide, ticking off as each one is written. It reads the real deck
 * (newest revision only, every 2 s; an unchanged deck costs no document read), so what it shows is what exists: nothing here is a guess or a timer.
 * `onCount` tells the page how many slides are written, so it can offer "Open the editor now" once there is something to edit.
 */
export function BuildProgress({ deckId, onCount }: { deckId: string; onCount: (written: number, total: number) => void }) {
  const [rows, setRows] = useState<BuildRow[]>([])
  const known = useRef(new Map<string, string>())
  const revision = useRef(-1)
  const nowRef = useRef<HTMLLIElement>(null)
  const cb = useRef(onCount)
  useEffect(() => { cb.current = onCount }) // the newest callback, read by the polling below

  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const r = await api.getPresentationIfChanged(deckId, revision.current)
        if (stop || 'unchanged' in r) return
        revision.current = r.revision
        const next = buildRows(r.document.slides, known.current)
        setRows(next)
        cb.current(next.filter((x) => x.done).length, next.length)
      } catch { /* the next tick tries again; the page above decides what a stopped job means */ }
    }
    void tick()
    const t = setInterval(() => void tick(), 2000)
    return () => { stop = true; clearInterval(t) }
  }, [deckId])

  const now = currentRow(rows)
  // keep the slide being written in view when the list is longer than its box
  useEffect(() => { nowRef.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }) }, [now])

  if (rows.length === 0) return null
  const done = rows.filter((r) => r.done).length
  return (
    <div className="mt-6 border-t border-border pt-5" data-testid="build-slides">
      <p className="text-sm font-heading font-bold text-slate-800 mb-3">Your slides <span className="font-normal text-slate-500">· {done} of {rows.length} written</span></p>
      <ol className="space-y-1 max-h-[300px] overflow-y-auto pr-1" aria-label="Slides being written">
        {rows.map((r, i) => {
          const state = r.done ? 'done' : i === now ? 'now' : 'next'
          return (
            <li key={r.id} ref={i === now ? nowRef : undefined} data-state={state} aria-current={state === 'now' ? 'step' : undefined}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm motion-safe:animate-[pt-rise_0.35s_ease-out_both]" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold transition-colors duration-300 ${state === 'done' ? 'bg-primary text-white' : state === 'now' ? 'border-2 border-primary bg-white text-primary' : 'border border-slate-300 bg-slate-50 text-slate-400'}`}>
                {state === 'done' ? <Check size={12} strokeWidth={3} /> : state === 'now' ? <span className="block h-2.5 w-2.5 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" /> : i + 1}
              </span>
              <span className={`min-w-0 truncate ${state === 'done' ? 'text-slate-800' : state === 'now' ? 'font-semibold text-primary' : 'text-slate-400'}`}>{r.title}</span>
              <span className="sr-only">{state === 'done' ? ', written' : state === 'now' ? ', being written' : ', waiting'}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
