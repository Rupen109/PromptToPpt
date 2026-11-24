import { useEffect, useState } from 'react'
import type { BrandKit, BrandTheme } from '@prompttoppt/api-client'
import { CATEGORIES, DESIGNS, brandTheme, composeSlide, designById } from '@prompttoppt/theme'
import { SlideCanvas } from '@prompttoppt/ui'
import type { Presentation, Slide, Theme } from '@prompttoppt/validation'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'

const field = 'w-full border border-border rounded-lg px-3 py-2 text-sm'

/** the deck's title on a title slide in a theme: what a theme looks like before it is applied */
function Preview({ doc, theme, width = 290 }: { doc: Presentation; theme: Theme; width?: number }) {
  let n = 0
  const slide: Slide = { id: 'preview', locked: false, validation: { status: 'pending', issues: [] }, ...composeSlide({ layout: 'title', title: doc.title, subtitle: '', speakerNotes: '', sources: [] }, theme, doc.aspectRatio, () => `bt${n++}`) }
  return <span className="block rounded-lg overflow-hidden ring-1 ring-border"><SlideCanvas slide={slide} theme={theme} aspect={doc.aspectRatio} width={width} /></span>
}

/**
 * THEMES made from a brand kit ("create a theme from this kit"): pick a design and light or dark, see it with the kit's colours, fonts and logo, and save it under a name. A saved
 * theme is applied to this deck in one step (one undo), and offered when starting a new deck. The preview and the saved theme use the same rule (packages/theme brand-theme.ts).
 */
export function BrandThemes({ doc, kit, kitDirty, onNote, onFail }: { doc: Presentation; kit: BrandKit | null; kitDirty: boolean; onNote: (s: string) => void; onFail: (e: unknown) => void }) {
  const apply = useDoc((s) => s.apply)
  const { ent, upgrade } = useEntitlements()
  const premiumOk = !!ent?.features.premiumTemplates
  const [themes, setThemes] = useState<BrandTheme[] | null>(null)
  const [limit, setLimit] = useState(0)
  const current = designById(doc.theme.templateId ?? '') ?? DESIGNS[0]!
  const [designId, setDesignId] = useState(current.id)
  const [mode, setMode] = useState<'light' | 'dark'>(current.look.mode)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let off = false
    api.brandThemes().then((r) => { if (!off) { setThemes(r.themes); setLimit(r.limit) } }).catch(() => !off && setThemes([]))
    return () => { off = true }
  }, [kit?.updatedAt])

  const design = designById(designId)
  const draft = kit && design ? brandTheme(design, mode, { primary: kit.colors.primary, accent: kit.colors.accent, headingFont: kit.fonts.heading, bodyFont: kit.fonts.body, name: kit.name, logo: kit.logo }, name.trim() || `${kit.name} ${mode}`) : null
  const use = (t: BrandTheme) => { apply(`Theme: ${t.name}`, (d) => C.applyThemeObject(d, t.theme)); onNote(`Applied the theme "${t.name}". You can undo it with ⌘Z.`) }
  const save = async () => {
    if (!kit || !design || busy) return
    if (design.premium && !premiumOk) return upgrade.show(`The "${design.name}" template is available on the Pro plan.`)
    setBusy(true)
    try { const t = await api.brandThemeCreate({ kitId: kit.id, designId, mode, ...(name.trim() ? { name: name.trim() } : {}) }); setThemes((all) => [t, ...(all ?? [])]); setName(''); onNote(`Saved the theme "${t.name}". Apply it here, or choose it when you start a new presentation.`) }
    catch (e) { onFail(e) } finally { setBusy(false) }
  }
  const remove = async (t: BrandTheme) => {
    if (!window.confirm(`Delete the theme "${t.name}"? Presentations already in it keep their look.`)) return
    try { await api.brandThemeDelete(t.id); setThemes((all) => (all ?? []).filter((x) => x.id !== t.id)) } catch (e) { onFail(e) }
  }
  if (themes === null || limit === 0) return null

  return (
    <section className="rounded-xl border border-border p-3 space-y-3" aria-label="Brand themes">
      <h3 className="text-sm font-semibold">Themes from your brand</h3>
      {themes.length > 0 && (
        <ul className="space-y-2" aria-label="Your themes">
          {themes.map((t) => (
            <li key={t.id} className="flex items-center gap-2" data-testid={`brand-theme-${t.id}`}>
              <Preview doc={doc} theme={t.theme} width={96} />
              <span className="flex-1 min-w-0 text-sm"><span className="block font-medium truncate">{t.name}</span><span className="block text-xs text-slate-500 truncate">{t.designName} · {t.mode} · {t.kitName}</span></span>
              <button onClick={() => use(t)} aria-label={`Apply the theme ${t.name}`} className="text-sm text-primary font-semibold">Apply</button>
              <button onClick={() => void remove(t)} aria-label={`Delete the theme ${t.name}`} className="text-xs text-slate-500 underline">Delete</button>
            </li>
          ))}
        </ul>
      )}
      {kit && (
        <div className="border-t border-border pt-3 space-y-2" aria-label="Make a theme from this kit">
          <div className="text-sm font-medium">Make a theme from “{kit.name}”</div>
          <label className="block text-sm">Design
            <select aria-label="Theme design" value={designId} onChange={(e) => setDesignId(e.target.value)} className={`${field} mt-1`}>
              {CATEGORIES.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {DESIGNS.filter((d) => d.category === c.id).map((d) => <option key={d.id} value={d.id}>{d.name}{d.premium && !premiumOk ? ' (Pro)' : ''}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <fieldset className="flex items-center gap-4 text-sm" aria-label="Light or dark">
            <label className="flex items-center gap-1.5"><input type="radio" name="brand-theme-mode" checked={mode === 'light'} onChange={() => setMode('light')} />Light</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="brand-theme-mode" checked={mode === 'dark'} onChange={() => setMode('dark')} />Dark</label>
          </fieldset>
          <label className="block text-sm">Theme name<input aria-label="Theme name" value={name} maxLength={60} placeholder={`${kit.name} ${mode}`} onChange={(e) => setName(e.target.value)} className={`${field} mt-1`} /></label>
          {draft && <Preview doc={doc} theme={draft} />}
          {!kit.colors.primary && <p className="text-xs text-slate-500">This kit has no colours yet, so the theme keeps the design's colours.</p>}
          <button onClick={() => void save()} disabled={busy || kitDirty || themes.length >= limit} title={kitDirty ? 'Save your kit changes first' : themes.length >= limit ? `You can keep ${limit} themes` : undefined} className="w-full border border-primary text-primary rounded-lg py-2 text-sm font-semibold disabled:opacity-40">Save theme</button>
        </div>
      )}
    </section>
  )
}
