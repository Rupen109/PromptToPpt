'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { MAX_PAGES, PdfConvertError, QUALITIES, jpgName, type JpgPage, type JpgQuality } from '@/lib/pdf-to-jpg'

const save = (url: string, name: string) => { const a = document.createElement('a'); a.href = url; a.download = name; a.click() }

/** Free PDF → JPG. Everything happens in the browser; the PDF is never uploaded. */
export function PdfToJpgTool() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState<JpgQuality>('high')
  const [pagesText, setPagesText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [pages, setPages] = useState<JpgPage[]>([])
  const [total, setTotal] = useState(0)
  const [zipping, setZipping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setPages((p) => { p.forEach((x) => URL.revokeObjectURL(x.url)); return [] }); setError(null) }
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
      const m = await import('@/lib/pdf-to-jpg')
      const count = await m.pdfPageCount(file)
      setTotal(count)
      setPages(await m.convertPdfToJpg(file, quality, pagesText, (done, t) => setProgress({ done, total: t })))
    } catch (e) {
      console.error('pdf-to-jpg failed', e)
      setError(e instanceof PdfConvertError ? e.message : `Something went wrong while converting. Try a different PDF. (${e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 160) : 'unknown error'})`)
    } finally { setBusy(false) }
  }
  async function downloadZip() {
    if (!file) return
    setZipping(true)
    try {
      const { zipPages } = await import('@/lib/pdf-to-jpg')
      const blob = await zipPages(file, pages, total)
      const url = URL.createObjectURL(blob)
      save(url, `${file.name.replace(/\.pdf$/i, '')}-jpg.zip`)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch { setError('Could not make the zip file. Download the pictures one by one instead.') } finally { setZipping(false) }
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
          <legend className="text-xs font-heading font-extrabold uppercase text-foreground">Picture quality</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(Object.keys(QUALITIES) as JpgQuality[]).map((v) => (
              <label key={v} className={`cursor-pointer rounded-xl border-2 border-foreground px-4 py-3 ${quality === v ? 'bg-secondary' : 'bg-white hover:bg-[#f8f9fc]'}`}>
                <input type="radio" name="quality" value={v} checked={quality === v} onChange={() => { setQuality(v); reset() }} className="sr-only" />
                <span className="block font-heading font-extrabold text-sm text-foreground">{QUALITIES[v].label}</span>
                <span className="block text-xs font-medium text-[#475569]">{QUALITIES[v].hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-5 block">
          <span className="text-xs font-heading font-extrabold uppercase text-foreground">Pages (optional)</span>
          <input value={pagesText} onChange={(e) => { setPagesText(e.target.value); reset() }} placeholder="All pages — or type 1-3, 7" aria-label="Pages to convert"
            className="mt-2 w-full rounded-xl border-2 border-foreground bg-white px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary" />
        </label>
        <Button variant="accent" size="lg" arrow disabled={busy || !file} onClick={() => void convert()} className="mt-6">
          {busy ? (progress ? `Converting page ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Opening your PDF…') : 'Convert to JPG'}
        </Button>
        {busy && progress && <div className="mt-4 h-2 rounded-full bg-[#e2e8f0] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
      </Card>

      {pages.length > 0 && file && (
        <Card tone="white" radius="3xl" shadow="md" border hover={false} className="p-5 md:p-7" wrapperClassName="h-auto">
          <h2 className="font-heading font-extrabold text-2xl text-foreground">Your {pages.length === 1 ? 'picture is' : `${pages.length} pictures are`} ready</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {pages.length > 1 && <Button variant="lime" size="lg" disabled={zipping} onClick={() => void downloadZip()}>{zipping ? 'Making zip…' : 'Download all (.zip)'}</Button>}
            {pages.length === 1 && <Button variant="lime" size="lg" onClick={() => save(pages[0]!.url, jpgName(file, pages[0]!.page, total))}>Download JPG</Button>}
          </div>
          <ul className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
            {pages.map((p) => (
              <li key={p.page} className="list-none rounded-xl border-2 border-foreground bg-white p-2 flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Page ${p.page}`} className="w-full h-auto rounded-md bg-[#f8f9fc]" />
                <div className="flex items-center justify-between gap-2 text-xs font-bold text-foreground">
                  <span>Page {p.page} · {Math.max(1, Math.round(p.blob.size / 1024))} KB</span>
                  <button type="button" onClick={() => save(p.url, jpgName(file, p.page, total))} className="underline hover:text-primary" aria-label={`Download page ${p.page}`}>Download</button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
