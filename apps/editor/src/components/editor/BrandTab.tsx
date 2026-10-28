import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { ApiError, isGateError, type BrandKit, type BrandProfile } from '@prompttoppt/api-client'
import { SUPPORTED_FONTS } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'

type Form = { name: string; primary: string; accent: string; heading: string; body: string }
const formOf = (k: BrandKit): Form => ({ name: k.name, primary: k.colors.primary ?? '', accent: k.colors.accent ?? '', heading: k.fonts.heading ?? '', body: k.fonts.body ?? '' })
const field = 'w-full border border-border rounded-lg px-3 py-2 text-sm'

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
  const applyKit = () => { if (!kit || !form) return; apply('Apply brand kit', (d) => C.applyBrand(d, { name: kit.name, colors: { primary: kit.colors.primary, accent: kit.colors.accent }, fonts: { heading: kit.fonts.heading ? { family: kit.fonts.heading } : null, body: kit.fonts.body ? { family: kit.fonts.body } : null }, logo: kit.logo }, pick)); setNote('Applied to every slide. You can undo it with ⌘Z.') }

  // ── starter plan / loading
  if (kits === null) return <p className="text-sm text-slate-500">Loading…</p>
  if (limit === 0) {
    return (
      <div className="rounded-xl border border-border p-4 space-y-2" aria-label="Brand kit">
        <h3 className="font-semibold">Your brand, on every slide</h3>
        <p className="text-sm text-slate-600">Save your company's colours, fonts and logo once, or read them from your website, and apply them to any presentation. Available on Pro and Gold.</p>
        <button onClick={() => upgrade.show('Brand kits are available on Pro and Gold.')} className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold">See plans</button>
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
            <button onClick={applyKit} disabled={dirty} title={dirty ? 'Save your changes first' : undefined} className="w-full bg-primary text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">Apply to this presentation</button>
          </div>
        </section>
      )}

      {doc.theme.brand?.logo && (
        <section className="rounded-xl border border-border p-3" aria-label="Current brand">
          <div className="text-sm font-medium mb-1.5">Logo on this presentation</div>
          <img src={doc.theme.brand.logo.src} alt="Current logo" className="h-10 max-w-[160px] object-contain bg-white border border-border rounded p-1" />
          <button onClick={() => apply('Remove logo', (d) => C.removeBrandLogo(d))} className="block mt-2 text-sm text-slate-600 underline">Remove logo from every slide</button>
        </section>
      )}

      <FromWebsite kits={kits} limit={limit} sel={sel} busy={!!busy} onSave={(p) => run('site', async () => {
        const body = { name: p.name ?? 'My brand', primary: p.colors.primary, accent: p.colors.accent, extra: p.colors.palette.filter((c) => c !== p.colors.primary && c !== p.colors.accent).slice(0, 6), headingFont: p.fonts.heading?.family ?? null, bodyFont: p.fonts.body?.family ?? null, sourceUrl: p.sourceUrl, ...(p.logo ? { logoUrl: p.logo.url } : {}) }
        return kits.length < limit ? api.brandKitCreate(body) : api.brandKitUpdate(sel ?? kits[0]!.id, body)
      }, (k) => { if (kits.some((x) => x.id === k.id)) replace(k); else setKits([...kits, k]); setSel(k.id); setForm(formOf(k)); setNote(`Saved to your brand kit "${k.name}".`) })} onFail={fail} />
    </div>
  )
}

