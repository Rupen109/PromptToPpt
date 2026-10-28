import { useState } from 'react'
import type { LayoutId, Presentation, SlideElement } from '@prompttoppt/validation'
import { SlideCanvas } from '@prompttoppt/ui'
import { othersOf, useLive } from '@/editor/live'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { isUnread, useComments } from '@/editor/comments'
import { useUi } from '@/editor/ui'
import { ContextMenu, type MenuItem } from './ContextMenu'

const STICKERS = ['⭐', '✅', '💡', '🚀', '⚠️', '❤️', '🎯', '📈']
const LAYOUT_LABEL: Partial<Record<LayoutId, string>> = { 'title-body': 'Title + body', 'split-image-text': 'Image + text', comparison: 'Comparison', process: 'Process', timeline: 'Timeline', quote: 'Quote', table: 'Table', 'section-divider': 'Section divider', title: 'Title', 'thank-you': 'Thank you', agenda: 'Agenda', team: 'Team', matrix: '2×2 matrix', roadmap: 'Roadmap', architecture: 'Architecture', 'case-study': 'Case study', 'big-number': 'Big number' }

/** A small speech bubble with the number of open comment threads on this slide (a red dot when some are unread). */
function Bubble({ slideId, index }: { slideId: string; index: number }) {
  const threads = useComments((c) => c.threads)
  const seenAt = useComments((c) => c.seenAt)
  const mine = threads.filter((t) => t.slideId === slideId && t.status === 'open')
  if (!mine.length) return null
  const unread = mine.some((t) => isUnread(t, seenAt))
  return <span data-testid={`comment-badge-${index}`} aria-label={`${mine.length} open comment${mine.length > 1 ? 's' : ''}${unread ? ', some unread' : ''}`} className="absolute right-1.5 bottom-9 z-10 inline-flex items-center gap-0.5 rounded-full bg-primary text-white text-[11px] font-bold px-1.5 py-0.5 shadow">💬 {mine.length}{unread && <i aria-hidden className="w-1.5 h-1.5 rounded-full bg-red-400 ml-0.5" />}</span>
}

/** Coloured dots for the people currently looking at this slide. */
function Here({ slideId }: { slideId: string }) {
  const peers = useLive((st) => st.peers)
  const me = useLive((st) => st.you?.userId)
  const here = [...new Map(othersOf(peers, me).filter((p) => p.slideId === slideId).map((p) => [p.userId, p])).values()]
  if (!here.length) return null
  return <span className="absolute left-1.5 bottom-1.5 z-10 flex gap-0.5" aria-label={`${here.map((p) => p.name).join(', ')} viewing`}>{here.slice(0, 3).map((p) => <i key={p.userId} title={`${p.name} is here`} className="w-3 h-3 rounded-full border border-white" style={{ background: p.color }} />)}</span>
}

