import { ChevronDown, MoreHorizontal } from '@prompttoppt/ui/icons'
import { Lock, MessageSquare } from '@prompttoppt/ui/icons'
import { useEffect, useMemo, useState } from 'react'
import type { Slide, Theme } from '@prompttoppt/validation'
import { api } from '@/lib/api'
import type { LayoutId, Presentation, SlideElement } from '@prompttoppt/validation'
import { SlideCanvas } from '@prompttoppt/ui'
import { PLACEHOLDER_KINDS, PLACEHOLDER_LABEL, type PlaceholderKind } from '@prompttoppt/theme'
import { othersOf, useLive } from '@/editor/live'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { isUnread, useComments } from '@/editor/comments'
import { useUi } from '@/editor/ui'
import { ContextMenu, type MenuItem } from './ContextMenu'

/** the designed layouts the PowerPoint set already covers (they would only be listed twice) */
const PLACEHOLDER_ALREADY = new Set<LayoutId>(['title', 'section-divider', 'comparison'])
const STICKERS = ['⭐', '✅', '💡', '🚀', '⚠️', '❤️', '🎯', '📈']
const LAYOUT_LABEL: Partial<Record<LayoutId, string>> = { 'title-body': 'Designed bullets', 'split-image-text': 'Image + text', comparison: 'Comparison', process: 'Process', timeline: 'Timeline', quote: 'Quote', table: 'Table', 'section-divider': 'Section divider', title: 'Title', 'thank-you': 'Thank you', agenda: 'Agenda', team: 'Team', matrix: '2×2 matrix', roadmap: 'Roadmap', architecture: 'Architecture', 'case-study': 'Case study', 'big-number': 'Big number' }

