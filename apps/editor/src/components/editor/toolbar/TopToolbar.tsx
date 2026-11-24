import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AreaChart, BarChart3, ChevronDown, Copy, Layers, ScatterChart, Droplet, Eraser, Film, Grid3x3, History, Wand2, ImagePlus, Images, LineChart, PaintBucket, PieChart, Pencil, Redo2, Shapes, Sparkles, Table2, Type, Undo2, Upload } from '@prompttoppt/ui/icons'
import { ApiError, isGateError } from '@prompttoppt/api-client'
import { PATTERN_KINDS, SHAPE_GROUP_LABEL, SHAPE_LIBRARY, defaultPattern, describeSlides, isSectionStart, patternSvg, sectionSlides, type Presentation, type ShapeGroup, type Slide } from '@prompttoppt/validation'
import { slideTheme } from '@prompttoppt/theme'
import * as C from '@/editor/commands'
import * as T from '@/editor/toolbar-commands'
import { useDoc } from '@/editor/store'
import { GRID_SIZES, useGrid } from '@/editor/grid'
import { useUi } from '@/editor/ui'
import { api } from '@/lib/api'
import { useEntitlements } from '@/lib/entitlements'
import { ColorPanel } from './ColorPanel'
import { GRADIENTS, cssGradient } from './data'
import { MediaLibraryDialog, type PickedGradient, type PickedMedia } from './MediaLibraryDialog'
import { TemplatePicturesDialog, templateOfDeck } from '../TemplatePicturesDialog'
import { ShapePreview } from './ShapePreview'

const btn = 'h-9 px-2.5 shrink-0 rounded-lg text-sm font-medium hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent flex items-center gap-1.5 whitespace-nowrap'

/** A dropdown that opens under its button, stays inside the screen and closes on outside click or Escape. */
function Dropdown({ label, icon, testId, width = 288, open, onOpen, onClose, children, onBeforeOpen }: { label: string; icon: ReactNode; testId: string; width?: number; open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode; onBeforeOpen?: () => boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 8, top: 0 })
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8)), top: r.bottom + 6 })
  }, [open, width])
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { onClose(); btnRef.current?.focus() } }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key); window.addEventListener('resize', onClose)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); window.removeEventListener('resize', onClose) }
  }, [open, onClose])
  return (
    <>
      <button ref={btnRef} type="button" data-testid={testId} aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? onClose() : (onBeforeOpen?.() ?? true) && onOpen())} className={`${btn} ${open ? 'bg-slate-100' : ''}`}>{icon}<span className="max-lg:sr-only">{label}</span><ChevronDown aria-hidden size={12} className="text-slate-400" /></button>
      {open && <div ref={panel} role="dialog" aria-label={label} style={{ position: 'fixed', left: pos.left, top: pos.top, width, maxWidth: 'calc(100vw - 16px)', zIndex: 60 }} className="bg-white border border-border rounded-xl shadow-xl max-h-[calc(100vh-90px)] overflow-y-auto">{children}</div>}
    </>
  )
}
const MenuRow = ({ icon, children, onClick, testId }: { icon: ReactNode; children: ReactNode; onClick: () => void; testId?: string }) => (
  <button type="button" role="menuitem" data-testid={testId} onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-100 rounded-lg">{icon}{children}</button>
)

type Which = null | 'shapes' | 'table' | 'media' | 'chart' | 'background' | 'grid'

/**
 * The ribbon above the slide (for every deck, AI-made or built from scratch): Text, Shapes, Table, Media, Chart, Background, then Undo, Redo and History.
 * Anything that puts a new object on the slide goes through `requireAdvanced` (the plan gate for the advanced editor); background, undo, redo and history are open to all.
 */
const isDarkHex = (h: string) => { const v = h.replace('#', ''); return parseInt(v.slice(0, 2), 16) * 0.299 + parseInt(v.slice(2, 4), 16) * 0.587 + parseInt(v.slice(4, 6), 16) * 0.114 < 140 }

