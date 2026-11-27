import { useEffect, useRef, useState } from 'react'
import { QUICK_EDITS, type QuickEditId } from '@prompttoppt/validation'
import { AlignLeft, Contrast, Eraser, Image as ImageIcon, ImagePlus, Lock, MessageSquareQuote, Megaphone, PenLine, Rows2, Scissors, Smile, SpellCheck, Sparkles, StickyNote, Type, Wand2, Zap, type LucideIcon } from '@prompttoppt/ui/icons'
import type { ModelOption } from '@prompttoppt/api-client'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useUi } from '@/editor/ui'
import { Portal } from '@/components/Portal'

const ICON: Record<QuickEditId, LucideIcon> = {
  improve: Sparkles, expand: AlignLeft, shorten: Scissors, simplify: Type, tone_professional: MessageSquareQuote, tone_friendly: Smile, tone_persuasive: Megaphone,
  rewrite: PenLine, grammar: SpellCheck, notes: StickyNote, redesign: Wand2, split: Rows2, readability: Contrast, photo: ImageIcon, ai_image: ImagePlus, remove_pictures: Eraser,
}
const GROUPS = ['Writing', 'Design', 'Pictures'] as const

/**
 * The toolbar's "Quick edits": one-click AI actions on the slide on screen. Each shows what it costs on this person's plan (one AI edit; a split writes two
 * slides). Clicking one opens the AI panel, which sends it (the chat shows the request, the answer, the undo and the credits). The server runs a fixed task
 * for each, so nothing is guessed from words. Starter has no AI edits: it is offered the upgrade instead.
 */
export function QuickEditsButton({ className, locked }: { className: string; locked: boolean }) {
  // where the menu opens: above the button, centred on it (drawn in a portal: the toolbar scrolls sideways and would cut it off)
  const [open, setOpen] = useState<{ x: number; bottom: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('pointerdown', away); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={!!open} onClick={(e) => { if (open) return setOpen(null); const r = e.currentTarget.getBoundingClientRect(); setOpen({ x: r.left + r.width / 2, bottom: window.innerHeight - r.top + 10 }) }}><Zap aria-hidden size={16} /><span className="max-sm:sr-only">Quick edits</span></button>
      {open && <Portal><div ref={menu} className="fixed z-50" style={{ left: Math.min(Math.max(155, open.x), window.innerWidth - 155), bottom: open.bottom, transform: 'translateX(-50%)' }}><QuickMenu locked={locked} onDone={() => setOpen(null)} /></div></Portal>}
    </div>
  )
}

function QuickMenu({ locked, onDone }: { locked: boolean; onDone: () => void }) {
  const { ent, upgrade } = useEntitlements()
  const [price, setPrice] = useState<{ edit: number; slide: number; image: number } | null>(null)
  // the plan's own prices (the model the plan writes with; Premium's picked model can cost more: the chat shows the exact charge)
  useEffect(() => {
    let off = false
    void Promise.all([api.models(), api.models('image')]).then(([t, im]) => {
      if (off) return
      const m: ModelOption | undefined = t.models.find((x) => x.id === t.default) ?? t.models.find((x) => x.allowed)
      const img = im.models.find((x) => x.id === im.default)
      if (m) setPrice({ edit: m.creditsPerEdit, slide: m.creditsPerWrittenSlide ?? m.creditsPerEdit, image: img?.creditsPerImage ?? 0 })
    }).catch(() => {})
    return () => { off = true }
  }, [])
  const shown = QUICK_EDITS
  const run = (id: QuickEditId) => {
    onDone()
    if (!ent?.features.aiEdits) { upgrade.show('Quick edits use AI, which is part of the Pro plan and above.'); return }
    useUi.setState((s) => ({ drawer: 'ai', quickEdit: { id, n: (s.quickEdit?.n ?? 0) + 1 + Math.random() } }))
  }
  const cost = (slides: number) => (price ? price.edit + (slides - 1) * price.slide : null)
  return (
    <div role="menu" aria-label="Quick edits for this slide" className="w-[290px] max-w-[calc(100vw-16px)] rounded-2xl border border-border bg-white shadow-2xl">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">This slide</p>
        {price && <p className="text-[11px] text-slate-500" data-testid="quick-price">{price.edit} credits each</p>}
      </div>
      {locked && <p className="mx-4 mb-1 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800"><Lock aria-hidden size={12} />This slide is locked. Unlock it to use AI.</p>}
      <div className="max-h-[52vh] overflow-y-auto px-1.5 pb-1">
        {GROUPS.map((g) => {
          const items = shown.filter((x) => x.group === g)
          if (!items.length) return null
          return (
            <div key={g} className="py-1 border-b border-slate-100 last:border-0">
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g}</p>
              {items.map((x) => {
                const Icon = ICON[x.id]
                const extra = x.slides > 1 ? cost(x.slides) : null
                return (
                  <button key={x.id} type="button" role="menuitem" disabled={locked} onClick={() => run(x.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent">
                    <Icon aria-hidden size={16} className="shrink-0 text-primary" />
                    <span className="flex-1">{x.label}</span>
                    {extra !== null && <span className="text-[11px] text-slate-400 tabular-nums">{extra} credits</span>}
                    {x.id === 'ai_image' && price && price.image > 0 && <span className="text-[11px] text-slate-400">+{price.image} if kept</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
        <p className="px-2.5 py-2 text-[11px] text-slate-500">Anything else: describe it in <button type="button" onClick={() => { onDone(); useUi.setState({ drawer: 'ai' }) }} className="underline hover:text-slate-700">Edit with AI</button>.</p>
      </div>
    </div>
  )
}
