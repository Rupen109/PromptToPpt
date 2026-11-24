import { FileUp, Loader2 } from '@prompttoppt/ui/icons'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, isGateError, type ModelOption } from '@prompttoppt/api-client'
import type { AspectRatio } from '@prompttoppt/validation'
import { FormatPicker } from '@/components/FormatPicker'
import { Portal } from '@/components/Portal'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { clearPending, setPendingJob, setPendingPrompt } from '@/lib/pending-prompt'
import { useDialog } from '@/lib/useDialog'

const IDEAS = [
  'A short version for investors with only the key points',
  'A customer-facing version in plain language',
  'A cleaner, simpler version with fewer words per slide',
  'Keep the story, tidy the structure and make it look professional',
]
const DEFAULT_ASK = 'Rebuild this presentation as a clean, well-structured new presentation, keeping its story and content.'

/**
 * Remix a PowerPoint: choose a .pptx, say how it should change, pick the shape and length, and get a NEW presentation built from that file's slides (its text and speaker notes):
 * same facts and figures, a fresh design, nothing invented. The file is read here on the server; it is never changed. Charged per slide like a new deck.
 */
export function RemixFileDialog({ onClose }: { onClose: () => void }) {
  const { ent, upgrade } = useEntitlements()
  const navigate = useNavigate()
  const cap = ent?.limits.maxSlides ?? 15
  const clamp = (v: string) => Math.max(3, Math.min(cap, Math.round(Number(v)) || 3))
  const [file, setFile] = useState<{ id: string; title: string; slides: number | null } | null>(null)
  const [reading, setReading] = useState(false)
  const [over, setOver] = useState(false)
  const [text, setText] = useState('')
  const [count, setCount] = useState('8')
  const [format, setFormat] = useState<AspectRatio>('16:9')
  const [models, setModels] = useState<ModelOption[]>([])
  const [modelId, setModelId] = useState<string | null>(null)
  const [choice, setChoice] = useState(false)
  const perSlide = models.find((m) => m.id === modelId)?.creditsPerSlide ?? null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idem = useRef(crypto.randomUUID())
  const input = useRef<HTMLInputElement>(null)
  const ref = useDialog<HTMLDivElement>(true, () => { if (!busy && !reading) onClose() })
  useEffect(() => { api.models().then((r) => { setModels(r.models); setChoice(r.choice); setModelId(r.default) }).catch(() => {}) }, [])

  async function read(f: File | undefined) {
    if (!f || reading) return
    setError(null); setFile(null); setReading(true)
    try {
      const s = await api.addFileSource(f)
      if (s.type !== 'pptx') throw new Error('That file is not a PowerPoint presentation. Choose a .pptx file.')
      setFile({ id: s.id, title: s.title, slides: s.parts ?? null })
      setCount(String(clamp(String(s.parts ?? 8))))
    } catch (e) {
      if (isGateError(e)) { onClose(); upgrade.show(e.message) } else setError(e instanceof Error ? (e instanceof ApiError ? e.message : e.message) : 'That file could not be read.')
    } finally { setReading(false) }
  }
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); void read(e.dataTransfer.files[0]) }

  async function start() {
    if (!file || busy) return
    setBusy(true); setError(null)
    try {
      const ask = text.trim() || DEFAULT_ASK
      const job = await api.createJob({ prompt: ask, slideCount: clamp(count), sourceIds: [file.id], remixFile: file.title, aspectRatio: format, ...(modelId ? { model: modelId } : {}), idempotencyKey: idem.current })
      clearPending(); setPendingPrompt(`Remix of "${file.title}": ${text.trim() || 'a clean new version'}`); setPendingJob(job.id)
      navigate('/create') // the create screen shows the progress and opens the new presentation when it is ready
    } catch (e) {
      if (isGateError(e)) { onClose(); upgrade.show(e.message) } else setError(e instanceof ApiError ? e.message : 'Something went wrong. You were not charged.')
      setBusy(false)
    }
  }

  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && !reading && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Remix a PowerPoint" className="bg-white rounded-2xl w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6 shadow-xl outline-none">
        <h2 className="font-heading font-bold text-xl">Remix a PowerPoint</h2>
        <p className="text-sm text-slate-600 mt-1">Choose a .pptx and say how it should change. You get a <b>new</b> presentation built from its slides, with the same facts and figures in a fresh design. Your file is not changed.</p>

        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}
          className={`mt-4 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${over ? 'border-primary bg-primary/5' : file ? 'border-emerald-300 bg-emerald-50/50' : 'border-border bg-slate-50'}`}
        >
          {reading ? (
            <p role="status" className="text-sm text-slate-700 inline-flex items-center gap-2"><Loader2 aria-hidden size={16} className="animate-spin" />Reading your slides…</p>
          ) : file ? (
            <div data-testid="remix-file-ready">
              <p className="font-semibold text-sm break-all">{file.title}.pptx</p>
              <p className="text-xs text-slate-600 mt-0.5">{file.slides ? `${file.slides} slide${file.slides === 1 ? '' : 's'} with text read` : 'Slides read'} · <button type="button" onClick={() => input.current?.click()} className="underline">choose another file</button></p>
            </div>
          ) : (
            <button type="button" onClick={() => input.current?.click()} className="inline-flex flex-col items-center gap-1.5 text-sm text-slate-700">
              <FileUp aria-hidden size={22} className="text-primary" />
              <span><b className="text-primary">Choose a PowerPoint</b> or drop it here</span>
              <span className="text-xs text-slate-500">.pptx · up to 15 MB</span>
            </button>
          )}
          <input ref={input} data-testid="remix-file-input" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="sr-only" aria-label="PowerPoint file" tabIndex={-1} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        <textarea aria-label="How should it change?" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder="e.g. Make it a 6-slide pitch for investors. (Optional: without it the story is kept and the structure tidied.)" className="mt-4 w-full border border-border rounded-xl px-3 py-2 text-sm resize-none" />
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Ideas">
          {IDEAS.map((i) => <button key={i} type="button" onClick={() => setText(i)} className="text-xs border border-border rounded-full px-3 py-1 hover:border-primary hover:text-primary">{i}</button>)}
        </div>

        <label className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">Slides in the new version
          <input type="number" inputMode="numeric" aria-label="Slides in the new version" min={3} max={cap} value={count} onChange={(e) => setCount(e.target.value)} onBlur={() => setCount(String(clamp(count)))} className="w-20 border border-border rounded-lg px-2 py-1.5" />
          {file?.slides ? <span className="text-slate-500">(your file has {file.slides})</span> : null}
        </label>
        <FormatPicker value={format} onChange={setFormat} label="Format of the new version" cols={2} />
        {choice && models.filter((m) => m.allowed).length > 0 && (
          <label className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">AI model
            <select aria-label="AI model" value={modelId ?? ''} onChange={(e) => setModelId(e.target.value)} className="min-w-0 flex-1 border border-border rounded-lg px-2 py-1.5 bg-white">
              {models.filter((m) => m.allowed).map((m) => <option key={m.id} value={m.id}>{m.displayName} · {m.creditsPerSlide} credits/slide</option>)}
            </select>
          </label>
        )}
        {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{perSlide !== null && file ? `About ${clamp(count) * perSlide} credits · refunded if it fails` : ''}</span>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy || reading} className="px-4 py-2 text-sm rounded-lg border border-border disabled:opacity-50">Cancel</button>
            <button onClick={() => void start()} disabled={busy || reading || !file} data-testid="remix-file-start" className="px-4 py-2 text-sm rounded-lg bg-primary text-white font-semibold disabled:opacity-50">{busy ? 'Starting…' : 'Create the remix'}</button>
          </div>
        </div>
      </div>
    </div></Portal>
  )
}
