'use client'

import { useRef, useState } from 'react'
import type { FreePdfResult } from '@prompttoppt/api-client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { openInEditor, outlineToPrompt, toolError } from '@/lib/free-tools'

const MODES = [
  ['presentation', 'Professional presentation', 'A clear deck that follows your document'],
  ['summary', 'Summary into slides', 'The key ideas, shortened'],
  ['executive', 'Executive briefing', 'Conclusions and decisions for busy readers'],
  ['academic', 'Academic talk', 'Question, method, findings, conclusion'],
  ['business', 'Business deck', 'Situation, plan, numbers and next steps'],
] as const
const MAX_MB = 5

/** Free "PDF → presentation" tool. Reads the PDF on our server, returns a summary and slide outline, then opens the full deck in the editor. */
export function PdfTool() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<string>('presentation')
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [out, setOut] = useState<FreePdfResult | null>(null)

  function pick(f: File | undefined) {
    setOut(null); setError(null)
    if (!f) return setFile(null)
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return setError('Please choose a PDF file.')
    if (f.size > MAX_MB * 1024 * 1024) return setError(`That PDF is larger than ${MAX_MB} MB. Try a smaller file.`)
    setFile(f)
  }
  async function run() {
    if (!file) return setError('Choose a PDF first.')
    setBusy(true); setError(null)
    try { setOut(await api.freePdf(file, mode)) }
    catch (e) { setError(toolError(e, 'Could not read that PDF. Please try again.')) }
    finally { setBusy(false) }
  }
  async function toDeck() {
    if (!out) return
    setOpening(true); setError(null)
    try { await openInEditor(outlineToPrompt(out, 'Use the attached document as the source.'), [out.attachmentId]) }
    catch (e) { setError(toolError(e, 'Could not open the editor. Please upload the PDF again.')); setOpening(false) }
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
          className="w-full rounded-2xl border-2 border-dashed border-foreground bg-[#f8f9fc] px-6 py-10 text-center hover:bg-[#f0f4f8] focus:outline-none focus:ring-2 focus:ring-primary">
          <span className="block font-heading font-extrabold text-lg text-foreground">{file ? file.name : 'Drop your PDF here, or click to choose'}</span>
          <span className="mt-1 block text-sm font-medium text-[#64748b]">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `Reports, papers, plans and notes · up to ${MAX_MB} MB · text PDFs`}</span>
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose a PDF" onChange={(e) => pick(e.target.files?.[0])} />

        <fieldset className="mt-5">
          <legend className="text-xs font-heading font-extrabold uppercase text-foreground">What should we make?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {MODES.map(([v, label, hint]) => (
              <label key={v} className={`cursor-pointer rounded-xl border-2 border-foreground px-4 py-3 ${mode === v ? 'bg-secondary' : 'bg-white hover:bg-[#f8f9fc]'}`}>
                <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="sr-only" />
                <span className="block font-heading font-extrabold text-sm text-foreground">{label}</span>
                <span className="block text-xs font-medium text-[#475569]">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button variant="accent" size="lg" arrow disabled={busy || !file} onClick={() => void run()} className="mt-6">{busy ? 'Reading your PDF…' : 'Create from PDF'}</Button>
        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
      </Card>

      {out && (
        <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
          <h2 className="font-heading font-extrabold text-2xl text-foreground">{out.title}</h2>
          <p className="mt-1 text-xs font-medium text-[#64748b]">{out.pages} page{out.pages === 1 ? '' : 's'} read{out.truncated ? ' (long document: the first part was used)' : ''}</p>
          <p className="mt-4 text-sm leading-6 font-medium text-[#334155]">{out.summary}</p>
          <h3 className="mt-5 font-heading font-extrabold text-sm uppercase text-foreground">Key points</h3>
          <ul className="mt-2 list-disc pl-5 text-sm leading-6 font-medium text-[#475569]">{out.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>
          <h3 className="mt-5 font-heading font-extrabold text-sm uppercase text-foreground">Slide outline</h3>
          <ol className="mt-2 flex flex-col gap-3">
            {out.slides.map((s, i) => (
              <li key={i} className="list-none flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-lg bg-secondary border-2 border-foreground flex items-center justify-center font-heading font-extrabold text-xs">{i + 1}</span>
                <div><p className="font-heading font-extrabold text-sm text-foreground">{s.title}</p><p className="text-sm leading-6 font-medium text-[#475569]">{s.points.join(' · ')}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-7"><Button variant="accent" size="lg" arrow disabled={opening} onClick={() => void toDeck()}>{opening ? 'Opening the editor…' : 'Make this a designed, editable presentation'}</Button></div>
          <p className="mt-3 text-xs font-medium text-[#64748b]">Free to start. Your PDF is read for this request and removed within an hour if you don’t continue.</p>
        </Card>
      )}
    </div>
  )
}
