import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { CANVAS, type Slide, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'
import { resolveColor } from '@prompttoppt/theme'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { ElementView, backgroundCss } from '@prompttoppt/ui'
import { pointer } from '@/editor/live'
import { FormatBar } from './FormatBar'
import { useComments } from '@/editor/comments'
import { CommentPins } from './CommentPins'
import { PeerLayer } from './PeerLayer'
import { applyListShortcut, backspaceAtListStart, normalizeRoot, pastePlain, readParagraphs, splitParagraph, toggleList, type EditedParagraph } from '@/editor/inline-lists'

const HANDLES: C.Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CURSOR: Record<C.Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' }
const HANDLE_POS: Record<C.Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] }
const HEADING = new Set(['title', 'heading', 'metric', 'subtitle'])

function useFitWidth(max: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.min(max, Math.floor(e!.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [max])
  return [ref, w] as const
}

type Flag = 'bold' | 'italic' | 'underline'
/**
 * Inline editor for a text element: commits on blur / Escape as ONE undoable edit. It looks like the slide while you type: every paragraph is its own block, list items keep
 * their bullet / number (drawn by CSS, never part of the text), Enter makes the next bullet, Enter on an empty bullet or Backspace at the start of one leaves the list,
 * "- " / "1. " start a list, Ctrl/Cmd+Shift+8 / 7 toggle bullets / numbers. Ctrl/Cmd+B, I and U switch the whole box (like the toolbar buttons).
 */
function InlineText({ el, theme, slide, onCommit }: { el: TextElement; theme: Theme; slide: Slide; onCommit: (items: EditedParagraph[], flags: Partial<Record<Flag, boolean>>) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  const first = el.paragraphs[0]?.runs[0]
  const [fmt, setFmt] = useState<Record<Flag, boolean>>({ bold: !!first?.bold, italic: !!first?.italic, underline: !!first?.underline })
  const touched = useRef(new Set<Flag>())
  const fmtRef = useRef(fmt)
  useEffect(() => { fmtRef.current = fmt }, [fmt])
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
  }, [])
  const commit = () => {
    if (done.current) return
    done.current = true
    const node = ref.current
    if (node) normalizeRoot(node)
    onCommit(node ? readParagraphs(node) : [{ text: '' }], Object.fromEntries([...touched.current].map((f) => [f, fmtRef.current[f]])))
  }
  const heading = HEADING.has(el.role)
  const gap = el.fontSize * (el.paraGap ?? 0.5)
  return (
    <>
    {/* the same spacing, indent and markers as the slide itself, so the text does not jump when editing starts (outside the editable box: it must never become text) */}
    <style>{`.pt-inline-edit{counter-reset:pt-n}.pt-inline-edit>div{position:relative;margin-bottom:var(--pt-gap);counter-increment:pt-n;white-space:pre-wrap}.pt-inline-edit>div:last-child{margin-bottom:0}.pt-inline-edit>div[data-list]{padding-inline-start:var(--pt-indent)}.pt-inline-edit>div[data-list]::before{position:absolute;inset-inline-start:0;content:var(--pt-bullet);user-select:none}.pt-inline-edit>div[data-list="number"]::before{content:counter(pt-n) "."}`}</style>
    <div
      ref={ref}
      className="pt-inline-edit"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Edit text"
      aria-multiline="true"
      onBlur={commit}
      onPaste={(e) => { e.preventDefault(); if (ref.current) pastePlain(ref.current, e.clipboardData.getData('text/plain')) }}
      onInput={() => { if (ref.current) { normalizeRoot(ref.current); applyListShortcut(ref.current) } }}
      onKeyDown={(e) => {
        e.stopPropagation() // keep editor shortcuts (delete/undo/nudge) out of text editing
        const root = ref.current
        const mod = (e.ctrlKey || e.metaKey) && !e.altKey
        const flag = mod && !e.shiftKey ? ({ b: 'bold', i: 'italic', u: 'underline' } as const)[e.key.toLowerCase() as 'b' | 'i' | 'u'] : undefined
        if (flag) { e.preventDefault(); touched.current.add(flag); setFmt((f) => ({ ...f, [flag]: !f[flag] })); return }
        if (root && mod && e.shiftKey && (e.code === 'Digit8' || e.code === 'Digit7')) { e.preventDefault(); toggleList(root, e.code === 'Digit8' ? 'bullet' : 'number'); return }
        if (root && e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); splitParagraph(root); return }
        if (root && e.key === 'Backspace' && !e.nativeEvent.isComposing && backspaceAtListStart(root)) { e.preventDefault(); return }
        if (e.key === 'Escape') {
          e.preventDefault()
          commit()
        }
      }}
      style={{
        position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 9000, outline: '3px solid #2563eb', background: 'rgba(255,255,255,0.0)', overflowWrap: 'anywhere',
        display: 'flex', flexDirection: 'column', justifyContent: { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[el.valign], textAlign: { left: 'start', center: 'center', right: 'end' }[el.align] as 'start' | 'center' | 'end', unicodeBidi: 'plaintext', color: resolveColor(el.color, theme, slide), fontSize: el.fontSize, lineHeight: el.lineHeight ?? 1.3,
        fontFamily: `'${heading ? theme.fonts.heading : theme.fonts.body}', system-ui, sans-serif`, fontWeight: fmt.bold ? 700 : el.weight ?? (el.role === 'title' || el.role === 'metric' ? 800 : heading ? 700 : 400), fontStyle: fmt.italic ? 'italic' : undefined, textDecoration: fmt.underline ? 'underline' : undefined,
        ...(el.uppercase ? { textTransform: 'uppercase' as const } : {}), ...(el.letterSpacing ? { letterSpacing: el.letterSpacing } : {}),
        ['--pt-gap' as string]: `${gap}px`, ['--pt-indent' as string]: `${el.fontSize * 0.9}px`, ['--pt-bullet' as string]: JSON.stringify(el.bullet ?? '•'),
      }}
    >
      {el.paragraphs.map((p, i) => (
        <div key={i} {...(p.list ? { 'data-list': p.list } : {})}>{p.runs.map((r) => r.text).join('') || <br />}</div>
      ))}
    </div>
    </>
  )
}

