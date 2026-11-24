import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { CANVAS, TEXT_ALIGN_CSS, canRotate, expandToGroups, isWholeGroup, textShadowCss, visualBox, type AspectRatio, type Slide, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'
import { effectiveBackground, isDark, resolveColor, slideTheme } from '@prompttoppt/theme'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { ElementView, Footer, SlideBackground, backgroundCss } from '@prompttoppt/ui'
import { pointer } from '@/editor/live'
import { RotateCw } from '@prompttoppt/ui/icons'
import { FormatBar } from './FormatBar'
import { ContextMenu } from './ContextMenu'
import { objectMenuItems, slideMenuItems } from './objectMenu'
import { useComments } from '@/editor/comments'
import { CommentPins } from './CommentPins'
import { PeerLayer } from './PeerLayer'
import { CanvasAnimationOverlay, PathBar } from './animation/CanvasAnimationOverlay'
import { StageOverlays } from './animation/StageOverlays'
import { applyListShortcut, backspaceAtListStart, normalizeRoot, pastePlain, splitParagraph, toggleList } from '@/editor/inline-lists'
import { canonicalRuns, clearInline, formatInline, inlineBase, readRuns, registerInline, runSpanStyle } from '@/editor/inline-runs'
import { TypingBar } from './TypingBar'
import { handleAngle, handleCursor, resizeTurned, rotateElements, snapAngle } from '@/editor/rotate'
import { snapMoveToGrid, snapResizeToGrid, useGrid } from '@/editor/grid'

const HANDLES: C.Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** the box all the selected objects take on the slide, as seen (the toolbar keeps clear of all of them, not only the first) */
const selBox = (els: SlideElement[]) => {
  const bs = els.map((e) => visualBox(e, e.rotation))
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y))
  return { x, y, width: Math.max(...bs.map((b) => b.x + b.width)) - x, height: Math.max(...bs.map((b) => b.y + b.height)) - y }
}
const HANDLE_POS: Record<C.Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] }
const HEADING = new Set(['title', 'heading', 'metric', 'subtitle'])

/** The width the slide is drawn at: the room the page gives it, never more than `max`, and (for a tall slide such as 9:16) never so wide that its height runs off the screen. */
function useFitWidth(max: number, tall?: { W: number; H: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [vh, setVh] = useState(() => window.innerHeight)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.min(max, Math.floor(e!.contentRect.width))))
    ro.observe(el)
    const on = () => setVh(window.innerHeight)
    window.addEventListener('resize', on)
    return () => { ro.disconnect(); window.removeEventListener('resize', on) }
  }, [max])
  // room above and below the slide (title bar, ribbon, notes, the floating dock): about 260 px
  const byHeight = tall ? Math.max(240, Math.floor(((vh - 260) * tall.W) / tall.H)) : Infinity
  return [ref, Math.min(w, byHeight)] as const
}

/** A text box nobody has typed in (its words are all empty). */
const isEmptyText = (el: TextElement) => el.paragraphs.every((p) => p.runs.every((r) => r.text.trim() === ''))

/**
 * Inline editor for a text element: commits on blur / Escape as ONE undoable edit. It looks like the slide while you type: every paragraph is its own block, every styled
 * stretch of words is drawn as it is on the slide, list items keep their bullet / number (drawn by CSS, never part of the text), Enter makes the next bullet, Enter on an empty
 * bullet or Backspace at the start of one leaves the list, "- " / "1. " start a list, Ctrl/Cmd+Shift+8 / 7 toggle bullets / numbers. Ctrl/Cmd+B, I, U (and \\ to clear) format the
 * SELECTED words (or the word at the caret, or what is typed next), like a word processor; the text bar above does the same. What is saved is read back from what is shown.
 */
