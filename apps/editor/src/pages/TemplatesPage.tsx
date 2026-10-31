import { ArrowLeft, ArrowRight, Lock, Play } from '@prompttoppt/ui/icons'
import { X } from '@prompttoppt/ui/icons'
import { Portal } from '@/components/Portal'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import { CATEGORIES, DESIGNS, designById, templateSlides, type CategoryId, type TemplateDesign } from '@prompttoppt/theme'
import type { AspectRatio, Slide } from '@prompttoppt/validation'
import { FitSlide } from '@prompttoppt/ui'
import { Sidebar } from '@/components/Sidebar'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { WEB_URL } from '@/lib/env'
import { useDialog } from '@/lib/useDialog'

const slidesOf = (d: TemplateDesign, aspect: AspectRatio): Slide[] => {
  let n = 0
  return templateSlides(d.id, aspect, () => `${d.id}-e${n++}`, `${WEB_URL}/template-assets`)!.slides.map((s, i) => ({ id: `${d.id}-${i}`, locked: false, validation: { status: 'passed', issues: [] }, ...s }))
}

/** Three content slides with different layouts; the starting point rotates with the design's position so cards in one category show different slides. */
function sampleStrip(slides: Slide[], index: number): Slide[] {
  const body = slides.slice(1, -1)
  const out: Slide[] = []
  const seen = new Set<string>()
  for (let k = 0; k < body.length && out.length < 3; k++) {
    const sl = body[(index * 2 + k) % body.length]!
    if (seen.has(sl.layoutId)) continue
    seen.add(sl.layoutId)
    out.push(sl)
  }
  return out
}

/** Renders only once scrolled near the viewport, so 120 designs (and their fonts) don't all load at once. */
function LazyThumb({ design }: { design: TemplateDesign }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setSeen(true), io.disconnect()), { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  const slides = useMemo(() => (seen ? slidesOf(design, '16:9') : null), [seen, design])
  // the title slide, plus three content slides underneath so the card shows how the design treats headings, cards and diagrams
  const strip = slides ? sampleStrip(slides, design.index) : []
  return (
    <div ref={ref} className="bg-slate-100">
      <div className="aspect-video overflow-hidden">{slides && <FitSlide slide={slides[0]!} theme={design.theme} aspect="16:9" />}</div>
      <div className="grid grid-cols-3 gap-1 p-1">
        {strip.map((s) => <div key={s.id} className="aspect-video overflow-hidden rounded-sm"><FitSlide slide={s} theme={design.theme} aspect="16:9" /></div>)}
      </div>
    </div>
  )
}

