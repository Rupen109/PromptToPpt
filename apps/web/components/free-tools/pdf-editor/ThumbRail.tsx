'use client'

import { useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Copy, FilePlus, RotateCcw, RotateCw, Trash2 } from '@prompttoppt/ui/icons'
import { shownSize, type PageState } from '@/lib/pdf-editor/model'

export interface RailProps {
  pages: PageState[]
  currentId: string
  /** page id -> thumbnail picture (original page plus the visitor's edits, before the extra turn) */
  thumbs: Record<string, string | undefined>
  onSelect: (id: string) => void
  onRotate: (id: string, by: 90 | -90) => void
  onDelete: (id: string) => void
  onMove: (id: string, delta: -1 | 1) => void
  onMoveTo: (id: string, index: number) => void
  onDuplicate: (id: string) => void
  onAddBlank: (id: string) => void
}

function Act({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md border-2 border-transparent text-foreground hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-35 disabled:hover:bg-transparent">
      {children}
    </button>
  )
}

/** Page thumbnails with the page operations. A column on laptops, a sideways strip on phones. */
export function ThumbRail(r: RailProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  return (
    <ol aria-label="Pages" className="flex md:flex-col gap-3 overflow-auto p-3 m-0 list-none">
      {r.pages.map((p, i) => {
        const s = shownSize(p), W = 112, H = Math.round((W * s.h) / s.w)
        const t = r.thumbs[p.id]
        const on = p.id === r.currentId
        const sideways = p.turn % 180 !== 0
        return (
          <li key={p.id} className="shrink-0 list-none" draggable onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)}
            onDragOver={(e) => { if (dragId) e.preventDefault() }} onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== p.id) r.onMoveTo(dragId, i); setDragId(null) }}>
            <button type="button" onClick={() => r.onSelect(p.id)} aria-label={`Page ${i + 1} of ${r.pages.length}${p.annos.length ? `, ${p.annos.length} edits` : ''}`} aria-current={on ? 'page' : undefined}
              className={`relative block overflow-hidden rounded-md border-2 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? 'border-primary ring-2 ring-primary' : 'border-foreground'}`} style={{ width: W, height: H }}>
              {t && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t} alt="" data-thumb-edits={p.annos.length} draggable={false} style={{ position: 'absolute', left: '50%', top: '50%', width: sideways ? H : W, height: sideways ? W : H, transform: `translate(-50%, -50%) rotate(${p.turn}deg)`, maxWidth: 'none' }} />
              )}
            </button>
            <p className="mt-1 text-center text-xs font-bold text-foreground">{i + 1}</p>
            {on && (
              <div className="mt-1 grid grid-cols-4 gap-0.5 md:w-[112px]" role="group" aria-label={`Page ${i + 1} actions`}>
                <Act label="Rotate left" onClick={() => r.onRotate(p.id, -90)}><RotateCcw aria-hidden size={16} /></Act>
                <Act label="Rotate right" onClick={() => r.onRotate(p.id, 90)}><RotateCw aria-hidden size={16} /></Act>
                <Act label="Move up" disabled={i === 0} onClick={() => r.onMove(p.id, -1)}><ArrowUp aria-hidden size={16} /></Act>
                <Act label="Move down" disabled={i === r.pages.length - 1} onClick={() => r.onMove(p.id, 1)}><ArrowDown aria-hidden size={16} /></Act>
                <Act label="Duplicate page" onClick={() => r.onDuplicate(p.id)}><Copy aria-hidden size={16} /></Act>
                <Act label="Add blank page after" onClick={() => r.onAddBlank(p.id)}><FilePlus aria-hidden size={16} /></Act>
                <Act label="Delete page" disabled={r.pages.length <= 1} onClick={() => r.onDelete(p.id)}><Trash2 aria-hidden size={16} /></Act>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
