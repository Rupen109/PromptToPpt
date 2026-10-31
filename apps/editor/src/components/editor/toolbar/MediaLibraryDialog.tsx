import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Upload, X } from '@prompttoppt/ui/icons'
import { ApiError, type StockPhoto } from '@prompttoppt/api-client'
import { Portal } from '@/components/Portal'
import { api } from '@/lib/api'
import { useDialog } from '@/lib/useDialog'
import { GRADIENTS, MEDIA_CATEGORIES, cssGradient, gradientToFile, type GradientPreset } from './data'

export interface PickedMedia { kind: 'image'; url: string; alt: string; attribution?: { source: string; license: string; url?: string } }
export interface PickedGradient { kind: 'gradient'; gradient: GradientPreset }
type Tab = 'photos' | 'mine' | 'library'
type Selection = { kind: 'stock'; photo: StockPhoto } | { kind: 'mine'; id: string; url: string; name: string } | { kind: 'lib'; url: string; alt: string } | { kind: 'gradient'; gradient: GradientPreset }

const TAB_LABEL: Record<Tab, string> = { photos: 'Photos', mine: 'My uploads', library: 'Template photos' }

/**
 * Media library (reference screenshot 4): free photo search with quick categories, the built-in gradients, the person's own uploads and the pictures that ship with
 * the templates. "Select Image" copies the picture to our storage and hands it back. As a slide BACKGROUND a gradient is used directly; when INSERTED it becomes a picture.
 */
