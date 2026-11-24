import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brush, Check, Columns2, Download, Eraser, Hand, ImagePlus, Loader2, Maximize2, Redo2, RotateCcw, Undo2, X, ZoomIn, ZoomOut } from '@prompttoppt/ui/icons'
import { Portal } from '@/components/Portal'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { api } from '@/lib/api'
import type { Backdrop } from '@/lib/bgremoval/renderer'
import { useBackgroundRemoval } from '@/lib/bgremoval/useBackgroundRemoval'
import type { BackgroundSpec, SegmentationProvider } from '@/lib/bgremoval/types'
import { useDialog } from '@/lib/useDialog'
import { MaskStage, type StageControls, type StageTool } from './MaskStage'

type Bg = 'transparent' | 'white' | 'black' | 'color' | 'image'
const UPLOAD_LIMIT = 7.5 * 1024 * 1024 // the picture upload limit is 8 MB

const btn = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-white text-sm font-medium hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white'
const tile = (on: boolean) => `h-9 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-1.5 ${on ? 'border-primary ring-2 ring-primary/25 bg-white' : 'border-border bg-white hover:bg-slate-50'}`

/**
 * "Remove background": a dialog in the editor that edits a MASK of the picture. Where the first mask comes from is a `SegmentationProvider` given to it (the dialog knows no model); the
 * rest (erase and restore brushes, undo and redo, reset to the first mask, a transparent, coloured or picture background, before and after, PNG at the picture's own size) works the
 * same whichever provider made it. The picture is never changed: only a mask is edited, and "Apply" puts the finished PNG on the slide.
 */
