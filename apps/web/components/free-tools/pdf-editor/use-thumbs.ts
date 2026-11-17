'use client'

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Anno, PageState } from '@/lib/pdf-editor/model'
import { renderThumb } from '@/lib/pdf-editor/render'
import { THUMB_W, composeThumb } from '@/lib/pdf-editor/thumbs'

const DEBOUNCE_MS = 250
const NO_BASES: Record<number, string> = {}

/**
 * Thumbnails for the page rail, by page id. The original pages are drawn once (small JPEGs); a page with edits gets a composed thumbnail (its picture plus
 * its items), made after the visitor stops changing that page for a moment, one page at a time, and only for the page that changed (an item list is
 * replaced only on the page it belongs to, so a reference comparison finds the changed pages). A result for items that changed meanwhile is dropped.
 * Memory: one small JPEG blob per page (about 10 to 20 KB), revoked when replaced or when the page or file goes away.
 */
export function useThumbs(pdf: PDFDocumentProxy | null, pages: PageState[]): Record<string, string | undefined> {
  const [store, setStore] = useState<{ pdf: PDFDocumentProxy | null; map: Record<number, string> }>({ pdf: null, map: {} })
  const bases = store.pdf === pdf ? store.map : NO_BASES
  const [composed, setComposed] = useState<Record<string, string>>({})
  const made = useRef(new Map<string, { annos: Anno[]; url: string }>())
  const latest = useRef<PageState[]>(pages)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const running = useRef(false)
  const basesRef = useRef(bases)
  useEffect(() => { latest.current = pages; basesRef.current = bases })

  // the original pages, one after the other
  useEffect(() => {
    if (!pdf) return
    let dead = false
    const urls: string[] = []
    void (async () => {
      for (let i = 0; i < pdf.numPages && !dead; i++) {
        try {
          const t = await renderThumb(pdf, i, THUMB_W)
          if (dead) { URL.revokeObjectURL(t.url); return }
          urls.push(t.url); setStore((cur) => ({ pdf, map: { ...(cur.pdf === pdf ? cur.map : {}), [i]: t.url } }))
        } catch { /* a missing thumbnail is not worth an error */ }
      }
    })()
    return () => { dead = true; urls.forEach((u) => URL.revokeObjectURL(u)) }
  }, [pdf])

  // pages that need a new composed thumbnail
  const pending = (): PageState[] => latest.current.filter((p) => {
    const m = made.current.get(p.id)
    if (p.src !== null && basesRef.current[p.src] === undefined) return false // its picture is not ready yet
    return p.annos.length > 0 ? m?.annos !== p.annos : p.src === null && !m
  })
  const pump = () => {
    if (running.current) return
    const next = pending()[0]
    if (!next) return
    running.current = true
    const base = next.src === null ? null : basesRef.current[next.src] ?? null
    void composeThumb(next, base).then((url) => {
      const cur = latest.current.find((p) => p.id === next.id)
      if (!cur || cur.annos !== next.annos) { URL.revokeObjectURL(url); return } // changed while drawing: the newer one is queued
      const old = made.current.get(next.id)
      if (old) URL.revokeObjectURL(old.url)
      made.current.set(next.id, { annos: next.annos, url })
      setComposed((c) => ({ ...c, [next.id]: url }))
    }).catch(() => { made.current.set(next.id, { annos: next.annos, url: '' }) }).finally(() => { running.current = false; if (pending().length) pump() })
  }
  useEffect(() => {
    if (!pdf) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(pump, DEBOUNCE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pages, bases])

  // pages that were deleted, and everything when the file changes
  useEffect(() => {
    const ids = new Set(pages.map((p) => p.id))
    let drop = false
    for (const [id, m] of made.current) if (!ids.has(id)) { if (m.url) URL.revokeObjectURL(m.url); made.current.delete(id); drop = true }
    // a page whose edits were all removed (undo) goes back to its plain picture
    for (const p of pages) { const m = made.current.get(p.id); if (m && p.annos.length === 0 && p.src !== null) { if (m.url) URL.revokeObjectURL(m.url); made.current.delete(p.id); drop = true } }
    if (drop) setComposed((c) => Object.fromEntries(Object.entries(c).filter(([id]) => made.current.has(id))))
  }, [pages])
  useEffect(() => {
    const store = made.current
    return () => { for (const m of store.values()) if (m.url) URL.revokeObjectURL(m.url); store.clear() }
  }, [pdf])

  const out: Record<string, string | undefined> = {}
  for (const p of pages) out[p.id] = p.annos.length > 0 || p.src === null ? composed[p.id] ?? (p.src !== null ? bases[p.src] : undefined) : bases[p.src!] // a page without edits shows its plain picture at once (undo)
  return out
}