export function TopToolbar({ doc, slide, presentationId, requireAdvanced, onHistory, flash }: { doc: Presentation; slide: Slide; presentationId: string; requireAdvanced: () => boolean; onHistory: () => void; flash: (m: string) => void }) {
  const apply = useDoc((s) => s.apply)
  const canUndo = useDoc((s) => s.past.length > 0)
  const canRedo = useDoc((s) => s.future.length > 0)
  const select = useUi((s) => s.select)
  const edit = useUi((s) => s.edit)
  const selection = useUi((s) => s.selection)
  const ribbon = useUi((s) => s.ribbon)
  const setRibbon = useUi((s) => s.setRibbon)
  const { upgrade } = useEntitlements()
  const [open, setOpen] = useState<Which>(null)
  const gridPrefs = useGrid()
  const [bgColor, setBgColor] = useState(false)
  /** the style the gradient swatches give a slide: linear or radial (starts as the slide's own) */
  const [gradKind, setGradKind] = useState<'linear' | 'radial'>(() => (slide.background?.type === 'gradient' && slide.background.gradient?.kind === 'radial' ? 'radial' : 'linear'))
  const [library, setLibrary] = useState<null | 'insert' | 'background'>(null)
  const [tplPictures, setTplPictures] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const insertFile = useRef<HTMLInputElement>(null)
  const bgFile = useRef<HTMLInputElement>(null)
  const [grid, setGrid] = useState<[number, number]>([0, 0])
  const close = () => { setOpen(null); setBgColor(false) }
  const sid = slide.id
  const onlyTable = selection.length === 1 ? slide.elements.find((e) => e.id === selection[0] && e.type === 'table') : undefined
  const bgNow = slide.background?.type === 'color' ? slide.background.value : slideTheme(doc.theme, slide).colors.background

  const guard = () => requireAdvanced()
  const fail = (e: unknown, fallback: string) => { if (isGateError(e)) upgrade.show(e.message); else flash(e instanceof ApiError ? e.message : fallback) }
  const placed = (id: string | null) => { if (id) select([id]) }

  function addText() {
    if (!guard()) return
    let id: string | null = null
    apply('Add text', (d) => { id = T.addTextBox(d, sid) })
    if (id) { select([id]); edit(id) }
  }
  const addShape = (shape: string) => { close(); let id: string | null = null; apply('Add shape', (d) => { id = T.addShape(d, sid, shape) }); placed(id) }
  const addTable = (rows: number, cols: number) => { close(); let id: string | null = null; apply('Add table', (d) => { id = T.addTable(d, sid, rows, cols) }); placed(id) }
  const addChart = (kind: T.ChartKind) => { close(); let id: string | null = null; apply('Add chart', (d) => { id = T.addChart(d, sid, kind) }); placed(id) }

  function placePicture(m: PickedMedia) {
    let id: string | null = null
    apply('Add picture', (d) => { id = C.insertImageElement(d, sid, { url: m.url, alt: m.alt, prompt: '' }); if (id && m.attribution) C.updateElement(d, sid, id, { attribution: m.attribution } as never) })
    placed(id)
  }
  async function uploadAndPlace(f: File) {
    setBusy('upload'); close()
    try { const r = await api.uploadImage(presentationId, f); placePicture({ kind: 'image', url: r.url, alt: r.name }) } catch (e) { fail(e, 'Could not add that picture.') } finally { setBusy(null) }
  }
  async function uploadAsBackground(f: File) {
    setBusy('upload'); close()
    try { const r = await api.uploadImage(presentationId, f); apply('Slide background', (d) => T.setBackgroundPicture(d, sid, r.url)) } catch (e) { fail(e, 'Could not use that picture.') } finally { setBusy(null) }
  }
  const fromLibrary = (m: PickedMedia | PickedGradient) => {
    const mode = library
    setLibrary(null)
    if (m.kind === 'gradient') apply('Slide background', (d) => T.setBackgroundGradient(d, sid, m.gradient.from, m.gradient.to, m.gradient.angle))
    else if (mode === 'background') apply('Slide background', (d) => T.setBackgroundPicture(d, sid, m.url))
    else placePicture(m)
  }

  const groups: ShapeGroup[] = ['basic', 'symbols', 'arrows', 'callouts']
  const rectRow = ['rect', 'roundRect', 'snipRect', 'frame']
  const basics = ['line', 'ellipse', 'ring', 'triangle', 'chevron']
  const label = (id: string) => SHAPE_LIBRARY.find((s) => s.id === id)?.label ?? ({ rect: 'Rectangle', ellipse: 'Circle', ring: 'Ring', triangle: 'Triangle', chevron: 'Chevron', line: 'Line' } as Record<string, string>)[id] ?? id
  const shapeBtn = (id: string) => <button key={id} type="button" data-testid={`shape-${id}`} title={label(id)} aria-label={label(id)} onClick={() => addShape(id)} className="w-10 h-10 grid place-items-center rounded-lg hover:bg-slate-100"><ShapePreview id={id} /></button>

  return (
    <>
      <div role="toolbar" aria-label="Insert toolbar" data-testid="top-toolbar" className="relative h-12 bg-white border-b border-border flex items-center gap-0.5 px-2 sm:px-4 shrink-0 overflow-x-auto">
        <button type="button" data-testid="tb-text" className={btn} onClick={addText}><Type aria-hidden size={16} /><span className="max-lg:sr-only">Text</span></button>

        <Dropdown label="Shapes" icon={<Shapes aria-hidden size={16} />} testId="tb-shapes" width={400} open={open === 'shapes'} onOpen={() => setOpen('shapes')} onClose={close} onBeforeOpen={guard}>
          <div className="p-3">
            <div className="text-xs font-semibold text-slate-500 mb-1">Rectangle</div>
            <div className="flex flex-wrap gap-0.5 mb-3">{rectRow.map(shapeBtn)}</div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Lines and basics</div>
            <div className="flex flex-wrap gap-0.5 mb-3">{basics.map(shapeBtn)}</div>
            {groups.map((g) => (
              <div key={g} className="mb-3 last:mb-0">
                <div className="text-xs font-semibold text-slate-500 mb-1">{SHAPE_GROUP_LABEL[g]}</div>
                <div className="flex flex-wrap gap-0.5">{SHAPE_LIBRARY.filter((s) => s.group === g && !rectRow.includes(s.id)).map((s) => shapeBtn(s.id))}</div>
              </div>
            ))}
          </div>
        </Dropdown>

        <Dropdown label="Table" icon={<Table2 aria-hidden size={16} />} testId="tb-table" width={290} open={open === 'table'} onOpen={() => { setGrid([0, 0]); setOpen('table') }} onClose={close} onBeforeOpen={guard}>
          <div className="p-3">
            <div className="text-sm font-semibold mb-2">{grid[0] ? `${grid[0]} × ${grid[1]} table` : 'Insert table'}</div>
            <div role="grid" aria-label="Table size" className="grid gap-1" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }} onMouseLeave={() => setGrid([0, 0])}>
              {Array.from({ length: 6 * 8 }, (_, i) => { const r = Math.floor(i / 8) + 1, c = (i % 8) + 1; const on = r <= grid[0] && c <= grid[1]; return <button key={i} type="button" role="gridcell" aria-label={`${r} rows by ${c} columns`} data-testid={`table-${r}x${c}`} onMouseEnter={() => setGrid([r, c])} onFocus={() => setGrid([r, c])} onClick={() => addTable(r, c)} className={`aspect-square rounded-sm border ${on ? 'bg-primary/20 border-primary' : 'border-slate-300 bg-white'}`} /> })}
            </div>
            {onlyTable && <button type="button" data-testid="tb-edit-table" onClick={() => { close(); useUi.getState().editTable(onlyTable.id) }} className="mt-3 w-full h-9 rounded-lg border border-border text-sm inline-flex items-center justify-center gap-1.5 hover:bg-slate-50"><Pencil aria-hidden size={14} />Edit selected table</button>}
          </div>
        </Dropdown>

        <Dropdown label="Media" icon={<ImagePlus aria-hidden size={16} />} testId="tb-media" width={248} open={open === 'media'} onOpen={() => setOpen('media')} onClose={close} onBeforeOpen={guard}>
          <div className="p-1.5" role="menu">
            <MenuRow testId="media-upload" icon={<Upload aria-hidden size={16} />} onClick={() => insertFile.current?.click()}>Upload from computer</MenuRow>
            <MenuRow testId="media-library" icon={<Images aria-hidden size={16} />} onClick={() => { close(); setLibrary('insert') }}>Media library…</MenuRow>
            {templateOfDeck(doc) && <MenuRow testId="media-template-pictures" icon={<Images aria-hidden size={16} />} onClick={() => { close(); setTplPictures(true) }}>Template pictures…</MenuRow>}
            <MenuRow testId="media-ai" icon={<Sparkles aria-hidden size={16} />} onClick={() => { close(); useUi.getState().openImageDialog() }}>Create with AI…</MenuRow>
          </div>
        </Dropdown>

        <Dropdown label="Chart" icon={<BarChart3 aria-hidden size={16} />} testId="tb-chart" width={220} open={open === 'chart'} onOpen={() => setOpen('chart')} onClose={close} onBeforeOpen={guard}>
          <div className="p-1.5" role="menu">
            <MenuRow testId="chart-bar" icon={<BarChart3 aria-hidden size={16} />} onClick={() => addChart('bar')}>Bar chart</MenuRow>
            <MenuRow testId="chart-line" icon={<LineChart aria-hidden size={16} />} onClick={() => addChart('line')}>Line chart</MenuRow>
            <MenuRow testId="chart-area" icon={<AreaChart aria-hidden size={16} />} onClick={() => addChart('area')}>Area chart</MenuRow>
            <MenuRow testId="chart-scatter" icon={<ScatterChart aria-hidden size={16} />} onClick={() => addChart('scatter')}>Scatter chart</MenuRow>
            <MenuRow testId="chart-pie" icon={<PieChart aria-hidden size={16} />} onClick={() => addChart('pie')}>Pie chart</MenuRow>
            <MenuRow testId="chart-doughnut" icon={<PieChart aria-hidden size={16} />} onClick={() => addChart('doughnut')}>Doughnut chart</MenuRow>
          </div>
        </Dropdown>

        <Dropdown label="Background" icon={<PaintBucket aria-hidden size={16} />} testId="tb-background" width={bgColor ? 296 : 272} open={open === 'background'} onOpen={() => { setBgColor(false); setOpen('background') }} onClose={close}>
          {bgColor ? (
            <div>
              <button type="button" onClick={() => setBgColor(false)} className="px-3 pt-2 text-xs text-primary font-semibold">← Back</button>
              <ColorPanel theme={slideTheme(doc.theme, slide)} value={bgNow} onPick={(hex, o) => apply('Slide background', (d) => T.setBackgroundColor(d, sid, hex, o), { mergeKey: `bg:${sid}` })} />
            </div>
          ) : (
            <div className="p-1.5" role="menu">
              <MenuRow testId="bg-color" icon={<span aria-hidden style={{ background: bgNow }} className="w-4 h-4 rounded border border-slate-300" />} onClick={() => setBgColor(true)}>Colour…</MenuRow>
              <MenuRow testId="bg-upload" icon={<Upload aria-hidden size={16} />} onClick={() => bgFile.current?.click()}>Upload image</MenuRow>
              <MenuRow testId="bg-library" icon={<Images aria-hidden size={16} />} onClick={() => { close(); setLibrary('background') }}>Media library</MenuRow>
              <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-500 flex items-center gap-1"><Droplet aria-hidden size={12} />Gradients
                {/* linear or radial: the swatches show it; on a slide that already has a gradient, the switch restyles it at once */}
                <span role="group" aria-label="Gradient style" className="ml-auto inline-flex rounded-md border border-border overflow-hidden font-normal">
                  {(['linear', 'radial'] as const).map((k) => <button key={k} type="button" data-testid={`bg-grad-kind-${k}`} aria-pressed={gradKind === k} onClick={() => { setGradKind(k); const g = slide.background?.type === 'gradient' ? slide.background.gradient : undefined; if (g && (g.kind ?? 'linear') !== k) apply('Slide background', (d) => T.setBackgroundGradient(d, sid, g.from, g.to, g.angle, k)) }} className={`px-2 py-0.5 capitalize ${gradKind === k ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-50'}`}>{k}</button>)}
                </span>
              </div>
              <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                {GRADIENTS.slice(0, 10).map((g) => <button key={g.id} type="button" title={g.name} aria-label={`${g.name} gradient`} data-testid={`bg-grad-${g.id}`} onClick={() => { apply('Slide background', (d) => T.setBackgroundGradient(d, sid, g.from, g.to, g.angle, gradKind)); close() }} style={{ background: cssGradient({ ...g, kind: gradKind }) }} className="w-7 h-7 rounded-md border border-slate-300" />)}
              </div>
              {/* a pattern over the slide's colour (on a gradient or picture slide it goes over the deck's background colour); each button shows its own pattern */}
              <div className="px-3 pt-1 pb-1 text-xs font-semibold text-slate-500">Pattern</div>
              <div role="group" aria-label="Background pattern" className="px-3 pb-2 flex flex-wrap gap-1.5">
                {([null, ...PATTERN_KINDS] as const).map((k) => {
                  const base = slide.background?.type === 'color' && /^#[0-9a-f]{6}$/i.test(slide.background.value) ? slide.background.value : doc.theme.colors.background
                  const on = (slide.background?.type === 'color' ? slide.background.pattern?.kind ?? null : null) === k
                  return <button key={k ?? 'none'} type="button" data-testid={`bg-pattern-${k ?? 'none'}`} aria-pressed={on} title={k ? `${k[0]!.toUpperCase()}${k.slice(1)} pattern` : 'No pattern'} aria-label={k ? `${k} pattern` : 'No pattern'} onClick={() => apply('Background pattern', (d) => T.setBackgroundPattern(d, sid, k))}
                    className={`w-9 h-7 rounded-md border text-[10px] ${on ? 'border-2 border-primary' : 'border-slate-300'}`} style={{ background: k ? `center / cover url("data:image/svg+xml,${encodeURIComponent(patternSvg({ ...defaultPattern(k, base), size: 12, opacity: 0.6 }, base, 36, 28))}")` : base }}>{k ? '' : <span style={{ color: isDarkHex(base) ? '#fff' : '#111' }}>None</span>}</button>
                })}
              </div>
              {slide.background?.type === 'color' && slide.background.pattern && (
                <label className="mx-3 mb-2 flex items-center gap-2 text-xs text-slate-600">
                  <span className="shrink-0">Spacing</span>
                  <input type="range" aria-label="Pattern spacing" data-testid="bg-pattern-size" min={16} max={120} step={4} value={slide.background.pattern.size} onChange={(e) => apply('Background pattern', (d) => T.setBackgroundPattern(d, sid, (slide.background as { pattern: { kind: (typeof PATTERN_KINDS)[number] } }).pattern.kind, Number(e.target.value)), { mergeKey: `bgpat:${sid}` })} className="flex-1" />
                </label>
              )}
              {slide.background?.type === 'image' && (
                // the background picture softened, so the slide's words read over a busy photo (the same blur on screen and in the download)
                <label className="mx-3 mb-2 flex items-center gap-2 text-xs text-slate-600">
                  <span className="shrink-0">Blur picture</span>
                  <input type="range" aria-label="Blur the background picture" data-testid="bg-blur" min={0} max={20} step={0.5} value={slide.background.blur ?? 0} onChange={(e) => apply('Background blur', (d) => T.setBackgroundBlur(d, sid, Number(e.target.value)), { mergeKey: `bgblur:${sid}` })} className="flex-1" />
                  <span className="w-10 text-right tabular-nums">{(slide.background.blur ?? 0) === 0 ? 'sharp' : slide.background.blur}</span>
                </label>
              )}
              <div className="h-px bg-border my-1" />
              {/* this slide's background on the other slides of its section (from its section divider to the next: sections.ts), or on every slide */}
              {(() => {
                const here = doc.slides.findIndex((x) => x.id === sid)
                const sec = sectionSlides(doc.slides, here)
                const others = (idx: number[]) => idx.map((i) => doc.slides[i]!.id).filter((x) => x !== sid)
                const use = (label: string, ids: string[]) => { let n = 0; apply(label, (d) => { n = C.copyBackground(d, sid, ids) }); flash(n ? `This background is now on ${n} more slide${n === 1 ? '' : 's'}.` : 'Nothing changed: those slides already have it, or they are locked.'); close() }
                return <>
                  {doc.slides.some(isSectionStart) && sec.length > 1 && <MenuRow testId="bg-section" icon={<Layers aria-hidden size={16} />} onClick={() => use('Background on section', others(sec))}>Use on this section ({describeSlides(sec.map((i) => i + 1), doc.slides.length)})</MenuRow>}
                  {doc.slides.length > 1 && <MenuRow testId="bg-all" icon={<Copy aria-hidden size={16} />} onClick={() => use('Background on all slides', others(doc.slides.map((_, i) => i)))}>Use on all slides</MenuRow>}
                </>
              })()}
              <MenuRow testId="bg-remove" icon={<Eraser aria-hidden size={16} />} onClick={() => { apply('Remove background', (d) => T.removeBackground(d, sid)); close() }}>Remove background</MenuRow>
            </div>
          )}
        </Dropdown>

        <button type="button" className={`${btn} ${ribbon === 'animations' ? 'bg-slate-100' : ''}`} aria-pressed={ribbon === 'animations'} data-testid="tb-animations" title="Animations tab" onClick={() => setRibbon('animations')}><Wand2 aria-hidden size={16} /><span className="max-xl:sr-only">Animations</span></button>
        <button type="button" className={`${btn} ${ribbon === 'transitions' ? 'bg-slate-100' : ''}`} aria-pressed={ribbon === 'transitions'} data-testid="tb-transitions" title="Transitions tab" onClick={() => setRibbon('transitions')}><Film aria-hidden size={16} /><span className="max-xl:sr-only">Transitions</span></button>

        <span className="w-px h-6 bg-border mx-1.5 shrink-0" />
        {/* the grid: an aid for placing objects, never part of the slide (remembered for this browser) */}
        <Dropdown label="Grid" icon={<Grid3x3 aria-hidden size={16} />} testId="tb-grid" width={230} open={open === 'grid'} onOpen={() => setOpen('grid')} onClose={close}>
          <div className="p-3 text-sm space-y-2" data-testid="grid-menu">
            <label className="flex items-center gap-2"><input type="checkbox" data-testid="grid-show" checked={gridPrefs.show} onChange={(e) => gridPrefs.set({ show: e.target.checked })} />Show grid <span className="ml-auto text-xs text-slate-500">Shift+F9</span></label>
            <label className="flex items-center gap-2"><input type="checkbox" data-testid="grid-snap" checked={gridPrefs.snap} onChange={(e) => gridPrefs.set({ snap: e.target.checked })} />Snap to grid</label>
            <div role="group" aria-label="Grid size" className="flex items-center gap-1 pt-1">
              {GRID_SIZES.map((g) => <button key={g.size} type="button" aria-pressed={gridPrefs.size === g.size} onClick={() => gridPrefs.set({ size: g.size })} className={`flex-1 rounded-md border px-2 py-1 text-xs ${gridPrefs.size === g.size ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-slate-50'}`}>{g.label}</button>)}
            </div>
            <p className="text-xs text-slate-500">Hold Alt while dragging to place freely. The grid never shows in Present or downloads.</p>
          </div>
        </Dropdown>
        <span className="w-px h-6 bg-border mx-1" />
        <button type="button" className={btn} aria-label="Undo" data-testid="tb-undo" title="Undo (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={() => useDoc.getState().undo()}><Undo2 aria-hidden size={17} /><span className="max-xl:sr-only">Undo</span></button>
        <button type="button" className={btn} aria-label="Redo" data-testid="tb-redo" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!canRedo} onClick={() => useDoc.getState().redo()}><Redo2 aria-hidden size={17} /><span className="max-xl:sr-only">Redo</span></button>
        <button type="button" className={btn} aria-label="History" data-testid="tb-history" title="Version history" onClick={onHistory}><History aria-hidden size={17} /><span className="max-xl:sr-only">History</span></button>
        {busy === 'upload' && <span role="status" className="ml-2 text-xs text-slate-500 whitespace-nowrap">Uploading…</span>}
      </div>
      <input ref={insertFile} type="file" accept="image/png,image/jpeg" hidden data-testid="insert-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadAndPlace(f) }} />
      <input ref={bgFile} type="file" accept="image/png,image/jpeg" hidden data-testid="bg-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadAsBackground(f) }} />
      {tplPictures && <TemplatePicturesDialog doc={doc} presentationId={presentationId} onClose={() => setTplPictures(false)} />}
      {library && <MediaLibraryDialog deckId={presentationId} mode={library} onPick={fromLibrary} onClose={() => setLibrary(null)} />}
    </>
  )
}