/** A small speech bubble with the number of open comment threads on this slide (a red dot when some are unread). */
function Bubble({ slideId, index }: { slideId: string; index: number }) {
  const threads = useComments((c) => c.threads)
  const seenAt = useComments((c) => c.seenAt)
  const mine = threads.filter((t) => t.slideId === slideId && t.status === 'open')
  if (!mine.length) return null
  const unread = mine.some((t) => isUnread(t, seenAt))
  return <span data-testid={`comment-badge-${index}`} aria-label={`${mine.length} open comment${mine.length > 1 ? 's' : ''}${unread ? ', some unread' : ''}`} className="absolute right-1.5 bottom-9 z-10 inline-flex items-center gap-0.5 rounded-full bg-primary text-white text-[11px] font-bold px-1.5 py-0.5 shadow"><MessageSquare aria-hidden size={11} /> {mine.length}{unread && <i aria-hidden className="w-1.5 h-1.5 rounded-full bg-red-400 ml-0.5" />}</span>
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
  /** the layout gallery opened from a slide's menu: change THAT slide's layout (fixed at the place of the menu, so it stays in view when the rail is scrolled) */
  const [changeFor, setChangeFor] = useState<{ slideId: string; x: number; y: number } | null>(null)
  /** where the gallery of "New slide" opens: beside the rail (the rail scrolls and clips, so the gallery is fixed on the page) */
  const [addAt, setAddAt] = useState<{ x: number; y: number } | null>(null)
  const galleryOpen = addOpen || !!changeFor
  const closeGallery = () => { setAddOpen(false); setChangeFor(null) }
  useEffect(() => {
    if (!galleryOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAddOpen(false); setChangeFor(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [galleryOpen])
  /** what each PowerPoint layout looks like, with sample words (the slide you get has empty boxes instead); worked out only while the gallery is open */
  const previews = useMemo(() => (galleryOpen ? Object.fromEntries(PLACEHOLDER_KINDS.map((k) => [k, C.previewSlide(k, doc.theme, doc.aspectRatio)])) as Record<PlaceholderKind, Slide> : null), [galleryOpen, doc.theme, doc.aspectRatio])
  /** the deck's uploaded design ("Use a file's design"): its layouts with placeholder words, fetched when the menu opens. null = not loaded, 'gone' = the design was deleted (the section is hidden; the deck works as before). */
  const [own, setOwn] = useState<{ theme: Theme; aspect: string; layouts: { index: number; name: string; layoutName: string; slide: Slide }[] } | 'gone' | null>(null)
  useEffect(() => {
    if (!addOpen || !doc.templateId || own) return
    let live = true
    api.fileTemplateLayouts(doc.templateId).then((r) => live && setOwn(r)).catch(() => live && setOwn('gone'))
    return () => { live = false }
  }, [addOpen, doc.templateId, own])
  const addOwn = (layout: Slide) => {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const slide: Slide = { ...layout, id, elements: layout.elements.map((e) => ({ ...e, id: `${id}:${e.id.split(':').pop()}` })) }
    apply('Add slide from your template', (d) => C.addSlideAt(d, doc.slides.length, slide as never))
    setActiveSlide(id)
  }
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const indexOf = (id: string) => doc.slides.findIndex((s) => s.id === id)
  const addAfter = (idx: number, layout: LayoutId | PlaceholderKind | 'blank') => {
    const slide = layout === 'blank' ? C.blankSlide(doc.theme) : (PLACEHOLDER_KINDS as readonly string[]).includes(layout) ? C.newSlide(layout as PlaceholderKind, doc.theme, doc.aspectRatio) : C.slideFromLayout(layout as LayoutId, doc.theme, doc.aspectRatio)
    apply('Add slide', (d) => C.addSlideAt(d, idx + 1, slide as never))
    setActiveSlide(slide.id)
  }
  /** a new slide goes in right after the slide you are on, like PowerPoint (at the end when none is selected) */
  const here = Math.max(0, indexOf(activeSlideId ?? '') < 0 ? doc.slides.length - 1 : indexOf(activeSlideId ?? ''))
  const pick = (kind: PlaceholderKind) => {
    if (changeFor) { const id = changeFor.slideId; apply('Change layout', (d) => C.changeLayout(d, id, kind)); setActiveSlide(id) } else addAfter(here, kind)
    closeGallery()
  }

  function menuItems(slideId: string): MenuItem[] {
    const i = indexOf(slideId)
    const slide = doc.slides[i]!
    return [
      { label: 'Duplicate slide', onClick: () => { let id: string | null = null; apply('Duplicate slide', (d) => { id = C.duplicateSlide(d, slideId) }); if (id) setActiveSlide(id) } },
      { label: 'Add slide below', onClick: () => addAfter(i, 'content') },
      ...(C.canChangeLayout(slide as Slide) ? [{ label: 'Layout…', onClick: () => { const m = menu; setChangeFor({ slideId, x: m?.x ?? 240, y: m?.y ?? 120 }) } }] : []),
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
      <div className="relative max-md:shrink-0 max-md:w-36">
        <div className="flex">
          <button onClick={() => { closeGallery(); addAfter(here, 'content') }} className="flex-1 border border-border rounded-l-lg py-2 text-sm font-semibold hover:bg-slate-50">+ New slide</button>
          <button onClick={(e) => { if (galleryOpen) { closeGallery(); return } const r = e.currentTarget.closest('nav')!.getBoundingClientRect(); const wide = window.innerWidth >= 768; setAddAt({ x: wide ? r.right + 8 : r.left + 8, y: wide ? e.currentTarget.getBoundingClientRect().top : r.top }); setAddOpen(true) }} aria-label="Choose a layout" aria-haspopup="menu" aria-expanded={galleryOpen} className="px-2 border border-l-0 border-border rounded-r-lg hover:bg-slate-50 grid place-items-center"><ChevronDown aria-hidden size={16} /></button>
        </div>
        {galleryOpen && <div aria-hidden className="fixed inset-0 z-20" onClick={closeGallery} />}
        {galleryOpen && previews && (
          <div role="menu" aria-label={changeFor ? 'Change layout' : 'New slide layout'} style={{ left: Math.max(8, Math.min((changeFor ?? addAt)?.x ?? 8, window.innerWidth - 296)), top: Math.max(8, Math.min((changeFor ?? addAt)?.y ?? 8, window.innerHeight - 460)) }} className="fixed z-30 w-72 bg-white border border-border rounded-xl shadow-xl p-2 text-sm max-h-[85vh] overflow-y-auto">
            <div className="px-1 pb-1.5 text-[11px] font-bold text-slate-500">{changeFor ? 'CHANGE LAYOUT' : 'NEW SLIDE'}</div>
            <div className="grid grid-cols-2 gap-2">
              {PLACEHOLDER_KINDS.map((k) => (
                <button key={k} role="menuitem" aria-label={PLACEHOLDER_LABEL[k]} data-testid={`layout-${k}`} onClick={() => pick(k)} className="text-left rounded-lg p-1 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="block rounded ring-1 ring-border overflow-hidden"><SlideCanvas slide={previews[k]} theme={doc.theme} aspect={doc.aspectRatio} width={120} /></span>
                  <span className="block text-xs mt-1 text-slate-700">{PLACEHOLDER_LABEL[k]}</span>
                </button>
              ))}
            </div>
            {!changeFor && (
              <>
                <button role="menuitem" className="w-full text-left mt-1.5 px-2.5 py-2 rounded-lg hover:bg-slate-100" onClick={() => { addAfter(here, 'blank'); closeGallery() }}>Blank slide</button>
                {own && own !== 'gone' && own.aspect === doc.aspectRatio && own.layouts.length > 0 && (
                  <div data-testid="from-your-template">
                    <div className="px-2.5 pt-2 pb-1 text-[11px] font-bold text-slate-500">FROM YOUR TEMPLATE</div>
                    <div className="grid grid-cols-2 gap-1.5 px-1 pb-1">
                      {own.layouts.map((l) => (
                        <button key={l.index} role="menuitem" title={`${l.layoutName} (slide ${l.index + 1} of your template)`} aria-label={`Insert layout ${l.index + 1} from your template`} data-testid={`own-layout-${l.index}`} onClick={() => { addOwn(l.slide); closeGallery() }} className="rounded-md ring-1 ring-border hover:ring-primary overflow-hidden p-0.5 text-left">
                          <SlideCanvas slide={l.slide} theme={own.theme} aspect={doc.aspectRatio} width={88} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="px-2.5 pt-2 pb-1 text-[11px] font-bold text-slate-500">MORE LAYOUTS</div>
                {C.INSERTABLE_LAYOUTS.filter((l) => !PLACEHOLDER_ALREADY.has(l)).map((l) => <button key={l} role="menuitem" className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-100" onClick={() => { addAfter(here, l); closeGallery() }}>{LAYOUT_LABEL[l] ?? l}</button>)}
              </>
            )}
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
            {s.locked && <span aria-label="Locked" className="absolute right-1.5 top-1.5 z-10 text-[11px] inline-flex"><Lock aria-hidden size={12} /></span>}
            <SlideCanvas slide={s} theme={doc.theme} aspect={doc.aspectRatio} width={172} watermark={watermark} />
          </button>
          <button aria-label={`Slide ${i + 1} options`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setActiveSlide(s.id); setMenu({ x: r.right + 4, y: r.top, slideId: s.id }) }} className="absolute right-1 bottom-1 z-10 w-6 h-6 rounded bg-white/90 border border-border text-xs hover:bg-white grid place-items-center"><MoreHorizontal aria-hidden size={14} /></button>
        </div>
      ))}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.slideId)} onClose={() => setMenu(null)} />}
    </nav>
  )
}