export function SlideRail({ doc, watermark }: { doc: Presentation; watermark: boolean }) {
  const apply = useDoc((s) => s.apply)
  const { activeSlideId, setActiveSlide, toggleNotes, select } = useUi()
  const [menu, setMenu] = useState<{ x: number; y: number; slideId: string } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const indexOf = (id: string) => doc.slides.findIndex((s) => s.id === id)
  const addAfter = (idx: number, layout: LayoutId | 'blank') => {
    const slide = layout === 'blank' ? C.blankSlide(doc.theme) : C.slideFromLayout(layout, doc.theme, doc.aspectRatio)
    apply('Add slide', (d) => C.addSlideAt(d, idx + 1, slide as never))
    setActiveSlide(slide.id)
  }

  function menuItems(slideId: string): MenuItem[] {
    const i = indexOf(slideId)
    const slide = doc.slides[i]!
    return [
      { label: 'Duplicate slide', onClick: () => { let id: string | null = null; apply('Duplicate slide', (d) => { id = C.duplicateSlide(d, slideId) }); if (id) setActiveSlide(id) } },
      { label: 'Add slide below', onClick: () => addAfter(i, 'title-body') },
      { label: 'Move up', disabled: i === 0, onClick: () => apply('Move slide', (d) => C.moveSlide(d, i, i - 1)) },
      { label: 'Move down', disabled: i === doc.slides.length - 1, onClick: () => apply('Move slide', (d) => C.moveSlide(d, i, i + 1)) },
      { type: 'divider' },
      { type: 'swatches', label: 'Slide colors', options: Object.entries(doc.theme.colors).filter(([k]) => k !== 'onPrimary').map(([k, v]) => ({ value: v, css: v, title: k })), onPick: (v) => apply('Slide colour', (d) => C.setSlideBackground(d, slideId, v)) },
      { type: 'emoji', label: 'Add sticker', options: STICKERS, onPick: (emoji) => { const el: SlideElement = C.makeElement({ type: 'icon', id: crypto.randomUUID(), x: 1500, y: 120, width: 220, height: 220, name: emoji, color: 'primary' }); apply('Add sticker', (d) => C.addElement(d, slideId, el)); setActiveSlide(slideId) } },
      { label: 'Speaker notes', onClick: () => { setActiveSlide(slideId); toggleNotes(true) } },
      { label: slide.locked ? 'Unlock slide' : 'Lock slide', onClick: () => apply('Lock slide', (d) => C.setSlideLocked(d, slideId, !slide.locked)) },
      { type: 'divider' },
      { label: 'Delete slide', danger: true, disabled: doc.slides.length <= 1, onClick: () => { apply('Delete slide', (d) => C.deleteSlide(d, slideId)); if (activeSlideId === slideId) setActiveSlide(doc.slides[Math.max(0, i - 1)]?.id ?? null); select([]) } },
    ]
  }

  return (
    <nav aria-label="Slides" className="max-md:order-last md:w-[208px] shrink-0 bg-white border-t md:border-t-0 md:border-r border-border p-2 md:p-3 max-md:flex max-md:gap-2 max-md:overflow-x-auto md:overflow-y-auto md:space-y-2.5 relative">
      <div className="relative max-md:shrink-0 max-md:w-24">
        <button onClick={() => setAddOpen((v) => !v)} aria-haspopup="menu" aria-expanded={addOpen} className="w-full max-md:h-full border border-border rounded-lg py-2 text-sm font-semibold hover:bg-slate-50">+ New slide</button>
        {addOpen && (
          <div role="menu" className="absolute z-30 left-0 right-0 max-md:right-auto max-md:w-60 max-md:bottom-full max-md:mb-1 md:mt-1 bg-white border border-border rounded-xl shadow-xl p-1.5 text-sm max-h-80 overflow-y-auto">
            <button role="menuitem" className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-100" onClick={() => { addAfter(doc.slides.length - 1, 'blank'); setAddOpen(false) }}>Blank slide</button>
            <div className="px-2.5 pt-2 pb-1 text-[11px] font-bold text-slate-500">FROM A LAYOUT</div>
            {C.INSERTABLE_LAYOUTS.map((l) => <button key={l} role="menuitem" className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100" onClick={() => { addAfter(doc.slides.length - 1, l); setAddOpen(false) }}>{LAYOUT_LABEL[l] ?? l}</button>)}
          </div>
        )}
      </div>
      {doc.slides.map((s, i) => (
        <div key={s.id} className="relative max-md:shrink-0 max-md:w-32" onDragOver={(e) => { if (dragFrom === null) return; e.preventDefault(); setDropAt(i) }} onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) apply('Reorder slides', (d) => C.moveSlide(d, dragFrom, i)); setDragFrom(null); setDropAt(null) }}>
          {dropAt === i && dragFrom !== null && dragFrom !== i && <div aria-hidden className={`absolute left-0 right-0 h-1 bg-primary rounded z-10 ${dragFrom < i ? '-bottom-1.5' : '-top-1.5'}`} />}
          <button
            draggable
            onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move' }}
            onDragEnd={() => { setDragFrom(null); setDropAt(null) }}
            onClick={() => setActiveSlide(s.id)}
            onContextMenu={(e) => { e.preventDefault(); setActiveSlide(s.id); setMenu({ x: e.clientX, y: e.clientY, slideId: s.id }) }}
            aria-label={`Slide ${i + 1}`}
            aria-current={s.id === activeSlideId}
            data-testid={`thumb-${i}`}
            className={`relative block w-full rounded-md p-0.5 ${s.id === activeSlideId ? 'ring-2 ring-primary' : 'ring-1 ring-border hover:ring-slate-400'} ${dragFrom === i ? 'opacity-40' : ''}`}
          >
            <span className="absolute left-1.5 top-1.5 z-10 text-[11px] font-bold bg-black/60 text-white rounded px-1.5">{i + 1}</span>
            <Here slideId={s.id} />
            <Bubble slideId={s.id} index={i} />
            {s.locked && <span aria-label="Locked" className="absolute right-1.5 top-1.5 z-10 text-[11px]">🔒</span>}
            <SlideCanvas slide={s} theme={doc.theme} aspect={doc.aspectRatio} width={172} watermark={watermark} />
          </button>
          <button aria-label={`Slide ${i + 1} options`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setActiveSlide(s.id); setMenu({ x: r.right + 4, y: r.top, slideId: s.id }) }} className="absolute right-1 bottom-1 z-10 w-6 h-6 rounded bg-white/90 border border-border text-xs hover:bg-white">⋯</button>
        </div>
      ))}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.slideId)} onClose={() => setMenu(null)} />}
    </nav>
  )
}