function InlineText({ el, theme, slide, onCommit }: { el: TextElement; theme: Theme; slide: Slide; onCommit: (paragraphs: TextElement['paragraphs']) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  const resolve = (c: string) => resolveColor(c, theme, slide)
  const base = inlineBase(el, resolve)
  const baseRef = useRef(base)
  useEffect(() => { baseRef.current = base })
  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    return registerInline(el.id, node)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The box can be CLOSED by the editor itself (a click on the slide background or on another object clears editingId first). A box that is removed never sends
  // its blur event, so the typed words would be lost. Keep the latest words and the latest onCommit, and save them when the box goes away.
  const typed = useRef<TextElement['paragraphs'] | null>(null)
  const onCommitRef = useRef(onCommit)
  useEffect(() => { onCommitRef.current = onCommit })
  const commit = () => {
    if (done.current) return
    done.current = true
    const node = ref.current
    onCommit(node ? readRuns(node, baseRef.current) : typed.current ?? el.paragraphs)
  }
  useEffect(() => () => {
    if (done.current || !typed.current) return // already saved, or nothing was changed
    done.current = true
    onCommitRef.current(typed.current)
  }, [])
  const heading = HEADING.has(el.role)
  const gap = el.fontSize * (el.paraGap ?? 0.5)
  return (
    <>
    {/* the same spacing, indent and markers as the slide itself, so the text does not jump when editing starts (outside the editable box: it must never become text) */}
    <style>{`.pt-inline-edit{counter-reset:pt-n}.pt-inline-edit>div{position:relative;margin-bottom:var(--pt-gap);counter-increment:pt-n;white-space:pre-wrap}.pt-inline-edit>div:last-child{margin-bottom:0}.pt-inline-edit>div[data-list]{padding-inline-start:var(--pt-indent)}.pt-inline-edit>div[data-list]::before{position:absolute;inset-inline-start:0;content:var(--pt-bullet);user-select:none}.pt-inline-edit>div[data-list="number"]::before{content:counter(pt-n) "."}`}</style>
    <div
      ref={ref}
      className="pt-inline-edit"
      data-testid="inline-text"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Edit text"
      aria-multiline="true"
      // a button of the text bar (B / I / U, a colour) keeps the box open: it formats the selected words
      onBlur={(e) => { if (e.relatedTarget instanceof Element && e.relatedTarget.closest('[data-inline-keep]')) return; commit() }}
      onPaste={(e) => { e.preventDefault(); if (ref.current) pastePlain(ref.current, e.clipboardData.getData('text/plain')) }}
      onInput={() => { if (ref.current) { normalizeRoot(ref.current); applyListShortcut(ref.current); typed.current = readRuns(ref.current, baseRef.current) } }}
      onKeyDown={(e) => {
        e.stopPropagation() // keep editor shortcuts (delete/undo/nudge) out of text editing
        const root = ref.current
        const mod = (e.ctrlKey || e.metaKey) && !e.altKey
        const flag = mod && !e.shiftKey ? ({ b: 'bold', i: 'italic', u: 'underline' } as const)[e.key.toLowerCase() as 'b' | 'i' | 'u'] : undefined
        if (root && flag) { e.preventDefault(); formatInline(root, flag); return }
        if (root && mod && !e.shiftKey && e.key === '\\') { e.preventDefault(); clearInline(root); return }
        if (root && mod && e.shiftKey && (e.code === 'Digit8' || e.code === 'Digit7')) { e.preventDefault(); toggleList(root, e.code === 'Digit8' ? 'bullet' : 'number'); typed.current = readRuns(root, baseRef.current); return }
        if (root && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); splitParagraph(root); typed.current = readRuns(root, baseRef.current); return }
        if (root && e.key === 'Backspace' && !e.nativeEvent.isComposing && backspaceAtListStart(root)) { e.preventDefault(); typed.current = readRuns(root, baseRef.current); return }
        if (e.key === 'Escape') {
          e.preventDefault()
          commit()
        }
      }}
      style={{
        position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 9000, ...(el.rotation ? { transform: `rotate(${el.rotation}deg)` } : {}), outline: '3px solid #2563eb', background: 'rgba(255,255,255,0.0)', overflowWrap: 'anywhere',
        display: 'flex', flexDirection: 'column', justifyContent: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.valign], textAlign: TEXT_ALIGN_CSS[el.align], unicodeBidi: 'plaintext', color: base.colorHex, fontSize: el.fontSize, lineHeight: el.lineHeight ?? 1.3,
        fontFamily: `'${heading ? slideTheme(theme, slide).fonts.heading : slideTheme(theme, slide).fonts.body}', system-ui, sans-serif`, // (the slide's own brand fonts: the same as the slide draws them) fontWeight: base.weight, fontStyle: base.italic ? 'italic' : undefined,
        ...(el.uppercase ? { textTransform: 'uppercase' as const } : {}), ...(el.letterSpacing ? { letterSpacing: el.letterSpacing } : {}),
        ...(el.textShadow ? { textShadow: textShadowCss(el.textShadow) } : {}), ...(el.textOutline ? { WebkitTextStroke: `${el.textOutline.width}px ${resolve(el.textOutline.color)}` } : {}), // (typing shows the box's effects, as the slide does)
        ['--pt-gap' as string]: `${gap}px`, ['--pt-indent' as string]: `${el.fontSize * 0.9}px`, ['--pt-bullet' as string]: JSON.stringify(el.bullet ?? '•'),
      }}
    >
      {el.paragraphs.map((p, i) => (
        <div key={i} {...(p.list ? { 'data-list': p.list } : {})}>
          {p.runs.some((r) => r.text) ? p.runs.map((r, k) => (
            <span key={k} style={runSpanStyle(r, base, resolve)} {...(r.color && !r.color.startsWith('#') ? { 'data-c': r.color, 'data-hex': resolve(r.color).toUpperCase() } : {})} {...(r.link ? { 'data-link': r.link } : {})}>{r.text}</span>
          )) : <br />}
        </div>
      ))}
    </div>
    </>
  )
}

