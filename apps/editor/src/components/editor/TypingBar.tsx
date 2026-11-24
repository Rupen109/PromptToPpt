import { useEffect, useRef, useState } from 'react'
import { Bold, Highlighter, Italic, RemoveFormatting, Trash2, Underline } from '@prompttoppt/ui/icons'
import { HIGHLIGHTS, type SlideElement, type TextElement, type Theme } from '@prompttoppt/validation'
import * as C from '@/editor/commands'
import { useDoc } from '@/editor/store'
import { useUi } from '@/editor/ui'
import { useToolbarPlace } from './toolbarPlace'
import { clearInline, colourInline, formatInline, highlightInline, inlineState, onInlineChange, restoreInline, type InlineFlag } from '@/editor/inline-runs'

const ROLES = [{ token: 'textPrimary', label: 'Text' }, { token: 'textSecondary', label: 'Muted' }, { token: 'primary', label: 'Primary' }, { token: 'accent', label: 'Accent' }, { token: 'onPrimary', label: 'On primary' }] as const
const STANDARD = [{ hex: '#DC2626', label: 'Red' }, { hex: '#F59E0B', label: 'Amber' }, { hex: '#16A34A', label: 'Green' }, { hex: '#2563EB', label: 'Blue' }, { hex: '#111111', label: 'Black' }, { hex: '#FFFFFF', label: 'White' }] as const
const btn = 'h-8 min-w-8 px-2 rounded-md text-sm font-semibold hover:bg-slate-100 grid place-items-center'
const FLAGS = [['bold', 'Bold', Bold, 'Ctrl+B'], ['italic', 'Italic', Italic, 'Ctrl+I'], ['underline', 'Underline', Underline, 'Ctrl+U']] as const

/**
 * The bar above a text box while typing in it: bold, italic, underline and colour for the SELECTED words (the word at the caret, or what is typed next, when nothing is
 * selected), exactly like the keyboard shortcuts. Its buttons never take the caret away (the box stays open and the selection stays), so styling one word is: select, click.
 */
export function TypingBar({ el, slideId, scale, stageWidth, stageHeight, theme, requireAdvanced }: { el: SlideElement; slideId: string; scale: number; stageWidth: number; stageHeight: number; theme: Theme; requireAdvanced: () => boolean }) {
  const apply = useDoc((s) => s.apply)
  const { select, edit } = useUi()
  const [state, setState] = useState(inlineState)
  useEffect(() => onInlineChange(() => setState(inlineState())), [])
  const picker = useRef<HTMLInputElement>(null)
  // the custom colour applies when the picker closes ("change"), not on every move inside it (each one would pull the caret back into the box and close the picker)
  useEffect(() => {
    const input = picker.current
    if (!input) return
    const on = () => { const root = restoreInline(); if (root && requireAdvanced()) colourInline(root, input.value.toUpperCase() as TextElement['color'], input.value) }
    input.addEventListener('change', on)
    return () => input.removeEventListener('change', on)
  }, [requireAdvanced])
  const keep = (e: { preventDefault: () => void }) => e.preventDefault() // a click here must not take the caret out of the box
  const format = (flag: InlineFlag) => { const root = restoreInline(); if (root && requireAdvanced()) formatInline(root, flag) }
  const colour = (c: TextElement['color'], hex: string) => { const root = restoreInline(); if (root && requireAdvanced()) colourInline(root, c, hex) }
  const { measure, top: placeTop, left: placeLeft } = useToolbarPlace(el, scale, stageWidth, stageHeight, { belowRoom: 0 }) // (no rotate handle while typing)
  const left = placeLeft
  return (
    <div role="toolbar" aria-label="Text tools" data-inline-keep data-testid="typing-bar" ref={measure} style={{ position: 'absolute', top: placeTop, left, zIndex: 20 }}
      className="flex items-center gap-0.5 bg-white border border-border rounded-xl shadow-lg px-1.5 py-1 text-xs text-slate-600" onPointerDown={(e) => e.stopPropagation()}>
      {FLAGS.map(([flag, label, Icon, keys]) => (
        <button key={flag} type="button" aria-label={label} title={`${label} the selected words (${keys})`} aria-pressed={state[flag]} onMouseDown={keep} onClick={() => format(flag)} className={`${btn} ${state[flag] ? 'bg-slate-100 text-slate-900' : ''}`}><Icon aria-hidden size={16} /></button>
      ))}
      <button type="button" aria-label="Clear formatting" title="Clear formatting of the selected words (Ctrl+\)" onMouseDown={keep} onClick={() => { const root = restoreInline(); if (root && requireAdvanced()) clearInline(root) }} className={btn}><RemoveFormatting aria-hidden size={16} /></button>
      <span className="w-px h-5 bg-border mx-1" />
      {ROLES.map((r) => (
        <button key={r.token} type="button" aria-label={`Colour the selected words ${r.label}`} title={`${r.label} (theme)`} onMouseDown={keep} onClick={() => colour(r.token, theme.colors[r.token])} className="w-5 h-5 rounded-full border border-slate-300 mx-0.5" style={{ background: theme.colors[r.token] }} />
      ))}
      <span className="w-px h-5 bg-border mx-1" />
      {STANDARD.map((c) => (
        <button key={c.hex} type="button" aria-label={`Colour the selected words ${c.label}`} title={c.label} onMouseDown={keep} onClick={() => colour(c.hex, c.hex)} className="w-5 h-5 rounded-full border border-slate-300 mx-0.5" style={{ background: c.hex }} />
      ))}
      <label className="relative mx-0.5 w-5 h-5 rounded-full border border-slate-300 overflow-hidden cursor-pointer" title="Any colour…" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}>
        <input ref={picker} type="color" aria-label="Any colour for the selected words" className="absolute inset-0 opacity-0 cursor-pointer" defaultValue="#DC2626" />
      </label>
      <span className="w-px h-5 bg-border mx-1" />
      <span role="group" aria-label="Highlight" className="inline-flex items-center gap-0.5" title="Highlight the selected words, like a marker">
        <Highlighter aria-hidden size={15} className="mx-0.5 text-slate-500" />
        {HIGHLIGHTS.map((h) => (
          <button key={h.hex} type="button" aria-label={`Highlight the selected words ${h.label}`} title={`${h.label} highlight`} onMouseDown={keep} onClick={() => { const root = restoreInline(); if (root && requireAdvanced()) highlightInline(root, h.hex) }} className="w-5 h-5 rounded border border-slate-300" style={{ background: h.hex }} />
        ))}
        <button type="button" aria-label="No highlight" title="Take the highlight off" onMouseDown={keep} onClick={() => { const root = restoreInline(); if (root && requireAdvanced()) highlightInline(root, null) }} className="w-5 h-5 rounded border border-slate-300 bg-white relative overflow-hidden"><span aria-hidden className="absolute left-[-2px] right-[-2px] top-1/2 h-[1.5px] bg-red-500 -rotate-45" /></button>
      </span>
      <span className="w-px h-5 bg-border mx-1" />
      <span className="px-1 whitespace-nowrap max-xl:hidden">Select words to style them · Esc to finish</span>
      <button type="button" aria-label="Delete" title="Delete this box" onMouseDown={keep} onClick={() => { if (!requireAdvanced()) return; apply('Delete', (d) => C.deleteElements(d, slideId, [el.id])); select([]); edit(null) }} className="w-8 h-8 grid place-items-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 aria-hidden size={16} /></button>
    </div>
  )
}
