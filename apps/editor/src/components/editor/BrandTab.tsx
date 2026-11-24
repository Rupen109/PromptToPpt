import { FileUp } from '@prompttoppt/ui/icons'
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ApiError, isGateError, type BrandKit, type BrandKitInput, type BrandProfile } from '@prompttoppt/api-client'
import { SUPPORTED_FONTS } from '@prompttoppt/theme'
import { describeSlides, parseSlideRange, type Presentation } from '@prompttoppt/validation'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { api } from '@/lib/api'
import { uploadDesign } from '@/components/FileTemplatePicker'
import { useEntitlements } from '@/lib/entitlements'
import { SlideLoader } from '../SlideLoader'
import { BrandThemes } from './BrandThemes'

type Form = { name: string; primary: string; accent: string; heading: string; body: string }
const formOf = (k: BrandKit): Form => ({ name: k.name, primary: k.colors.primary ?? '', accent: k.colors.accent ?? '', heading: k.fonts.heading ?? '', body: k.fonts.body ?? '' })
const field = 'w-full border border-border rounded-lg px-3 py-2 text-sm'

type Scope = 'all' | 'current' | 'range'
/** where a brand goes: every slide (the deck's own design), the slide on screen, or slides typed like "1-5, 8" (read by the same reader as Export and the assistant: slide-range.ts) */
function useApplyScope(doc: Presentation, slideId: string) {
  const [scope, setScope] = useState<Scope>('all')
  const [range, setRange] = useState('')
  const total = doc.slides.length
  const parsed = scope === 'range' ? parseSlideRange(range, total) : null
  const ids: string[] | null = scope === 'all' ? null : scope === 'current' ? [slideId] : parsed?.ok ? parsed.numbers.map((n) => doc.slides[n - 1]!.id) : []
  const blocked = scope === 'range' && !parsed?.ok
  const said = scope === 'all' ? 'every slide' : scope === 'current' ? `slide ${doc.slides.findIndex((x) => x.id === slideId) + 1}` : parsed?.ok ? describeSlides(parsed.numbers, total) : ''
  const control = (name: string) => (
    <fieldset className="space-y-1 text-sm" aria-label="Apply to">
      <legend className="text-xs font-semibold text-slate-600 mb-0.5">Apply to</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <label className="flex items-center gap-1.5"><input type="radio" name={name} checked={scope === 'all'} onChange={() => setScope('all')} />Every slide</label>
        <label className="flex items-center gap-1.5"><input type="radio" name={name} checked={scope === 'current'} onChange={() => setScope('current')} />This slide</label>
      </div>
      <label className="flex items-center gap-1.5"><input type="radio" name={name} checked={scope === 'range'} onChange={() => setScope('range')} />Slides
        <input aria-label="Slides to brand" placeholder="e.g. 1-5" value={range} onFocus={() => setScope('range')} onChange={(e) => setRange(e.target.value)}
          className={`ml-1 flex-1 min-w-0 h-7 border rounded-md px-2 text-sm ${scope === 'range' && range && !parsed?.ok ? 'border-red-400' : 'border-border'}`} />
      </label>
      {scope === 'range' && range && parsed && !parsed.ok && <p className="text-xs text-red-700">{parsed.why}</p>}
    </fieldset>
  )
  return { ids, blocked, said, control }
}

/**
 * Brand kits: the company's colours, fonts, logo and pictures, saved once. "Apply" puts a kit on the open presentation (colours, fonts and the
 * logo on every slide); the default kit is also offered when creating a new presentation. A kit can be filled in from a company website.
 */