/** Loads the picture once more, off screen; when it fails, a button on the picture's box says so and opens the picture dialog to replace it. Nothing is drawn for a picture that loads. */
function BrokenPictureCue({ el }: { el: Extract<SlideElement, { type: 'image' }> }) {
  const [broken, setBroken] = useState<string | null>(null)
  useEffect(() => {
    let off = false
    const probe = new Image()
    probe.referrerPolicy = 'no-referrer'
    probe.onerror = () => { if (!off) setBroken(el.src ?? null) }
    probe.src = el.src ?? ''
    return () => { off = true; probe.onerror = null }
  }, [el.src])
  if (!el.src || broken !== el.src) return null
  return (
    <button type="button" data-testid="picture-unavailable-cue" aria-label="Picture unavailable: replace it" onPointerDown={(e) => e.stopPropagation()} onClick={() => useUi.getState().openImageDialog({ elementId: el.id })}
      style={{ position: 'absolute', left: el.x + el.width / 2, top: el.y + el.height / 2, transform: 'translate(-50%, -50%)', zIndex: 5001 + el.zIndex, pointerEvents: 'auto', cursor: 'pointer', padding: '10px 22px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '2px solid #f59e0b', font: '600 26px/1.2 system-ui, sans-serif', whiteSpace: 'nowrap' }}>
      Picture unavailable — replace
    </button>
  )
}

interface Props {
  slide: Slide
  theme: Theme
  aspect: AspectRatio
  watermark: boolean
  /** Pro "advanced editor": moving/resizing/formatting objects. Returns false (and prompts upgrade) if not allowed. */
  requireAdvanced: () => boolean
}

export function EditorCanvas({ slide, theme, aspect, watermark, requireAdvanced }: Props) {
  /** where the pointer went down on a box: a click that did not move is a click, not the end of a drag */
  const downAt = useRef<{ x: number; y: number; was: boolean } | null>(null)
  const apply = useDoc((s) => s.apply)
  const { selection, editingId, select, edit } = useUi()
  const { width: W, height: H } = CANVAS[aspect]
  // where this slide sits in the deck, for the footer (plain values, so the canvas only re-renders when they change)
  const footerAt = useDoc((st) => st.doc?.slides.findIndex((x) => x.id === slide.id) ?? -1)
  const footerTotal = useDoc((st) => st.doc?.slides.length ?? 0)
  const footerTitle = useDoc((st) => st.doc?.title ?? '')
  const footerInfo = footerAt >= 0 ? { index: footerAt, total: footerTotal, title: footerTitle } : null
  const placing = useComments((c) => c.placing)
  const grid = useGrid()
  const [wrap, width] = useFitWidth(1100, H > W ? { W, H } : undefined)
  const scale = width / W || 1
  const [drag, setDrag] = useState<{ ids: string[]; dx: number; dy: number; guides: C.Guide[] } | null>(null)
  const [resize, setResize] = useState<{ id: string; box: C.Box } | null>(null)
  /** the object being turned with its handle, and the angle it shows now */
  const [turn, setTurn] = useState<{ id: string; angle: number } | null>(null)
  /** a whole group being resized: every member's new box, and how much text grows */
  const [groupResize, setGroupResize] = useState<{ boxes: Record<string, C.Box>; font: number } | null>(null)
  /** the right-click menu: on objects (the selection) or on the empty slide */
  const [menu, setMenu] = useState<{ x: number; y: number; on: 'object' | 'slide' } | null>(null)
  const gesture = useRef<{ kind: 'move' | 'resize' | 'rotate'; sx: number; sy: number; ids: string[]; base: Record<string, C.Box>; handle?: C.Handle; rot?: number; stage?: DOMRect; moved: boolean; blocked: boolean } | null>(null)

  const readOnly = useDoc((st) => st.readOnly)
  const locked = slide.locked || !!slide.writing || readOnly // a slide still being written cannot be edited until its text lands; a viewer (read-only copy) cannot edit at all
  const shown = useMemo<SlideElement[]>(
    () => slide.elements.filter((e) => !e.hidden).map((e) => (e.rotation && !canRotate(e) ? { ...e, rotation: 0 } : e)).map((e) => (drag?.ids.includes(e.id) ? { ...e, x: e.x + drag.dx, y: e.y + drag.dy } : resize?.id === e.id ? { ...e, ...resize.box } : turn?.id === e.id ? { ...e, rotation: turn.angle } : groupResize?.boxes[e.id] ? { ...e, ...groupResize.boxes[e.id]! } : e)),
    [slide.elements, drag, resize, turn, groupResize],
  )
  const bg = backgroundCss(slide, theme)

  /** the selection is exactly one whole group: it is resized as one (the bounding box has the handles) */
  const groupOnly = isWholeGroup(slide.elements, selection)

  function begin(e: RPE, el: SlideElement, kind: 'move' | 'resize' | 'rotate', handle?: C.Handle) {
    e.stopPropagation()
    if (e.button === 2) { // right button: select (keep a selection the object is part of), never start a drag; the menu opens on contextmenu
      if (kind === 'move' && !selection.includes(el.id)) select(expandToGroups(slide.elements, [el.id]))
      return
    }
    if (kind === 'move') {
      const additive = e.shiftKey
      const ids = expandToGroups(slide.elements, selection.includes(el.id) && !additive ? selection : additive ? [...new Set([...selection, el.id])] : [el.id]) // (a group is selected, moved and deleted as one)
      select(ids)
      if (el.locked || locked) return
      gesture.current = { kind, sx: e.clientX, sy: e.clientY, ids, base: Object.fromEntries(slide.elements.filter((x) => ids.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y, width: x.width, height: x.height }])), moved: false, blocked: false }
    } else if (kind === 'rotate') {
      const stage = (e.currentTarget as HTMLElement).closest('[data-testid="stage"]')?.getBoundingClientRect()
      gesture.current = { kind, sx: e.clientX, sy: e.clientY, ids: [el.id], base: { [el.id]: { x: el.x, y: el.y, width: el.width, height: el.height } }, rot: el.rotation ?? 0, ...(stage ? { stage } : {}), moved: false, blocked: false }
    } else if (groupOnly) {
      gesture.current = { kind, sx: e.clientX, sy: e.clientY, ids: selection, base: Object.fromEntries(slide.elements.filter((x) => selection.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y, width: x.width, height: x.height }])), handle: handle!, moved: false, blocked: false }
    } else {
      gesture.current = { kind, sx: e.clientX, sy: e.clientY, ids: [el.id], base: { [el.id]: { x: el.x, y: el.y, width: el.width, height: el.height } }, handle: handle!, rot: el.rotation ?? 0, moved: false, blocked: false }
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function move(e: RPE) {
    const g = gesture.current
    if (!g || g.blocked) return
    const dx = (e.clientX - g.sx) / scale
    const dy = (e.clientY - g.sy) / scale
    if (!g.moved) {
      if (Math.hypot(dx, dy) * scale < 4) return
      if (!requireAdvanced()) { // Starter: selecting/typing is fine, moving objects is a Pro feature
        g.blocked = true
        return
      }
      g.moved = true
    }
    if (g.kind === 'move') {
      // lined up by what is SEEN: a turned object snaps by the upright box it fills on the slide
      const first = slide.elements.find((x) => x.id === g.ids[0])
      const primary = visualBox(g.base[g.ids[0]!]!, first?.rotation)
      const others = slide.elements.filter((x) => !g.ids.includes(x.id) && !x.hidden).map((x) => visualBox(x, x.rotation))
      const guided = e.altKey ? { x: primary.x + dx, y: primary.y + dy, guides: [] as C.Guide[] } : C.snap({ ...primary, x: primary.x + dx, y: primary.y + dy }, others, aspect)
      // on the grid (when "Snap to grid" is on): the edges land on grid lines (the grid wins; a guide shows where it also aligns); Alt places freely
      const s = grid.snap && !e.altKey ? snapMoveToGrid({ x: primary.x + dx, y: primary.y + dy, width: primary.width, height: primary.height }, guided, grid.size) : guided
      setDrag({ ids: g.ids, dx: s.x - primary.x, dy: s.y - primary.y, guides: s.guides })
    } else if (g.kind === 'rotate') {
      const b = g.base[g.ids[0]!]!, r = g.stage
      if (!r) return
      const angle = handleAngle(b.x + b.width / 2, b.y + b.height / 2, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale)
      setTurn({ id: g.ids[0]!, angle: snapAngle(angle, e.shiftKey) })
    } else if (g.ids.length > 1) {
      // a group: its bounding box is resized, every member keeps its place and size inside it
      const all = g.ids.map((id) => g.base[id]!)
      const bb = { x: Math.min(...all.map((b) => b.x)), y: Math.min(...all.map((b) => b.y)), width: 0, height: 0 }
      bb.width = Math.max(...all.map((b) => b.x + b.width)) - bb.x; bb.height = Math.max(...all.map((b) => b.y + b.height)) - bb.y
      const nb = C.resizeBox(bb, g.handle!, dx, dy)
      const sx = nb.width / bb.width, sy = nb.height / bb.height
      setGroupResize({ boxes: Object.fromEntries(g.ids.map((id) => { const b = g.base[id]!; return [id, { x: nb.x + (b.x - bb.x) * sx, y: nb.y + (b.y - bb.y) * sy, width: b.width * sx, height: b.height * sy }] })), font: Math.min(sx, sy) })
    } else {
      const box = resizeTurned(g.base[g.ids[0]!]!, g.rot ?? 0, g.handle!, dx, dy)
      setResize({ id: g.ids[0]!, box: grid.snap && !e.altKey && !(g.rot ?? 0) ? snapResizeToGrid(box, g.handle!, grid.size) : box })
    }
  }

  function end() {
    const g = gesture.current
    gesture.current = null
    if (!g?.moved) { setGroupResize(null); setTurn(null); return setDrag(null) }
    if (g.kind === 'move' && drag) apply('Move', (d) => C.moveElements(d, slide.id, drag.ids, drag.dx, drag.dy))
    if (g.kind === 'resize' && resize) apply('Resize', (d) => C.setGeometry(d, slide.id, resize.id, resize.box))
    if (g.kind === 'resize' && groupResize) apply('Resize group', (d) => C.setBoxes(d, slide.id, groupResize.boxes, groupResize.font))
    if (g.kind === 'rotate' && turn) apply('Rotate', (d) => { rotateElements(d, slide.id, [turn.id], { to: turn.angle }) })
    setDrag(null)
    setResize(null)
    setTurn(null)
    setGroupResize(null)
  }

  const sel = selection.map((id) => shown.find((e) => e.id === id)).filter((e): e is SlideElement => !!e)
  const primary = sel[0]
  /** the box round a selected whole group (where its handles are), or null */
  const groupBox = groupOnly && sel.length > 1 && !locked && !sel.some((x) => x.locked)
    ? (() => { const x = Math.min(...sel.map((e) => e.x)), y = Math.min(...sel.map((e) => e.y)); return { x, y, w: Math.max(...sel.map((e) => e.x + e.width)) - x, h: Math.max(...sel.map((e) => e.y + e.height)) - y } })()
    : null

  return (
    <div ref={wrap} style={{ width: '100%' }}>
      {width > 0 && (
        <div
          style={{ position: 'relative', width, height: H * scale }} data-testid="stage" data-scale={scale}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); pointer.current = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; pointer.poke() }}
          onPointerLeave={() => { pointer.current = null; pointer.poke() }}
        >
          {/* rendered slide: clipped to the slide rectangle */}
          <div style={{ width, height: H * scale, overflow: 'hidden', position: 'relative', background: bg, borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }} onPointerDown={() => { select([]); edit(null) }} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, on: 'slide' }) }}>
            <SlideBackground slide={slide} scale={scale} W={W} H={H} />
            <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
              {shown.map((el) => (el.id === editingId && el.type === 'text' ? null : <ElementView key={el.id} el={el} theme={theme} slide={slide} />))}
              {/* the deck footer as the slideshow and the file draw it (Style > Design > Footer); not part of the slide, so it cannot be selected */}
              {footerInfo && <div style={{ pointerEvents: 'none' }}><Footer info={footerInfo} theme={theme} slide={slide} W={W} H={H} M={Math.round(W * 0.05)} /></div>}
              {watermark && (
                <div aria-hidden style={{ position: 'absolute', right: 32, bottom: 24, zIndex: 9999, pointerEvents: 'none', padding: '10px 20px', borderRadius: 999, background: 'rgba(15,23,42,0.78)', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 26, fontWeight: 600 }}>
                  Made with SlidesDone
                </div>
              )}
            </div>
          </div>
          {/* interaction layer: same coordinate space but NOT clipped, so handles/outlines of elements that extend past the slide edge stay reachable */}
          <div style={{ position: 'absolute', left: 0, top: 0, width, height: H * scale, pointerEvents: 'none' }}>
            <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
              {shown.map((el) => {
                const isSel = selection.includes(el.id)
                if (el.id === editingId && el.type === 'text') {
                  return (
                    <div key={el.id} style={{ pointerEvents: 'auto' }}>
                      <InlineText el={el} theme={theme} slide={slide} onCommit={(next) => { if (JSON.stringify(next) === JSON.stringify(canonicalRuns(el.paragraphs, inlineBase(el, (c) => resolveColor(c, theme, slide)), (c) => resolveColor(c, theme, slide)))) { edit(null); return } /* nothing changed: no edit, no new revision, the slide is not marked hand-edited */ apply('Edit text', (d) => C.setText(d, slide.id, el.id, next), { mergeKey: `text:${el.id}` }); edit(null) }} />
                    </div>
                  )
                }
                if (el.decorative && !isSel) return null // background ornaments bleed past the slide edge; they must never catch clicks meant for the page around the canvas
                // an unselected element's hit area is clipped to the slide, so overhanging objects can't cover the notes button / toolbars below the canvas
                const clip = isSel ? undefined : `inset(${Math.max(0, -el.y)}px ${Math.max(0, el.x + el.width - W)}px ${Math.max(0, el.y + el.height - H)}px ${Math.max(0, -el.x)}px)`
                return (
                  <div
                    key={el.id}
                    data-element={el.id}
                    data-testid={`el-${el.type}`}
                    onPointerDown={(e) => { downAt.current = { x: e.clientX, y: e.clientY, was: selection.includes(el.id) }; begin(e, el, 'move') }}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, on: 'object' }) }}
                    onPointerMove={move}
                    onPointerUp={end}
                    onClick={(e) => { const d0 = downAt.current; /* the first click on an empty "Click to add …" box selects it (its tools, with Delete, show); a click on the box while it is selected starts typing */ if (el.type === 'text' && el.hint && !el.locked && !locked && isEmptyText(el) && d0?.was && Math.hypot(e.clientX - d0.x, e.clientY - d0.y) < 4) edit(el.id) }}
                    onDoubleClick={(e) => { e.stopPropagation(); if (el.type === 'text' && !el.locked && !locked) edit(el.id); else if (el.type === 'table' && !el.locked && !locked) useUi.getState().editTable(el.id); else if (el.type === 'chart' && !el.locked && !locked) useUi.getState().editChart(el.id) }}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 5000 + el.zIndex, ...(el.rotation ? { transform: `rotate(${el.rotation}deg)` } : {}), ...(clip && !el.rotation ? { clipPath: clip } : {}), cursor: el.locked || locked ? 'default' : 'move', touchAction: 'none', pointerEvents: 'auto', outline: isSel ? `${Math.max(2, 2 / scale)}px solid #2563eb` : undefined }}
                    className={isSel ? '' : 'hover:outline hover:outline-2 hover:outline-blue-300/70'}
                  />
                )
              })}
              {/* an empty text box of a new slide says what goes in it, here only: like the chart cue below, this layer is not part of the slide, so thumbnails, Present, the shared view and every export draw nothing */}
              {shown.map((el) => (el.type === 'text' && el.hint && el.id !== editingId && isEmptyText(el) ? (
                <div key={`hint-${el.id}`} aria-hidden data-testid="text-hint" style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 4000, pointerEvents: 'none', ...(el.rotation ? { transform: `rotate(${el.rotation}deg)` } : {}), display: 'flex', flexDirection: 'column', justifyContent: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.valign], textAlign: TEXT_ALIGN_CSS[el.align], color: isDark(effectiveBackground(slide, theme, el)) ? 'rgba(255,255,255,.62)' : '#94a3b8', fontSize: Math.min(el.fontSize, 56), lineHeight: el.lineHeight ?? 1.3, fontFamily: `'${HEADING.has(el.role) ? theme.fonts.heading : theme.fonts.body}', system-ui, sans-serif`, fontWeight: el.role === 'title' ? 700 : 400, outline: `${Math.max(2, 2 / scale)}px dashed ${isDark(effectiveBackground(slide, theme, el)) ? 'rgba(255,255,255,.4)' : '#cbd5e1'}`, outlineOffset: -1, overflow: 'hidden', userSelect: 'none' }}>
                  <span>{el.hint}</span>
                </div>
              ) : null))}
              {/* a picture that cannot be loaded (a stock photo that was taken down) says so and offers a replacement, here only */}
              {shown.map((el) => (el.type === 'image' && el.src && !el.locked && !locked ? <BrokenPictureCue key={`broken-${el.id}`} el={el} /> : null))}
              {/* a chart that still holds sample data says so, here only: this layer is not part of the slide, so thumbnails, Present, shared view and every export draw a plain chart */}
              {shown.map((el) => (el.type === 'chart' && el.placeholder ? (
                <button key={`sample-${el.id}`} type="button" data-testid="chart-sample-cue" aria-label="Sample data: edit this chart" onPointerDown={(e) => e.stopPropagation()} onClick={() => { if (!el.locked && !locked) useUi.getState().editChart(el.id) }}
                  style={{ position: 'absolute', left: el.x + 12, top: el.y + 12, zIndex: 5001 + el.zIndex, pointerEvents: 'auto', cursor: 'pointer', padding: '8px 18px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '2px solid #f59e0b', font: '600 26px/1.2 system-ui, sans-serif', whiteSpace: 'nowrap' }}>
                  Sample data — edit this chart
                </button>
              ) : null))}
              {grid.show && (
                // the grid: drawn here only (this layer is not part of the slide: thumbnails, Present and every download never show it)
                <svg aria-hidden data-testid="editor-grid" width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 1 }}>
                  <defs><pattern id="sd-editor-grid" width={grid.size} height={grid.size} patternUnits="userSpaceOnUse"><path d={`M${grid.size} 0H0V${grid.size}`} fill="none" stroke="rgba(37,99,235,0.28)" strokeWidth={Math.max(1, 1 / scale)} /></pattern></defs>
                  <rect width={W} height={H} fill="url(#sd-editor-grid)" />
                </svg>
              )}
              <CanvasAnimationOverlay slide={slide} scale={scale} W={W} H={H} />
              <PeerLayer slideId={slide.id} elements={slide.elements} scale={scale} />
              <CommentPins slideId={slide.id} W={W} H={H} scale={scale} />
              {drag?.guides.map((g) => (
                <div key={`${g.axis}${g.at}`} aria-hidden style={{ position: 'absolute', zIndex: 9500, background: '#ec4899', pointerEvents: 'none', ...(g.axis === 'x' ? { left: g.at, top: 0, width: Math.max(1, 1.5 / scale), height: H } : { top: g.at, left: 0, height: Math.max(1, 1.5 / scale), width: W }) }} />
              ))}
              {groupBox && (
                <>
                  <div aria-hidden data-testid="group-box" style={{ position: 'absolute', zIndex: 9590, pointerEvents: 'none', left: groupBox.x, top: groupBox.y, width: groupBox.w, height: groupBox.h, outline: `${2 / scale}px dashed #6366f1` }} />
                  {HANDLES.map((h) => (
                    <div key={h} role="button" aria-label={`Resize group ${h}`} data-group-handle={h} onPointerDown={(e) => begin(e, primary!, 'resize', h)} onPointerMove={move} onPointerUp={end}
                      style={{ position: 'absolute', zIndex: 9600, pointerEvents: 'auto', width: 12 / scale, height: 12 / scale, left: groupBox.x + HANDLE_POS[h][0] * groupBox.w - 6 / scale, top: groupBox.y + HANDLE_POS[h][1] * groupBox.h - 6 / scale, background: '#fff', border: `${1.5 / scale}px solid #6366f1`, borderRadius: 3 / scale, cursor: handleCursor(h) }} />
                  ))}
                </>
              )}
              {sel.length === 1 && primary && !primary.locked && !locked && editingId !== primary.id && (
                // the handles sit on the object's own sides, so they turn with it; the round handle below the middle turns it
                <div data-testid="handles" style={{ position: 'absolute', left: primary.x, top: primary.y, width: primary.width, height: primary.height, zIndex: 9600, pointerEvents: 'none', ...(primary.rotation ? { transform: `rotate(${primary.rotation}deg)` } : {}) }}>
                  {HANDLES.map((h) => (
                    <div
                      key={h}
                      role="button"
                      aria-label={`Resize ${h}`}
                      data-handle={h}
                      onPointerDown={(e) => begin(e, primary, 'resize', h)}
                      onPointerMove={move}
                      onPointerUp={end}
                      style={{ position: 'absolute', pointerEvents: 'auto', width: 12 / scale, height: 12 / scale, left: HANDLE_POS[h][0] * primary.width - 6 / scale, top: HANDLE_POS[h][1] * primary.height - 6 / scale, background: '#fff', border: `${Math.max(1, 2 / scale)}px solid #2563eb`, borderRadius: 2, cursor: handleCursor(h, primary.rotation), touchAction: 'none' }}
                    />
                  ))}
                  {canRotate(primary) && !drag && !resize && (
                    <>
                      <div aria-hidden style={{ position: 'absolute', left: primary.width / 2 - 0.75 / scale, top: primary.height, width: 1.5 / scale, height: 22 / scale, background: '#2563eb' }} />
                      <div
                        role="slider"
                        aria-label="Rotate"
                        aria-valuemin={-180}
                        aria-valuemax={180}
                        aria-valuenow={Math.round(primary.rotation ?? 0)}
                        aria-valuetext={`${Math.round(primary.rotation ?? 0)}°`}
                        title="Drag to turn (Shift: 15° steps) · Alt+arrow keys turn it too"
                        data-testid="rotate-handle"
                        onPointerDown={(e) => begin(e, primary, 'rotate')}
                        onPointerMove={move}
                        onPointerUp={end}
                        style={{ position: 'absolute', pointerEvents: 'auto', width: 18 / scale, height: 18 / scale, left: primary.width / 2 - 9 / scale, top: primary.height + 22 / scale, borderRadius: '50%', background: '#fff', border: `${Math.max(1, 2 / scale)}px solid #2563eb`, cursor: turn ? 'grabbing' : 'grab', touchAction: 'none', display: 'grid', placeItems: 'center' }}
                      >
                        <RotateCw aria-hidden size={11 / scale} color="#2563eb" strokeWidth={2.5} />
                      </div>
                    </>
                  )}
                </div>
              )}
              {turn && primary && (
                <div data-testid="rotate-angle" aria-live="polite" style={{ position: 'absolute', zIndex: 9700, pointerEvents: 'none', left: primary.x + primary.width / 2, top: visualBox(primary, primary.rotation).y - 16 / scale, transform: 'translate(-50%, -100%)', padding: `${4 / scale}px ${10 / scale}px`, borderRadius: 999, background: '#0f172a', color: '#fff', font: `600 ${13 / scale}px/1.2 system-ui, sans-serif`, whiteSpace: 'nowrap' }}>
                  {Math.round(turn.angle * 10) / 10}°
                </div>
              )}
            </div>
          </div>
          <StageOverlays slide={slide} width={width} />
          <PathBar slide={slide} />
          {placing && (
            <div data-testid="pin-overlay" aria-label="Click to place the comment" role="button" tabIndex={0}
              style={{ position: 'absolute', left: 0, top: 0, width, height: H * scale, zIndex: 50, cursor: 'crosshair', outline: '3px dashed #2563eb', outlineOffset: -3, background: 'rgba(37,99,235,.06)' }}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); useComments.getState().setPending({ slideId: slide.id, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }) }}
              onKeyDown={(e) => { if (e.key === 'Escape') useComments.getState().setPlacing(false) }} />
          )}
          {(() => {
            const typing = editingId ? shown.find((x) => x.id === editingId) : undefined
            if (!typing || locked || typing.locked) return null
            return <TypingBar el={typing} slideId={slide.id} scale={scale} stageWidth={width} stageHeight={H * scale} theme={slideTheme(theme, slide)} requireAdvanced={requireAdvanced} />
          })()}
          {primary && !readOnly && !editingId && !drag && !resize && !turn && !menu && <FormatBar el={primary} around={selBox(sel)} slideId={slide.id} scale={scale} stageWidth={width} stageHeight={H * scale} theme={slideTheme(theme, slide)} requireAdvanced={requireAdvanced} />}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.on === 'object' && selection.length ? objectMenuItems(slide, selection, requireAdvanced) : slideMenuItems(slide, requireAdvanced)} onClose={() => setMenu(null)} />}
    </div>
  )
}
