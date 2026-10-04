import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import type { ExportFormat, SlideElement } from '@prompttoppt/validation'
import { AiPanel } from '@/components/editor/AiPanel'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { ContextMenu, type MenuItem } from '@/components/editor/ContextMenu'
import { DeckRewriteDialog } from '@/components/editor/DeckRewriteDialog'
import { EditorCanvas } from '@/components/editor/EditorCanvas'
import { SlideRail } from '@/components/editor/SlideRail'
import { StyleDrawer } from '@/components/editor/StyleDrawer'
import { VersionsDialog } from '@/components/editor/VersionsDialog'
import { readBackup, useAutosave, type SaveStatus } from '@/editor/autosave'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { useFlag } from '@/lib/flags'
import { download, exportClient, type ClientFormat } from '@/lib/export'

const STICKERS = ['⭐', '✅', '💡', '🚀', '⚠️', '❤️', '🎯', '📈']
const STATUS: Record<SaveStatus, { text: string; cls: string }> = {
  saved: { text: 'Saved', cls: 'text-green-700' }, dirty: { text: 'Unsaved changes…', cls: 'text-slate-500' }, saving: { text: 'Saving…', cls: 'text-slate-500' },
  offline: { text: 'Offline — will sync', cls: 'text-amber-700' }, conflict: { text: 'Conflict', cls: 'text-red-700' }, error: { text: 'Could not save', cls: 'text-red-700' },
}
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
const tb = 'h-10 sm:h-9 px-3 shrink-0 rounded-lg text-sm font-medium hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1.5'

