'use client'

import type { CSSProperties } from 'react'
import { HIGHLIGHT_OPACITY, type Anno, type PathAnno } from '@/lib/pdf-editor/model'
import { CSS_FAMILY, LINE_HEIGHT, hasRtl, hasSpans, isLaidOut, lineStyles, stretches, textLines } from '@/lib/pdf-editor/text'

/** the arrow head as two short lines at the last point, in the box's own units (the same maths the file export uses) */
function arrowHead(pts: [number, number][], width: number): [number, number][][] {
  if (pts.length < 2) return []
  const p = pts[0]!, q = pts[pts.length - 1]!
  const ang = Math.atan2(q[1] - p[1], q[0] - p[0]), len = Math.max(8, width * 4)
  return [-1, 1].map((s) => [q, [q[0] - len * Math.cos(ang + s * 0.5), q[1] - len * Math.sin(ang + s * 0.5)] as [number, number]])
}
export const pathPoints = (a: PathAnno): [number, number][] => a.points.map(([nx, ny]) => [nx * a.w, ny * a.h])

/**
 * Put the caret in the text being edited. On a touch screen the on-screen keyboard covers the lower part of the window, so the box is scrolled to the middle of what
 * is left (the visual viewport shrinks when the keyboard opens, and the box is brought into it again when that happens).
 */
function focusText(el: HTMLTextAreaElement | null): void {
  if (!el || document.activeElement === el) return
  el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length)
  let coarse = false
  try { coarse = window.matchMedia('(pointer: coarse)').matches } catch { /* no matchMedia */ }
  if (!coarse) return
  const bring = (): void => { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }) } catch { /* detached */ } }
  bring()
  const vv = window.visualViewport
  if (vv) { const on = (): void => { if (document.activeElement === el) bring(); else vv.removeEventListener('resize', on) }; vv.addEventListener('resize', on) }
}