interface Props {
  slide: Slide
  theme: Theme
  aspect: '16:9' | '4:3' | '1:1'
  watermark: boolean
  /** Pro "advanced editor": moving/resizing/formatting objects. Returns false (and prompts upgrade) if not allowed. */
  requireAdvanced: () => boolean
}

export function EditorCanvas({ slide, theme, aspect, watermark, requireAdvanced }: Props) {
  const apply = useDoc((s) => s.apply)
  const { selection, editingId, select, edit } = useUi()
  const { width: W, height: H } = CANVAS[aspect]
  const placing = useComments((c) => c.placing)
  const [wrap, width] = useFitWidth(1100)
  const scale = width / W || 1
  const [drag, setDrag] = useState<{ ids: string[]; dx: number; dy: number; guides: C.Guide[] } | null>(null)
  const [resize, setResize] = useState<{ id: string; box: C.Box } | null>(null)
  const gesture = useRef<{ kind: 'move' | 'resize'; sx: number; sy: number; ids: string[]; base: Record<string, C.Box>; handle?: C.Handle; moved: boolean; blocked: boolean } | null>(null)

  const locked = slide.locked
  const shown = useMemo<SlideElement[]>(
    () => slide.elements.map((e) => (drag?.ids.includes(e.id) ? { ...e, x: e.x + drag.dx, y: e.y + drag.dy } : resize?.id === e.id ? { ...e, ...resize.box } : e)),
    [slide.elements, drag, resize],
  )
  const bg = backgroundCss(slide, theme)

  function begin(e: RPE, el: SlideElement, kind: 'move' | 'resize', handle?: C.Handle) {
    e.stopPropagation()
    if (kind === 'move') {
      const additive = e.shiftKey
      const ids = selection.includes(el.id) && !additive ? selection : additive ? [...new Set([...selection, el.id])] : [el.id]
      select(ids)
      if (el.locked || locked) return
      gesture.current = { kind, sx: e.clientX, sy: e.clientY, ids, base: Object.fromEntries(slide.elements.filter((x) => ids.includes(x.id)).map((x) => [x.id, { x: x.x, y: x.y, width: x.width, height: x.height }])), moved: false, blocked: false }
    } else {
      gesture.current = { kind, sx: e.clientX, sy: e.clientY, ids: [el.id], base: { [el.id]: { x: el.x, y: el.y, width: el.width, height: el.height } }, handle: handle!, moved: false, blocked: false }
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
      const primary = g.base[g.ids[0]!]!
      const others = slide.elements.filter((x) => !g.ids.includes(x.id)).map((x) => ({ x: x.x, y: x.y, width: x.width, height: x.height }))
      const s = e.altKey ? { x: primary.x + dx, y: primary.y + dy, guides: [] as C.Guide[] } : C.snap({ ...primary, x: primary.x + dx, y: primary.y + dy }, others, aspect)
      setDrag({ ids: g.ids, dx: s.x - primary.x, dy: s.y - primary.y, guides: s.guides })
    } else {
      setResize({ id: g.ids[0]!, box: C.resizeBox(g.base[g.ids[0]!]!, g.handle!, dx, dy) })
    }
  }

  function end() {
    const g = gesture.current
    gesture.current = null
    if (!g?.moved) return setDrag(null)
    if (g.kind === 'move' && drag) apply('Move', (d) => C.moveElements(d, slide.id, drag.ids, drag.dx, drag.dy))
    if (g.kind === 'resize' && resize) apply('Resize', (d) => C.setGeometry(d, slide.id, resize.id, resize.box))
    setDrag(null)
    setResize(null)
  }

  const sel = selection.map((id) => shown.find((e) => e.id === id)).filter((e): e is SlideElement => !!e)
  const primary = sel[0]

  return (
    <div ref={wrap} style={{ width: '100%' }}>
      {width > 0 && (
        <div
          style={{ position: 'relative', width, height: H * scale }} data-testid="stage" data-scale={scale}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); pointer.current = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; pointer.poke() }}
          onPointerLeave={() => { pointer.current = null; pointer.poke() }}
        >
          {/* rendered slide: clipped to the slide rectangle */}
          <div style={{ width, height: H * scale, overflow: 'hidden', position: 'relative', background: bg, borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }} onPointerDown={() => { select([]); edit(null) }}>
            <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
              {shown.map((el) => (el.id === editingId && el.type === 'text' ? null : <ElementView key={el.id} el={el} theme={theme} slide={slide} />))}
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
                      <InlineText el={el} theme={theme} slide={slide} onCommit={(items, flags) => { apply('Edit text', (d) => { C.setText(d, slide.id, el.id, C.retextParagraphs(el.paragraphs, items.length ? items : [{ text: '' }])); for (const [flag, on] of Object.entries(flags)) C.setRunFlag(d, slide.id, el.id, flag as Flag, on) }, { mergeKey: `text:${el.id}` }); edit(null) }} />
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
                    onPointerDown={(e) => begin(e, el, 'move')}
                    onPointerMove={move}
                    onPointerUp={end}
                    onDoubleClick={(e) => { e.stopPropagation(); if (el.type === 'text' && !el.locked && !locked) edit(el.id); else if (el.type === 'table' && !el.locked && !locked) useUi.getState().editTable(el.id) }}
                    style={{ position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 5000 + el.zIndex, ...(clip ? { clipPath: clip } : {}), cursor: el.locked || locked ? 'default' : 'move', touchAction: 'none', pointerEvents: 'auto', outline: isSel ? `${Math.max(2, 2 / scale)}px solid #2563eb` : undefined }}
                    className={isSel ? '' : 'hover:outline hover:outline-2 hover:outline-blue-300/70'}
                  />
                )
              })}
              <PeerLayer slideId={slide.id} elements={slide.elements} scale={scale} />
              <CommentPins slideId={slide.id} W={W} H={H} scale={scale} />
              {drag?.guides.map((g) => (
                <div key={`${g.axis}${g.at}`} aria-hidden style={{ position: 'absolute', zIndex: 9500, background: '#ec4899', pointerEvents: 'none', ...(g.axis === 'x' ? { left: g.at, top: 0, width: Math.max(1, 1.5 / scale), height: H } : { top: g.at, left: 0, height: Math.max(1, 1.5 / scale), width: W }) }} />
              ))}
              {sel.length === 1 && primary && !primary.locked && !locked && editingId !== primary.id &&
                HANDLES.map((h) => (
                  <div
                    key={h}
                    role="button"
                    aria-label={`Resize ${h}`}
                    data-handle={h}
                    onPointerDown={(e) => begin(e, primary, 'resize', h)}
                    onPointerMove={move}
                    onPointerUp={end}
                    style={{ position: 'absolute', zIndex: 9600, pointerEvents: 'auto', width: 12 / scale, height: 12 / scale, left: primary.x + HANDLE_POS[h][0] * primary.width - 6 / scale, top: primary.y + HANDLE_POS[h][1] * primary.height - 6 / scale, background: '#fff', border: `${Math.max(1, 2 / scale)}px solid #2563eb`, borderRadius: 2, cursor: CURSOR[h], touchAction: 'none' }}
                  />
                ))}
            </div>
          </div>
          {placing && (
            <div data-testid="pin-overlay" aria-label="Click to place the comment" role="button" tabIndex={0}
              style={{ position: 'absolute', left: 0, top: 0, width, height: H * scale, zIndex: 50, cursor: 'crosshair', outline: '3px dashed #2563eb', outlineOffset: -3, background: 'rgba(37,99,235,.06)' }}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); useComments.getState().setPending({ slideId: slide.id, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }) }}
              onKeyDown={(e) => { if (e.key === 'Escape') useComments.getState().setPlacing(false) }} />
          )}
          {primary && !editingId && !drag && !resize && <FormatBar el={primary} slideId={slide.id} scale={scale} stageWidth={width} theme={theme} requireAdvanced={requireAdvanced} />}
        </div>
      )}
    </div>
  )
}
