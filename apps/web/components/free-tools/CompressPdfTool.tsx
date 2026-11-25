'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TOOL_LIMITS, mb, type CompressLevel } from '@/lib/pdf-tools'
import { Choice, ErrorLine, PdfDrop, Ready, ToolCard, plain, readBytes } from './pdf-kit'

const LEVEL_OPTIONS: { value: CompressLevel; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Best quality, a smaller file. Photos keep their detail.' },
  { value: 'recommended', label: 'Recommended', hint: 'Good quality, a much smaller file. Right for email and sharing.' },
  { value: 'strong', label: 'Strong', hint: 'The smallest file. Photos get softer; text stays sharp.' },
]

/** Free compress PDF: photos re-saved at a sensible size and quality, text and drawings untouched. In the browser; nothing is uploaded. */
export function CompressPdfTool() {
  const [file, setFile] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(null)
  const [level, setLevel] = useState<CompressLevel>('recommended')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ blob: Blob; before: number; after: number; changed: number } | null>(null)

  async function pick(files: File[]) {
    const f = files[0]!
    setError(null); setDone(null); setFile(null)
    if (f.size > TOOL_LIMITS.maxBytes) return setError(`That PDF is larger than ${mb(TOOL_LIMITS.maxBytes)}.`)
    try {
      const { loadPdf } = await import('@/lib/pdf-tools')
      const bytes = await readBytes(f)
      await loadPdf(bytes)
      setFile({ name: f.name, size: f.size, bytes })
    } catch (e) { setError(plain(e, 'Could not read that PDF.')) }
  }

  async function compress() {
    if (!file) return
    setBusy(true); setError(null); setProgress(null)
    try {
      const { compressPdf, browserCodec, pdfBlob } = await import('@/lib/pdf-tools')
      const r = await compressPdf(file.bytes, level, browserCodec(), (done, total) => setProgress({ done, total }))
      setDone({ blob: pdfBlob(r.bytes), before: r.before, after: r.after, changed: r.changed })
    } catch (e) { setError(plain(e, 'Something went wrong while compressing. Try again.')) } finally { setBusy(false) }
  }

  const saved = done ? Math.round((1 - done.after / done.before) * 100) : 0
  return (
    <ToolCard>
      <PdfDrop onFiles={(f) => void pick(f)} title={file ? file.name : 'Drop your PDF here, or click to choose'}
        hint={file ? mb(file.size) : `Up to ${mb(TOOL_LIMITS.maxBytes)} · compressed on your device — nothing is uploaded`} />
      <Choice name="How much to compress" value={level} options={LEVEL_OPTIONS} onChange={(l) => { setLevel(l); setDone(null) }} />
      {done && file ? (
        done.after < done.before
          ? <Ready title={`${saved}% smaller`} detail={`${mb(done.before)} → ${mb(done.after)}${done.changed ? ` · ${done.changed} ${done.changed === 1 ? 'photo' : 'photos'} made smaller` : ''}`} blob={done.blob} name={file.name.replace(/\.pdf$/i, '') + '-compressed.pdf'} onAgain={() => { setFile(null); setDone(null) }} againLabel="Compress another PDF" />
          : (
            <div className="mt-6" role="status">
              <p className="font-heading font-extrabold text-lg text-foreground">This PDF is already compact</p>
              <p className="mt-1 text-sm font-medium text-[#64748b]">It has no photos large enough to make smaller{level !== 'strong' ? '. Try Strong for the smallest file.' : ', so your original is as small as it gets without losing quality.'}</p>
            </div>
          )
      ) : (
        <>
          <Button variant="accent" size="lg" arrow disabled={busy || !file} onClick={() => void compress()} className="mt-6">
            {busy ? (progress && progress.total ? `Compressing photo ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Reading your PDF…') : 'Compress PDF'}
          </Button>
          {busy && progress && progress.total > 0 && <div className="mt-4 h-2 rounded-full bg-[#e2e8f0] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
        </>
      )}
      <ErrorLine error={error} />
    </ToolCard>
  )
}
