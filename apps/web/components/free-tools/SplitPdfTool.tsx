'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TOOL_LIMITS, mb } from '@/lib/pdf-tools'
import { Choice, ErrorLine, PdfDrop, Ready, ToolCard, plain, readBytes } from './pdf-kit'

type Mode = 'every' | 'ranges' | 'extract'
const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: 'every', label: 'Every page', hint: 'One PDF for each page.' },
  { value: 'ranges', label: 'Custom ranges', hint: 'One PDF for each range, like 1-3, 4-6.' },
  { value: 'extract', label: 'Extract pages', hint: 'The pages you pick, together in one PDF.' },
]

/** Free split PDF: every page, page ranges, or chosen pages. In the browser; nothing is uploaded. */
export function SplitPdfTool() {
  const [file, setFile] = useState<{ name: string; size: number; bytes: Uint8Array; pages: number } | null>(null)
  const [mode, setMode] = useState<Mode>('ranges')
  const [ranges, setRanges] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ blob: Blob; name: string; count: number } | null>(null)

  async function pick(files: File[]) {
    const f = files[0]!
    setError(null); setDone(null); setFile(null)
    if (f.size > TOOL_LIMITS.maxBytes) return setError(`That PDF is larger than ${mb(TOOL_LIMITS.maxBytes)}.`)
    try {
      const { loadPdf } = await import('@/lib/pdf-tools')
      const bytes = await readBytes(f)
      const doc = await loadPdf(bytes)
      if (doc.getPageCount() > TOOL_LIMITS.maxPages) return setError(`That PDF has ${doc.getPageCount()} pages. This free tool splits up to ${TOOL_LIMITS.maxPages}.`)
      setFile({ name: f.name, size: f.size, bytes, pages: doc.getPageCount() })
      // a suggestion only while the box is empty (the visitor may already be typing their own pages)
      const n = doc.getPageCount(), half = Math.ceil(n / 2)
      if (n > 1) setRanges((r) => r || (n > 2 ? `1-${half}, ${half + 1}-${n}` : '1, 2'))
    } catch (e) { setError(plain(e, 'Could not read that PDF.')) }
  }

  async function split() {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const t = await import('@/lib/pdf-tools')
      const groups = mode === 'every' ? Array.from({ length: file.pages }, (_, i) => [i + 1]) : t.parseRanges(ranges, file.pages)
      const plan = mode === 'extract' ? [groups.flat()] : groups
      const parts = await t.splitPdf(file.bytes, plan)
      const tag = (g: number[]) => (g.length === 1 ? `page-${g[0]}` : `pages-${g[0]}-${g.at(-1)}`)
      if (parts.length === 1) setDone({ blob: t.pdfBlob(parts[0]!), name: t.outName(file.name, mode === 'extract' ? 'extract' : tag(plan[0]!)), count: 1 })
      else setDone({ blob: await t.zipPdfs(parts.map((b, i) => ({ name: t.outName(file.name, tag(plan[i]!)), bytes: b }))), name: t.outName(file.name, 'split', 'zip'), count: parts.length })
    } catch (e) { setError(plain(e, 'Something went wrong while splitting. Try again.')) } finally { setBusy(false) }
  }

  return (
    <ToolCard>
      <PdfDrop onFiles={(f) => void pick(f)} title={file ? file.name : 'Drop your PDF here, or click to choose'}
        hint={file ? `${file.pages} pages · ${mb(file.size)}` : `Up to ${TOOL_LIMITS.maxPages} pages and ${mb(TOOL_LIMITS.maxBytes)} · split on your device — nothing is uploaded`} />
      <Choice name="How to split" value={mode} options={MODES} onChange={(m) => { setMode(m); setDone(null); setError(null) }} />
      {mode !== 'every' && (
        <label className="mt-4 block">
          <span className="block text-sm font-bold text-foreground">{mode === 'ranges' ? 'Ranges (each becomes its own PDF)' : 'Pages to keep'}</span>
          <input value={ranges} onChange={(e) => { setRanges(e.target.value); setDone(null) }} placeholder={mode === 'ranges' ? '1-3, 4-6, 7-' : '1, 3, 5-8'} aria-label={mode === 'ranges' ? 'Page ranges' : 'Pages to extract'}
            className="mt-1 w-full max-w-md rounded-xl border-2 border-foreground bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary" />
          <span className="mt-1 block text-xs font-medium text-[#64748b]">{file ? `Pages 1 to ${file.pages}. ` : ''}Commas separate the parts; “7-” means page 7 to the end.</span>
        </label>
      )}
      {done && file ? (
        <Ready title={done.count === 1 ? 'Your PDF is ready' : `${done.count} PDFs are ready`} detail={`${done.count === 1 ? done.name : `${done.name}: ${done.count} PDFs in one zip`} · ${mb(done.blob.size)}`} blob={done.blob} name={done.name} onAgain={() => { setFile(null); setDone(null); setRanges('') }} againLabel="Split another PDF" />
      ) : (
        <Button variant="accent" size="lg" arrow disabled={busy || !file || (mode !== 'every' && !ranges.trim())} onClick={() => void split()} className="mt-6">
          {busy ? 'Splitting…' : mode === 'every' && file ? `Split into ${file.pages} PDFs` : mode === 'extract' ? 'Extract pages' : 'Split PDF'}
        </Button>
      )}
      <ErrorLine error={error} />
    </ToolCard>
  )
}
