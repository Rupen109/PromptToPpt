import { useEffect, useRef, useState } from 'react'
import { CATEGORIES, DESIGNS, PALETTES, PALETTE_GROUPS, SUPPORTED_FONTS, THEMES, PREMIUM_THEME_IDS, composeSlide, designById, isDark, isHex, makeColors, type TemplateDesign } from '@prompttoppt/theme'
import type { Presentation, Slide, Theme } from '@prompttoppt/validation'
import { SlideCanvas } from '@prompttoppt/ui'
import * as C from '@/editor/commands'
import { useEntitlements } from '@/lib/entitlements'
import { useDoc } from '@/editor/store'
import { BrandTab } from './BrandTab'

type Tab = 'templates' | 'designs' | 'colors' | 'fonts' | 'brand'

/** Right-hand Style drawer (reference screenshot 2): workspace themes, alternative slide designs, colours, typography. Brand tab = a company's colours, fonts and logo from its website. */
export function StyleDrawer({ doc, slide, onClose }: { doc: Presentation; slide: Slide; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('templates')
  const apply = useDoc((s) => s.apply)

  const alternatives = C.compatibleLayouts(slide.content).filter((l) => l !== slide.layoutId)

  return (
    <aside aria-label="Style" className="w-[340px] max-lg:fixed max-lg:z-40 max-lg:right-0 max-lg:top-14 max-lg:bottom-0 max-lg:shadow-2xl max-md:left-0 max-md:top-auto max-md:h-[60vh] max-md:rounded-t-2xl max-md:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold">Style</h2>
        <button onClick={onClose} aria-label="Close style panel" className="text-xl leading-none text-slate-500 hover:text-slate-800">×</button>
      </div>
      <div role="tablist" className="flex flex-wrap gap-1 px-3 pt-3">
        {([['templates', 'Templates'], ['designs', 'Layouts'], ['colors', 'Colors'], ['fonts', 'Fonts'], ['brand', 'Brand']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-sm ${tab === k ? 'bg-foreground text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{l}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === 'templates' && <TemplatesTab doc={doc} />}
        {tab === 'brand' && <BrandTab doc={doc} slideId={slide.id} />}
        {tab === 'designs' && (
          alternatives.length === 0 ? (
            <p className="text-sm text-slate-500">No alternative designs for this slide{slide.manual ? '. Hand-edited slides keep their layout.' : '.'}</p>
          ) : (
            <>
              <div className="text-xs font-semibold text-slate-500">Alternative designs for this slide</div>
              {alternatives.map((l) => {
                const converted = C.convertContent(slide.content!, l)
                if (!converted) return null
                const preview: Slide = { id: 'preview', locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide(converted, doc.theme, doc.aspectRatio, ((n) => () => `p${n++}`)(0)) }
                return (
                  <button key={l} onClick={() => apply('Change design', (d) => C.relayout(d, slide.id, l))} className="block w-full rounded-xl border border-border hover:border-primary p-1.5" aria-label={`Use ${l} design`}>
                    <SlideCanvas slide={preview} theme={doc.theme} aspect={doc.aspectRatio} width={290} />
                    <div className="text-sm text-left mt-1.5 px-1 capitalize">{l.replace(/-/g, ' ')}</div>
                  </button>
                )
              })}
              {slide.manual && <p className="text-xs text-amber-700">Choosing a design replaces your manual edits on this slide (you can undo).</p>}
            </>
          )
        )}
        {tab === 'colors' && (
          <>
            <div className="text-xs font-semibold text-slate-500">Deck mode</div>
            <div role="group" aria-label="Deck mode" className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg text-sm font-semibold">
              {(['dark', 'light'] as const).map((m) => {
                const on = isDark(doc.theme.colors.background) === (m === 'dark')
                return <button key={m} aria-pressed={on} onClick={() => !on && apply('Deck mode', (d) => C.setThemeMode(d, m))} className={`py-1.5 rounded-md capitalize ${on ? 'bg-white shadow-sm' : 'text-slate-500'}`}>{m === 'dark' ? '🌙 Dark' : '☀️ Light'}</button>
              })}
            </div>
            <p className="text-xs text-slate-500">Switches every slide and keeps your brand colours, fonts and content.</p>
            <div className="text-xs font-semibold text-slate-500">Slide background</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(doc.theme.colors).filter(([k]) => k !== 'onPrimary').map(([k, v]) => (
                <button key={k} title={k} aria-label={`Background ${k}`} aria-pressed={slide.background?.value.toLowerCase() === v.toLowerCase()} onClick={() => apply('Slide colour', (d) => C.setSlideBackground(d, slide.id, v))} className="w-9 h-9 rounded-full border border-slate-300" style={{ background: v, outline: slide.background?.value.toLowerCase() === v.toLowerCase() ? '2px solid #2563eb' : undefined, outlineOffset: 2 }} />
              ))}
            </div>
            <label className="block text-sm mt-2">Custom colour
              <input type="color" aria-label="Custom background colour" value={/^#[0-9a-f]{6}$/i.test(slide.background?.value ?? '') ? slide.background!.value : '#ffffff'} onChange={(e) => apply('Slide colour', (d) => C.setSlideBackground(d, slide.id, e.target.value), { mergeKey: `bg:${slide.id}` })} className="block mt-1 w-full h-10 rounded-lg border border-border" />
            </label>
            <p className="text-xs text-slate-500">Text colour adjusts per element from the toolbar. Contrast is checked when you save.</p>
          </>
        )}
        {tab === 'fonts' && (
          <>
            {(['heading', 'body'] as const).map((k) => (
              <label key={k} className="block text-sm capitalize">{k} font
                <select aria-label={`${k} font`} value={doc.theme.fonts[k]} onChange={(e) => apply('Change font', (d) => C.setFonts(d, { ...doc.theme.fonts, [k]: e.target.value }))} className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-white">
                  {SUPPORTED_FONTS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
            ))}
            <p className="text-xs text-slate-500">Only fonts that export reliably to PowerPoint are offered. Plus Jakarta Sans and Inter are web fonts and will be substituted on export.</p>
          </>
        )}
      </div>
    </aside>
  )
}


/** Renders its children only once scrolled near the viewport: 122 live slide previews must not all mount at once. */
function Lazy({ height, children }: { height: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setSeen(true), io.disconnect()), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [seen])
  return <div ref={ref} style={{ minHeight: seen ? undefined : height }}>{seen ? children : null}</div>
}

/** A palette as four chips: brand, accent, a lighter sibling and the slide ground it produces in the deck's current mode. */
function Swatch({ primary, accent, dark }: { primary: string; accent: string; dark: boolean }) {
  const c = makeColors({ primary, accent, mode: dark ? 'dark' : 'light', bg: 'white' })
  return <span aria-hidden className="inline-flex h-4 w-20 rounded overflow-hidden border border-black/10 shrink-0">{[c.primary, c.accent, c.secondary, c.background].map((x, i) => <span key={i} className="flex-1" style={{ background: x }} />)}</span>
}

/**
 * Templates: every catalogue design, rendered with THIS deck's own title slide so the choice shows the user's content in each look;
 * a colour-palette picker (any palette on any design) sits above the list, like the reference style panel.
 */
function TemplatesTab({ doc }: { doc: Presentation }) {
  const apply = useDoc((s) => s.apply)
  const { ent, upgrade } = useEntitlements()
  const premiumOk = ent?.features.premiumTemplates ?? false
  const [cat, setCat] = useState<string>('for-you')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const dark = isDark(doc.theme.colors.background)
  const currentDesign = doc.theme.templateId ? designById(doc.theme.templateId) : undefined
  const home = currentDesign?.category
  const first = doc.slides[0]
  const title = first?.content && (first.content.layout === 'title') ? first.content : null
  const photo = first ? C.slidePhoto(first) : undefined

  const list = (() => {
    const byCat = (id: string) => DESIGNS.filter((d) => d.category === id)
    if (cat === 'all') return CATEGORIES.map((c) => ({ id: c.id, name: c.name, designs: byCat(c.id) }))
    if (cat === 'for-you') {
      const rest = CATEGORIES.filter((c) => c.id !== home)
      return [...(home ? [{ id: home, name: 'For you', designs: byCat(home) }] : []), ...rest.map((c) => ({ id: c.id, name: c.name, designs: byCat(c.id) }))]
    }
    const c = CATEGORIES.find((x) => x.id === cat)
    return c ? [{ id: c.id, name: c.name, designs: byCat(c.id) }] : []
  })()

  const choose = (d: TemplateDesign) => {
    if (d.premium && !premiumOk) return upgrade.show(`The "${d.name}" template is available on the Pro plan.`)
    apply('Change template', (x) => C.applyDesign(x, d.id))
  }
  const preview = (d: TemplateDesign) => {
    const content = title ?? { layout: 'title' as const, title: doc.title, subtitle: '', speakerNotes: '', sources: [] }
    let n = 0
    return { id: 'preview', locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(content, d.theme, doc.aspectRatio, () => `t${n++}`, { photo }) }
  }
  const palette = (p: { primary: string; accent: string }) => apply('Change colors', (x) => C.applyPalette(x, p))
  const isCurrent = (p: { primary: string; accent: string }) => { const c = makeColors({ primary: p.primary, accent: p.accent, mode: dark ? 'dark' : 'light', bg: 'white' }); return c.primary === doc.theme.colors.primary && c.accent === doc.theme.colors.accent }
  const [custom, setCustom] = useState({ primary: doc.theme.colors.primary, accent: doc.theme.colors.accent })

  return (
    <>
      <div className="relative">
        <button type="button" aria-haspopup="listbox" aria-expanded={paletteOpen} onClick={() => setPaletteOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 rounded-xl border-2 border-foreground px-3 py-2 text-left">
          <span className="min-w-0"><span className="block text-[11px] font-semibold text-slate-500">Color palette</span><span className="block text-sm font-semibold truncate">{PALETTES.find((p) => isCurrent(p))?.name ?? (currentDesign && doc.theme.colors.primary === currentDesign.theme.colors.primary && doc.theme.colors.accent === currentDesign.theme.colors.accent ? `Original (${currentDesign.name})` : 'Custom')}</span></span>
          <span className="flex items-center gap-2"><Swatch primary={doc.theme.colors.primary} accent={doc.theme.colors.accent} dark={dark} /><span aria-hidden className={paletteOpen ? 'rotate-180' : ''}>⌄</span></span>
        </button>
        {paletteOpen && (
          <div role="listbox" aria-label="Color palettes" className="absolute z-20 left-0 right-0 mt-1 max-h-[55vh] overflow-y-auto bg-white border border-border rounded-xl shadow-xl p-1.5">
            {currentDesign && (
              <button role="option" aria-selected={doc.theme.colors.primary === currentDesign.theme.colors.primary && doc.theme.colors.accent === currentDesign.theme.colors.accent} onClick={() => { apply('Change colors', (x) => C.applyThemeObject(x, { ...(x.theme as typeof doc.theme), colors: currentDesign.theme.colors })); setPaletteOpen(false) }} className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg hover:bg-slate-100 text-sm">
                <span>Original ({currentDesign.name})</span><Swatch primary={currentDesign.theme.colors.primary} accent={currentDesign.theme.colors.accent} dark={isDark(currentDesign.theme.colors.background)} />
              </button>
            )}
            {PALETTE_GROUPS.map((g) => (
              <div key={g}>
                <div className="px-2.5 pt-2 pb-1 text-[11px] font-semibold text-slate-500">{g}</div>
                {PALETTES.filter((p) => p.group === g).map((p) => (
                  <button key={p.id} role="option" aria-selected={isCurrent(p)} onClick={() => { palette(p); setPaletteOpen(false) }} className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg hover:bg-slate-100 text-sm ${isCurrent(p) ? 'bg-slate-100 font-semibold' : ''}`}>
                    <span>{p.name}</span><Swatch primary={p.primary} accent={p.accent} dark={dark} />
                  </button>
                ))}
              </div>
            ))}
            <div className="mt-2 border-t border-border p-2.5">
              <div className="text-[11px] font-semibold text-slate-500 mb-2">Your own colors</div>
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5">Brand <input type="color" aria-label="Custom brand colour" value={custom.primary} onChange={(e) => setCustom((c) => ({ ...c, primary: e.target.value }))} className="w-8 h-8 rounded border border-border" /></label>
                <label className="flex items-center gap-1.5">Accent <input type="color" aria-label="Custom accent colour" value={custom.accent} onChange={(e) => setCustom((c) => ({ ...c, accent: e.target.value }))} className="w-8 h-8 rounded border border-border" /></label>
                <button type="button" disabled={!isHex(custom.primary) || !isHex(custom.accent)} onClick={() => { palette(custom); setPaletteOpen(false) }} className="ml-auto px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">Apply</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <label className="block text-xs font-semibold text-slate-500">Show
        <select aria-label="Template category" value={cat} onChange={(e) => setCat(e.target.value)} className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-white text-sm font-normal text-slate-800">
          <option value="for-you">{home ? 'For you first' : 'All categories'}</option>
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      {list.map((g) => (
        <section key={g.id} aria-label={g.name} className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 pt-1">{g.name === 'For you' ? `For you · ${CATEGORIES.find((c) => c.id === g.id)?.name}` : g.name}</div>
          {g.designs.map((d) => {
            const locked = d.premium && !premiumOk
            const on = doc.theme.templateId === d.id
            return (
              <button key={d.id} type="button" aria-pressed={on} aria-label={`${d.name} template${locked ? ' (Pro)' : ''}`} onClick={() => choose(d)} className={`relative block w-full text-left rounded-xl border p-1.5 transition ${on ? 'border-2 border-foreground' : 'border-border hover:border-primary'}`}>
                <Lazy height={176}><SlideCanvas slide={preview(d)} theme={d.theme} aspect={doc.aspectRatio} width={290} /></Lazy>
                <div className="flex items-center justify-between mt-1.5 px-1 text-sm"><span className="font-medium">{d.name}</span>{locked && <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">🔒 PRO</span>}{on && <span className="text-[10px] font-bold text-slate-600">Current</span>}</div>
              </button>
            )
          })}
        </section>
      ))}

      <section aria-label="Classic themes" className="space-y-3">
        <div className="text-xs font-semibold text-slate-500 pt-2">Classic themes</div>
        {THEMES.map((t: Theme) => {
          const premium = PREMIUM_THEME_IDS.includes(t.id)
          const current = doc.theme.id === t.id
          return (
            <button key={t.id} type="button" aria-pressed={current} onClick={() => (premium && !premiumOk ? upgrade.show(`The "${t.name}" theme is available on the Pro plan.`) : apply('Change theme', (d) => C.applyTheme(d, t.id)))} className={`w-full text-left rounded-xl border p-1.5 ${current ? 'border-2 border-foreground' : 'border-border hover:border-primary'}`}>
              <Lazy height={176}><SlideCanvas slide={preview({ theme: t } as TemplateDesign)} theme={t} aspect={doc.aspectRatio} width={290} /></Lazy>
              <div className="flex items-center justify-between mt-1.5 px-1 text-sm"><span className="font-medium">{t.name}</span>{premium && !premiumOk && <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">🔒 PRO</span>}</div>
            </button>
          )
        })}
      </section>
    </>
  )
}