function PreviewDialog({ design, locked, onClose }: { design: TemplateDesign; locked: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { upgrade, refresh } = useEntitlements()
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const [aspect, setAspect] = useState<AspectRatio>('16:9')
  const [i, setI] = useState(0)
  const [play, setPlay] = useState(0)
  const [title, setTitle] = useState(design.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slides = useMemo(() => slidesOf(design, aspect), [design, aspect])
  const motion = design.theme.motion

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(slides.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [slides.length])

  async function use() {
    if (locked) return upgrade.show(`"${design.name}" is a Pro template.`)
    setBusy(true)
    setError(null)
    try {
      const { id } = await api.createPresentation({ templateId: design.id, title: title.trim() || design.name, aspectRatio: aspect })
      void refresh()
      navigate(`/edit/${id}?new=1`) // the editor opens with "tell me what to put in your slides"
    } catch (e) {
      if (isGateError(e) && e.code === 'UPGRADE_REQUIRED') upgrade.show(e.message)
      else setError(e instanceof ApiError ? e.message : 'Could not create the presentation.')
      setBusy(false)
    }
  }

  return (
    <Portal><div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${design.name} template`} className="bg-white rounded-2xl w-full max-w-5xl max-h-[94vh] overflow-y-auto shadow-xl outline-none">
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <h2 className="font-heading font-bold text-2xl flex items-center gap-2">{design.name} {locked && <span className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">PRO</span>}</h2>
            <p className="text-slate-600 text-sm">{design.tagline} · {CATEGORIES.find((c) => c.id === design.category)?.name}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-600 hover:text-slate-800 text-2xl leading-none"><X aria-hidden size={24} /></button>
        </div>
        <div className="px-5">
          <div className="rounded-xl overflow-hidden border border-border bg-slate-100 max-w-[880px] mx-auto">
            <FitSlide key={`${i}-${play}-${aspect}`} slide={slides[i]!} theme={design.theme} aspect={aspect} play={play > 0} />
          </div>
          <div className="flex items-center justify-center gap-3 mt-3 text-sm">
            <button onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Previous slide" className="border border-border rounded-lg px-3 py-1 disabled:opacity-40"><ArrowLeft aria-hidden size={16} /></button>
            <span className="tabular-nums text-slate-600">{i + 1} / {slides.length}</span>
            <button onClick={() => setI((x) => Math.min(slides.length - 1, x + 1))} disabled={i === slides.length - 1} aria-label="Next slide" className="border border-border rounded-lg px-3 py-1 disabled:opacity-40"><ArrowRight aria-hidden size={16} /></button>
            <button onClick={() => setPlay((p) => p + 1)} className="border border-border rounded-lg px-3 py-1 text-primary font-semibold inline-flex items-center gap-1.5"><Play aria-hidden size={14} fill="currentColor" />Play animation</button>
          </div>
          <div className="flex gap-2 overflow-x-auto py-3" role="tablist" aria-label="Slides in this template">
            {slides.map((s, k) => (
              <button key={s.id + k} role="tab" aria-selected={k === i} aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className={`shrink-0 w-32 rounded-md overflow-hidden border-2 ${k === i ? 'border-primary' : 'border-transparent'}`}>
                <FitSlide slide={s} theme={design.theme} aspect={aspect} />
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5 pt-1 grid md:grid-cols-[1fr_auto] gap-4 items-end border-t border-border mt-1">
          <div className="grid sm:grid-cols-2 gap-3 pt-4">
            <label className="text-sm font-medium">Presentation title
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="mt-1 w-full border border-border rounded-lg px-3 py-2 font-normal" />
            </label>
            <div className="text-sm font-medium">Shape
              <div className="mt-1 flex gap-1.5" role="group" aria-label="Aspect ratio">
                {(['16:9', '4:3', '1:1'] as const).map((a) => <button key={a} aria-pressed={aspect === a} onClick={() => setAspect(a)} className={`px-3 py-2 rounded-lg border text-sm ${aspect === a ? 'bg-primary text-white border-primary' : 'border-border'}`}>{a}</button>)}
              </div>
            </div>
            <p className="sm:col-span-2 text-xs text-slate-600">Starts with a ready-made {slides.length}-slide {CATEGORIES.find((c) => c.id === design.category)?.name.toLowerCase()} story in this design{motion && motion.entrance !== 'none' ? `, animated (${motion.entrance.replace('-', ' ')} entrances, ${motion.transition} transitions)` : ''}. The text and numbers are samples — edit them, or ask the AI assistant to rewrite the whole deck for your topic.</p>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button onClick={() => void use()} disabled={busy} className="bg-primary text-white rounded-lg px-6 py-3 font-semibold disabled:opacity-50">{busy ? 'Creating…' : locked ? 'Upgrade to use this template' : 'Use this template'}</button>
          </div>
        </div>
      </div>
    </div></Portal>
  )
}

/** All 120 designs, by category. Starter gets the first 3 designs of every category; the rest need Pro (enforced when the deck is created). */
export function TemplatesPage() {
  const { ent } = useEntitlements()
  const [params, setParams] = useSearchParams()
  const cat = (CATEGORIES.some((c) => c.id === params.get('category')) ? params.get('category') : 'all') as CategoryId | 'all'
  const [q, setQ] = useState('')
  // /templates?open=<id> (from a website template page) lands with that template's preview already open
  const [open, setOpen] = useState<TemplateDesign | null>(() => designById(params.get('open') ?? '') ?? null)
  const premiumOk = ent?.features.premiumTemplates ?? false
  const shown = useMemo(() => DESIGNS.filter((d) => (cat === 'all' || d.category === cat) && (`${d.name} ${d.tagline}`.toLowerCase().includes(q.trim().toLowerCase()))), [cat, q])
  const current = CATEGORIES.find((c) => c.id === cat)

  return (
    <div className="flex min-h-screen pt-14 lg:pt-0 bg-[#f6f7fb]">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-[1300px]">
        <h1 className="font-heading font-bold text-2xl sm:text-3xl">Templates</h1>
        <p className="text-slate-600 mt-1 mb-6">{DESIGNS.length} professionally designed, animated templates. {premiumOk ? 'Your plan includes all of them.' : 'Starter includes 3 per category; Pro unlocks them all.'}</p>
        <div className="flex gap-2 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto sm:overflow-visible sm:flex-wrap pb-1 sm:pb-0 [scrollbar-width:none]" role="tablist" aria-label="Template categories">
          {[{ id: 'all', name: 'All' }, ...CATEGORIES].map((c) => (
            <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => setParams(c.id === 'all' ? {} : { category: c.id })} className={`text-sm rounded-full px-4 py-2 sm:py-1.5 border whitespace-nowrap shrink-0 ${cat === c.id ? 'bg-foreground text-white border-foreground' : 'bg-white border-border hover:border-slate-400'}`}>{c.name}</button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <p className="text-sm text-slate-600">{current ? current.blurb : 'Pick a category, or search by name or mood.'} <span className="text-slate-600">· {shown.length} shown</span></p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" aria-label="Search templates" className="border border-border rounded-lg px-3 py-2.5 sm:py-2 text-sm bg-white w-full sm:w-64" />
        </div>
        {shown.length === 0 ? <p className="py-20 text-center text-slate-600">No templates match “{q}”.</p> : (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {shown.map((d) => {
              const locked = d.premium && !premiumOk
              return (
                <li key={d.id}>
                  <button onClick={() => setOpen(d)} className="group block w-full text-left bg-white border border-border rounded-xl overflow-hidden hover:shadow-lg transition" aria-label={`${d.name} — ${d.tagline}${locked ? ' (Pro)' : ''}`}>
                    <div className="relative">
                      <LazyThumb design={d} />
                      {locked && <span className="absolute top-2 right-2 text-[11px] font-bold bg-white/95 text-primary rounded-full px-2 py-0.5 shadow inline-flex items-center gap-1"><Lock aria-hidden size={11} />PRO</span>}
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/25 grid place-items-center text-white font-semibold opacity-0 group-hover:opacity-100 transition">Preview</span>
                    </div>
                    <div className="p-4">
                      <div className="font-semibold">{d.name}</div>
                      <div className="text-sm text-slate-600">{d.tagline}</div>
                      {cat === 'all' && <div className="text-xs text-slate-600 mt-1">{CATEGORIES.find((c) => c.id === d.category)?.name}</div>}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
      {open && <PreviewDialog design={open} locked={open.premium && !premiumOk} onClose={() => setOpen(null)} />}
    </div>
  )
}
