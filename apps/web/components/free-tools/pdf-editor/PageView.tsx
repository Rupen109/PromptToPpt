'use client'

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { clientToPage, type Point } from '@/lib/pdf-editor/geometry'
import { MIN_SIZE, pageSize, resizeBox, shownSize, uid, type Anno, type Box, type Handle, type PageState } from '@/lib/pdf-editor/model'
import { coverPatch, pixelScale, renderPage, ringColour, sampleRun, type CoverPatch, type Run } from '@/lib/pdf-editor/render'
import { coverBox, type Pic } from '@/lib/pdf-editor/pictures'
import { turnedBounds } from '@/lib/pdf-editor/geometry'
import { modelCover } from '@/lib/pdf-editor/cover'
import { coveredBy, lineAt, runCovered } from '@/lib/pdf-editor/blocks'
import { BASELINE, retext, rightEdge } from '@/lib/pdf-editor/text'
import { boxFrom, dragItem, pathFrom, type Defaults, type Tool } from '@/lib/pdf-editor/tools'
import { markerIn, markerStrip } from '@/lib/pdf-editor/bullets'
import type { FieldValue, FormField, FormValues } from '@/lib/pdf-editor/forms'
import { AnnoView } from './AnnoView'
import { FormLayer } from './FormLayer'

type Gesture =
  | { type: 'create'; start: Point; id: string }
  | { type: 'draw'; pts: Point[]; id: string }
  | { type: 'region'; start: Point; pointer: number; active: boolean }
  | { type: 'move'; id: string; orig: Anno; start: Point; key: string; moved: boolean }
  | { type: 'resize'; id: string; handle: Handle; orig: Anno; start: Point; key: string }

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CORNERS: Handle[] = ['nw', 'ne', 'se', 'sw']
/** a paragraph is resized by width only */
const SIDES: Handle[] = ['w', 'e']
const CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
const HANDLE_POS: Record<Handle, [string, string]> = { nw: ['0%', '0%'], n: ['50%', '0%'], ne: ['100%', '0%'], e: ['100%', '50%'], se: ['100%', '100%'], s: ['50%', '100%'], sw: ['0%', '100%'], w: ['0%', '50%'] }

/** `marker`: a list symbol left of the words (a cover for it, in case the visitor removes the bullet with the words) */
export type Sample = { text: string; bg: string; patch: CoverPatch | null; marker?: { box: Box; bg: string; patch: CoverPatch | null } }
/** what a picked-up picture leaves behind: the cover (its box, flat colour, and a smooth patch on a gradient) */
export interface PicCover { box: Box; bg: string; patch: CoverPatch | null }
export interface PageViewProps {
  pdf: PDFDocumentProxy | null
  page: PageState
  zoom: number
  tool: Tool
  style: Defaults
  selectedId: string | null
  editingId: string | null
  runs: Run[]
  /** pictures found on this page (real images, or photos found in a picture page) */
  pics: Pic[]
  /** a found picture was clicked: pick it up */
  onPicPick: (pic: Pic, cover: PicCover) => void
  onSelect: (id: string | null) => void
  onEditing: (id: string | null) => void
  /** the page could not be drawn (the browser ran out of memory, a damaged page): the editor says so instead of showing a blank page */
  onRenderError?: () => void
  /** new items; `key` joins later typing into the same undo step */
  onCreate: (annos: Anno[], key: string | null) => void
  onPatch: (id: string, patch: Partial<Anno>, key: string) => void
  onText: (id: string, text: string) => void
  onEditBlur: (id: string) => void
  /** `run` is a paragraph (its `parts` are its lines) or a single line */
  onRunPick: (run: Run, sample: Sample) => void
  /** a box dragged with Edit text over something that is not text in the file (a picture): cover it, then type new words */
  onRegionPick: (box: Box, sample: Sample) => void
  /** a plain click (no drag) with Edit text on a page that has nothing to click */
  onEmptyClick: () => void
  /** show the found lines as visible outlines (text read from a picture) */
  outlineRuns: boolean
  /** a dragged box picks up a picture (manual box for photos the search missed) */
  pickBox?: boolean
  onToolDone: () => void
  /** form fields of this page, the visitor's values and how to change one */
  fields?: FormField[]
  form?: FormValues
  onField?: (name: string, value: FieldValue) => void
  /** the characters selected inside the text being typed in */
  onSelection?: (id: string, start: number, end: number) => void
}

