import { Check, ChevronDown, LoaderCircle } from '@prompttoppt/ui/icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { JobStatus } from '@prompttoppt/api-client'
import type { PromptAnalysis } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import { buildRows, currentRow, type BuildRow } from '@/lib/buildRows'

/**
 * The progress screen while a deck is made, as a quiet timeline: "Thought for 6s" (what the request was understood as), then each step the job really went
 * through, with how long it took, and the step running now with a small spinner and its seconds. Everything shown is real: the understanding is the analysis
 * the server returned, the outline and the slides are read from the deck itself, and the steps are the job's own states. Nothing is a timer or a made-up line.
 */

const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`

/** a second-by-second clock for the step running now (stops when nothing is running) */
function useNow(running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  return now
}

/** a row that opens to show its details (closed by default unless `open`); without details it is plain text */
function Row({ icon, title, meta, children, open: start = false, testId }: { icon: ReactNode; title: ReactNode; meta?: ReactNode; children?: ReactNode; open?: boolean; testId?: string }) {
  // follows `open` (the step running now shows its slides) until the person opens or closes it themselves
  const [chosen, setChosen] = useState<boolean | null>(null)
  const open = chosen ?? start
  const setOpen = (f: (o: boolean) => boolean) => setChosen(f(open))
  const head = (
    <>
      <span className="font-medium text-slate-800">{title}</span>
      {meta && <span className="text-slate-400 tabular-nums">{meta}</span>}
      {children && <ChevronDown aria-hidden size={15} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
    </>
  )
  return (
    <li className="relative pl-7" data-testid={testId}>
      <span aria-hidden className="absolute left-0 top-[3px] grid h-4 w-4 place-items-center">{icon}</span>
      {children
        ? <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 text-left text-[14px] hover:text-slate-900">{head}</button>
        : <p className="flex items-center gap-1.5 text-[14px]">{head}</p>}
      {children && open && <div className="mt-2 mb-1 text-[13.5px] leading-relaxed text-slate-600">{children}</div>}
    </li>
  )
}

const Dot = () => <span className="block h-1.5 w-1.5 rounded-full bg-slate-400" />
const Spin = () => <LoaderCircle size={15} className="text-primary motion-safe:animate-spin" />

/** "Thinking 4s" while the request is read, then "Thought for 6s" with what was understood (shown on every step after it) */
export function ThoughtRow({ startedAt, tookMs, analysis, sources }: { startedAt: number; tookMs: number | null; analysis: PromptAnalysis | null; sources: number }) {
  const now = useNow(tookMs === null)
  if (tookMs === null || !analysis) {
    return (
      <ol className="mt-7" aria-label="Steps">
        <Row icon={<Spin />} title={<span role="status">Thinking</span>} meta={secs(now - startedAt)} />
      </ol>
    )
  }
  const lines: [string, string | undefined][] = [['About', analysis.topic], ['For', analysis.audience], ['Goal', analysis.objective], ['Tone', analysis.tone], ['Covers', analysis.requiredSections.join(' · ') || undefined]]
  return (
    <ol className="mt-7" aria-label="What I understood">
      <Row icon={<Dot />} title={`Thought for ${secs(tookMs)}`} testId="thought">
        <dl className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-0.5">
          {lines.filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-slate-400">{k}</dt><dd className="text-slate-700">{v}</dd></div>)}
        </dl>
        {sources > 0 && <p className="mt-1.5">Read your {sources === 1 ? 'attached source' : `${sources} attached sources`}.</p>}
        {(analysis.facts ?? []).length > 0 && <p className="mt-1.5">{analysis.facts.length === 1 ? 'One detail of yours' : `${analysis.facts.length} details of yours`} will be used as facts; nothing else is stated as fact.</p>}
      </Row>
    </ol>
  )
}

/** the job's states as the steps a person sees, in order */
type Step = 'queued' | 'planning' | 'writing' | 'designing' | 'checking'
const STEP_OF: Partial<Record<JobStatus, Step>> = { queued: 'queued', analyzing: 'planning', outlining: 'planning', generating: 'writing', rendering: 'designing', validating: 'checking' }
const ORDER: Step[] = ['queued', 'planning', 'writing', 'designing', 'checking']
const LABEL: Record<Step, string> = { queued: 'Waiting for a free slot', planning: 'Planning the outline', writing: 'Writing the slides', designing: 'Designing the layouts', checking: 'Checking the deck' }

/** the slides of the deck being written, read from the deck itself every 2 s (an unchanged deck costs no document read) */
function useBuildRows(deckId: string | null) {
  const [rows, setRows] = useState<BuildRow[]>([])
  const known = useRef(new Map<string, string>())
  const revision = useRef(-1)
  useEffect(() => {
    if (!deckId) return
    let stop = false
    const tick = async () => {
      try {
        const r = await api.getPresentationIfChanged(deckId, revision.current)
        if (stop || 'unchanged' in r) return
        revision.current = r.revision
        setRows(buildRows(r.document.slides, known.current))
      } catch { /* the next tick tries again; the page above decides what a stopped job means */ }
    }
    void tick()
    const t = setInterval(() => void tick(), 2000)
    return () => { stop = true; clearInterval(t) }
  }, [deckId])
  return rows
}

function SlideList({ rows }: { rows: BuildRow[] }) {
  const now = currentRow(rows)
  const nowRef = useRef<HTMLLIElement>(null)
  useEffect(() => { nowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' }) }, [now])
  return (
    <ol className="space-y-0.5 max-h-[280px] overflow-y-auto pr-1" aria-label="Slides being written" data-testid="build-slides">
      {rows.map((r, i) => {
        const state = r.done ? 'done' : i === now ? 'now' : 'next'
        return (
          <li key={r.id} ref={i === now ? nowRef : undefined} data-state={state} aria-current={state === 'now' ? 'step' : undefined} className="flex items-center gap-2.5 py-0.5">
            <span aria-hidden className="grid h-4 w-4 shrink-0 place-items-center">
              {state === 'done' ? <Check size={13} strokeWidth={2.5} className="text-slate-500" /> : state === 'now' ? <Spin /> : <span className="block h-1.5 w-1.5 rounded-full bg-slate-300" />}
            </span>
            <span className="w-5 shrink-0 text-right text-slate-400 tabular-nums">{i + 1}</span>
            <span className={`min-w-0 truncate ${state === 'done' ? 'text-slate-700' : state === 'now' ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>{r.title}</span>
            <span className="sr-only">{state === 'done' ? ', written' : state === 'now' ? ', being written' : ', waiting'}</span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The steps of the job so far. `onCount` tells the page how many slides are written, so it can offer "Open the editor now" once there is something to edit.
 */
export function BuildProgress({ status, deckId, onCount }: { status: JobStatus | null; deckId: string | null; onCount: (written: number, total: number) => void }) {
  const rows = useBuildRows(deckId)
  const cb = useRef(onCount)
  useEffect(() => { cb.current = onCount })
  useEffect(() => { cb.current(rows.filter((r) => r.done).length, rows.length) }, [rows])

  const step = status ? STEP_OF[status] ?? null : null
  const now = useNow(!!step)
  // when each step was first seen running (in this browser, to the second), so a finished step can say how long it took
  const [seen, setSeen] = useState<Partial<Record<Step, number>>>({})
  if (step && seen[step] === undefined) setSeen({ ...seen, [step]: now })

  const at = step ? ORDER.indexOf(step) : -1
  const shown = ORDER.filter((s, i) => i <= at && (s !== 'queued' || seen.queued !== undefined))
  const took = (s: Step) => { const i = ORDER.indexOf(s); const start = seen[s]; const next = ORDER.slice(i + 1).map((x) => seen[x]).find((t) => t !== undefined); return start !== undefined && next !== undefined ? secs(next - start) : undefined }
  const done = rows.filter((r) => r.done).length

  if (!step) return (
    <ol className="mt-5 space-y-3" aria-label="Steps"><Row icon={<Spin />} title={<span role="status">Starting</span>} /></ol>
  )
  return (
    <ol className="mt-5 space-y-3" aria-label="Steps">
      {shown.map((s) => {
        const running = s === step
        const meta = running ? secs(now - (seen[s] ?? now)) : took(s)
        const title = s === 'writing' && rows.length ? <>{LABEL[s]} <span className="font-normal text-slate-500">· {done} of {rows.length}</span></> : LABEL[s]
        const detail = s === 'planning' && !running && rows.length ? <p>{rows.length} slides: {rows.map((r) => r.title).join(' · ')}</p>
          : s === 'writing' && rows.length ? <SlideList rows={rows} /> : undefined
        return (
          <Row key={s} icon={running ? <Spin /> : <Dot />} title={running ? <span role="status">{title}</span> : title} meta={meta} open={s === 'writing' && running}>
            {detail}
          </Row>
        )
      })}
    </ol>
  )
}
