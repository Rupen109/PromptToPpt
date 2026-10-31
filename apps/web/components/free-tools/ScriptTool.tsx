'use client'

import { useState, type FormEvent } from 'react'
import type { FreeOutline } from '@prompttoppt/api-client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { openInEditor, outlineToPrompt, toolError } from '@/lib/free-tools'

const KINDS = [['reel', 'Reel / Short / TikTok'], ['youtube', 'YouTube video'], ['talk', 'Talk or speech'], ['podcast', 'Podcast episode']] as const
const FIELD = 'w-full rounded-xl border-2 border-foreground bg-white px-4 py-3 text-sm font-medium text-foreground placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-primary'
const MAX = 6000

/** Free "video / Reel script → slides" tool. The outline follows the script's beats; turning it into a full deck carries the script into the editor. */
export function ScriptTool() {
  const [script, setScript] = useState('')
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('reel')
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<(FreeOutline & { attachmentId: string }) | null>(null)

  async function run(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setOut(null)
    try { setOut(await api.freeScript({ script: script.trim(), kind })) }
    catch (err) { setError(toolError(err, 'Something went wrong. Please try again.')) }
    finally { setBusy(false) }
  }
  async function toDeck() {
    if (!out) return
    setOpening(true); setError(null)
    try { await openInEditor(outlineToPrompt(out, 'Use the attached script as the source.'), [out.attachmentId]) }
    catch (err) { setError(toolError(err, 'Could not open the editor. Please paste the script again.')); setOpening(false) }
  }
  const copy = () => out && navigator.clipboard?.writeText(`${out.title}\n\n${out.slides.map((s, i) => `${i + 1}. ${s.title}\n${s.points.map((p) => `   - ${p}`).join('\n')}`).join('\n\n')}`)

  return (
    <div className="flex flex-col gap-6 text-left">
      <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
        <form onSubmit={run} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-xs font-heading font-extrabold uppercase text-foreground">Your script
            <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={9} maxLength={MAX} placeholder="Paste the script or caption of your video, Reel or talk…" className={`${FIELD} normal-case leading-6`} />
          </label>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="flex flex-col gap-2 text-xs font-heading font-extrabold uppercase text-foreground">What is it?
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={FIELD}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <span className="text-xs font-medium text-[#64748b]">{script.length.toLocaleString('en-US')} / {MAX.toLocaleString('en-US')} characters</span>
          </div>
          <Button type="submit" variant="accent" size="lg" arrow disabled={busy || script.trim().length < 40} className="self-start">{busy ? 'Reading your script…' : 'Make my slide outline'}</Button>
        </form>
        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
        <p className="mt-4 text-xs font-medium text-[#64748b]">Paste only text you wrote or may use. It is read by AI for this request and removed within an hour if you don’t continue.</p>
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
            <Button variant="accent" size="lg" arrow disabled={opening} onClick={() => void toDeck()}>{opening ? 'Opening the editor…' : 'Turn this into a designed, editable presentation'}</Button>
            <Button variant="white" size="lg" onClick={copy}>Copy outline</Button>
          </div>
          <p className="mt-3 text-xs font-medium text-[#64748b]">Free to start — your first deck is on us. No credit card.</p>
        </Card>
      )}
    </div>
  )
}
