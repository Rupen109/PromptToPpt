'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { api } from '@/lib/api'
import { openInEditor, toolError } from '@/lib/free-tools'
import { PPT_MAX_BYTES, PPT_MAX_PAGES, PdfConvertError } from '@/lib/pdf-limits'
import { OCR_LANGUAGES, defaultOcrLanguage } from '@/lib/pdf-editor/ocr-info'
import { SOURCE_MAX_BYTES } from '@prompttoppt/validation'

const MODES: { ocr: boolean; label: string; hint: string }[] = [
  { ocr: false, label: 'No OCR', hint: 'Convert PDFs with selectable text into editable PowerPoint files.' },
  { ocr: true, label: 'OCR', hint: 'Convert scanned PDFs with non-selectable text into editable PowerPoint files.' },
]

/**
 * Free PDF → PPT: every page becomes a slide that looks like the page, with its text as editable text boxes (No OCR: the PDF's own text; OCR: also the text
 * of pages that are only pictures). One card from start to finish: the download button appears in the same place as the convert button.
 * The conversion runs in the browser; the PDF is only uploaded if the visitor chooses "Redesign it with AI".
 */
export function PdfToPptTool() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [ocr, setOcr] = useState(false)
  const [lang, setLang] = useState(() => (typeof document === 'undefined' ? 'eng' : defaultOcrLanguage(document.documentElement.lang)))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ page: number; pages: number; reading?: boolean } | null>(null)
  const [done, setDone] = useState<{ url: string; name: string; size: number; pages: number; pictures: number; read: number; partial: number } | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setDone((d) => { if (d) URL.revokeObjectURL(d.url); return null }); setError(null) }
  function pick(f: File | undefined) {
    reset()
    if (!f) return setFile(null)
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return setError('Please choose a PDF file.')
    setFile(f)
  }
  async function convert(withOcr = ocr) {
    if (!file) return setError('Choose a PDF first.')
    reset(); setBusy(true); setProgress(null)
    try {
      const { convertPdf } = await import('@/lib/pdf-to-pptx')
      const r = await convertPdf(file, { ocr: withOcr, ocrLanguage: lang }, setProgress)
      setDone({ url: URL.createObjectURL(r.blob), name: `${file.name.replace(/\.pdf$/i, '')}.pptx`, size: r.blob.size, pages: r.pages, pictures: r.pictures, read: r.read, partial: r.partial })
    } catch (e) {
      setError(e instanceof PdfConvertError ? e.message : 'Something went wrong while converting. Try a different PDF.')
    } finally { setBusy(false) }
  }
  function download() {
    if (!done) return
    const a = document.createElement('a'); a.href = done.url; a.download = done.name; a.click()
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
          <span className="mt-1 block text-sm font-medium text-[#64748b]">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `Up to ${PPT_MAX_PAGES} pages and ${PPT_MAX_BYTES / 1024 / 1024} MB · converted on your device — your file is not uploaded`}</span>
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose a PDF" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />

        <fieldset className="mt-5" disabled={busy}>
          <legend className="sr-only">How to read the text</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {MODES.map((m) => (
              <label key={m.label} className={`flex cursor-pointer gap-3 rounded-xl border-2 px-4 py-3 ${ocr === m.ocr ? 'border-foreground bg-[#f8f9fc]' : 'border-[#cbd5e1] bg-white hover:border-foreground'}`}>
                <input type="radio" name="ocr" checked={ocr === m.ocr} onChange={() => { setOcr(m.ocr); reset() }} className="mt-1 h-4 w-4 shrink-0 accent-[#0f172a]" />
                <span>
                  <span className="block font-heading font-extrabold text-base text-foreground">{m.label}</span>
                  <span className="block text-sm font-medium text-[#475569]">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {ocr && (
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
              Language of the text
              <select value={lang} onChange={(e) => { setLang(e.target.value); reset() }} className="rounded-lg border-2 border-foreground bg-white px-2 py-1 text-sm font-medium">
                {OCR_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
              <span className="font-medium text-[#64748b]">OCR reads each page on your device, so it takes a few seconds a page.</span>
            </label>
          )}
        </fieldset>

        {done ? (
          <div className="mt-6" role="status">
            <p className="font-heading font-extrabold text-lg text-foreground">Your PowerPoint is ready</p>
            <p className="mt-1 text-sm font-medium text-[#64748b]">{done.name} · {(done.size / 1024 / 1024).toFixed(1)} MB{done.pictures < done.pages ? ' · the text is editable' : ''}</p>
            {done.pictures > 0 && (
              // pages that are only pictures: said plainly, with the way to make their text editable
              <p className="mt-2 text-sm font-bold text-[#92400e]">{done.pictures === 1 ? '1 page has' : `${done.pictures} pages have`} no selectable text, so {done.pictures === 1 ? 'it was' : 'they were'} kept as {done.pictures === 1 ? 'a picture' : 'pictures'}. <button type="button" onClick={() => { setOcr(true); void convert(true) }} className="underline text-primary">Convert again with OCR</button> to make that text editable.</p>
            )}
            {done.partial > 0 && <p className="mt-2 text-sm font-medium text-[#475569]">OCR ran out of time on {done.partial === 1 ? '1 page' : `${done.partial} pages`}, so some of their text may still be part of the picture.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="lime" size="lg" onClick={download}>Download .pptx</Button>
              <Button variant="white" size="lg" onClick={() => { pick(undefined); if (input.current) { input.current.value = ''; input.current.click() } }}>Convert another PDF</Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="accent" size="lg" arrow disabled={busy || !file} onClick={() => void convert()} className="mt-6">
              {busy ? (progress ? `${progress.reading ? 'Reading' : 'Converting'} page ${progress.page} of ${progress.pages}…` : 'Opening your PDF…') : 'Convert to PowerPoint'}
            </Button>
            {busy && progress && <div className="mt-4 h-2 rounded-full bg-[#e2e8f0] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.pages} aria-valuenow={progress.page}><div className="h-full bg-primary transition-all" style={{ width: `${(progress.page / progress.pages) * 100}%` }} /></div>}
          </>
        )}
        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}

        {done && (
          // the optional next step, in the same card: an AI-designed deck from the same document
          <div className="mt-6 border-t-2 border-dashed border-[#cbd5e1] pt-5">
            <p className="font-heading font-extrabold text-base text-foreground">Want it professionally designed?</p>
            <p className="mt-1 text-sm leading-6 font-medium text-[#475569]">Our AI can read the document and build a clean, designed, fully editable presentation from it.</p>
            {file && file.size > SOURCE_MAX_BYTES.pdf
              // the AI reads PDFs up to the server's limit: say so here instead of a button that would be refused after the upload
              ? <p className="mt-3 text-sm font-bold text-[#475569]">AI redesign reads PDFs up to {SOURCE_MAX_BYTES.pdf / 1024 / 1024} MB, and this one is {(file.size / 1024 / 1024).toFixed(1)} MB. To redesign it, use a smaller PDF, such as the chapters that matter most.</p>
              : <>
                <Button variant="accent" size="md" arrow disabled={opening} onClick={() => void redesign()} className="mt-3">{opening ? 'Opening the editor…' : 'Redesign it with AI'}</Button>
                <p className="mt-2 text-xs font-medium text-[#64748b]">This uploads the PDF so we can read it. Free to start.</p>
              </>}
          </div>
        )}
      </Card>
    </div>
  )
}