/** One page: the pdf.js picture, and above it a layer of the visitor's items with all the pointer handling. Shown turned by the page's extra turn with CSS. */
export function PageView(p: PageViewProps) {
  const { pdf, page, zoom, tool } = p
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const pxRef = useRef(1)
  const drawn = useRef(false)
  const gesture = useRef<Gesture | null>(null)
  const renderFailed = useRef(p.onRenderError)
  useEffect(() => { renderFailed.current = p.onRenderError })
  const [draft, setDraft] = useState<Anno | null>(null)
  const [region, setRegion] = useState<Box | null>(null)
  const base = pageSize(page.geom), shown = shownSize(page)
  /** items can be picked, moved and re-edited whenever the Edit text tool is active (it is the resting tool: there is no separate Select tool) */
  const interactive = tool === 'editText'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!pdf || page.src === null || !canvas) return
    const scale = pixelScale(base.w, base.h, zoom, window.devicePixelRatio || 1)
    let job: ReturnType<typeof renderPage> | null = null
    const t = setTimeout(() => {
      job = renderPage(pdf, page.src!, canvas, scale)
      job.done.then((px) => { if (px) { pxRef.current = px; drawn.current = true; canvas.dataset.ready = '1' } }).catch((e) => { console.error('page render failed', e); renderFailed.current?.() })
    }, drawn.current ? 150 : 0)
    return () => { clearTimeout(t); job?.cancel() }
  }, [pdf, page.src, zoom, base.w, base.h])

  /** keep keyboard shortcuts (Delete, arrows, undo) working after a click on the page */
  const focusEditor = () => stageRef.current?.closest<HTMLElement>('[data-testid=pdf-editor]')?.focus({ preventScroll: true })
  const toPage = (e: { clientX: number; clientY: number }): Point => clientToPage(e.clientX, e.clientY, stageRef.current!.getBoundingClientRect(), page.turn, zoom, shown)
  const find = (id: string) => page.annos.find((a) => a.id === id)

  function onStageDown(e: RPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const pt = toPage(e)
    focusEditor()
    if (tool === 'editText') {
      p.onSelect(null); p.onEditing(null)
      // a plain click on a text line is handled by that line's own button; only a DRAG (below) turns into a box. The pointer is captured once it really drags, so a click still reaches the button.
      gesture.current = { type: 'region', start: pt, pointer: e.pointerId, active: false }
      return
    }
    if (tool === 'text') {
      const s = p.style.text
      const t = retext({ id: uid(), kind: 'text', x: 0, y: 0, w: 0, h: 0, text: '', ...s }, {})
      const x0 = Math.min(Math.max(pt[0], 0), base.w - 20)
      const a = { ...t, x: x0, right: rightEdge(base.w, x0), y: Math.min(Math.max(pt[1] - BASELINE[s.fam] * s.size, 0), base.h - t.h) }
      p.onCreate([a], `text:${a.id}`)
      return
    }
    stageRef.current!.setPointerCapture(e.pointerId)
    const id = uid()
    gesture.current = tool === 'draw' ? { type: 'draw', pts: [pt], id } : { type: 'create', start: pt, id }
    if (tool === 'draw') setDraft(pathFrom([pt], 'pen', p.style.pen, id))
  }

  function onAnnoDown(e: RPointerEvent<HTMLDivElement>, hit: Anno) {
    if (!interactive || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.stopPropagation()
    // the cover that sits under an edited paragraph belongs to that paragraph: picking the cover picks its text
    const a = hit.kind === 'whiteout' ? page.annos.find((t) => t.kind === 'text' && t.x + t.w / 2 >= hit.x && t.x + t.w / 2 <= hit.x + hit.w && t.y + t.h / 2 >= hit.y && t.y + t.h / 2 <= hit.y + hit.h) ?? hit : hit
    p.onSelect(a.id)
    if (p.editingId === a.id) return
    focusEditor()
    p.onEditing(null)
    stageRef.current!.setPointerCapture(e.pointerId)
    gesture.current = { type: 'move', id: a.id, orig: a, start: toPage(e), key: `move:${uid()}`, moved: false }
  }
  function onHandleDown(e: RPointerEvent<HTMLElement>, a: Anno, handle: Handle) {
    e.stopPropagation(); focusEditor()
    stageRef.current!.setPointerCapture(e.pointerId)
    gesture.current = { type: 'resize', id: a.id, handle, orig: a, start: toPage(e), key: `resize:${uid()}` }
  }

  function onMove(e: RPointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g) return
    const pt = toPage(e)
    if (g.type === 'region') {
      if (!g.active) {
        if (Math.hypot(pt[0] - g.start[0], pt[1] - g.start[1]) * zoom < 6) return
        g.active = true
        stageRef.current!.setPointerCapture(g.pointer)
      }
      setRegion(boxFrom(g.start, pt, base.w, base.h))
      return
    }
    if (g.type === 'create') setDraft(dragItem(tool, p.style, g.start, pt, base.w, base.h, g.id))
    else if (g.type === 'draw') {
      const last = g.pts.at(-1)!
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.8) return
      g.pts.push([Math.min(Math.max(pt[0], 0), base.w), Math.min(Math.max(pt[1], 0), base.h)])
      setDraft(pathFrom(g.pts, 'pen', p.style.pen, g.id))
    } else if (g.type === 'move') {
      const dx = pt[0] - g.start[0], dy = pt[1] - g.start[1]
      if (!g.moved && Math.hypot(dx, dy) * zoom < 4) return // a click, not a drag: the item stays where it is
      g.moved = true
      const o = g.orig
      p.onPatch(g.id, { x: Math.min(Math.max(o.x + dx, 10 - o.w), base.w - 10), y: Math.min(Math.max(o.y + dy, 10 - o.h), base.h - 10) }, g.key)
    } else {
      const dx = pt[0] - g.start[0], dy = pt[1] - g.start[1]
      const o = g.orig
      const nb: Box = resizeBox(o, g.handle, dx, dy, o.kind === 'image' || (o.kind === 'text' && o.wrap === undefined))
      if (o.kind === 'text' && o.wrap !== undefined) {
        // a paragraph: the handles change how wide the lines may be, not the size of the letters
        const wrap = Math.max(o.size * 2, resizeBox(o, g.handle, dx, 0, false).w)
        const t = retext(o, { wrap })
        p.onPatch(g.id, { wrap: t.wrap, lines: t.lines, w: t.w, h: t.h, x: g.handle.includes('w') ? o.x + o.w - t.w : o.x }, g.key)
      } else if (o.kind === 'text') {
        const t = retext(o, { size: Math.max(4, o.size * (nb.w / o.w)) })
        p.onPatch(g.id, { size: t.size, w: t.w, h: t.h, x: g.handle.includes('w') ? o.x + o.w - t.w : o.x, y: g.handle.includes('n') ? o.y + o.h - t.h : o.y }, g.key)
      } else p.onPatch(g.id, nb, g.key)
    }
  }

  function onUp() {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    // a plain click (no drag) on text opens it for typing again, as many times as needed
    if (g.type === 'move' && !g.moved && g.orig.kind === 'text') { p.onEditing(g.id); return }
    if (g.type === 'region') {
      const box = region
      setRegion(null)
      if (!g.active && p.runs.length === 0) p.onEmptyClick()
      if (g.active && box && box.w >= MIN_SIZE && box.h >= MIN_SIZE) {
        const canvas = canvasRef.current
        if (p.pickBox) { pickPic({ id: `m${uid()}`, box, embedded: false, native: 0 }); return }
        p.onRegionPick(box, canvas && drawn.current ? sampleOf(canvas, box) : { text: '#000000', bg: '#ffffff', patch: null })
      }
      return
    }
    if (g.type === 'create' && draft) {
      const big = draft.kind === 'path' ? Math.hypot(draft.w, draft.h) >= MIN_SIZE : draft.w >= MIN_SIZE && draft.h >= MIN_SIZE
      if (big) { p.onCreate([draft], null); p.onToolDone() }
    } else if (g.type === 'draw' && draft) p.onCreate([draft], null)
    setDraft(null)
  }

  const sampleOf = (canvas: HTMLCanvasElement, box: Box): Sample => ({ ...sampleRun(canvas, pxRef.current, box), patch: coverPatch(canvas, pxRef.current, box) })
  /** the list symbol of a run: known from the file (real text), or found as a small blob left of the words (a picture page) */
  const markerOf = (canvas: HTMLCanvasElement, run: Run): Sample['marker'] => {
    const first = run.parts?.[0] ?? run
    let box: Box | null = run.marker ?? first.marker ?? null
    if (!box && first.conf !== undefined) {
      const strip = markerStrip({ x: first.box.x + (first.pad ?? 0), baseline: first.box.baseline, size: first.box.size })
      const k = pxRef.current, sx = Math.max(0, Math.floor(strip.x * k)), sy = Math.max(0, Math.floor(strip.y * k))
      const sw = Math.min(canvas.width - sx, Math.ceil(strip.w * k)), sh = Math.min(canvas.height - sy, Math.ceil(strip.h * k))
      if (sw < 4 || sh < 4) return undefined
      const img = canvas.getContext('2d')!.getImageData(sx, sy, sw, sh)
      const bg = sampleRun(canvas, k, strip).bg
      box = markerIn(img, { ...strip, x: sx / k, y: sy / k }, k, [parseInt(bg.slice(1, 3), 16), parseInt(bg.slice(3, 5), 16), parseInt(bg.slice(5, 7), 16)], first.box.size)
    }
    if (!box) return undefined
    // the cover is what surrounds the symbol (a ring just outside it, or a smooth patch on a gradient): the inside is mostly the symbol's own ink
    return { box, bg: ringColour(canvas, pxRef.current, box), patch: coverPatch(canvas, pxRef.current, box) }
  }
  const pickRun = (r: Run, alt: boolean, y: number) => {
    const canvas = canvasRef.current
    const run = alt && r.parts ? lineAt(r, y) : r // Alt-click on a paragraph: only the line under the pointer
    if (!canvas || !drawn.current) { p.onRunPick(run, { text: '#000000', bg: '#ffffff', patch: null }); return }
    const marker = run.box.rot ? undefined : markerOf(canvas, run)
    p.onRunPick(run, { ...sampleOf(canvas, turnedBounds(run.box, run.box.rot)), ...(marker ? { marker } : {}) })
  }

  const pickPic = (pic: Pic) => {
    const canvas = canvasRef.current
    const pad = Math.max(1.5, 2 / pxRef.current)
    // the fill comes from the page's background MODEL (not from the pixels around the box, which may be other shapes); those pixels are the fallback for pages the model cannot describe
    const model = canvas && drawn.current ? modelCover(canvas, pxRef.current, pic.box, base, pad, [...p.runs.map((r) => r.box), ...p.pics.filter((q) => q.id !== pic.id).map((q) => q.box)]) : null
    const box = model?.box ?? coverBox(pic.box, base.w, base.h, pad)
    p.onPicPick(pic, model ? { box, bg: model.bg, patch: model.patch } : canvas && drawn.current ? { box, bg: ringColour(canvas, pxRef.current, box), patch: coverPatch(canvas, pxRef.current, box) } : { box, bg: '#ffffff', patch: null })
  }
  /** found pictures still in place: not picked up yet, and not under a picture the visitor put there */
  const shownPics = tool === 'editText' ? p.pics.filter((q) => !coveredBy(page.annos, q.box) && !page.annos.some((a) => a.kind === 'image' && a.x <= q.box.x + q.box.w / 2 && a.x + a.w >= q.box.x + q.box.w / 2 && a.y <= q.box.y + q.box.h / 2 && a.y + a.h >= q.box.y + q.box.h / 2)) : []
  const sel = p.selectedId ? find(p.selectedId) : undefined
  const drawing = tool !== 'editText'
  return (
    <div style={{ width: shown.w * zoom, height: shown.h * zoom, position: 'relative', flex: 'none' }} className="shadow-[0_2px_14px_rgba(24,27,37,0.28)] bg-white">
      <div ref={stageRef} data-testid="stage" data-page={page.id} data-turn={page.turn}
        onMouseDown={(e) => { if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault() /* stops text selection (and its page auto-scroll) while dragging on the page */ }}
        onPointerDown={onStageDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        style={{ position: 'absolute', left: '50%', top: '50%', width: base.w * zoom, height: base.h * zoom, transform: `translate(-50%, -50%) rotate(${page.turn}deg)`, touchAction: drawing ? 'none' : 'pan-x pan-y pinch-zoom', userSelect: 'none', cursor: drawing ? 'crosshair' : tool === 'editText' ? 'text' : 'default', background: '#fff' }}>
        {page.src !== null && <canvas ref={canvasRef} aria-label="Page picture" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />}
        {/* under the items, so text or a picture the visitor put on top of a found picture is clicked first */}
        {shownPics.map((q) => (
          <button key={q.id} type="button" aria-label={q.maybe ? 'Maybe a picture: click to pick it up' : 'Picture: click to pick it up'} data-pic={q.id} data-embedded={q.embedded ? '1' : '0'} data-maybe={q.maybe ? '1' : '0'} data-box={`${q.box.x.toFixed(1)},${q.box.y.toFixed(1)},${q.box.w.toFixed(1)},${q.box.h.toFixed(1)}`}
            onClick={() => pickPic(q)} title={q.maybe ? 'This might be a picture (it is mostly one flat colour, so the finder is not sure). Click to pick it up as a picture; ignore it if it is not.' : 'Click to pick this picture up. Then drag it, resize it with the corners, replace it or delete it.'}
            className={`absolute rounded-[3px] border-2 border-dashed ${q.maybe ? 'border-[#64748b] bg-[#64748b14]' : 'border-[#c084fc] bg-[#c084fc1f]'} shadow-[0_0_0_1px_rgba(15,23,42,0.9),inset_0_0_0_1px_rgba(255,255,255,0.9)] hover:border-[#fbbf24] hover:bg-[#fbbf2438] focus-visible:border-[#fbbf24] focus:outline-none`}
            style={{ left: q.box.x * zoom - 1, top: q.box.y * zoom - 1, width: q.box.w * zoom + 2, height: q.box.h * zoom + 2, cursor: 'pointer' }}>
            <span aria-hidden className={`pointer-events-none absolute left-1 top-1 rounded ${q.maybe ? 'bg-[#475569]' : 'bg-[#6d28d9]'} px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none text-white shadow-[0_0_0_1px_rgba(255,255,255,0.9)]`}>{q.maybe ? 'Picture?' : 'Picture'}</span>
          </button>
        ))}
        {page.annos.map((a) => (
          <div key={a.id} data-anno={a.kind} data-id={a.id} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: interactive ? undefined : 'none', cursor: interactive ? 'move' : undefined, touchAction: interactive ? 'none' : undefined }}
            onPointerDown={(e) => onAnnoDown(e, a)} onDoubleClick={() => { if (interactive && a.kind === 'text') p.onEditing(a.id) }}>
            <AnnoView a={a} zoom={zoom} hit={interactive} editing={p.editingId === a.id} onText={(v) => p.onText(a.id, v)} onBlur={() => p.onEditBlur(a.id)} onSelection={(s, e) => p.onSelection?.(a.id, s, e)} />
          </div>
        ))}
        {p.fields && p.onField && <FormLayer fields={p.fields} values={p.form} zoom={zoom} live={interactive} onChange={p.onField} />}
        {draft && <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}><AnnoView a={draft} zoom={zoom} hit={false} /></div>}
        {region && <div data-testid="region" style={{ position: 'absolute', left: region.x * zoom, top: region.y * zoom, width: region.w * zoom, height: region.h * zoom, border: '2px dashed #0b3dd0', background: 'rgba(11,61,208,0.12)', pointerEvents: 'none' }} />}
        {tool === 'editText' && p.runs.filter((r) => !runCovered(page.annos, r)).map((r) => (
          <button key={r.id} type="button" aria-label={`Edit text: ${r.str}`} onClick={(e) => pickRun(r, e.altKey, toPage(e)[1])} data-run={r.str} data-lines={r.parts?.length ?? 1} data-conf={r.conf === undefined ? undefined : Math.round(Math.min(...(r.parts ?? [r]).map((l) => l.conf ?? 100)))} data-size={r.box.size.toFixed(1)} data-look={`${r.fam}${r.bold ? '-bold' : ''}`}
            title={r.parts ? `Click to change this paragraph (${r.parts.length} lines). Alt-click changes only one line.` : 'Click to change this text'}
            className={`absolute rounded-[3px] border-2 ${p.outlineRuns ? 'border-[#38bdf8] bg-[#38bdf82e] shadow-[0_0_0_1px_rgba(15,23,42,0.9),inset_0_0_0_1px_rgba(255,255,255,0.9)]' : 'border-transparent bg-transparent'} hover:border-[#fbbf24] hover:bg-[#fbbf2447] hover:shadow-[0_0_0_1px_rgba(15,23,42,0.9),inset_0_0_0_1px_rgba(255,255,255,0.95)] focus-visible:border-[#fbbf24] focus-visible:bg-[#fbbf2447] focus:outline-none`}
            style={{ left: r.box.x * zoom - 1, top: r.box.y * zoom - 1, width: r.box.w * zoom + 2, height: r.box.h * zoom + 2, cursor: 'text', ...(r.box.rot ? { transform: `rotate(${r.box.rot}deg)`, transformOrigin: '0 0' } : {}) }} data-rot={r.box.rot ? r.box.rot.toFixed(1) : undefined} />
        ))}
        {interactive && sel && (
          <div data-selection data-rot={'rot' in sel && sel.rot ? String(sel.rot) : undefined} style={{ position: 'absolute', left: sel.x * zoom, top: sel.y * zoom, width: sel.w * zoom, height: sel.h * zoom, outline: '1.5px solid #0b3dd0', outlineOffset: 1, pointerEvents: 'none', ...('rot' in sel && sel.rot ? { transform: `rotate(${sel.rot}deg)`, transformOrigin: '0 0' } : {}) }}>
            {p.editingId !== sel.id && !('rot' in sel && sel.rot) && (sel.kind === 'text' ? (sel.wrap !== undefined ? SIDES : CORNERS) : HANDLES).map((h) => (
              <span key={h} role="presentation" data-handle={h} onPointerDown={(e) => onHandleDown(e, sel, h)}
                style={{ position: 'absolute', left: HANDLE_POS[h][0], top: HANDLE_POS[h][1], width: 22, height: 22, transform: 'translate(-50%, -50%)', cursor: CURSOR[h], pointerEvents: 'auto', touchAction: 'none', display: 'grid', placeItems: 'center' }}>
                <span style={{ width: 10, height: 10, background: '#fff', border: '2px solid #0b3dd0', borderRadius: 2, display: 'block' }} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