export function MediaLibraryDialog({ deckId, mode, onPick, onClose }: { deckId: string; mode: 'background' | 'insert'; onPick: (m: PickedMedia | PickedGradient) => void; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const [tab, setTab] = useState<Tab>('photos')
  const [cat, setCat] = useState<string>('gradient')
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<StockPhoto[]>([])
  const [more, setMore] = useState<{ q: string; page: number } | null>(null)
  const [mine, setMine] = useState<{ id: string; url: string; name: string }[] | null>(null)
  const [lib, setLib] = useState<{ key: string; url: string; alt: string }[] | null>(null)
  const [libQ, setLibQ] = useState('')
  const [sel, setSel] = useState<Selection | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const fail = (e: unknown, fallback: string) => setError(e instanceof ApiError ? e.message : fallback)

  const search = useCallback(async (q: string, page = 1) => {
    setError(null); setBusy('search')
    try {
      const r = await api.searchStock(q, page)
      setPhotos((p) => (page === 1 ? r.photos : [...p, ...r.photos]))
      setMore(r.hasMore ? { q, page: page + 1 } : null)
      if (page === 1 && !r.photos.length) setError('No pictures found. Try another word.')
    } catch (e) { fail(e, 'Photo search failed. Please try again.') } finally { setBusy(null) }
  }, [])

  useEffect(() => { if (tab === 'mine' && !mine) api.myUploads().then((r) => setMine(r.items)).catch((e) => fail(e, 'Could not load your uploads.')) }, [tab, mine])
  useEffect(() => { if (tab === 'library') api.templateLibrary(libQ).then((r) => setLib(r.items)).catch((e) => fail(e, 'Could not load the template pictures.')) }, [tab, libQ])

  const pickCategory = (id: string) => {
    setCat(id); setSel(null); setError(null)
    const c = MEDIA_CATEGORIES.find((x) => x.id === id)
    if (c && c.id !== 'gradient') { setText(''); void search(c.query) }
  }

  async function addUpload(f: File) {
    setError(null); setBusy('upload')
    try {
      const r = await api.uploadImage(deckId, f)
      setMine((m) => [{ id: r.assetId, url: r.url, name: r.name }, ...(m ?? [])])
      setSel({ kind: 'mine', id: r.assetId, url: r.url, name: r.name })
    } catch (e) { fail(e, 'Could not add that picture.') } finally { setBusy(null) }
  }
  async function removeUpload(id: string) {
    try { await api.deleteUpload(id); setMine((m) => (m ?? []).filter((x) => x.id !== id)); if (sel?.kind === 'mine' && sel.id === id) setSel(null) } catch (e) { fail(e, 'Could not delete that picture.') }
  }

  async function confirm() {
    if (!sel) return
    setError(null); setBusy('select')
    try {
      if (sel.kind === 'gradient') {
        if (mode === 'background') onPick({ kind: 'gradient', gradient: sel.gradient })
        else { const r = await api.uploadImage(deckId, await gradientToFile(sel.gradient)); onPick({ kind: 'image', url: r.url, alt: `${sel.gradient.name} gradient` }) }
      } else if (sel.kind === 'stock') {
        const r = await api.useStockPhoto(deckId, sel.photo)
        onPick({ kind: 'image', url: r.url, alt: r.alt || sel.photo.alt || 'Photo', attribution: r.attribution })
      } else if (sel.kind === 'mine') onPick({ kind: 'image', url: sel.url, alt: sel.name })
      else onPick({ kind: 'image', url: sel.url, alt: sel.alt })
    } catch (e) { fail(e, 'Could not use that picture. Please try another.') } finally { setBusy(null) }
  }

  const tile = (key: string, selected: boolean, onClick: () => void, onDouble: () => void, children: React.ReactNode, label: string) => (
    <button key={key} type="button" aria-label={label} aria-pressed={selected} onClick={onClick} onDoubleClick={onDouble} className={`relative aspect-video rounded-lg overflow-hidden border-2 bg-slate-100 ${selected ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-slate-300'}`}>{children}</button>
  )

  return (
    <Portal><div className="fixed inset-0 z-[70] bg-black/40 grid place-items-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Media library" className="bg-white rounded-2xl w-full max-w-4xl h-[min(86vh,720px)] shadow-xl outline-none flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="font-heading font-bold text-xl">Media library</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-500"><X aria-hidden size={20} /></button>
        </div>
        <div role="tablist" aria-label="Media sources" className="flex gap-1 px-5 mt-3 border-b border-border">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setSel(null); setError(null) }} className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-primary text-primary' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{TAB_LABEL[t]}</button>)}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {tab === 'photos' && (
            <>
              <form onSubmit={(e) => { e.preventDefault(); if (text.trim().length >= 2) { setCat(''); setSel(null); void search(text.trim()) } }} className="relative mb-3">
                <Search aria-hidden size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input aria-label="Search free photos" placeholder="Search free photos (Unsplash)…" value={text} onChange={(e) => setText(e.target.value)} className="w-full h-10 pl-9 pr-3 rounded-lg border border-border" />
              </form>
              <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Categories">
                {MEDIA_CATEGORIES.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => pickCategory(c.id)} className={`px-3 h-8 rounded-full text-sm border ${cat === c.id ? 'bg-primary text-white border-primary' : 'border-border hover:bg-slate-50'}`}>{c.label}</button>)}
              </div>
              {cat === 'gradient' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="gradient-grid">
                  {GRADIENTS.map((g) => tile(g.id, sel?.kind === 'gradient' && sel.gradient.id === g.id, () => setSel({ kind: 'gradient', gradient: g }), () => { setSel({ kind: 'gradient', gradient: g }) }, <span aria-hidden className="absolute inset-0" style={{ background: cssGradient(g) }} />, `${g.name} gradient`))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="photo-grid">
                    {photos.map((p) => tile(`${p.provider}-${p.id}`, sel?.kind === 'stock' && sel.photo.id === p.id, () => setSel({ kind: 'stock', photo: p }), () => setSel({ kind: 'stock', photo: p }), <img src={p.thumb} alt={p.alt || 'Photo'} loading="lazy" className="w-full h-full object-cover" />, p.alt || `Photo by ${p.author}`))}
                  </div>
                  {busy === 'search' && <p className="text-sm text-slate-500 mt-3">Searching…</p>}
                  {!busy && !photos.length && !error && <p className="text-sm text-slate-500">Pick a category or search for a word to see free photos.</p>}
                  {more && !busy && <button onClick={() => void search(more.q, more.page)} className="mt-4 h-9 px-4 rounded-lg border border-border text-sm hover:bg-slate-50">Load more</button>}
                  {sel?.kind === 'stock' && <p className="text-xs text-slate-500 mt-3">{sel.photo.attribution.source}. Free to use under the {sel.photo.attribution.license}.</p>}
                </>
              )}
            </>
          )}
          {tab === 'mine' && (
            <>
              <input ref={file} type="file" accept="image/png,image/jpeg" hidden data-testid="library-upload" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addUpload(f) }} />
              <button onClick={() => file.current?.click()} disabled={busy === 'upload'} className="mb-4 h-10 px-4 rounded-lg border border-dashed border-slate-400 text-sm font-medium inline-flex items-center gap-2 hover:bg-slate-50 disabled:opacity-60"><Upload aria-hidden size={16} />{busy === 'upload' ? 'Uploading…' : 'Upload from computer'}</button>
              <span className="ml-3 text-xs text-slate-500">PNG or JPEG, up to 8 MB</span>
              {mine && !mine.length && <p className="text-sm text-slate-500">Pictures you upload show up here, ready to use again.</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(mine ?? []).map((m) => (
                  <div key={m.id} className="relative group">
                    {tile(m.id, sel?.kind === 'mine' && sel.id === m.id, () => setSel({ kind: 'mine', id: m.id, url: m.url, name: m.name }), () => setSel({ kind: 'mine', id: m.id, url: m.url, name: m.name }), <img src={m.url} alt={m.name} loading="lazy" className="w-full h-full object-cover" />, m.name)}
                    <button type="button" aria-label={`Delete ${m.name}`} onClick={() => void removeUpload(m.id)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 focus:opacity-100"><X aria-hidden size={14} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === 'library' && (
            <>
              <div className="relative mb-4"><Search aria-hidden size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Search template photos" placeholder="Search template photos…" value={libQ} onChange={(e) => setLibQ(e.target.value)} className="w-full h-10 pl-9 pr-3 rounded-lg border border-border" /></div>
              {lib && !lib.length && <p className="text-sm text-slate-500">No template photos match. Try another word.</p>}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(lib ?? []).map((l) => tile(l.key, sel?.kind === 'lib' && sel.url === l.url, () => setSel({ kind: 'lib', url: l.url, alt: l.alt }), () => setSel({ kind: 'lib', url: l.url, alt: l.alt }), <img src={l.url} alt={l.alt} loading="lazy" className="w-full h-full object-cover" />, l.alt))}
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center gap-3">
          {error && <p role="alert" className="text-sm text-red-700 flex-1">{error}</p>}
          {!error && <span className="flex-1 text-xs text-slate-500">{mode === 'background' ? 'The picture becomes the background of this slide.' : 'The picture is added to this slide.'}</span>}
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-border text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={() => void confirm()} disabled={!sel || !!busy} className="h-10 px-5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50">{busy === 'select' ? 'Adding…' : 'Select Image'}</button>
        </div>
      </div>
    </div></Portal>
  )
}
