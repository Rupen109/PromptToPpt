'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { openInEditor, toolError } from '@/lib/free-tools'
import { MAX_PAGES, PdfConvertError, type PdfMode } from '@/lib/pdf-to-pptx'

const MODES: [PdfMode, string, string][] = [
  ['image', 'Exact look', 'Every page becomes a slide that looks just like the PDF. Text is part of the picture.'],
  ['text', 'Editable text', 'Text becomes real text boxes you can edit. Pictures and graphics are not carried over.'],
]

/** Free PDF → PPT. The conversion runs in the browser; the PDF is only uploaded if the visitor chooses "redesign with AI". */
export function PdfToPptTool() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<PdfMode>('image')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ page: number; pages: number } | null>(null)
  const [done, setDone] = useState<{ url: string; name: string; size: number } | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setDone((d) => { if (d) URL.revokeObjectURL(d.url); return null }); setError(null) }
  function pick(f: File | undefined) {
    reset()
    if (!f) return setFile(null)
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return setError('Please choose a PDF file.')
    setFile(f)
  }
  async function convert() {
    if (!file) return setError('Choose a PDF first.')
    reset(); setBusy(true); setProgress(null)
    try {
      const { convertPdf } = await import('@/lib/pdf-to-pptx')
      const blob = await convertPdf(file, mode, setProgress)
      setDone({ url: URL.createObjectURL(blob), name: `${file.name.replace(/\.pdf$/i, '')}.pptx`, size: blob.size })
    } catch (e) {
      setError(e instanceof PdfConvertError ? e.message : 'Something went wrong while converting. Try the other option, or a different PDF.')
    } finally { setBusy(false) }
  }
  async function redesign() {
    if (!file) return
    setOpening(true); setError(null)
    try {
      const a = await api.addDraftFile(file)
      await openInEditor('Create a presentation from the attached document', [a.id])
    } catch (e) { setError(toolError(e, 'Could not open the editor. Please try again.')); setOpening(false) }
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
          className="w-full rounded-2xl border-2 border-dashed border-foreground bg-[#f8f9fc] px-6 py-10 text-center hover:bg-[#f0f4f8] focus:outline-none focus:ring-2 focus:ring-primary">
          <span className="block font-heading font-extrabold text-lg text-foreground">{file ? file.name : 'Drop your PDF here, or click to choose'}</span>
          <span className="mt-1 block text-sm font-medium text-[#64748b]">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `Up to ${MAX_PAGES} pages · converted on your device — your file is not uploaded`}</span>
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose a PDF" onChange={(e) => pick(e.target.files?.[0])} />

        <fieldset className="mt-5">
          <legend className="text-xs font-heading font-extrabold uppercase text-foreground">How should it convert?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {MODES.map(([v, label, hint]) => (
              <label key={v} className={`cursor-pointer rounded-xl border-2 border-foreground px-4 py-3 ${mode === v ? 'bg-secondary' : 'bg-white hover:bg-[#f8f9fc]'}`}>
                <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => { setMode(v); reset() }} className="sr-only" />
                <span className="block font-heading font-extrabold text-sm text-foreground">{label}</span>
                <span className="block text-xs font-medium text-[#475569]">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button variant="accent" size="lg" arrow disabled={busy || !file} onClick={() => void convert()} className="mt-6">
          {busy ? (progress ? `Converting page ${progress.page} of ${progress.pages}…` : 'Opening your PDF…') : 'Convert to PowerPoint'}
        </Button>
        {busy && progress && <div className="mt-4 h-2 rounded-full bg-[#e2e8f0] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.pages} aria-valuenow={progress.page}><div className="h-full bg-primary transition-all" style={{ width: `${(progress.page / progress.pages) * 100}%` }} /></div>}
        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
      </Card>

      {done && (
        <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
          <h2 className="font-heading font-extrabold text-2xl text-foreground">Your PowerPoint is ready</h2>
          <p className="mt-1 text-sm font-medium text-[#64748b]">{done.name} · {(done.size / 1024 / 1024).toFixed(1)} MB</p>
          <div className="mt-5"><Button variant="lime" size="lg" onClick={() => { const a = document.createElement('a'); a.href = done.url; a.download = done.name; a.click() }}>Download .pptx</Button></div>
          <div className="mt-8 rounded-2xl border-2 border-foreground bg-[#fffbe6] p-5">
            <h3 className="font-heading font-extrabold text-lg text-foreground">Want it to look professionally designed?</h3>
            <p className="mt-1 text-sm leading-6 font-medium text-[#475569]">A plain conversion keeps your layout. Our AI can read the document and build a clean, designed, fully editable presentation from it instead.</p>
            <Button variant="accent" size="lg" arrow disabled={opening} onClick={() => void redesign()} className="mt-4">{opening ? 'Opening the editor…' : 'Redesign it with AI'}</Button>
            <p className="mt-2 text-xs font-medium text-[#64748b]">This uploads the PDF so we can read it. Free to start.</p>
          </div>
        </Card>
      )}
    </div>
  )
}
