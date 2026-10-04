import { useState } from 'react'
import { SUPPORTED_FONTS, THEMES, PREMIUM_THEME_IDS, composeSlide, isDark } from '@prompttoppt/theme'
import type { Presentation, Slide, Theme } from '@prompttoppt/validation'
import { SlideCanvas } from '@prompttoppt/ui'
import * as C from '@/editor/commands'
import { useEntitlements } from '@/lib/entitlements'
import { useDoc } from '@/editor/store'

type Tab = 'themes' | 'designs' | 'colors' | 'fonts'

/** Right-hand Style drawer (reference screenshot 2): workspace themes, alternative slide designs, colours, typography. Brand kit = Gold, later. */
export function StyleDrawer({ doc, slide, onClose }: { doc: Presentation; slide: Slide; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('themes')
  const apply = useDoc((s) => s.apply)
  const { ent, upgrade } = useEntitlements()
  const premiumOk = ent?.features.premiumTemplates ?? false

  const alternatives = C.compatibleLayouts(slide.content).filter((l) => l !== slide.layoutId)

  return (
    <aside aria-label="Style" className="w-[340px] max-lg:fixed max-lg:z-40 max-lg:right-0 max-lg:top-14 max-lg:bottom-0 max-lg:shadow-2xl max-md:left-0 max-md:top-auto max-md:h-[60vh] max-md:rounded-t-2xl max-md:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold">Style</h2>
        <button onClick={onClose} aria-label="Close style panel" className="text-xl leading-none text-slate-500 hover:text-slate-800">×</button>
      </div>
      <div role="tablist" className="flex gap-1 px-3 pt-3">
        {([['themes', 'Themes'], ['designs', 'Designs'], ['colors', 'Colors'], ['fonts', 'Fonts']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-sm ${tab === k ? 'bg-foreground text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>{l}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tab === 'themes' && (
          <>
            <div className="text-xs font-semibold text-slate-500">Workspace themes</div>
            {THEMES.map((t: Theme) => {
              const premium = PREMIUM_THEME_IDS.includes(t.id)
              const current = doc.theme.id === t.id
              return (
                <button key={t.id} aria-pressed={current} onClick={() => (premium && !premiumOk ? upgrade.show(`The "${t.name}" theme is available on the Pro plan.`) : apply('Change theme', (d) => C.applyTheme(d, t.id)))} className={`w-full text-left rounded-xl border p-2 ${current ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-slate-400'}`}>
                  <div className="rounded-lg h-16 flex overflow-hidden" style={{ background: t.colors.background, border: '1px solid #e2e8f0' }}>
                    <div style={{ background: t.colors.primary, width: '40%' }} className="p-2"><div style={{ background: t.colors.secondary, height: 4, width: 24, borderRadius: 2 }} /><div style={{ color: t.colors.onPrimary, fontFamily: t.fonts.heading, fontWeight: 800, fontSize: 11, marginTop: 6 }}>Title</div></div>
                    <div className="flex-1 p-2 flex flex-col gap-1.5 justify-center">{[60, 80, 50].map((w) => <div key={w} style={{ background: t.colors.textSecondary, opacity: 0.5, height: 4, width: `${w}%`, borderRadius: 2 }} />)}</div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-sm"><span className="font-medium">{t.name}</span>{premium && !premiumOk && <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">🔒 PRO</span>}{current && <span className="text-xs text-slate-500">Applied</span>}</div>
                </button>
              )
            })}
          </>
        )}
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
