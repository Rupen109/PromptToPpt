'use client'

import { useState, type FormEvent } from 'react'
import type { FreeOutline } from '@prompttoppt/api-client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { openInEditor, outlineToPrompt, toolError } from '@/lib/free-tools'

const KINDS = [['general', 'Any topic'], ['business', 'Business'], ['sales', 'Sales'], ['marketing', 'Marketing'], ['pitch', 'Startup pitch'], ['proposal', 'Project proposal'], ['education', 'Education'], ['research', 'Research']] as const
const FIELD = 'w-full rounded-xl border-2 border-foreground bg-white px-4 py-3 text-sm font-medium text-foreground placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-primary'

/** Free AI outline generator. The outline is shown first; turning it into a full deck is the one call to action. */
export function OutlineTool({ initialTopic = '', initialKind = 'general' }: { initialTopic?: string; initialKind?: string }) {
  const [topic, setTopic] = useState(initialTopic)
  const [kind, setKind] = useState(initialKind)
  const [audience, setAudience] = useState('')
  const [slides, setSlides] = useState(8)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<FreeOutline | null>(null)

  async function run(e: FormEvent) {
    e.preventDefault()
    if (topic.trim().length < 3) return setError('Tell us what the presentation is about.')
    setBusy(true); setError(null)
    try { setOut(await api.freeOutline({ topic: topic.trim(), kind, slides, ...(audience.trim() ? { audience: audience.trim() } : {}) })) }
    catch (err) { setError(toolError(err, 'Something went wrong. Please try again.')) }
    finally { setBusy(false) }
  }
  async function toDeck() {
    if (!out) return
    setOpening(true); setError(null)
    try { await openInEditor(outlineToPrompt(out)) }
    catch (err) { setError(toolError(err, 'Could not open the editor. Please try again.')); setOpening(false) }
  }
  const copy = () => out && navigator.clipboard?.writeText(`${out.title}\n\n${out.slides.map((s, i) => `${i + 1}. ${s.title}\n${s.points.map((p) => `   - ${p}`).join('\n')}`).join('\n\n')}`)

  return (
    <div className="flex flex-col gap-6 text-left">
      <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
        <form onSubmit={run} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-xs font-heading font-extrabold uppercase text-foreground">What is your presentation about?
            <input value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={300} placeholder="e.g. Salesforce Agentforce for a retail leadership team" className={FIELD} />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-2 text-xs font-heading font-extrabold uppercase text-foreground">Type
              <select value={kind} onChange={(e) => setKind(e.target.value)} className={FIELD}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-heading font-extrabold uppercase text-foreground">Audience (optional)
              <input value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={100} placeholder="e.g. board members" className={FIELD} />
            </label>
            <label className="flex flex-col gap-2 text-xs font-heading font-extrabold uppercase text-foreground">Slides
              <select value={slides} onChange={(e) => setSlides(Number(e.target.value))} className={FIELD}>{[5, 6, 7, 8, 9, 10, 12].map((n) => <option key={n} value={n}>{n} slides</option>)}</select>
            </label>
          </div>
          <Button type="submit" variant="accent" size="lg" arrow disabled={busy} className="self-start">{busy ? 'Writing your outline…' : 'Generate outline'}</Button>
        </form>
        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
      </Card>

      {out && (
        <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
          <h2 className="font-heading font-extrabold text-2xl text-foreground">{out.title}</h2>
          <ol className="mt-5 flex flex-col gap-4">
            {out.slides.map((s, i) => (
              <li key={i} className="list-none flex gap-4">
                <span className="shrink-0 w-8 h-8 rounded-lg bg-secondary border-2 border-foreground flex items-center justify-center font-heading font-extrabold text-sm">{i + 1}</span>
                <div><h3 className="font-heading font-extrabold text-base text-foreground">{s.title}</h3>
                  <ul className="mt-1 list-disc pl-5 text-sm leading-6 font-medium text-[#475569]">{s.points.map((p, j) => <li key={j}>{p}</li>)}</ul></div>
              </li>
            ))}
          </ol>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="accent" size="lg" arrow disabled={opening} onClick={() => void toDeck()}>{opening ? 'Opening the editor…' : 'Turn this outline into a full presentation'}</Button>
            <Button variant="white" size="lg" onClick={copy}>Copy outline</Button>
          </div>
          <p className="mt-3 text-xs font-medium text-[#64748b]">Free to start — your first deck is on us. No credit card.</p>
        </Card>
      )}
    </div>
  )
}