/** One item on the page, drawn at `zoom` px per point. Pure display; pointer handling lives on the wrapper in PageView. */
export function AnnoView({ a, zoom, hit, editing, onText, onBlur, onSelection }: { a: Anno; zoom: number; hit: boolean; editing?: boolean; onText?: (v: string) => void; onBlur?: () => void; /** the selected characters of the text being typed in (for bold / italic on a stretch) */ onSelection?: (start: number, end: number) => void }) {
  const turn = (a.kind === 'text' || a.kind === 'whiteout') && a.rot ? { transform: `rotate(${a.rot}deg)`, transformOrigin: '0 0' } : {}
  const box: CSSProperties = { position: 'absolute', left: a.x * zoom, top: a.y * zoom, width: a.w * zoom, height: a.h * zoom, ...turn }
  switch (a.kind) {
    // eslint-disable-next-line @next/next/no-img-element
    case 'whiteout': return a.patch ? <img src={a.patch.url} alt="" draggable={false} style={{ ...box, maxWidth: 'none', userSelect: 'none' }} /> : <div style={{ ...box, background: a.color }} />
    case 'highlight': return <div style={{ ...box, background: a.color, opacity: HIGHLIGHT_OPACITY, mixBlendMode: 'multiply' }} />
    // eslint-disable-next-line @next/next/no-img-element
    case 'image': return <img src={a.url} alt="" draggable={false} style={{ ...box, maxWidth: 'none', userSelect: 'none' }} />
    case 'text': {
      const font: CSSProperties = { fontFamily: CSS_FAMILY[a.fam], fontSize: a.size * zoom, lineHeight: LINE_HEIGHT, fontWeight: a.bold ? 700 : 400, fontStyle: a.italic ? 'italic' : 'normal', color: a.color, whiteSpace: 'pre', fontKerning: 'none', margin: 0, padding: 0, ...(hasRtl(a.text) ? { direction: 'rtl', textAlign: 'right' } : {}) }
      if (isLaidOut(a)) {
        // a paragraph: every line is placed by its own baseline (the same numbers the PDF uses), so what is seen here is what is saved
        const lines = (
          <div aria-hidden={editing} style={{ ...box, userSelect: 'none', overflow: 'visible' }} data-pitch={a.pitch} data-wrap={a.wrap} data-size={a.size}>
            {textLines(a).map((l, i) => <div key={i} data-line={l} style={{ ...font, position: 'absolute', left: 0, top: (a.pitch ?? a.size * LINE_HEIGHT) * i * zoom, height: a.size * LINE_HEIGHT * zoom }}>{hasSpans(a) ? stretches(l, lineStyles(a, i)).map((st, k) => <span key={k} data-bold={st.bold ? '1' : '0'} data-italic={st.italic ? '1' : '0'} style={{ fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? 'italic' : 'normal' }}>{st.text}</span>) : l}</div>)}
          </div>
        )
        if (!editing) return lines
        // typing happens in a see-through text area laid over the drawn lines (only the caret and the selection show)
        return (
          <>
            {lines}
            <textarea aria-label="Text" value={a.text} spellCheck={false}
              ref={focusText}
              onChange={(e) => onText?.(e.target.value)} onBlur={onBlur} onSelect={(e) => onSelection?.(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
              style={{ ...box, ...font, whiteSpace: 'pre-wrap', color: 'transparent', caretColor: a.color, lineHeight: `${(a.pitch ?? a.size * LINE_HEIGHT) * zoom}px`, marginTop: -((a.pitch ?? a.size * LINE_HEIGHT) - a.size * LINE_HEIGHT) / 2 * zoom, background: 'rgba(56,189,248,0.12)', border: 0, outline: 'none', resize: 'none', overflow: 'hidden', height: Math.max(a.h * zoom, (a.pitch ?? a.size * LINE_HEIGHT) * zoom * 1.5) }} />
          </>
        )
      }
      if (editing) {
        return (
          <textarea aria-label="Text" value={a.text} wrap="off" spellCheck={false} rows={1}
            ref={focusText}
            onChange={(e) => onText?.(e.target.value)} onBlur={onBlur} onSelect={(e) => onSelection?.(e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
            style={{ ...box, ...font, width: a.w * zoom + 8, background: 'rgba(255,255,255,0.35)', border: 0, outline: 'none', resize: 'none', overflow: 'hidden' }} />
        )
      }
      return <div style={{ ...box, ...font, overflow: 'visible', userSelect: 'none' }}>{a.text}</div>
    }
    case 'shape': return (
      <svg style={{ ...box, overflow: 'visible', pointerEvents: 'none' }} viewBox={`0 0 ${a.w} ${a.h}`} preserveAspectRatio="none" aria-hidden>
        {a.shape === 'rect'
          ? <rect x={0} y={0} width={a.w} height={a.h} fill={a.fill ?? 'none'} stroke={a.width > 0 ? a.stroke : 'none'} strokeWidth={a.width} style={{ pointerEvents: hit ? (a.fill ? 'all' : 'stroke') : 'none' }} />
          : <ellipse cx={a.w / 2} cy={a.h / 2} rx={a.w / 2} ry={a.h / 2} fill={a.fill ?? 'none'} stroke={a.width > 0 ? a.stroke : 'none'} strokeWidth={a.width} style={{ pointerEvents: hit ? (a.fill ? 'all' : 'stroke') : 'none' }} />}
      </svg>
    )
    case 'path': {
      const pts = pathPoints(a)
      const d = pts.map((p) => p.join(',')).join(' ')
      const thick = Math.max(a.width, 14 / zoom)
      return (
        <svg style={{ ...box, overflow: 'visible', pointerEvents: 'none' }} viewBox={`0 0 ${a.w} ${a.h}`} preserveAspectRatio="none" aria-hidden>
          <g fill="none" stroke={a.color} strokeWidth={a.width} strokeLinecap="round" strokeLinejoin="round">
            <polyline points={pts.length === 1 ? `${d} ${pts[0]![0] + 0.01},${pts[0]![1]}` : d} />
            {a.variant === 'arrow' && arrowHead(pts, a.width).map((l, i) => <polyline key={i} points={l.map((p) => p.join(',')).join(' ')} />)}
          </g>
          <polyline points={d} fill="none" stroke="transparent" strokeWidth={thick} strokeLinecap="round" style={{ pointerEvents: hit ? 'stroke' : 'none' }} />
        </svg>
      )
    }
  }
}
