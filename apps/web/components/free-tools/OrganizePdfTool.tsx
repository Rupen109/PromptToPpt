'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCcw, RotateCw, Trash2 } from '@prompttoppt/ui/icons'
import { Button } from '@/components/ui/Button'
import { TOOL_LIMITS, mb } from '@/lib/pdf-tools'
import { ErrorLine, PdfDrop, Ready, ToolCard, plain, readBytes } from './pdf-kit'

interface Card { key: string; src: number; turn: number }
const THUMB_W = 150

/** Free organize PDF: reorder, rotate and delete pages, seeing a thumbnail of each. In the browser; nothing is uploaded. */
export function OrganizePdfTool() {
  const [file, setFile] = useState<{ name: string; size: number; bytes: Uint8Array; pages: number } | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Blob | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const gen = useRef(0)

  async function pick(files: File[]) {
    const f = files[0]!
    setError(null); setDone(null); setFile(null); setCards([]); setThumbs({})
    if (f.size > TOOL_LIMITS.maxBytes) return setError(`That PDF is larger than ${mb(TOOL_LIMITS.maxBytes)}.`)
    try {
      const { loadPdf } = await import('@/lib/pdf-tools')
      const bytes = await readBytes(f)
      const n = (await loadPdf(bytes)).getPageCount()
      if (n > TOOL_LIMITS.organizePages) return setError(`That PDF has ${n} pages. This free tool organizes up to ${TOOL_LIMITS.organizePages}; use Split PDF to work on a part.`)
      setFile({ name: f.name, size: f.size, bytes, pages: n })
      setCards(Array.from({ length: n }, (_, i) => ({ key: `p${i}`, src: i, turn: 0 })))
    } catch (e) { setError(plain(e, 'Could not read that PDF.')) }
  }

  // thumbnails, a few at a time after the grid shows (a long PDF opens at once and fills in)
  useEffect(() => {
    if (!file) return
    const run = ++gen.current
    void (async () => {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      const pdf = await pdfjs.getDocument({ data: file.bytes.slice() }).promise
      try {
        for (let i = 1; i <= pdf.numPages && run === gen.current; i++) {
          const page = await pdf.getPage(i)
          const v1 = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (THUMB_W * 2) / v1.width })
          const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
          const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
          const url = canvas.toDataURL('image/jpeg', 0.7); canvas.width = 0; page.cleanup()
          if (run === gen.current) setThumbs((t) => ({ ...t, [i - 1]: url }))
          if (i % 20 === 0) await pdf.cleanup()
        }
      } finally { void pdf.loadingTask.destroy() }
    })()
    return () => { gen.current++ }
  }, [file])

  const edit = (next: Card[]) => { setCards(next); setDone(null) }
  const move = (from: number, to: number) => { if (to < 0 || to >= cards.length || from === to) return; const n = [...cards]; const [c] = n.splice(from, 1); n.splice(to, 0, c!); edit(n) }
  const turn = (i: number, by: number) => edit(cards.map((c, k) => (k === i ? { ...c, turn: (c.turn + by + 360) % 360 } : c)))
  const remove = (i: number) => edit(cards.filter((_, k) => k !== i))
  const changed = !!file && (cards.length !== file.pages || cards.some((c, i) => c.src !== i || c.turn))

  async function save() {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const { organizePdf, pdfBlob } = await import('@/lib/pdf-tools')
      setDone(pdfBlob(await organizePdf(file.bytes, cards.map((c) => ({ src: c.src, turn: c.turn })))))
    } catch (e) { setError(plain(e, 'Something went wrong while saving. Try again.')) } finally { setBusy(false) }
  }
  const reset = () => { if (file) edit(Array.from({ length: file.pages }, (_, i) => ({ key: `p${i}`, src: i, turn: 0 }))) }
  const btn = 'rounded-lg p-1.5 hover:bg-[#f1f5f9] disabled:opacity-30'

  return (
    <ToolCard>
      <PdfDrop onFiles={(f) => void pick(f)} title={file ? file.name : 'Drop your PDF here, or click to choose'}
        hint={file ? `${cards.length} pages · ${mb(file.size)} · drag a page to move it` : `Up to ${TOOL_LIMITS.organizePages} pages and ${mb(TOOL_LIMITS.maxBytes)} · organized on your device — nothing is uploaded`} />
      {cards.length > 0 && (
        <>
          <ol className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Pages, in their new order">
            {cards.map((c, i) => (
              <li key={c.key} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null) }}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 bg-[#f8f9fc] p-2 cursor-grab ${drag === i ? 'border-primary' : 'border-[#cbd5e1]'}`} data-testid="page-card">
                <div className="flex h-[170px] w-full items-center justify-center overflow-hidden">
                  {thumbs[c.src]
                    ? <img src={thumbs[c.src]} alt={`Page ${c.src + 1}`} style={{ maxWidth: THUMB_W, maxHeight: 160, transform: `rotate(${c.turn}deg)`, transition: 'transform 0.2s' }} className="border border-[#cbd5e1] bg-white shadow-sm" />
                    : <span className="text-xs font-medium text-[#94a3b8]">Page {c.src + 1}…</span>}
                </div>
                <span className="text-xs font-bold text-foreground">{i + 1}{c.src !== i ? <span className="font-medium text-[#64748b]"> (was {c.src + 1})</span> : null}</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" className={btn} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move page ${i + 1} earlier`}><ArrowLeft aria-hidden size={15} /></button>
                  <button type="button" className={btn} onClick={() => turn(i, -90)} aria-label={`Rotate page ${i + 1} left`}><RotateCcw aria-hidden size={15} /></button>
                  <button type="button" className={btn} onClick={() => turn(i, 90)} aria-label={`Rotate page ${i + 1} right`}><RotateCw aria-hidden size={15} /></button>
                  <button type="button" className={`${btn} hover:bg-[#fee2e2]`} onClick={() => remove(i)} disabled={cards.length === 1} aria-label={`Delete page ${i + 1}`}><Trash2 aria-hidden size={15} /></button>
                  <button type="button" className={btn} onClick={() => move(i, i + 1)} disabled={i === cards.length - 1} aria-label={`Move page ${i + 1} later`}><ArrowRight aria-hidden size={15} /></button>
                </div>
              </li>
            ))}
          </ol>
          {!done && <button type="button" onClick={reset} className="mt-3 text-sm font-bold text-primary underline">Start again from the original order</button>}
        </>
      )}
      {done && file ? (
        <Ready title="Your organized PDF is ready" detail={`${cards.length} pages · ${mb(done.size)}`} blob={done} name={file.name.replace(/\.pdf$/i, '') + '-organized.pdf'} onAgain={() => { setFile(null); setCards([]); setDone(null) }} againLabel="Organize another PDF" />
      ) : (
        <Button variant="accent" size="lg" arrow disabled={busy || !file || !changed} onClick={() => void save()} className="mt-6">
          {busy ? 'Saving…' : !file ? 'Organize PDF' : changed ? 'Save the new PDF' : 'Move, rotate or delete a page first'}
        </Button>
      )}
      <ErrorLine error={error} />
    </ToolCard>
  )
}