export function EditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { ent, upgrade } = useEntitlements()
  const maintenance = useFlag('maintenance_mode')
  const aiAvailable = useFlag('ai_assistant') && !maintenance
  const doc = useDoc((s) => s.doc)
  const revision = useDoc((s) => s.revision)
  const canUndo = useDoc((s) => s.past.length > 0)
  const canRedo = useDoc((s) => s.future.length > 0)
  const apply = useDoc((s) => s.apply)
  const { activeSlideId, setActiveSlide, select, edit, drawer, setDrawer, notesOpen, toggleNotes, setClipboard, imageDialog, openImageDialog, closeImageDialog } = useUi()
  const [load, setLoad] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [toast, setToast] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'insert' | 'more' } | null>(null)
  const [versions, setVersions] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  // `?new=1` (just created from a template) opens the "tell me what to put in your slides" dialog once; the assistant can also request a full rewrite
  const [rewrite, setRewrite] = useState<{ brief?: string; picturesOnly?: boolean } | null>(() => (searchParams.get('new') === '1' ? {} : null))
  const [exporting, setExporting] = useState<string | null>(null)

  // the export menu closes on Escape and on any click outside it
  useEffect(() => {
    if (!exportMenu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportMenu(false) }
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('[data-export-menu]')) setExportMenu(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [exportMenu])

  const flash = useCallback((t: string) => {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ── load (+ recover unsaved edits from a previous session if they're based on the current server revision)
  useEffect(() => {
    let off = false
    api.getPresentation(id).then((p) => {
      if (off) return
      useDoc.getState().load(p.document, p.revision)
      const backup = readBackup(id)
      if (backup && backup.revision === p.revision && JSON.stringify(backup.doc) !== JSON.stringify(p.document)) {
        useDoc.getState().replaceDoc(backup.doc, p.revision)
        flash('Recovered unsaved changes from your last session.')
      }
      setActiveSlide(useDoc.getState().doc!.slides[0]!.id)
      setLoad('ready')
    }).catch((e) => !off && setLoad(e instanceof ApiError && e.status === 404 ? 'missing' : 'error'))
    return () => {
      off = true
      useDoc.setState({ doc: null, past: [], future: [] })
    }
  }, [id, setActiveSlide, flash])

  const autosave = useAutosave(id, (d, r) => useDoc.getState().load(d, r))

  const slide = useMemo(() => doc?.slides.find((s) => s.id === activeSlideId) ?? doc?.slides[0] ?? null, [doc, activeSlideId])
  useEffect(() => {
    if (slide && slide.id !== activeSlideId) setActiveSlide(slide.id)
  }, [slide, activeSlideId, setActiveSlide])

  const watermark = ent?.features.watermark ?? false
  const requireAdvanced = useCallback(() => {
    if (ent?.features.advancedEditor) return true
    upgrade.show('Moving, resizing and formatting objects is part of the Advanced editor on the Pro plan. You can still edit text, reorder slides and change themes.')
    return false
  }, [ent, upgrade])

  // ── keyboard shortcuts
  useEffect(() => {
    if (load !== 'ready') return
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 's') { e.preventDefault(); void autosave.saveNow(true); flash('Version saved.'); return }
      if (typing(e.target)) return
      const st = useDoc.getState()
      const ui = useUi.getState()
      const sl = st.doc?.slides.find((s) => s.id === ui.activeSlideId)
      if (!sl) return
      const els = sl.elements.filter((x) => ui.selection.includes(x.id))
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return }
      if (mod && k === 'y') { e.preventDefault(); st.redo(); return }
      if (mod && k === 'c' && els.length) { e.preventDefault(); setClipboard(structuredClone(els) as SlideElement[]); return }
      if (mod && k === 'v' && ui.clipboard.length) { e.preventDefault(); if (!requireAdvanced()) return; let ids: string[] = []; st.apply('Paste', (d) => { ids = C.pasteElements(d, sl.id, ui.clipboard) }); select(ids); return }
      if (mod && k === 'd' && els.length) { e.preventDefault(); if (!requireAdvanced()) return; let ids: string[] = []; st.apply('Duplicate', (d) => { ids = C.duplicateElements(d, sl.id, els.map((x) => x.id)) }); select(ids); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && els.length) { e.preventDefault(); if (!requireAdvanced()) return; st.apply('Delete', (d) => C.deleteElements(d, sl.id, els.map((x) => x.id))); select([]); return }
      if (e.key.startsWith('Arrow') && els.length) {
        e.preventDefault()
        if (!requireAdvanced()) return
        const n = e.shiftKey ? 10 : 1
        const [dx, dy] = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key] ?? [0, 0]
        st.apply('Nudge', (d) => C.moveElements(d, sl.id, els.map((x) => x.id), dx!, dy!), { mergeKey: 'nudge' })
        return
      }
      if (e.key === 'Enter' && els.length === 1 && els[0]!.type === 'text' && !els[0]!.locked && !sl.locked) { e.preventDefault(); edit(els[0]!.id); return }
      if (e.key === 'Escape') { select([]); return }
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        const i = st.doc!.slides.findIndex((s) => s.id === sl.id)
        const next = st.doc!.slides[i + (e.key === 'PageDown' ? 1 : -1)]
        if (next) { e.preventDefault(); setActiveSlide(next.id) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [load, autosave, requireAdvanced, select, edit, setClipboard, setActiveSlide, flash])

  if (load === 'loading') return <div className="min-h-screen grid place-items-center text-muted">Loading…</div>
  if (load !== 'ready' || !doc || !slide) {
    return <div className="min-h-screen grid place-items-center text-center"><div><p className="font-bold mb-3">{load === 'missing' ? 'Presentation not found.' : 'Could not load the presentation.'}</p><Link to="/" className="text-primary font-semibold">Back to home</Link></div></div>
  }

  const addEl = (partial: Record<string, unknown>) => { if (!requireAdvanced()) return; const el = C.makeElement(partial); apply('Insert', (d) => C.addElement(d, slide.id, el)); select([el.id]) }
  const base = { id: '', rotation: 0, locked: false, zIndex: 0 }
  const insertItems: MenuItem[] = [
    { label: 'Text box', onClick: () => addEl({ ...base, id: crypto.randomUUID(), type: 'text', x: 200, y: 400, width: 700, height: 120, role: 'body', paragraphs: [{ runs: [{ text: 'Type here' }] }], fontSize: 44, align: 'left', color: 'textPrimary', valign: 'top' }) },
    { label: 'Rectangle', onClick: () => addEl({ ...base, id: crypto.randomUUID(), type: 'shape', shape: 'rect', x: 300, y: 300, width: 500, height: 300, fill: 'accent', radius: doc.theme.radius }) },
    { label: 'Circle', onClick: () => addEl({ ...base, id: crypto.randomUUID(), type: 'shape', shape: 'ellipse', x: 400, y: 300, width: 320, height: 320, fill: 'secondary', radius: 0 }) },
    { label: '✨ AI image…', onClick: () => openImageDialog() },
    { label: 'Image (set URL after)', onClick: () => addEl({ ...base, id: crypto.randomUUID(), type: 'image', x: 300, y: 250, width: 800, height: 450, alt: 'Image', fit: 'cover' }) },
    { type: 'emoji', label: 'Sticker', options: STICKERS, onPick: (emoji) => addEl({ ...base, id: crypto.randomUUID(), type: 'icon', x: 800, y: 300, width: 240, height: 240, name: emoji, color: 'primary' }) },
  ]
  const moreItems: MenuItem[] = [
    { label: slide.locked ? 'Unlock slide' : 'Lock slide', onClick: () => apply('Lock slide', (d) => C.setSlideLocked(d, slide.id, !slide.locked)) },
    { label: 'Speaker notes', onClick: () => toggleNotes(true) },
    { type: 'divider' },
    { label: 'Save version', hint: '⌘S', onClick: () => { void autosave.saveNow(true); flash('Version saved.') } },
    { label: 'Version history…', onClick: () => setVersions(true) },
    { type: 'divider' },
    { label: 'Delete presentation', danger: true, onClick: () => { if (confirm(`Delete "${doc.title}"? This can't be undone.`)) void api.deletePresentation(id).then(() => navigate('/')) } },
  ]

  async function doExport(format: ExportFormat) {
    setExportMenu(false)
    setExporting(`Preparing ${format.toUpperCase()}…`)
    try {
      await autosave.saveNow(false) // export what the user sees, not the last autosave
      const r = await api.requestExport(id, format) // the SERVER decides whether the plan allows it (and builds the PPTX)
      if (r.mode === 'file') download(r.blob, r.filename)
      else {
        const d = useDoc.getState().doc
        if (!d) throw new Error('no document')
        await exportClient(d, r.format as ClientFormat, (done, total) => setExporting(`Preparing ${format.toUpperCase()}… slide ${done} of ${total}`), (outcome) => void api.reportExport(r.eventId, outcome))
      }
      flash(`${format.toUpperCase()} downloaded.`)
    } catch (e) {
      if (isGateError(e)) upgrade.show(e.message)
      else flash('Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }
  const st = STATUS[autosave.status]

  return (
    <div className="h-screen flex flex-col bg-[#eeeeee]">
      <header className="h-14 bg-white border-b border-border flex items-center gap-2 sm:gap-3 px-3 sm:px-4 shrink-0">
        <Link to="/" aria-label="Home" className="font-bold text-lg w-8 h-9 grid place-items-center shrink-0">⌂</Link>
        <input aria-label="Presentation title" defaultValue={doc.title} key={doc.title} maxLength={200} onBlur={(e) => e.target.value.trim() !== doc.title && apply('Rename', (d) => C.setTitle(d, e.target.value))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="font-semibold min-w-0 flex-1 max-w-sm px-2 py-1 rounded-md hover:bg-slate-100 focus:bg-white focus:outline focus:outline-2 focus:outline-primary truncate" />
        <span role="status" aria-live="polite" title={autosave.message ?? undefined} className={`hidden sm:inline text-xs shrink-0 ${st.cls}`}>{st.text}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { void autosave.saveNow(); navigate(`/present/${id}`) }} className="h-9 px-3 rounded-lg text-sm border border-border hover:bg-slate-50 whitespace-nowrap">▷<span className="max-sm:sr-only"> Present</span></button>
          <div className="relative" data-export-menu>
            <button onClick={() => setExportMenu((v) => !v)} aria-haspopup="menu" aria-expanded={exportMenu} disabled={!!exporting} className="h-9 px-4 rounded-lg text-sm font-semibold bg-foreground text-white disabled:opacity-60">{exporting ? 'Exporting…' : 'Export'}</button>
            {exportMenu && (
              <div role="menu" className="absolute right-0 mt-2 w-44 bg-white border border-border rounded-xl shadow-lg p-1 z-30">
                {(['pptx', 'pdf', 'png', 'jpg', 'html'] as const).map((f) => (
                  <button key={f} role="menuitem" onClick={() => void doExport(f)} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-slate-100">{f.toUpperCase()}{ent && !ent.features.exportFormats.includes(f) && <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">PRO</span>}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {(autosave.status === 'conflict' || autosave.status === 'error' || autosave.status === 'offline') && autosave.message && (
        <div role="alert" className={`px-4 py-2 text-sm flex items-center gap-3 ${autosave.status === 'offline' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
          <span className="flex-1">{autosave.message}</span>
          {autosave.status === 'conflict' && (
            <>
              <button onClick={() => void autosave.resolve('reload')} className="font-semibold underline">Load the latest (discard my changes)</button>
              <button onClick={() => void autosave.resolve('overwrite')} className="font-semibold underline">Keep my changes (overwrite)</button>
            </>
          )}
        </div>
      )}

      <div className="flex-1 flex max-md:flex-col min-h-0 relative">
        <SlideRail doc={doc} watermark={watermark} />
        <main className="flex-1 min-w-0 flex flex-col relative">
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 pb-24">
            <div className="max-w-[1100px] mx-auto">
              <EditorCanvas slide={slide} theme={doc.theme} aspect={doc.aspectRatio} watermark={watermark} requireAdvanced={requireAdvanced} />
              {slide.locked && <p className="mt-2 text-xs text-slate-500">🔒 This slide is locked — unlock it from ⋮ to edit.</p>}
              {slide.validation.issues.length > 0 && (
                <ul className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">{slide.validation.issues.map((x, i) => <li key={i}>{x.severity === 'error' ? '⛔' : '⚠️'} {x.message}</li>)}</ul>
              )}
              <div className="mt-4">
                <button onClick={() => toggleNotes()} aria-expanded={notesOpen} className="text-sm font-medium text-slate-600">{notesOpen ? '▾' : '▸'} Speaker notes</button>
                {notesOpen && (
                  <textarea aria-label="Speaker notes" value={slide.speakerNotes} maxLength={5000} rows={4} placeholder="What you'll say on this slide…" onChange={(e) => apply('Speaker notes', (d) => C.setSpeakerNotes(d, slide.id, e.target.value), { mergeKey: `notes:${slide.id}` })} className="mt-2 w-full bg-white border border-border rounded-xl p-3 text-sm" />
                )}
              </div>
            </div>
          </div>
          <div role="toolbar" aria-label="Editor toolbar" className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100%-1rem)] overflow-x-auto flex items-center gap-0.5 sm:gap-1 bg-white border border-border rounded-2xl shadow-lg px-1.5 sm:px-2 py-1.5 z-20">
            <button className={tb} aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 330, kind: 'insert' }) }}>＋<span className="max-sm:sr-only"> Insert</span></button>
            <button className={`${tb} ${drawer === 'style' ? 'bg-slate-100' : ''}`} aria-pressed={drawer === 'style'} onClick={() => setDrawer('style')}>🎨<span className="max-sm:sr-only"> Style</span></button>
            <button className={`${tb} ${drawer === 'ai' ? 'bg-slate-100' : ''}`} aria-pressed={drawer === 'ai'} onClick={() => setDrawer('ai')}>✨<span className="max-sm:sr-only"> Edit with AI</span></button>
            <button className={tb} aria-label="More" aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 300, kind: 'more' }) }}>⋮</button>
            <span className="w-px h-6 bg-border mx-1" />
            <button className={tb} aria-label="Undo" disabled={!canUndo} onClick={() => useDoc.getState().undo()}>↶</button>
            <button className={tb} aria-label="Redo" disabled={!canRedo} onClick={() => useDoc.getState().redo()}>↷</button>
          </div>
        </main>
        {drawer === 'style' && <StyleDrawer doc={doc} slide={slide} onClose={() => setDrawer('style')} />}
        {drawer === 'ai' && !aiAvailable && (
          <aside aria-label="AI assistant" className="w-[360px] max-lg:fixed max-lg:z-40 max-lg:right-0 max-lg:top-14 max-lg:bottom-0 max-lg:shadow-2xl max-md:left-0 max-md:top-auto max-md:h-[60vh] max-md:rounded-t-2xl max-md:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border p-5 text-sm">
            <h2 className="font-semibold mb-2">AI is paused</h2>
            <p className="text-slate-600">{maintenance ? "We're doing some quick maintenance, so the AI assistant is paused for a short while. Your work is safe — please try again soon." : 'The AI assistant is switched off right now. You can keep editing by hand.'}</p>
          </aside>
        )}
        {drawer === 'ai' && aiAvailable && <AiPanel doc={doc} slide={slide} presentationId={id} onRewrite={(brief, picturesOnly) => setRewrite({ brief, ...(picturesOnly ? { picturesOnly } : {}) })} onClose={() => setDrawer('ai')} onBeforeSend={() => autosave.saveNow(false)} />}
      </div>

      {rewrite && load === 'ready' && (
        <DeckRewriteDialog
          presentationId={id} slideCount={doc.slides.length} autoBrief={rewrite.brief} picturesOnly={rewrite.picturesOnly}
          onClose={() => { setRewrite(null); if (searchParams.has('new')) setSearchParams({}, { replace: true }) }}
          onDone={(d, r) => {
            useDoc.getState().load(d, r)
            setActiveSlide(d.slides[0]!.id)
            setRewrite(null); setSearchParams({}, { replace: true })
            flash(rewrite?.picturesOnly ? 'New pictures are in. The previous version is saved in Version history.' : 'Your presentation is ready. The previous version is saved in Version history.')
          }}
        />
      )}
      {imageDialog && <ImageDialog key={imageDialog.elementId ?? 'new'} doc={doc} slide={slide} presentationId={id} request={imageDialog} onClose={closeImageDialog} />}
      {menu && <ContextMenu x={menu.x} y={Math.max(8, menu.y)} items={menu.kind === 'insert' ? insertItems : moreItems} onClose={() => setMenu(null)} />}
      {versions && <VersionsDialog id={id} revision={revision} onClose={() => setVersions(false)} onRestored={(d, r) => { useDoc.getState().load(d, r); setActiveSlide(d.slides[0]!.id) }} />}
      {exporting && <div role="status" className="fixed bottom-6 left-6 bg-foreground text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50">{exporting}</div>}
      {toast && <div role="status" className="fixed bottom-6 left-6 bg-foreground text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50">{toast}</div>}
    </div>
  )
}
