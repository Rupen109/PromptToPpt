import { AccountButton } from '@/components/AccountButton'
import { AlertTriangle, Ban, ChevronDown, ChevronRight, Home, Lock, MessageSquare, MoreVertical, Palette, Play, Sparkles, Users } from '@prompttoppt/ui/icons'
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import { describeSlides, type ExportFormat } from '@prompttoppt/validation'
import { ExportMenu } from '@/components/editor/ExportMenu'
import { AiPanel } from '@/components/editor/AiPanel'
import { CommentsPanel } from '@/components/editor/CommentsPanel'
import { ImageDialog } from '@/components/editor/ImageDialog'
import { backgroundRemovalProvider } from '@/lib/bgremoval/providers'
import { ContextMenu, type MenuItem } from '@/components/editor/ContextMenu'
import { DeckRewriteDialog } from '@/components/editor/DeckRewriteDialog'
import { EditorCanvas } from '@/components/editor/EditorCanvas'
import { PeerAvatars } from '@/components/editor/PeerAvatars'
import { RemixDialog } from '@/components/editor/RemixDialog'
import { ShareDialog } from '@/components/editor/ShareDialog'
import { SlideRail } from '@/components/editor/SlideRail'
import { StyleDrawer } from '@/components/editor/StyleDrawer'
import { lostEffects } from '@/editor/effect-commands'
import { AnimationPane } from '@/components/editor/animation/AnimationPane'
import { AnimationsRibbon } from '@/components/editor/animation/AnimationsRibbon'
import { MorphPanel } from '@/components/editor/animation/MorphPanel'
import { SelectionPane } from '@/components/editor/animation/SelectionPane'
import { TransitionsRibbon } from '@/components/editor/animation/TransitionsRibbon'
import { VersionsDialog } from '@/components/editor/VersionsDialog'
import { TopToolbar } from '@/components/editor/toolbar/TopToolbar'
import { TableDialog } from '@/components/editor/toolbar/TableDialog'
import { ChartDialog } from '@/components/editor/toolbar/ChartDialog'
import { CropDialog } from '@/components/editor/toolbar/CropDialog'
import { readBackup, useAutosave, type SaveStatus } from '@/editor/autosave'
import * as C from '@/editor/commands'
import * as T from '@/editor/toolbar-commands'
import * as A from '@/editor/object-actions'
import { openCount, unreadCount, useComments } from '@/editor/comments'
import { useLive, useLiveSync } from '@/editor/live'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useGrid } from '@/editor/grid'
import { api } from '@/lib/api'
import { useDeckBuild } from '@/lib/useDeckBuild'
import { PRESENT_LOCKED, useEntitlements } from '@/lib/entitlements'
import { useFlag } from '@/lib/flags'
import { download, exportClient, type ClientFormat } from '@/lib/export'
import { SlideLoader } from '../components/SlideLoader'