export function BackgroundRemovalDialog({ presentationId, slideId, elementId, src, alt, provider, onClose }: { presentationId: string; slideId: string; elementId: string; src: string; alt: string; provider: SegmentationProvider; onClose: () => void }) {
  const ref = useDialog<HTMLDivElement>(true, onClose)
  const apply = useDoc((s) => s.apply)
  const { state, session, retry, cancel } = useBackgroundRemoval({ deckId: presentationId, url: src, provider })
  const controls = useRef<StageControls | null>(null)
  const [tool, setTool] = useState<StageTool>('erase')
  const [brush, setBrush] = useState(40)
  const [hardness, setHardness] = useState(60)
  const [bg, setBg] = useState<Bg>('transparent')
  const [color, setColor] = useState('#ffffff')
  const [bgImage, setBgImage] = useState<{ blob: Blob; bitmap: ImageBitmap } | null>(null)
  const [compare, setCompare] = useState({ on: false, at: 0.5 })
  const [zoom, setZoom] = useState(100)
  const [, bump] = useState(0) // undo / redo availability follows the editor, which is not React state
  const [busy, setBusy] = useState<null | 'download' | 'apply' | 'edit'>(null)
  const [edge, setEdge] = useState(2)
  const [wheelZooms, setWheelZooms] = useState(() => { try { return globalThis.localStorage?.getItem('slidesdone.bg.wheel') !== 'pan' } catch { return true } })
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const editor = session?.editor ?? null
  const backdrop: Backdrop = useMemo(() => bg === 'transparent' ? { kind: 'transparent' } : bg === 'white' ? { kind: 'color', color: '#ffffff' } : bg === 'black' ? { kind: 'color', color: '#000000' } : bg === 'color' ? { kind: 'color', color } : bgImage ? { kind: 'image', bitmap: bgImage.bitmap } : { kind: 'transparent' }, [bg, color, bgImage])
  const spec: BackgroundSpec = bg === 'transparent' || (bg === 'image' && !bgImage) ? { kind: 'transparent' } : bg === 'white' ? { kind: 'color', color: '#ffffff' } : bg === 'black' ? { kind: 'color', color: '#000000' } : bg === 'color' ? { kind: 'color', color } : { kind: 'image' }

  useEffect(() => () => { bgImage?.bitmap.close() }, [bgImage])
  const chooseWheel = (zooms: boolean) => { setWheelZooms(zooms); try { globalThis.localStorage?.setItem('slidesdone.bg.wheel', zooms ? 'zoom' : 'pan') } catch { /* a blocked store only means the choice is not remembered */ } }

  /** The preview's cleaned colours belong to a mask; after a whole-mask step is undone, redone or reset they are worked out again for the mask that is shown now (the latest request wins). */
  const cleanTicket = useRef(0)
  const refreshColours = useCallback(async () => {
    if (!session) return
    const ticket = ++cleanTicket.current
    try {
      const subject = await session.worker.clean(session.image, session.editor.alpha, session.width, session.height)
      if (ticket !== cleanTicket.current) { subject.close(); return }
      session.renderer.setSubject(subject)
      controls.current?.refresh(null)
    } catch { /* the preview keeps its colours; the download is always worked out fresh */ }
  }, [session])

  const history = useCallback((fn: 'undo' | 'redo' | 'reset') => {
    if (!editor || busy === 'edit') return
    const rect = fn === 'undo' ? editor.undo() : fn === 'redo' ? editor.redo() : editor.reset()
    controls.current?.refresh(rect)
    bump((n) => n + 1)
    if (rect && (fn === 'reset' || editor.lastWasBulk)) void refreshColours()
  }, [editor, busy, refreshColours])

  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
    const key = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); history(e.shiftKey ? 'redo' : 'undo') }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); history('redo') }
      else if (!mod && e.key.toLowerCase() === 'e') setTool('erase')
      else if (!mod && e.key.toLowerCase() === 'r') setTool('restore')
      else if (!mod && e.key.toLowerCase() === 'h') setTool('pan')
      else if (e.key === '[') setBrush((b) => Math.max(4, b - 6))
      else if (e.key === ']') setBrush((b) => Math.min(240, b + 6))
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [history])

  async function pickBackgroundImage(f: File | undefined) {
    if (!f) return
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setNotice({ kind: 'error', text: 'Use a JPG, PNG or WebP picture for the background.' })
    if (f.size > 8 * 1024 * 1024) return setNotice({ kind: 'error', text: 'That background picture is larger than 8 MB.' })
    try {
      const bitmap = await createImageBitmap(f, { imageOrientation: 'from-image' })
      if (session && bitmap.width * bitmap.height > session.limits.maxPixels) { bitmap.close(); return setNotice({ kind: 'error', text: 'That background picture is too large for this device.' }) }
      setBgImage((old) => { old?.bitmap.close(); return { blob: f, bitmap } })
      setBg('image'); setNotice(null)
    } catch { setNotice({ kind: 'error', text: 'That background picture could not be read.' }) }
  }

  async function render(scale: number) {
    if (!session) throw new Error('The picture is not ready yet.')
    return session.worker.exportPng({ image: session.image, alpha: session.editor.alpha, width: session.width, height: session.height, background: spec, backgroundImage: bgImage?.blob, scale })
  }

  /** Feather or grow/shrink the mask as one undoable step (worked out in the worker), then refresh the preview's cleaned colours. The stage ignores the pointer meanwhile. */
  async function changeEdge(kind: 'feather' | 'grow', radius: number) {
    if (!session || busy) return
    setBusy('edit'); setNotice(null)
    try {
      const next = await session.worker.edit(session.editor.alpha, session.width, session.height, { kind, radius })
      const rect = session.editor.replace(next)
      controls.current?.refresh(rect)
      bump((n) => n + 1)
      if (rect) session.renderer.setSubject(await session.worker.clean(session.image, session.editor.alpha, session.width, session.height))
      controls.current?.refresh(rect)
      if (!rect) setNotice({ kind: 'ok', text: 'That did not change the picture.' })
    } catch (e) { setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'That did not work. The picture was not changed.' }) } finally { setBusy(null) }
  }

  async function download() {
    if (!session || busy) return
    setBusy('download'); setNotice(null)
    try {
      const out = await render(1)
      const url = URL.createObjectURL(out.blob)
      const a = document.createElement('a'); a.href = url; a.download = 'background-removed.png'; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 15_000)
      setNotice({ kind: 'ok', text: `Downloaded background-removed.png, ${out.width} × ${out.height} pixels (the picture's own size).` })
    } catch (e) { setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'The download did not work. Please try again.' }) } finally { setBusy(null) }
  }

  async function place() {
    if (!session || busy) return
    setBusy('apply'); setNotice(null)
    try {
      let scale = 1
      let out = await render(scale)
      // a slide picture may be at most 8 MB; the download keeps the full size, the slide gets the largest version that fits
      for (let i = 0; i < 4 && out.blob.size > UPLOAD_LIMIT; i++) { scale *= Math.max(0.3, Math.sqrt(UPLOAD_LIMIT / out.blob.size) * 0.92); out = await render(scale) }
      if (out.blob.size > UPLOAD_LIMIT) throw new Error('This picture is still too large to place on a slide. Use Download instead.')
      const r = await api.uploadImage(presentationId, new File([out.blob], 'background-removed.png', { type: 'image/png' }))
      apply('Remove background', (d) => { C.swapPicture(d, slideId, elementId, { url: r.url, alt, fit: 'contain' }) })
      onClose()
    } catch (e) { setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Placing the picture did not work. Nothing was changed.' }); setBusy(null) }
  }

  const ready = state.kind === 'ready' && !!session
  return (
    <Portal>
      <div className="fixed inset-0 z-[80] bg-black/50 grid place-items-center p-2 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
        <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Remove background" data-testid="bg-dialog" className="bg-white rounded-2xl w-full max-w-6xl h-[min(94vh,880px)] shadow-xl outline-none flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-border">
            <div className="min-w-0">
              <h2 className="font-heading font-bold text-lg sm:text-xl leading-tight">Remove background</h2>
              <p className="text-xs text-amber-700 truncate" data-testid="bg-provider">Development preview: {provider.label}. Not available to customers.</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-slate-500 shrink-0" disabled={busy !== null}><X aria-hidden size={20} /></button>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            <div className="md:w-72 shrink-0 overflow-y-auto max-md:max-h-[42%] border-b md:border-b-0 md:border-r border-border p-3 sm:p-4 space-y-4 text-sm">
              <section aria-label="Tools">
                <div className="font-semibold mb-1.5">Tool</div>
                <div className="flex flex-wrap gap-1.5" role="group">
                  <button className={tile(tool === 'erase')} aria-pressed={tool === 'erase'} data-testid="tool-erase" onClick={() => setTool('erase')} disabled={!ready} title="Erase (E): take the subject away under the brush"><Eraser aria-hidden size={15} />Erase</button>
                  <button className={tile(tool === 'restore')} aria-pressed={tool === 'restore'} data-testid="tool-restore" onClick={() => setTool('restore')} disabled={!ready} title="Restore (R): bring the subject back under the brush"><Brush aria-hidden size={15} />Restore</button>
                  <button className={tile(tool === 'pan')} aria-pressed={tool === 'pan'} data-testid="tool-pan" onClick={() => setTool('pan')} disabled={!ready} title="Move the picture (H, or hold Space)"><Hand aria-hidden size={15} />Move</button>
                </div>
                <label className="block mt-3 text-slate-600">Brush size <span className="tabular-nums">{brush}px</span>
                  <input type="range" min={4} max={240} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-full" data-testid="brush-size" aria-label="Brush size" disabled={!ready} />
                </label>
                <label className="block mt-1 text-slate-600">Soft edge <span className="tabular-nums">{100 - hardness}%</span>
                  <input type="range" min={0} max={100} value={100 - hardness} onChange={(e) => setHardness(100 - Number(e.target.value))} className="w-full" aria-label="Brush softness" disabled={!ready} />
                </label>
              </section>

              <section aria-label="History">
                <div className="font-semibold mb-1.5">History</div>
                <div className="flex flex-wrap gap-1.5">
                  <button className={btn} onClick={() => history('undo')} disabled={!ready || busy === 'edit' || !editor?.canUndo} data-testid="bg-undo" aria-label="Undo"><Undo2 aria-hidden size={15} />Undo</button>
                  <button className={btn} onClick={() => history('redo')} disabled={!ready || busy === 'edit' || !editor?.canRedo} data-testid="bg-redo" aria-label="Redo"><Redo2 aria-hidden size={15} />Redo</button>
                  <button className={btn} onClick={() => history('reset')} disabled={!ready || busy === 'edit' || !editor?.isEdited} data-testid="bg-reset" title="Back to the first mask. You can undo this."><RotateCcw aria-hidden size={15} />Reset</button>
                </div>
              </section>

              <section aria-label="View">
                <div className="font-semibold mb-1.5">View <span className="font-normal text-slate-500 tabular-nums" data-testid="bg-zoom">{zoom}%</span></div>
                <div className="flex flex-wrap gap-1.5">
                  <button className={btn} onClick={() => controls.current?.zoomBy(1 / 1.25)} disabled={!ready} aria-label="Zoom out"><ZoomOut aria-hidden size={15} /></button>
                  <button className={btn} onClick={() => controls.current?.zoomBy(1.25)} disabled={!ready} aria-label="Zoom in"><ZoomIn aria-hidden size={15} /></button>
                  <button className={btn} onClick={() => controls.current?.fit()} disabled={!ready} aria-label="Fit to screen"><Maximize2 aria-hidden size={15} />Fit</button>
                  <button className={btn} onClick={() => controls.current?.actual()} disabled={!ready}>100%</button>
                  <button className={tile(compare.on)} aria-pressed={compare.on} onClick={() => setCompare((c) => ({ ...c, on: !c.on }))} disabled={!ready} data-testid="bg-compare"><Columns2 aria-hidden size={15} />Before / after</button>
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={wheelZooms} onChange={(e) => chooseWheel(e.target.checked)} data-testid="bg-wheel" />Mouse wheel zooms (otherwise it moves the picture)</label>
                <p className="mt-1.5 text-xs text-slate-500">Zoom: pinch, or Ctrl or Cmd with the wheel. Move: two fingers, or hold Space and drag. Painting is switched off while comparing.</p>
              </section>

              <section aria-label="Edge">
                <div className="font-semibold mb-1.5">Edge <span className="font-normal text-slate-500 tabular-nums">{edge}px</span></div>
                <input type="range" min={1} max={10} value={edge} onChange={(e) => setEdge(Number(e.target.value))} className="w-full" aria-label="Edge amount in pixels" data-testid="edge-amount" disabled={!ready || busy !== null} />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button className={btn} onClick={() => void changeEdge('grow', -edge)} disabled={!ready || busy !== null} data-testid="edge-shrink" title="Take the edge inwards by this many pixels. You can undo it.">Shrink</button>
                  <button className={btn} onClick={() => void changeEdge('grow', edge)} disabled={!ready || busy !== null} data-testid="edge-grow" title="Move the edge outwards by this many pixels. You can undo it.">Expand</button>
                  <button className={btn} onClick={() => void changeEdge('feather', edge)} disabled={!ready || busy !== null} data-testid="edge-soften" title="Make the edge softer by this many pixels. You can undo it.">Soften</button>
                </div>
              </section>

              <section aria-label="Background">
                <div className="font-semibold mb-1.5">Background</div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Background">
                  {(['transparent', 'white', 'black'] as const).map((b) => <button key={b} role="radio" aria-checked={bg === b} className={tile(bg === b)} onClick={() => setBg(b)} disabled={!ready} data-testid={`bg-${b}`}>{b === 'transparent' ? 'Transparent' : b === 'white' ? 'White' : 'Black'}</button>)}
                  <label role="radio" aria-checked={bg === 'color'} className={`${tile(bg === 'color')} cursor-pointer`}>Colour
                    <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setBg('color') }} disabled={!ready} aria-label="Background colour" data-testid="bg-color" className="h-5 w-6 p-0 border-0 bg-transparent" />
                  </label>
                  <label role="radio" aria-checked={bg === 'image'} className={`${tile(bg === 'image')} cursor-pointer`}><ImagePlus aria-hidden size={15} />Picture
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Background picture" data-testid="bg-image-input" disabled={!ready} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pickBackgroundImage(f) }} />
                  </label>
                </div>
              </section>
            </div>

            <div className="flex-1 min-h-0 min-w-0 relative bg-neutral-200">
              {state.kind === 'loading' && (
                <div role="status" aria-live="polite" className="absolute inset-0 grid place-items-center p-6" data-testid="bg-loading">
                  <div className="text-center max-w-xs">
                    <Loader2 aria-hidden className="mx-auto animate-spin text-slate-500" size={28} />
                    <p className="mt-3 font-medium">{state.label}</p>
                    {provider.capabilities.imageLeavesDevice && <p className="mt-1 text-xs text-slate-500" data-testid="bg-privacy">Your picture is sent to {provider.capabilities.kind === 'commercial-api' ? 'an outside service' : 'our server'} to find the subject.</p>}
                    <div className="mt-3 h-1.5 w-56 mx-auto rounded-full bg-slate-300 overflow-hidden"><div className="h-full w-1/3 rounded-full bg-primary animate-pulse" /></div>
                    <button className={`${btn} mt-4`} onClick={cancel}>Cancel</button>
                  </div>
                </div>
              )}
              {state.kind === 'error' && (
                <div className="absolute inset-0 grid place-items-center p-6">
                  <div className="text-center max-w-sm">
                    <p role="alert" className="font-medium text-red-700" data-testid="bg-error">{state.message}</p>
                    <div className="mt-4 flex justify-center gap-2">
                      {state.canRetry && <button className={btn} onClick={retry}>Try again</button>}
                      <button className={btn} onClick={onClose}>Close</button>
                    </div>
                  </div>
                </div>
              )}
              {session && state.kind === 'ready' && (
                <MaskStage session={session} wheelZooms={wheelZooms} frozen={busy === 'edit'} tool={tool} brush={brush} hardness={hardness} backdrop={backdrop} compare={compare} onCompareAt={(at) => setCompare((c) => ({ ...c, at }))} onEdit={() => bump((n) => n + 1)} onZoom={setZoom} onControls={(c) => { controls.current = c }} />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-border">
            <p role={notice?.kind === 'error' ? 'alert' : 'status'} aria-live="polite" className={`text-sm min-w-0 flex-1 ${notice?.kind === 'error' ? 'text-red-700' : 'text-slate-600'}`} data-testid="bg-notice">
              {notice?.text ?? (ready ? `${session.width} × ${session.height} pixels. The download keeps this size.${session.refined ? ' The edge was fitted to your picture.' : ''}` : '')}
            </p>
            <div className="flex gap-2 shrink-0">
              <button className={btn} onClick={onClose} disabled={busy !== null}>Cancel</button>
              <button className={btn} onClick={download} disabled={!ready || busy !== null} data-testid="bg-download"><Download aria-hidden size={15} />{busy === 'download' ? 'Preparing…' : 'Download PNG'}</button>
              <button className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40" onClick={place} disabled={!ready || busy !== null} data-testid="bg-apply"><Check aria-hidden size={15} />{busy === 'apply' ? 'Placing…' : 'Apply to slide'}</button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