export function BrandTab({ doc, slideId }: { doc: Presentation; slideId: string }) {
  const apply = useDoc((s) => s.apply)
  const { upgrade } = useEntitlements()
  const [kits, setKits] = useState<BrandKit[] | null>(null)
  const [limit, setLimit] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [pick, setPick] = useState({ colors: true, fonts: true, logo: true })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const kit = kits?.find((k) => k.id === sel) ?? null
  const where = useApplyScope(doc, slideId)
  /** a brand on every slide (the deck's design) or on the chosen slides only (slide.brand: theme slide-theme.ts) */
  const applyTo = (label: string, b: C.BrandProfileLike, parts: typeof pick, ids: string[] | null, said: string): string => {
    if (!ids) { apply(label, (d) => C.applyBrand(d, b, parts)); return 'Applied to every slide. You can undo it with ⌘Z.' }
    let n = 0
    apply(label, (d) => { n = C.applyBrandToSlides(d, ids, b, parts) })
    return n ? `Applied to ${said}. You can undo it with ⌘Z.` : 'Nothing was changed: those slides are locked.'
  }
  const branded = doc.slides.flatMap((x, i) => (x.brand ? [i + 1] : []))
  const fail = useCallback((e: unknown) => {
    if (isGateError(e) && e.code === 'UPGRADE_REQUIRED') upgrade.show(e.message)
    else setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
  }, [upgrade])
  const choose = (k: BrandKit | null) => { setSel(k?.id ?? null); setForm(k ? formOf(k) : null) }
  const replace = (k: BrandKit, keepForm = false) => { setKits((all) => (all ?? []).map((x) => (x.id === k.id ? k : k.isDefault ? { ...x, isDefault: false } : x))); if (!keepForm) setForm(formOf(k)) }

  useEffect(() => {
    let off = false
    api.brandKits().then((r) => { if (off) return; setKits(r.kits); setLimit(r.limit); const first = r.kits[0] ?? null; setSel(first?.id ?? null); setForm(first ? formOf(first) : null) }).catch(() => !off && setKits([]))
    return () => { off = true }
  }, [])

  async function run<T>(label: string, fn: () => Promise<T>, then?: (r: T) => void) {
    if (busy) return
    setBusy(label); setError(null); setNote(null)
    try { const r = await fn(); then?.(r) } catch (e) { fail(e) } finally { setBusy(null) }
  }
  const dirty = !!(kit && form && (form.name !== kit.name || form.primary.toUpperCase() !== (kit.colors.primary ?? '') || form.accent.toUpperCase() !== (kit.colors.accent ?? '') || form.heading !== (kit.fonts.heading ?? '') || form.body !== (kit.fonts.body ?? '')))
  const save = () => kit && form && run('save', () => api.brandKitUpdate(kit.id, { name: form.name, primary: form.primary || null, accent: form.accent || null, headingFont: form.heading || null, bodyFont: form.body || null }), (k) => { replace(k); setNote('Saved.') })
  const create = (body: Parameters<typeof api.brandKitCreate>[0] = { name: 'My brand' }) => run('create', () => api.brandKitCreate(body), (k) => { setKits((all) => [...(all ?? []), k]); choose(k) })
  const remove = () => kit && window.confirm(`Delete the brand kit "${kit.name}" and its pictures?`) && run('delete', () => api.brandKitDelete(kit.id), () => { const rest = (kits ?? []).filter((k) => k.id !== kit.id); setKits(rest.length && kit.isDefault ? rest.map((k, i) => (i === 0 ? { ...k, isDefault: true } : k)) : rest); choose(rest[0] ?? null) })
  const upload = (e: ChangeEvent<HTMLInputElement>, what: 'logo' | 'image') => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f || !kit) return
    if (!/\.(png|jpe?g)$/i.test(f.name)) return setError('Use a PNG or JPEG picture.')
    void run(what, () => (what === 'logo' ? api.brandKitLogo(kit.id, f) : api.brandKitImageAdd(kit.id, f, f.name.replace(/\.[^.]+$/, ''))), (k) => replace(k, true))
  }
  const applyKit = () => { if (!kit || !form || where.blocked) return; setNote(applyTo('Apply brand kit', { name: kit.name, colors: { primary: kit.colors.primary, accent: kit.colors.accent }, fonts: { heading: kit.fonts.heading ? { family: kit.fonts.heading } : null, body: kit.fonts.body ? { family: kit.fonts.body } : null }, logo: kit.logo }, pick, where.ids, where.said)) }

  // ── a plan without brand kits (Starter, Pro) / loading
  if (kits === null) return <SlideLoader size="sm" />
  if (limit === 0) {
    return (
      <div className="rounded-xl border border-border p-4 space-y-2" aria-label="Brand kit">
        <h3 className="font-semibold">Your brand, on every slide</h3>
        <p className="text-sm text-slate-600">Save your company's colours, fonts and logo once, or read them from your website, a PowerPoint or a PDF, and apply them to any presentation. Available on Gold and Premium.</p>
        <button onClick={() => upgrade.show('Brand kits are available on Gold and Premium.')} className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold">See plans</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      {note && <p role="status" className="text-xs text-green-800">{note}</p>}

      <div className="flex items-center gap-2">
        {kits.length > 1 ? (
          <select aria-label="Brand kit" value={sel ?? ''} onChange={(e) => choose(kits.find((k) => k.id === e.target.value) ?? null)} className={`${field} flex-1`}>
            {kits.map((k) => <option key={k.id} value={k.id}>{k.name}{k.isDefault ? ' (default)' : ''}</option>)}
          </select>
        ) : <span className="flex-1 text-sm text-slate-600">{kits.length === 0 ? 'No brand kit yet' : `${kits.length} of ${limit} kit${limit > 1 ? 's' : ''}`}</span>}
        <button onClick={() => void create()} disabled={!!busy || kits.length >= limit} title={kits.length >= limit ? `Your plan includes ${limit} brand kit${limit > 1 ? 's' : ''}` : undefined} className="shrink-0 border border-border rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40">New brand kit</button>
      </div>

      {kit && form && (
        <section className="rounded-xl border border-border p-3 space-y-3" aria-label="Brand kit details">
          <label className="block text-sm">Kit name<input aria-label="Kit name" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${field} mt-1`} /></label>

          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5">Main <input type="color" aria-label="Main colour" value={form.primary || '#2563EB'} onChange={(e) => setForm({ ...form, primary: e.target.value.toUpperCase() })} className="w-8 h-8 rounded border border-border p-0" /></label>
            <label className="flex items-center gap-1.5">Accent <input type="color" aria-label="Accent colour" value={form.accent || '#7C3AED'} onChange={(e) => setForm({ ...form, accent: e.target.value.toUpperCase() })} className="w-8 h-8 rounded border border-border p-0" /></label>
            {kit.colors.extra.length > 0 && <span className="flex gap-1" aria-label="Other brand colours">{kit.colors.extra.map((c) => <span key={c} title={c} style={{ background: c }} className="w-5 h-5 rounded-full border border-border" />)}</span>}
          </div>
          {!form.primary && <p className="text-xs text-slate-500">No colours yet: pick them above, or read them from your website below.</p>}

          <div className="grid grid-cols-2 gap-2">
            {(['heading', 'body'] as const).map((k) => (
              <label key={k} className="block text-sm capitalize">{k} font
                <select aria-label={`${k === 'heading' ? 'Heading' : 'Body'} font in kit`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={`${field} mt-1`}>
                  <option value="">Keep the design's</option>
                  {SUPPORTED_FONTS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Logo</div>
            {kit.logo ? <img src={kit.logo.url} alt="Brand logo" className="h-10 max-w-[160px] object-contain bg-white border border-border rounded p-1" /> : <p className="text-xs text-slate-500">No logo yet.</p>}
            <div className="flex items-center gap-3 mt-1.5 text-sm">
              <label className="cursor-pointer text-primary font-medium">{kit.logo ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg" aria-label="Upload logo" onChange={(e) => upload(e, 'logo')} className="sr-only" /></label>
              {kit.logo && <button onClick={() => void run('rmlogo', () => api.brandKitUpdate(kit.id, { removeLogo: true }), (k) => replace(k, true))} className="text-slate-500 underline">Remove</button>}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">PNG or JPEG, up to 2 MB. A wide logo on a transparent background works best.</p>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Pictures <span className="text-slate-500 font-normal">({kit.images.length}/20)</span></div>
            {kit.images.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 mb-2">
                {kit.images.map((im) => (
                  <li key={im.id} className="relative border border-border rounded-lg bg-white p-1">
                    <img src={im.url} alt={im.name} className="h-14 w-full object-contain" />
                    <div className="flex justify-between mt-1 text-[11px]">
                      <button onClick={() => apply('Insert brand picture', (d) => C.addBrandImage(d, slideId, im))} aria-label={`Insert ${im.name} on this slide`} className="text-primary font-medium">Insert</button>
                      <button onClick={() => void run('rmimg', () => api.brandKitImageRemove(kit.id, im.id), (k) => replace(k, true))} aria-label={`Remove ${im.name}`} className="text-slate-500">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <label className="cursor-pointer text-sm text-primary font-medium">Add a picture<input type="file" accept="image/png,image/jpeg" aria-label="Add picture" onChange={(e) => upload(e, 'image')} className="sr-only" /></label>
          </div>

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={kit.isDefault} disabled={kit.isDefault || !!busy} onChange={() => void run('default', () => api.brandKitUpdate(kit.id, { isDefault: true }), (k) => replace(k, true))} />Default kit for new presentations</label>

          <div className="flex items-center gap-3">
            <button onClick={() => void save()} disabled={!dirty || !!busy} className="bg-foreground text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">Save kit</button>
            <button onClick={() => void remove()} disabled={!!busy} className="text-sm text-slate-500 underline">Delete kit</button>
          </div>

          <div className="border-t border-border pt-3 space-y-2" aria-label="Apply this kit">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={pick.colors} disabled={!kit.colors.primary || !kit.colors.accent} onChange={(e) => setPick({ ...pick, colors: e.target.checked })} />Colours</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={pick.fonts} disabled={!kit.fonts.heading || !kit.fonts.body} onChange={(e) => setPick({ ...pick, fonts: e.target.checked })} />Fonts</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={pick.logo} disabled={!kit.logo} onChange={(e) => setPick({ ...pick, logo: e.target.checked })} />Logo</label>
            </div>
            {where.control('kit-scope')}
            <button onClick={applyKit} disabled={dirty || where.blocked} title={dirty ? 'Save your changes first' : undefined} className="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">{where.ids ? `Apply to ${where.said || 'the chosen slides'}` : 'Apply to this presentation'}</button>
          </div>
        </section>
      )}

      <BrandThemes doc={doc} kit={kit} kitDirty={dirty} onNote={(t) => { setError(null); setNote(t) }} onFail={fail} />

      {branded.length > 0 && (
        <section className="rounded-xl border border-border p-3 space-y-1.5" aria-label="Slides with their own brand">
          <div className="text-sm font-medium">Slides with their own brand: {describeSlides(branded, doc.slides.length)}</div>
          <button onClick={() => { let n = 0; apply('Remove slide brand', (d) => { n = C.removeSlideBrand(d, doc.slides.filter((x) => x.brand).map((x) => x.id)) }); setNote(n ? 'Those slides are back in the presentation\'s own look.' : 'Nothing was changed: those slides are locked.') }} className="text-sm text-primary font-semibold">Back to the presentation's look</button>
        </section>
      )}

      {doc.theme.brand?.logo && (
        <section className="rounded-xl border border-border p-3" aria-label="Current brand">
          <div className="text-sm font-medium mb-1.5">Logo on this presentation</div>
          <img src={doc.theme.brand.logo.src} alt="Current logo" className="h-10 max-w-[160px] object-contain bg-white border border-border rounded p-1" />
          <button onClick={() => apply('Remove logo', (d) => C.removeBrandLogo(d))} className="block mt-2 text-sm text-slate-600 underline">Remove logo from every slide</button>
        </section>
      )}

      <GetBrand kits={kits} limit={limit} sel={sel} busy={!!busy} where={where} onApply={(b, parts) => applyTo('Apply brand', b, parts, where.ids, where.said)} onSave={(body) => run('site', async () => (kits.length < limit ? api.brandKitCreate(body) : api.brandKitUpdate(sel ?? kits[0]!.id, body)),
        (k) => { if (kits.some((x) => x.id === k.id)) replace(k); else setKits([...kits, k]); setSel(k.id); setForm(formOf(k)); setNote(`Saved to your brand kit "${k.name}".`) })} onFail={fail} />
    </div>
  )
}

type Source = 'website' | 'pptx' | 'pdf'
/** One review card for every source: what was found, ready to edit. */
interface Found {
  kind: Source
  /** the address (website) or the file's name */
  from: string
  name: string | null
  colors: BrandProfile['colors']
  fonts: BrandProfile['fonts']
  logo: BrandProfile['logo']
  confidence: 'high' | 'low'
  notes: string[]
  /** can this source ALSO give slide layouts, and the honest sentence about it */
  layouts: { available: boolean; reason: string }
  file: File | null
}
const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: 'website', label: 'From a website (URL)', hint: 'We read the site\'s public colours, fonts and logo.' },
  { id: 'pptx', label: 'From a PowerPoint (.pptx)', hint: 'We read its theme colours, the colours its slides really use, its fonts and its logo.' },
  { id: 'pdf', label: 'From a PDF', hint: 'We read the colours its pages draw, the fonts its text uses and a logo repeated on the pages.' },
]
const WEBSITE_LAYOUTS = 'A website has no slide layouts, so it can give colours, fonts and a logo only. A PowerPoint file can also give its slide layouts.'
/** flip when PDFs can be used as a design (the "Use a file\'s design" flow answers "coming soon" for them today) */

/**
 * "Get brand from a website, PowerPoint or PDF": reads the colours, fonts and logo of a company site, or of a PowerPoint or PDF you upload, into one review card where you can
 * edit them; apply them straight away or save them into a kit. A PowerPoint can also be kept as a design (its slide layouts) from the same card.
 */
function GetBrand({ kits, limit, sel, busy, where, onApply, onSave, onFail }: { kits: BrandKit[]; limit: number; sel: string | null; busy: boolean; where: ReturnType<typeof useApplyScope>; onApply: (b: C.BrandProfileLike, parts: { colors: boolean; fonts: boolean; logo: boolean }) => string; onSave: (body: BrandKitInput) => void; onFail: (e: unknown) => void }) {
  const { upgrade } = useEntitlements()
  const [source, setSource] = useState<Source>('website')
  const [url, setUrl] = useState('')
  const [looking, setLooking] = useState(false)
  const [found, setFound] = useState<Found | null>(null)
  const [primary, setPrimary] = useState('#000000')
  const [accent, setAccent] = useState('#000000')
  const [heading, setHeading] = useState('')
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [pick, setPick] = useState({ colors: true, fonts: true, logo: true })
  const [done, setDone] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [design, setDesign] = useState<{ state: 'idle' | 'busy' | 'done' | 'failed'; message?: string }>({ state: 'idle' })
  const fileInput = useRef<HTMLInputElement>(null)

  function show(f: Found) {
    setFound(f); setPrimary(f.colors.primary ?? '#2563EB'); setAccent(f.colors.accent ?? '#7C3AED'); setHeading(f.fonts.heading?.family ?? ''); setBody(f.fonts.body?.family ?? ''); setName(f.name ?? '')
    setPick({ colors: !!f.colors.primary, fonts: !!f.fonts.heading, logo: !!f.logo }); setDesign({ state: 'idle' })
  }
  const reset = () => { setFound(null); setDone(null); setProblem(null); setDesign({ state: 'idle' }) }
  const fail = (err: unknown) => {
    if (isGateError(err)) onFail(err) // the upgrade prompt
    else setProblem(err instanceof ApiError ? err.message : 'We could not reach the server. Check your connection and try again.')
  }

  async function find(e: FormEvent) {
    e.preventDefault()
    const typed = url.trim()
    if (!typed || looking) return
    // a website looks like name.tld (a path or http(s):// in front is fine); anything else never reaches the server
    if (typed.length > 2000 || /\s/.test(typed) || !/^(https?:\/\/)?[^/\s]+\.[^/\s.]{2,}([/?#].*)?$/i.test(typed)) { reset(); setProblem('Enter a website address like yourcompany.com'); return }
    setLooking(true); reset()
    try {
      const b = await api.brandExtract(typed)
      show({ kind: 'website', from: b.sourceUrl, name: b.name ?? new URL(b.sourceUrl).hostname, colors: b.colors, fonts: b.fonts, logo: b.logo, confidence: b.confidence, notes: [], layouts: { available: false, reason: WEBSITE_LAYOUTS }, file: null })
    } catch (err) { fail(err) } finally { setLooking(false) }
  }

  async function readFile(file: File | undefined) {
    if (!file || looking) return
    const kind: Source = source === 'pdf' ? 'pdf' : 'pptx'
    const okType = kind === 'pdf' ? /\.pdf$/i.test(file.name) : /\.pptx$/i.test(file.name)
    if (!okType) { reset(); setProblem(kind === 'pdf' ? 'Choose a PDF file (.pdf).' : /\.ppt$/i.test(file.name) ? 'Old .ppt files are not supported: open it in PowerPoint and save as .pptx.' : 'Choose a PowerPoint file (.pptx).'); return }
    if (file.size > 15 * 1024 * 1024) { reset(); setProblem(`${file.name} is larger than 15 MB.`); return }
    setLooking(true); reset()
    try {
      const b = await api.brandFromFile(file)
      show({ kind: b.source, from: b.fileName, name: b.name, colors: b.colors, fonts: b.fonts, logo: b.logo, confidence: b.confidence, notes: b.notes, layouts: b.layouts, file })
    } catch (err) { fail(err) } finally { setLooking(false) }
  }

  /** the second one-click action: hand the same PowerPoint to "Use a file's design" so the slide layouts come too */
  async function keepLayouts() {
    if (!found?.file || design.state === 'busy') return
    setDesign({ state: 'busy' })
    const r = await uploadDesign(found.file, upgrade.show)
    setDesign(r.ok ? { state: 'done', message: `Saved as the design "${r.summary.name}" with ${r.summary.slideCount} slide${r.summary.slideCount === 1 ? '' : 's'}.` } : { state: 'failed', message: r.message })
  }

  const colours = (): BrandProfile['colors'] | null => (found ? { ...found.colors, primary: pick.colors ? primary : null, accent: pick.colors ? accent : null } : null)
  const asBrand = () => {
    const c = colours()!
    const fam = (v: string, was: BrandProfile['fonts']['heading']) => (v ? { family: v, original: was?.original ?? v, exact: was ? was.family === v && was.exact : true } : null)
    return { name: name.trim() || found!.name || 'My brand', colors: c, fonts: { heading: pick.fonts ? fam(heading, found!.fonts.heading) : null, body: pick.fonts ? fam(body, found!.fonts.body) : null }, logo: pick.logo ? found!.logo : null }
  }
  const nothing = !found || (!(pick.colors && found.colors.primary) && !(pick.fonts && heading && body) && !(pick.logo && found.logo))
  const save = () => {
    if (!found) return
    const c = colours()!
    onSave({ name: name.trim() || found.name || 'My brand', primary: c.primary, accent: c.accent, extra: found.colors.palette.filter((x) => x !== c.primary && x !== c.accent).slice(0, 6), headingFont: pick.fonts && heading ? heading : null, bodyFont: pick.fonts && body ? body : null, sourceUrl: found.kind === 'website' ? found.from : null, ...(pick.logo && found.logo ? { logoUrl: found.logo.url } : {}) })
  }
  const box = 'flex items-start gap-2 text-sm'
  const cur = SOURCES.find((x) => x.id === source)!

  return (
    <details className="rounded-xl border border-border p-3" aria-label="Get brand from a source" data-testid="brand-source">
      <summary className="cursor-pointer text-sm font-medium">Get brand from a website, PowerPoint or PDF</summary>
      <div role="tablist" aria-label="Where should we read your brand from?" className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-3">
        {SOURCES.map((x) => (
          <button key={x.id} role="tab" type="button" id={`brand-src-${x.id}`} aria-selected={source === x.id} aria-controls="brand-src-panel" onClick={() => { setSource(x.id); reset() }}
            className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${source === x.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-slate-600 hover:bg-slate-50'}`}>{x.label}</button>
        ))}
      </div>

      <div id="brand-src-panel" role="tabpanel" aria-labelledby={`brand-src-${source}`} className="mt-3">
        {source === 'website' ? (
          <form onSubmit={find} className="space-y-2">
            <label className="block text-sm" htmlFor="brand-url">Your company website</label>
            <div className="flex gap-2">
              <input id="brand-url" value={url} onChange={(e) => { setUrl(e.target.value); setProblem(null) }} aria-invalid={!!problem} aria-describedby={problem ? 'brand-src-problem' : undefined} placeholder="yourcompany.com" inputMode="url" autoComplete="url" className="min-w-0 flex-1 border border-border rounded-lg px-3 py-2 text-sm" />
              <button disabled={looking || !url.trim()} className="shrink-0 bg-primary text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50">{looking ? 'Looking…' : 'Find brand'}</button>
            </div>
          </form>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); void readFile(e.dataTransfer.files[0]) }}
            className={`rounded-xl border-2 border-dashed p-4 text-center transition ${over ? 'border-primary bg-primary/5' : 'border-border bg-slate-50'}`}
          >
            <FileUp aria-hidden size={22} className="mx-auto text-slate-500" />
            <p className="mt-1.5 text-sm font-medium">{looking ? 'Reading your file…' : source === 'pdf' ? 'Drop a PDF here, or' : 'Drop a PowerPoint (.pptx) here, or'}</p>
            <button type="button" disabled={looking} onClick={() => fileInput.current?.click()} className="mt-2 rounded-lg bg-primary text-white px-3 py-1.5 text-sm font-semibold disabled:opacity-60">Choose a file</button>
            <input ref={fileInput} type="file" hidden aria-label={source === 'pdf' ? 'Brand PDF file' : 'Brand PowerPoint file'} data-testid="brand-file-input" accept={source === 'pdf' ? '.pdf,application/pdf' : '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation'} onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = '' }} />
            <p className="mt-1.5 text-xs text-slate-500">Up to 15 MB. The file is read once and not kept; only the logo is saved.</p>
          </div>
        )}
        {problem && <p id="brand-src-problem" role="alert" className="mt-2 text-sm font-medium text-red-700">{problem}</p>}
        <p className="mt-2 text-xs text-slate-500">{cur.hint} Nothing is changed until you apply or save it.</p>
      </div>

      {found && (
        <section className="mt-3 space-y-3" aria-label="What we found">
          <div>
            <label className="block text-xs text-slate-500" htmlFor="brand-found-name">Name</label>
            <input id="brand-found-name" aria-label="Brand name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className="w-full border border-border rounded-lg px-3 py-1.5 text-sm font-semibold" />
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">Read from {found.from}</p>
          </div>
          {found.confidence === 'low' && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">{found.kind === 'website' ? 'We found few brand signals on this page (some sites build their look with scripts). Check the colours before applying.' : 'We are not sure these colours are your brand. Check them before applying.'}</p>}
          {found.notes.length > 0 && <ul aria-label="Notes" className="text-xs text-slate-700 bg-slate-50 rounded-lg px-2.5 py-1.5 space-y-1 list-disc pl-5">{found.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

          <label className={box}><input type="checkbox" checked={pick.colors} disabled={!found.colors.primary} onChange={(e) => setPick({ ...pick, colors: e.target.checked })} className="mt-1" />
            <span className="flex-1">Colours
              {found.colors.primary ? (
                <>
                  <span className="flex flex-wrap items-center gap-3 mt-1.5">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">Main <input type="color" aria-label="Found main colour" value={primary} onChange={(e) => setPrimary(e.target.value.toUpperCase())} className="w-7 h-7 rounded border border-border p-0" /></label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">Accent <input type="color" aria-label="Found accent colour" value={accent} onChange={(e) => setAccent(e.target.value.toUpperCase())} className="w-7 h-7 rounded border border-border p-0" /></label>
                  </span>
                  {found.colors.palette.length > 2 && (
                    <span className="flex flex-wrap items-center gap-1 mt-1.5" aria-label="Other colours found">
                      <span className="text-[11px] text-slate-500 mr-1">Also found:</span>
                      {found.colors.palette.filter((c) => c !== found.colors.primary && c !== found.colors.accent).map((c) => (
                        <button key={c} type="button" title={`Use ${c} as the main colour`} aria-label={`Use ${c} as main colour`} onClick={() => setPrimary(c)} style={{ background: c }} className="w-5 h-5 rounded-full border border-border" />
                      ))}
                    </span>
                  )}
                </>
              ) : <span className="block text-xs text-slate-500">No brand colours found</span>}
              {found.colors.accentDerived && found.colors.primary && <span className="block text-xs text-slate-500 mt-1">Only one brand colour was found; the accent was chosen to go with it.</span>}
            </span>
          </label>
          <label className={box}><input type="checkbox" checked={pick.fonts} disabled={!heading || !body} onChange={(e) => setPick({ ...pick, fonts: e.target.checked })} className="mt-1" />
            <span className="flex-1">Fonts
              {found.fonts.heading && found.fonts.body ? (
                <>
                  <span className="grid grid-cols-2 gap-2 mt-1.5">
                    {([['Headings', heading, setHeading, found.fonts.heading], ['Text', body, setBody, found.fonts.body]] as const).map(([lab, val, set, was]) => (
                      <label key={lab} className="block text-xs text-slate-600">{lab}
                        <select aria-label={`${lab} font found`} value={val} onChange={(e) => set(e.target.value)} className="mt-0.5 w-full border border-border rounded-lg px-2 py-1 text-sm">
                          {!SUPPORTED_FONTS.includes(val) && <option>{val}</option>}
                          {SUPPORTED_FONTS.map((f) => <option key={f}>{f}</option>)}
                        </select>
                        {!was.exact && val === was.family && <span className="block text-[11px] text-slate-500 mt-0.5">Closest to {was.original}</span>}
                      </label>
                    ))}
                  </span>
                </>
              ) : <span className="block text-xs text-slate-500">{found.kind === 'pdf' || found.kind === 'pptx' ? 'No fonts could be read from this file. You can choose them after saving.' : 'No fonts found'}</span>}
            </span>
          </label>
          <label className={box}><input type="checkbox" checked={pick.logo} disabled={!found.logo} onChange={(e) => setPick({ ...pick, logo: e.target.checked })} className="mt-1" />
            <span className="flex-1">Logo
              {found.logo ? <img src={found.logo.url} alt={found.kind === 'website' ? 'Logo found on the site' : 'Logo found in the file'} className="mt-1.5 h-10 max-w-[160px] object-contain bg-white border border-border rounded p-1" /> : <span className="block text-xs text-slate-500">{found.kind === 'website' ? 'No usable PNG or JPEG logo found' : 'No logo found. You can upload one after saving.'}</span>}
              {found.logo && <span className="block text-[11px] text-slate-500 mt-1">Wrong picture? Save the kit, then use "Replace logo" in it.</span>}
            </span>
          </label>

          {where.control('found-scope')}
          <div className="flex gap-2">
            <button onClick={() => setDone(onApply(asBrand(), pick))} disabled={nothing || where.blocked} className="flex-1 bg-foreground text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">{where.ids ? `Apply to ${where.said || 'the chosen slides'}` : 'Apply to this presentation'}</button>
            <button onClick={save} disabled={busy || nothing} title={kits.length >= limit && sel ? 'Replaces what is in your selected kit' : undefined} className="flex-1 border border-border rounded-lg py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">{kits.length < limit ? 'Save as brand kit' : 'Update my kit'}</button>
          </div>
          {done && <p role="status" className="text-xs text-green-800">{done}</p>}

          <div className="rounded-lg border border-border p-2.5 space-y-1.5" data-testid="brand-layouts">
            <div className="text-sm font-medium">Slide layouts</div>
            <p className="text-xs text-slate-600">{found.layouts.reason}</p>
            {found.file && found.layouts.available && design.state !== 'done' && (
              <button type="button" onClick={() => void keepLayouts()} disabled={design.state === 'busy'} data-testid="brand-use-layouts" className="rounded-lg border border-primary text-primary px-3 py-1.5 text-sm font-semibold hover:bg-primary/5 disabled:opacity-50">{design.state === 'busy' ? 'Saving the design…' : 'Also use its slide layouts as a design (same format)'}</button>
            )}
            {design.state === 'done' && <p role="status" data-testid="brand-layouts-done" className="text-xs text-green-800">{design.message} To start a presentation in it, open Home and choose <b>Use a file's design</b> (<a href="/" target="_blank" rel="noopener" className="underline">open Home</a>).</p>}
            {design.state === 'failed' && <p role="alert" className="text-xs font-medium text-red-700">{design.message}</p>}
            {!found.file && <p className="text-xs text-slate-500">To get layouts as well, upload a PowerPoint file instead.</p>}
          </div>
        </section>
      )}
    </details>
  )
}