/** Development only: the background removal dialog is not even part of a production build (`import.meta.env.DEV` is false there and the branch is dropped). */
const BackgroundRemovalDialog = import.meta.env.DEV ? lazy(() => import('@/components/editor/bgremoval/BackgroundRemovalDialog').then((m) => ({ default: m.BackgroundRemovalDialog }))) : null

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
  const apply = useDoc((s) => s.apply)
  const { activeSlideId, setActiveSlide, select, edit, drawer, ribbon, setDrawer, notesOpen, toggleNotes, imageDialog, openImageDialog, closeImageDialog, bgRemoval, closeBgRemoval, tableEditId, editTable, chartEditId, editChart, cropId, openCrop } = useUi()
  const [load, setLoad] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [toast, setToast] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; kind: 'insert' | 'more' } | null>(null)
  const [remix, setRemix] = useState(false)
  const [versions, setVersions] = useState(false)
  const exportMenu = useUi((u) => u.exportMenu)
  const setExportMenu = (open: boolean) => useUi.getState().openExport(open ? 'all' : null)
  const [role, setRole] = useState<'owner' | 'editor' | 'viewer'>('owner')
  const viewer = role === 'viewer'
  const [shareOpen, setShareOpen] = useState(false)
  const [shareEmail, setShareEmail] = useState<string | undefined>(undefined)
  const [shareRole, setShareRole] = useState<'editor' | 'viewer'>('editor')
  const [searchParams, setSearchParams] = useSearchParams()
  // `?new=1` (just created from a template) opens the "tell me what to put in your slides" dialog once; the assistant can also request a full rewrite
  const [rewrite, setRewrite] = useState<{ brief?: string; picturesOnly?: boolean } | null>(() => (searchParams.get('new') === '1' ? {} : null))
  const [exporting, setExporting] = useState<string | null>(null)

  // the export menu closes on Escape and on any click outside it
  useEffect(() => {
    if (!exportMenu) return
    const close = () => useUi.getState().openExport(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.('[data-export-menu]')) close() }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [exportMenu])

  const flash = useCallback((t: string) => {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }, [])

  // A re-layout, a design swap or an AI rewrite draws a slide again: animations follow their objects where the new slide has a successor (effect-commands remapEffects); say so when some could not.
  useEffect(() => {
    let prev = useDoc.getState()
    return useDoc.subscribe((st) => {
      if (st.past.length > prev.past.length && st.doc && prev.doc && st.doc !== prev.doc) {
        const n = lostEffects(prev.doc, st.doc)
        if (n > 0) flash(`${n} animation${n > 1 ? 's' : ''} could not be kept: the slide was redrawn and the object ${n > 1 ? 'they were' : 'it was'} on is gone. Undo (Ctrl+Z) brings ${n > 1 ? 'them' : 'it'} back.`)
      }
      prev = st
    })
  }, [flash])

  // ── the owner changed what I may do (edit ↔ view and comment): read my access again. Becoming a viewer drops unsaved changes (the server would refuse them) and says so.
  const accessSeq = useLive((s) => s.accessSeq)
  useEffect(() => {
    if (!accessSeq) return
    let off = false
    api.getPresentation(id).then((p) => {
      if (off) return
      const nowViewer = p.role === 'viewer'
      setRole(p.role ?? 'owner')
      if (nowViewer) { useDoc.getState().setReadOnly(true); useDoc.getState().adoptRemote(p.document, p.revision); flash('The owner changed your access: you can now view and comment. Changes you had not saved yet were not kept.') }
      else { useDoc.getState().setReadOnly(false); flash('The owner gave you edit access: you can now change this presentation.') }
    }).catch(() => {})
    return () => { off = true }
  }, [accessSeq, id, flash])

  // ── load (+ recover unsaved edits from a previous session if they're based on the current server revision)
  useEffect(() => {
    let off = false
    api.getPresentation(id).then((p) => {
      if (off) return
      setRole(p.role ?? 'owner')
      useUi.setState({ canExport: (p.role ?? 'owner') === 'owner' }) // only the owner exports (the slide menu offers "Download this slide" to the owner only)
      useDoc.getState().load(p.document, p.revision)
      // a viewer's copy refuses every change (the server refuses their saves too); they look, present and comment
      useDoc.getState().setReadOnly(p.role === 'viewer')
      const backup = p.role === 'viewer' ? null : readBackup(id)
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
  // live editing: presence + "someone saved" nudges. Works for the owner too, whenever anyone else is in the deck.
  useLiveSync(id, load === 'ready', autosave.pull)
  // a deck that is still being written: its slides arrive one after another; this follows the job until the last one lands
  const writing = doc ? doc.slides.filter((s) => s.writing).length : 0
  useDeckBuild(id, load === 'ready' ? writing : 0, autosave.pull, flash)
  const liveEnded = useLive((s) => s.ended)
  // comments: read when the deck opens and when the tab regains focus. While the live channel is connected it announces every change instantly,
  // so the once-a-minute fallback read only runs while that channel is down
  useEffect(() => {
    if (load !== 'ready') return
    useComments.getState().start(id)
    const again = () => useComments.getState().refresh()
    const iv = setInterval(() => { if (!useLive.getState().connected) again() }, 60_000); window.addEventListener('focus', again)
    return () => { clearInterval(iv); window.removeEventListener('focus', again); useComments.getState().stop() }
  }, [id, load])
  const cThreads = useComments((s) => s.threads)
  const cSeen = useComments((s) => s.seenAt)
  useEffect(() => useLive.subscribe((s) => { if (s.notice) { flash(s.notice); useLive.setState({ notice: null }) } }), [flash])
  // after a collaborator's version is merged in, drop selection / text editing of things that no longer exist
  useEffect(() => {
    const unsub = useDoc.subscribe((s, prev) => {
      if (s.doc === prev.doc || !s.doc) return
      const ui = useUi.getState()
      const sl = s.doc.slides.find((x) => x.id === ui.activeSlideId)
      if (!sl) return
      const ids = new Set(sl.elements.map((e) => e.id))
      if (ui.editingId && !ids.has(ui.editingId)) useUi.getState().edit(null)
      if (ui.selection.some((x) => !ids.has(x))) useUi.getState().select(ui.selection.filter((x) => ids.has(x)))
    })
    return unsub
  }, [])

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
      // the grid on / off (PowerPoint's Shift+F9)
      if (e.shiftKey && e.key === 'F9') { e.preventDefault(); const g = useGrid.getState(); g.set({ show: !g.show }); return }
      // the Animation pane, Selection pane and effect gallery use the arrow and Delete keys themselves; only undo and redo still reach the deck from there
      const own = e.target instanceof HTMLElement && !!e.target.closest('[data-own-keys]')
      if (own && !(mod && (k === 'z' || k === 'y'))) return
      if (typing(e.target)) return
      const st = useDoc.getState()
      const ui = useUi.getState()
      const sl = st.doc?.slides.find((s) => s.id === ui.activeSlideId)
      if (!sl) return
      const els = sl.elements.filter((x) => ui.selection.includes(x.id))
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return }
      if (mod && k === 'y') { e.preventDefault(); st.redo(); return }
      // the same actions as the right-click menu (editor/object-actions.ts): one implementation each
      if (mod && k === 'c' && els.length) { e.preventDefault(); A.copySelection(); return }
      if (mod && k === 'x' && els.length) { e.preventDefault(); A.cut(requireAdvanced); return }
      if (mod && k === 'v' && ui.clipboard.length) { e.preventDefault(); A.paste(requireAdvanced); return }
      if (mod && k === 'd' && els.length) { e.preventDefault(); A.duplicate(requireAdvanced); return }
      if (mod && k === 'a') { e.preventDefault(); A.selectAll(); return }
      if (mod && k === 'g' && els.length) { e.preventDefault(); if (e.shiftKey) A.ungroup(requireAdvanced); else A.group(requireAdvanced); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && els.length) { e.preventDefault(); A.remove(requireAdvanced); return }
      // order: Ctrl+] / Ctrl+[ one step, with Shift all the way (PowerPoint's keys; e.code, so Shift turning ] into } does not matter)
      if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && els.length) { e.preventDefault(); A.layer(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'up') : (e.shiftKey ? 'back' : 'down'), requireAdvanced); return }
      // turn: Alt+Left / Alt+Right by 15°, with Shift by 1° (PowerPoint's keys)
      if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && els.length) { e.preventDefault(); const r = A.rotate({ by: (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 15) }, requireAdvanced); if (!r.ok && r.why) flash(r.why); return }
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
  }, [load, autosave, requireAdvanced, select, edit, setActiveSlide, flash])

  if (load === 'loading') return <SlideLoader fullScreen size="lg" label="Opening your presentation" />
  if (load !== 'ready' || !doc || !slide) {
    return <div className="min-h-screen grid place-items-center text-center"><div><p className="font-bold mb-3">{load === 'missing' ? 'Presentation not found.' : 'Could not load the presentation.'}</p><Link to="/" className="text-primary font-semibold">Back to home</Link></div></div>
  }

  // the same commands as the top toolbar (one way to insert: the free spot nearest the middle, an empty text box with an editor-only prompt)
  const insert = (label: string, make: (d: C.D) => string | null, thenEdit = false) => { if (!requireAdvanced()) return; let id: string | null = null; apply(label, (d) => { id = make(d) }); if (id) { select([id]); if (thenEdit) edit(id) } }
  const insertItems: MenuItem[] = [
    { label: 'Text box', onClick: () => insert('Add text', (d) => T.addTextBox(d, slide.id), true) },
    { label: 'Rectangle', onClick: () => insert('Add shape', (d) => T.addShape(d, slide.id, 'rect')) },
    { label: 'Circle', onClick: () => insert('Add shape', (d) => T.addShape(d, slide.id, 'ellipse')) },
    { label: 'AI image…', onClick: () => openImageDialog() },
    { label: 'Image (set URL after)', onClick: () => insert('Insert', (d) => T.addImageFrame(d, slide.id)) },
  ]
  const moreItems: MenuItem[] = [
    { label: slide.locked ? 'Unlock slide' : 'Lock slide', onClick: () => apply('Lock slide', (d) => C.setSlideLocked(d, slide.id, !slide.locked)) },
    { label: 'Speaker notes', onClick: () => toggleNotes(true) },
    { type: 'divider' },
    { label: 'Save version', hint: '⌘S', onClick: () => { void autosave.saveNow(true); flash('Version saved.') } },
    { label: 'Version history…', onClick: () => setVersions(true) },
    { type: 'divider' },
    ...(role === 'owner' ? [{ label: 'Duplicate presentation', onClick: () => { void autosave.saveNow(false).catch(() => {}).then(() => api.duplicatePresentation(id)).then((r) => { navigate(`/edit/${r.id}`); flash('Copy created.') }).catch((e) => (isGateError(e) ? upgrade.show(e.message) : flash(e instanceof ApiError ? e.message : 'Could not copy the presentation.'))) } },
    { label: 'Remix this presentation…', onClick: () => setRemix(true) }] as MenuItem[] : []),
    { type: 'divider' },
    { label: 'Delete presentation', danger: true, onClick: () => { if (confirm(`Delete "${doc.title}"? This can't be undone.`)) void api.deletePresentation(id).then(() => navigate('/')) } },
  ]

  // Present mode belongs to the paid plans, like export (the Starter plan has no export formats)
  const canPresent = !ent || ent.features.livePreview

  /** `slideIds`: only these slides ("This slide", "1-3, 5", or the slides the assistant prepared); absent = the whole deck */
  async function doExport(format: ExportFormat, slideIds?: string[]) {
    setExportMenu(false)
    const d0 = useDoc.getState().doc
    // the slides chosen must still be there (the assistant's button may be pressed after slides were deleted): never a silently smaller file
    if (slideIds && d0 && slideIds.some((sid) => !d0.slides.some((s) => s.id === sid))) { flash('One of those slides is no longer in the presentation. Choose the slides again.'); return }
    const part = slideIds && d0 && slideIds.length < d0.slides.length ? ` (${describeSlides(slideIds.map((sid) => d0.slides.findIndex((s) => s.id === sid) + 1), d0.slides.length)})` : ''
    setExporting(`Preparing ${format.toUpperCase()}${part}…`)
    try {
      await autosave.saveNow(false) // export what the user sees, not the last autosave
      const r = await api.requestExport(id, format, slideIds) // the SERVER decides whether the plan allows it (and builds the PPTX)
      if (r.mode === 'file') download(r.blob, r.filename)
      else {
        const d = useDoc.getState().doc
        if (!d) throw new Error('no document')
        await exportClient(d, r.format as ClientFormat, (done, total) => setExporting(`Preparing ${format.toUpperCase()}${part}… slide ${done} of ${total}`), (outcome) => void api.reportExport(r.eventId, outcome), slideIds)
      }
      flash(`${format.toUpperCase()}${part} downloaded.`)
    } catch (e) {
      if (isGateError(e)) upgrade.show(e.message)
      else if (e instanceof ApiError && e.code === 'SLIDES_GONE') flash(e.message)
      else flash('Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }
  const st = STATUS[autosave.status]

  return (
    <div className="h-screen flex flex-col bg-[#eeeeee]">
      <header className="h-14 bg-white border-b border-border flex items-center gap-2 sm:gap-3 px-3 sm:px-4 shrink-0">
        <Link to="/" aria-label="Home" className="font-bold text-lg w-8 h-9 grid place-items-center shrink-0"><Home aria-hidden size={20} /></Link>
        <input aria-label="Presentation title" readOnly={viewer} defaultValue={doc.title} key={doc.title} maxLength={200} onBlur={(e) => e.target.value.trim() !== doc.title && apply('Rename', (d) => C.setTitle(d, e.target.value))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ width: `${Math.min(Math.max(doc.title.length, 14) + 4, 44)}ch` }} className="font-semibold min-w-0 max-w-[45vw] h-9 px-3 rounded-lg bg-slate-100 border border-transparent hover:border-slate-300 focus:bg-white focus:border-primary focus:outline focus:outline-2 focus:outline-primary/30 truncate" />
        <span role="status" aria-live="polite" title={autosave.message ?? undefined} className={`hidden sm:inline text-xs shrink-0 ${st.cls}`}>{st.text}</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { if (!canPresent) return upgrade.show(PRESENT_LOCKED); void autosave.saveNow(); navigate(`/present/${id}`) }} className="h-9 px-3 rounded-lg text-sm border border-border hover:bg-slate-50 whitespace-nowrap inline-flex items-center gap-1.5"><Play aria-hidden size={16} /><span className="max-sm:sr-only">Present</span></button>
          <PeerAvatars />
          {role === 'owner' && <button onClick={() => setShareOpen(true)} className="h-9 px-3 rounded-lg text-sm font-semibold border border-border hover:bg-slate-50 whitespace-nowrap inline-flex items-center gap-1.5"><Users aria-hidden size={16} /><span className="max-sm:sr-only">Share</span></button>}
          {viewer && <span data-testid="view-only" title="You were invited to view this presentation: you can look at it, present it and comment. Ask its owner for edit access." className="text-xs rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 font-semibold whitespace-nowrap">View only</span>}
          {role === 'editor' && <span title="You were invited to edit this presentation. The AI uses the owner's credits; only the owner can export or share." className="hidden sm:inline text-xs rounded-full bg-amber-100 text-amber-900 px-2.5 py-1 whitespace-nowrap">Collaborating</span>}
          {role === 'owner' && <div className="relative" data-export-menu>
            <button onClick={() => setExportMenu(!exportMenu)} aria-haspopup="dialog" aria-expanded={!!exportMenu} disabled={!!exporting} className="h-9 px-4 rounded-lg text-sm font-semibold bg-foreground text-white disabled:opacity-60">{exporting ? 'Exporting…' : 'Export'}</button>
            {exportMenu && (
              <ExportMenu key={exportMenu.scope} total={doc.slides.length} current={Math.max(1, doc.slides.findIndex((s) => s.id === slide.id) + 1)} initial={exportMenu.scope} allowed={ent ? ent.features.exportFormats : null}
                onExport={(f, numbers) => void doExport(f, numbers ? numbers.map((n) => doc.slides[n - 1]!.id) : undefined)} />
            )}
          </div>}
          <AccountButton />
        </div>
      </header>
      {writing > 0 && (
        <div role="status" className="px-4 py-2 text-sm bg-primary/10 text-primary font-medium flex items-center gap-2"><Sparkles aria-hidden size={16} className="animate-pulse" />Writing your presentation: {doc.slides.length - writing} of {doc.slides.length} slides ready. Finished slides can be edited now.</div>
      )}
      {!viewer && <TopToolbar doc={doc} slide={slide} presentationId={id} requireAdvanced={requireAdvanced} onHistory={() => setVersions(true)} flash={flash} />}
      {!viewer && ribbon === 'animations' && <AnimationsRibbon doc={doc} slide={slide} />}
      {!viewer && ribbon === 'transitions' && <TransitionsRibbon doc={doc} slide={slide} />}

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

      {liveEnded && (
        <div role="alert" className="px-4 py-2 text-sm bg-red-50 text-red-800 flex items-center gap-3">
          <span className="flex-1">Your access to this presentation has ended. Your last changes are saved.</span>
          <Link to="/" className="font-semibold underline">Back to my presentations</Link>
        </div>
      )}
      <div className="flex-1 flex max-md:flex-col min-h-0 relative">
        <SlideRail doc={doc} watermark={watermark} />
        <main className="flex-1 min-w-0 flex flex-col relative">
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 pb-24">
            <div className="max-w-[1100px] mx-auto">
              <EditorCanvas slide={slide} theme={doc.theme} aspect={doc.aspectRatio} watermark={watermark} requireAdvanced={requireAdvanced} />
              {slide.locked && <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5"><Lock aria-hidden size={14} className="shrink-0" />This slide is locked — unlock it from the More menu to edit.</p>}
              {slide.validation.issues.length > 0 && (
                <ul className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">{slide.validation.issues.map((x, i) => <li key={i} className="flex items-start gap-1.5">{x.severity === 'error' ? <Ban aria-hidden size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle aria-hidden size={14} className="mt-0.5 shrink-0" />}{x.message}</li>)}</ul>
              )}
              <div className="mt-4">
                <button onClick={() => toggleNotes()} aria-expanded={notesOpen} className="text-sm font-medium text-slate-600 inline-flex items-center gap-1">{notesOpen ? <ChevronDown aria-hidden size={16} /> : <ChevronRight aria-hidden size={16} />} Speaker notes</button>
                {notesOpen && (
                  <textarea aria-label="Speaker notes" readOnly={viewer} value={slide.speakerNotes} maxLength={5000} rows={4} placeholder="What you'll say on this slide…" onChange={(e) => apply('Speaker notes', (d) => C.setSpeakerNotes(d, slide.id, e.target.value), { mergeKey: `notes:${slide.id}` })} className="mt-2 w-full bg-white border border-border rounded-xl p-3 text-sm" />
                )}
              </div>
            </div>
          </div>
          <div role="toolbar" aria-label="Editor toolbar" data-floating-dock className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 max-w-[calc(100%-1rem)] overflow-x-auto flex items-center gap-0.5 sm:gap-1 bg-white border border-border rounded-2xl shadow-lg px-1.5 sm:px-2 py-1.5 z-20">
            {!viewer && <button className={tb} aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 330, kind: 'insert' }) }}>＋<span className="max-sm:sr-only"> Insert</span></button>}
            {!viewer && <button className={`${tb} ${drawer === 'style' ? 'bg-slate-100' : ''}`} aria-pressed={drawer === 'style'} onClick={() => setDrawer('style')}><Palette aria-hidden size={16} /><span className="max-sm:sr-only">Style</span></button>}
            {!viewer && <button className={`${tb} ${drawer === 'ai' ? 'bg-slate-100' : ''}`} aria-pressed={drawer === 'ai'} onClick={() => setDrawer('ai')}><Sparkles aria-hidden size={16} /><span className="max-sm:sr-only">Edit with AI</span></button>}
            <button className={`${tb} relative ${drawer === 'comments' ? 'bg-slate-100' : ''}`} aria-pressed={drawer === 'comments'} aria-label={`Comments${openCount(cThreads) ? `, ${openCount(cThreads)} open` : ''}${unreadCount(cThreads, cSeen) ? ', unread' : ''}`} onClick={() => setDrawer('comments')}><MessageSquare aria-hidden size={16} /><span className="max-sm:sr-only">Comments</span>{openCount(cThreads) > 0 && <span data-testid="comments-count" className="ml-1 text-[11px] font-bold bg-primary text-white rounded-full px-1.5">{openCount(cThreads)}</span>}{unreadCount(cThreads, cSeen) > 0 && drawer !== 'comments' && <i data-testid="comments-unread" aria-hidden className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />}</button>
            <button className={tb} aria-label="More" aria-haspopup="menu" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 300, kind: 'more' }) }}><MoreVertical aria-hidden size={18} /></button>
          </div>
        </main>
        {drawer === 'comments' && <CommentsPanel doc={doc} slideId={slide.id} deckId={id} role={role} onClose={() => setDrawer('comments')} />}
        {!viewer && drawer === 'animations' && <AnimationPane doc={doc} slide={slide} onClose={() => setDrawer('animations')} />}
        {drawer === 'selection' && <SelectionPane slide={slide} onClose={() => setDrawer('selection')} />}
        {!viewer && drawer === 'morph' && <MorphPanel doc={doc} slide={slide} onClose={() => setDrawer('morph')} />}
        {!viewer && drawer === 'style' && <StyleDrawer doc={doc} slide={slide} onClose={() => setDrawer('style')} />}
        {!viewer && drawer === 'ai' && !aiAvailable && (
          <aside aria-label="AI assistant" className="w-[360px] max-lg:fixed max-lg:z-40 max-lg:right-0 max-lg:top-14 max-lg:bottom-0 max-lg:shadow-2xl max-md:left-0 max-md:top-auto max-md:h-[60vh] max-md:rounded-t-2xl max-md:border-t max-lg:max-w-full shrink-0 bg-white border-l border-border p-5 text-sm">
            <h2 className="font-semibold mb-2">AI is paused</h2>
            <p className="text-slate-600">{maintenance ? "We're doing some quick maintenance, so the AI assistant is paused for a short while. Your work is safe — please try again soon." : 'The AI assistant is switched off right now. You can keep editing by hand.'}</p>
          </aside>
        )}
        {!viewer && drawer === 'ai' && aiAvailable && <AiPanel doc={doc} slide={slide} presentationId={id} onRewrite={(brief, picturesOnly) => setRewrite({ brief, ...(picturesOnly ? { picturesOnly } : {}) })} onClose={() => setDrawer('ai')} onBeforeSend={() => autosave.saveNow(false)} onUiAction={(a) => {
          // the person pressed the button the assistant prepared: the same paths as the header's own buttons (plan and role checked again there)
          if (a.kind === 'present') { if (!canPresent) return upgrade.show(PRESENT_LOCKED); void autosave.saveNow(); navigate(`/present/${id}?slide=${a.fromSlide}`) }
          else if (a.kind === 'export') void doExport(a.format, a.slideIds)
          else if (role === 'owner') { setShareEmail(a.email); setShareRole(a.role === 'viewer' ? 'viewer' : 'editor'); setShareOpen(true) }
        }} />}
      </div>

      {shareOpen && role === 'owner' && <ShareDialog deckId={id} {...(shareEmail ? { initialEmail: shareEmail } : {})} initialRole={shareRole} onClose={() => { setShareOpen(false); setShareEmail(undefined) }} />}
      {rewrite && load === 'ready' && (
        <DeckRewriteDialog
          presentationId={id} slideCount={doc.slides.length} autoBrief={rewrite.brief} picturesOnly={rewrite.picturesOnly}
          onClose={() => { setRewrite(null); if (searchParams.has('new')) setSearchParams({}, { replace: true }) }}
          onDone={(d, r, kept) => {
            useDoc.getState().load(d, r)
            setActiveSlide(d.slides[0]!.id)
            setRewrite(null); setSearchParams({}, { replace: true })
            // which slides kept their own picture (no DIFFERENT match was found) is said, never left for the person to discover
            const keptText = kept.length ? ` ${kept.length === 1 ? `Slide ${kept[0]}` : `Slides ${kept.slice(0, -1).join(', ')} and ${kept.at(-1)}`} kept ${kept.length === 1 ? 'its' : 'their'} own picture: no different match was found.` : ''
            flash(rewrite?.picturesOnly ? `New pictures are in.${keptText} The previous version is saved in Version history.` : 'Your presentation is ready. The previous version is saved in Version history.')
          }}
        />
      )}
      {tableEditId && <TableDialog slideId={slide.id} elementId={tableEditId} onClose={() => editTable(null)} />}
      {chartEditId && <ChartDialog slideId={slide.id} elementId={chartEditId} onClose={() => editChart(null)} />}
      {cropId && <CropDialog slideId={slide.id} elementId={cropId} onClose={() => openCrop(null)} />}
      {bgRemoval && (() => {
        const provider = backgroundRemovalProvider()
        const el = doc.slides.find((s) => s.id === bgRemoval.slideId)?.elements.find((e) => e.id === bgRemoval.elementId)
        return BackgroundRemovalDialog && provider && el?.type === 'image' && el.src ? <Suspense fallback={null}><BackgroundRemovalDialog key={`${bgRemoval.slideId}:${bgRemoval.elementId}`} presentationId={id} slideId={bgRemoval.slideId} elementId={bgRemoval.elementId} src={el.src} alt={el.alt ?? ''} provider={provider} onClose={closeBgRemoval} /></Suspense> : null
      })()}
      {imageDialog && <ImageDialog key={imageDialog.elementId ?? 'new'} doc={doc} slide={slide} presentationId={id} request={imageDialog} onClose={closeImageDialog} />}
      {remix && <RemixDialog presentationId={id} title={doc.title} slideCount={doc.slides.length} aspect={doc.aspectRatio} handEdited={doc.slides.filter((x) => x.manual).length} beforeStart={() => autosave.saveNow(false)} onClose={() => setRemix(false)} />}
      {menu && <ContextMenu x={menu.x} y={Math.max(8, menu.y)} items={menu.kind === 'insert' ? insertItems : moreItems} onClose={() => setMenu(null)} />}
      {versions && <VersionsDialog id={id} revision={revision} onClose={() => setVersions(false)} onRestored={(d, r) => { useDoc.getState().load(d, r); setActiveSlide(d.slides[0]!.id) }} />}
      {exporting && <div role="status" className="fixed bottom-6 left-6 bg-foreground text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50">{exporting}</div>}
      {toast && <div role="status" className="fixed bottom-6 left-6 bg-foreground text-white px-4 py-2 rounded-lg text-sm shadow-lg z-50">{toast}</div>}
    </div>
  )
}