/** "Get brand from a website": reads a company site's colours, fonts and logo; apply them straight away or save them into a kit. */
function FromWebsite({ kits, limit, sel, busy, onSave, onFail }: { kits: BrandKit[]; limit: number; sel: string | null; busy: boolean; onSave: (p: BrandProfile) => void; onFail: (e: unknown) => void }) {
  const apply = useDoc((s) => s.apply)
  const [url, setUrl] = useState('')
  const [looking, setLooking] = useState(false)
  const [found, setFound] = useState<BrandProfile | null>(null)
  const [primary, setPrimary] = useState('#000000')
  const [accent, setAccent] = useState('#000000')
  const [pick, setPick] = useState({ colors: true, fonts: true, logo: true })
  const [done, setDone] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function find(e: FormEvent) {
    e.preventDefault()
    const typed = url.trim()
    if (!typed || looking) return
    // a website looks like name.tld (a path or http(s):// in front is fine); anything else never reaches the server
    if (typed.length > 2000 || /\s/.test(typed) || !/^(https?:\/\/)?[^/\s]+\.[^/\s.]{2,}([/?#].*)?$/i.test(typed)) { setFound(null); setProblem('Enter a website address like yourcompany.com'); return }
    setLooking(true); setFound(null); setDone(false); setProblem(null)
    try {
      const b = await api.brandExtract(url.trim())
      setFound(b); setPrimary(b.colors.primary ?? '#2563EB'); setAccent(b.colors.accent ?? '#7C3AED')
      setPick({ colors: !!b.colors.primary, fonts: !!b.fonts.heading, logo: !!b.logo })
    } catch (err) {
      if (isGateError(err)) onFail(err) // the upgrade prompt
      else setProblem(err instanceof ApiError ? err.message : 'We could not reach the server. Check your connection and try again.')
    } finally { setLooking(false) }
  }
  const withColours = (p: BrandProfile): BrandProfile => ({ ...p, colors: { ...p.colors, primary: pick.colors ? primary : null, accent: pick.colors ? accent : null } })
  const nothing = !found || (!(pick.colors && found.colors.primary) && !(pick.fonts && found.fonts.heading) && !(pick.logo && found.logo))
  const box = 'flex items-start gap-2 text-sm'

  return (
    <details className="rounded-xl border border-border p-3" aria-label="Get brand from a website">
      <summary className="cursor-pointer text-sm font-medium">Get brand from a website</summary>
      <form onSubmit={find} className="space-y-2 mt-3">
        <label className="block text-sm" htmlFor="brand-url">Your company website</label>
        <div className="flex gap-2">
          <input id="brand-url" value={url} onChange={(e) => { setUrl(e.target.value); setProblem(null) }} aria-invalid={!!problem} aria-describedby={problem ? 'brand-url-problem' : undefined} placeholder="yourcompany.com" inputMode="url" autoComplete="url" className="min-w-0 flex-1 border border-border rounded-lg px-3 py-2 text-sm" />
          <button disabled={looking || !url.trim()} className="shrink-0 bg-primary text-white rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50">{looking ? 'Looking…' : 'Find brand'}</button>
        </div>
        {problem && <p id="brand-url-problem" role="alert" className="text-sm font-medium text-red-700">{problem}</p>}
        <p className="text-xs text-slate-500">We read the site's public colours, fonts and logo. Nothing is changed until you apply or save it.</p>
      </form>

      {found && (
        <section className="mt-3 space-y-3" aria-label="What we found">
          <div className="font-semibold truncate">{found.name ?? new URL(found.sourceUrl).hostname}</div>
          {found.confidence === 'low' && <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">We found few brand signals on this page (some sites build their look with scripts). Check the colours before applying.</p>}
          <label className={box}><input type="checkbox" checked={pick.colors} disabled={!found.colors.primary} onChange={(e) => setPick({ ...pick, colors: e.target.checked })} className="mt-1" />
            <span className="flex-1">Colours
              {found.colors.primary ? (
                <span className="flex items-center gap-3 mt-1.5">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">Main <input type="color" aria-label="Found main colour" value={primary} onChange={(e) => setPrimary(e.target.value.toUpperCase())} className="w-7 h-7 rounded border border-border p-0" /></label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">Accent <input type="color" aria-label="Found accent colour" value={accent} onChange={(e) => setAccent(e.target.value.toUpperCase())} className="w-7 h-7 rounded border border-border p-0" /></label>
                </span>
              ) : <span className="block text-xs text-slate-500">No brand colours found</span>}
              {found.colors.accentDerived && found.colors.primary && <span className="block text-xs text-slate-500 mt-1">The site uses one brand colour; the accent was chosen to go with it.</span>}
            </span>
          </label>
          <label className={box}><input type="checkbox" checked={pick.fonts} disabled={!found.fonts.heading} onChange={(e) => setPick({ ...pick, fonts: e.target.checked })} className="mt-1" />
            <span className="flex-1">Fonts
              {found.fonts.heading && found.fonts.body ? (
                <span className="block text-xs text-slate-600 mt-1">
                  Headings: <b>{found.fonts.heading.family}</b>{!found.fonts.heading.exact && <> (closest to {found.fonts.heading.original})</>}<br />
                  Text: <b>{found.fonts.body.family}</b>{!found.fonts.body.exact && <> (closest to {found.fonts.body.original})</>}
                </span>
              ) : <span className="block text-xs text-slate-500">No fonts found</span>}
            </span>
          </label>
          <label className={box}><input type="checkbox" checked={pick.logo} disabled={!found.logo} onChange={(e) => setPick({ ...pick, logo: e.target.checked })} className="mt-1" />
            <span className="flex-1">Logo
              {found.logo ? <img src={found.logo.url} alt="Logo found on the site" className="mt-1.5 h-10 max-w-[160px] object-contain bg-white border border-border rounded p-1" /> : <span className="block text-xs text-slate-500">No usable PNG or JPEG logo found</span>}
            </span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => { apply('Apply brand', (d) => C.applyBrand(d, withColours(found), pick)); setDone(true) }} disabled={nothing} className="flex-1 bg-foreground text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">Apply to this presentation</button>
            <button onClick={() => onSave(withColours(found))} disabled={busy || nothing} title={kits.length >= limit && sel ? 'Replaces what is in your selected kit' : undefined} className="flex-1 border border-border rounded-lg py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">{kits.length < limit ? 'Save as brand kit' : 'Update my kit'}</button>
          </div>
          {done && <p role="status" className="text-xs text-green-800">Applied to every slide. You can undo it with ⌘Z.</p>}
        </section>
      )}
    </details>
  )
}
