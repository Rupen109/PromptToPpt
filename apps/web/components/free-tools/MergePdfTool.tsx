'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, X } from '@prompttoppt/ui/icons'
import { Button } from '@/components/ui/Button'
import { TOOL_LIMITS, mb } from '@/lib/pdf-tools'
import { ErrorLine, PdfDrop, Ready, ToolCard, plain, readBytes } from './pdf-kit'

interface Item { id: string; name: string; size: number; bytes: Uint8Array; pages: number }

/** Free merge PDF: several PDFs into one, in the order the visitor sets. In the browser; nothing is uploaded. */
export function MergePdfTool() {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ blob: Blob; pages: number } | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  async function add(files: File[]) {
    setError(null); setDone(null)
    const { loadPdf } = await import('@/lib/pdf-tools')
    const next = [...items]
    for (const f of files) {
      if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { setError(`${f.name} is not a PDF.`); continue }
      if (next.length >= TOOL_LIMITS.mergeFiles) { setError(`Merge up to ${TOOL_LIMITS.mergeFiles} PDFs at a time.`); break }
      if (next.reduce((s, i) => s + i.size, 0) + f.size > TOOL_LIMITS.mergeBytes) { setError(`Together the PDFs can be up to ${mb(TOOL_LIMITS.mergeBytes)}.`); break }
      try {
        const bytes = await readBytes(f)
        const doc = await loadPdf(bytes, f.name)
        next.push({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, size: f.size, bytes, pages: doc.getPageCount() })
      } catch (e) { setError(plain(e, `Could not read ${f.name}.`)) }
    }
    setItems(next)
  }
  const move = (from: number, to: number) => { if (to < 0 || to >= items.length || from === to) return; const n = [...items]; const [it] = n.splice(from, 1); n.splice(to, 0, it!); setItems(n); setDone(null) }
  const remove = (i: number) => { setItems(items.filter((_, k) => k !== i)); setDone(null) }

  async function merge() {
    setBusy(true); setError(null)
    try {
      const { mergePdfs, pdfBlob } = await import('@/lib/pdf-tools')
      const bytes = await mergePdfs(items.map((i) => ({ name: i.name, bytes: i.bytes })))
      setDone({ blob: pdfBlob(bytes), pages: items.reduce((s, i) => s + i.pages, 0) })
    } catch (e) { setError(plain(e, 'Something went wrong while merging. Try again, or with fewer files.')) } finally { setBusy(false) }
  }

  const pages = items.reduce((s, i) => s + i.pages, 0)
  return (
    <ToolCard>
      <PdfDrop multiple label="Choose PDFs" onFiles={(f) => void add(f)} title={items.length ? 'Add more PDFs' : 'Drop your PDFs here, or click to choose'}
        hint={`Up to ${TOOL_LIMITS.mergeFiles} PDFs and ${mb(TOOL_LIMITS.mergeBytes)} together · merged on your device — nothing is uploaded`} />
      {items.length > 0 && (
        <ol className="mt-5 flex flex-col gap-2" aria-label="PDFs to merge, in order">
          {items.map((it, i) => (
            <li key={it.id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null) }}
              className="flex items-center gap-3 rounded-xl border-2 border-[#cbd5e1] bg-white px-3 py-2 cursor-grab">
              <span className="font-heading font-extrabold text-sm text-primary w-6 text-right">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block truncate font-bold text-sm text-foreground">{it.name}</span>
                <span className="block text-xs font-medium text-[#64748b]">{it.pages} {it.pages === 1 ? 'page' : 'pages'} · {mb(it.size)}</span>
              </span>
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${it.name} up`} className="rounded-lg p-1.5 hover:bg-[#f1f5f9] disabled:opacity-30"><ArrowUp aria-hidden size={16} /></button>
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label={`Move ${it.name} down`} className="rounded-lg p-1.5 hover:bg-[#f1f5f9] disabled:opacity-30"><ArrowDown aria-hidden size={16} /></button>
              <button type="button" onClick={() => remove(i)} aria-label={`Remove ${it.name}`} className="rounded-lg p-1.5 hover:bg-[#fee2e2]"><X aria-hidden size={16} /></button>
            </li>
          ))}
        </ol>
      )}
      {done ? (
        <Ready title="Your merged PDF is ready" detail={`${items.length} PDFs · ${pages} pages · ${mb(done.blob.size)}`} blob={done.blob} name={`${items[0]!.name.replace(/\.pdf$/i, '')}-merged.pdf`} onAgain={() => { setItems([]); setDone(null) }} againLabel="Merge other PDFs" />
      ) : (
        <Button variant="accent" size="lg" arrow disabled={busy || items.length < 2} onClick={() => void merge()} className="mt-6">
          {busy ? 'Merging…' : items.length < 2 ? 'Add at least two PDFs' : `Merge ${items.length} PDFs (${pages} pages)`}
        </Button>
      )}
      <ErrorLine error={error} />
    </ToolCard>
  )
}
