'use client'

import type { ReactNode } from 'react'
import { Bold, ImageIcon, Italic, Trash2 } from '@prompttoppt/ui/icons'
import type { Anno, Family } from '@/lib/pdf-editor/model'
import { FONT_DEFS } from '@/lib/pdf-editor/fonts'
import { BOLD, ITALIC, charStyles } from '@/lib/pdf-editor/text'
import { HIGHLIGHT_COLORS, type Defaults, type Tool } from '@/lib/pdf-editor/tools'

const field = 'h-8 rounded-lg border-2 border-foreground bg-white px-2 text-xs font-bold text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
function Label({ text, children }: { text: string; children: ReactNode }) {
  return <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-heading font-extrabold uppercase text-foreground">{text}{children}</label>
}
const Color = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
  <Label text={label}><input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 cursor-pointer rounded-lg border-2 border-foreground bg-white p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b3dd0]" /></Label>
)
const Num = ({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) => (
  <Label text={label}><input type="number" aria-label={label} value={Math.round(value * 10) / 10} min={min} max={max} step={step} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))) }} className={`${field} w-16`} /></Label>
)
const Toggle = ({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" aria-label={label} title={label} aria-pressed={on} onClick={onClick} onMouseDown={(e) => e.preventDefault() /* keep the focus (and the selected words) in the text being typed in */} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${on ? 'bg-secondary' : 'bg-white'}`}>{children}</button>
)

export interface PropsBarProps {
  tool: Tool
  selected: Anno | undefined
  defaults: Defaults
  /** change the selected item (if any) and the starting style of its tool */
  onStyle: (patch: Record<string, unknown>) => void
  onDelete: () => void
  /** Edit text only: change one line at a time instead of whole paragraphs */
  lineByLine?: boolean
  onLineByLine?: (on: boolean) => void
  /** Edit text: a dragged box picks up a PICTURE (for photos the automatic search missed) instead of covering words */
  pickBox?: boolean
  onPickBox?: (on: boolean) => void
  /** pictures: choose a replacement picture / how it sits in the box */
  onReplace?: () => void
  onFit?: (fit: 'cover' | 'contain') => void
  /** characters selected inside the text being typed in: Bold / Italic then apply to them only */
  selection?: { start: number; end: number } | null
}

/** Style controls for the selected item, or for the tool that is active when nothing is selected. */
export function PropertiesBar({ tool, selected, defaults, onStyle, onDelete, lineByLine, onLineByLine, pickBox, onPickBox, onReplace, onFit, selection }: PropsBarProps) {
  const kind = selected ? selected.kind : tool === 'text' || tool === 'editText' ? 'text' : tool === 'draw' ? 'path' : tool === 'rect' || tool === 'ellipse' || tool === 'line' || tool === 'arrow' ? 'shape' : tool === 'highlight' ? 'highlight' : tool === 'whiteout' ? 'whiteout' : null
  let body: ReactNode = <span className="text-xs font-medium text-[#64748b]">Pick a tool, or click an item on the page to change how it looks.</span>
  if (kind === 'text') {
    const t: { fam: Family; size: number; bold: boolean; italic: boolean; color: string; wrap?: number } = selected?.kind === 'text' ? selected : { ...defaults.text }
    // with words selected inside the text, the buttons show (and change) those words only
    const range = selected?.kind === 'text' && selection && selection.end > selection.start ? charStyles(selected.text, selected.bold, selected.italic, selected.spans).slice(selection.start, selection.end) : null
    const boldOn = range ? range.every((x) => x & BOLD) : t.bold, italicOn = range ? range.every((x) => x & ITALIC) : t.italic
    const std = FONT_DEFS.filter((f) => f.std), bundled = FONT_DEFS.filter((f) => !f.std)
    body = (<>
      <Label text="Font"><select aria-label="Font" value={t.fam} onChange={(e) => onStyle({ fam: e.target.value as Family })} className={field}>
        <optgroup label="Standard PDF fonts">{std.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>
        <optgroup label="Embedded fonts">{bundled.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>
      </select></Label>
      <Num label="Size" value={t.size} min={4} max={200} onChange={(v) => onStyle({ size: v })} />
      <Toggle label="Bold" on={boldOn} onClick={() => onStyle({ bold: !boldOn })}><Bold aria-hidden size={16} /></Toggle>
      <Toggle label="Italic" on={italicOn} onClick={() => onStyle({ italic: !italicOn })}><Italic aria-hidden size={16} /></Toggle>
      {!FONT_DEFS.find((f) => f.id === t.fam)?.std && <span className="shrink-0 text-[11px] font-medium text-[#64748b]" data-testid="font-note">Embedded in the file (only the letters used). A character this font lacks is saved as a picture.</span>}
      <Color label="Colour" value={t.color} onChange={(v) => onStyle({ color: v })} />
      {t.wrap !== undefined && <span className="shrink-0 text-xs font-medium text-[#64748b]">Drag the side handles to change how wide the lines may be.</span>}
      {tool === 'editText' && !selected && onPickBox && (
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-heading font-extrabold uppercase text-foreground" title="Off: dragging a box over words covers them so you can type new words. On: dragging a box over a picture picks that picture up (use it when the automatic search missed one).">
          <input type="checkbox" aria-label="Drag a box to pick up a picture" checked={!!pickBox} onChange={(e) => onPickBox(e.target.checked)} className="h-5 w-5 accent-[#6d28d9]" />Drag picks up a picture
        </label>
      )}
      {tool === 'editText' && !selected && onLineByLine && (
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-heading font-extrabold uppercase text-foreground" title="Off: click a paragraph and change all of it. On: click one line at a time. Alt-click also picks a single line.">
          <input type="checkbox" aria-label="Edit line by line" checked={!!lineByLine} onChange={(e) => onLineByLine(e.target.checked)} className="h-5 w-5 accent-[#0b3dd0]" />Edit line by line
        </label>
      )}
    </>)
  } else if (kind === 'path') {
    const s = selected?.kind === 'path' ? selected : defaults.pen
    body = (<><Color label="Colour" value={s.color} onChange={(v) => onStyle({ color: v })} /><Num label="Width" value={s.width} min={0.5} max={40} step={0.5} onChange={(v) => onStyle({ width: v })} /></>)
  } else if (kind === 'shape') {
    const s = selected?.kind === 'shape' ? { stroke: selected.stroke, width: selected.width, fill: selected.fill } : selected?.kind === 'path' ? { stroke: selected.color, width: selected.width, fill: null } : defaults.shape
    const isPath = selected?.kind === 'path' || tool === 'line' || tool === 'arrow'
    body = (<>
      <Color label="Line colour" value={s.stroke} onChange={(v) => onStyle(isPath ? { color: v } : { stroke: v })} />
      <Num label="Width" value={s.width} min={0} max={40} step={0.5} onChange={(v) => onStyle({ width: v })} />
      {!isPath && <>
        <Label text="Fill"><input type="checkbox" aria-label="Fill the shape" checked={s.fill !== null} onChange={(e) => onStyle({ fill: e.target.checked ? '#fde68a' : null })} className="h-5 w-5 accent-[#0b3dd0]" /></Label>
        {s.fill !== null && <Color label="Fill colour" value={s.fill} onChange={(v) => onStyle({ fill: v })} />}
      </>}
    </>)
  } else if (kind === 'highlight') {
    const c = selected?.kind === 'highlight' ? selected.color : defaults.highlight.color
    body = (<>
      <span className="flex shrink-0 gap-1" role="group" aria-label="Highlight colours">{HIGHLIGHT_COLORS.map((h) => (
        <button key={h} type="button" aria-label={`Highlight colour ${h}`} aria-pressed={c === h} onClick={() => onStyle({ color: h })} className={`h-8 w-8 rounded-lg border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${c === h ? 'border-foreground' : 'border-[#cbd5e1]'}`} style={{ background: h }} />
      ))}</span>
      <Color label="Other" value={c} onChange={(v) => onStyle({ color: v })} />
    </>)
  } else if (kind === 'whiteout') {
    const c = selected?.kind === 'whiteout' ? selected.color : defaults.whiteout.color
    body = <Color label="Cover colour" value={c} onChange={(v) => onStyle({ color: v })} />
  } else if (kind === 'image') {
    const img = selected?.kind === 'image' ? selected : undefined
    body = (<>
      <button type="button" aria-label="Replace picture" onClick={onReplace} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 border-foreground bg-white px-2.5 text-[11px] font-heading font-extrabold uppercase text-foreground hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ImageIcon aria-hidden size={14} />Replace picture</button>
      <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-heading font-extrabold uppercase text-foreground" title={img?.src ? 'Off: the new picture fills the box and is cropped to fit. On: the whole picture fits inside the box.' : 'Available after you replace the picture'}>
        <input type="checkbox" aria-label="Fit inside" checked={img?.fit === 'contain'} disabled={!img?.src} onChange={(e) => onFit?.(e.target.checked ? 'contain' : 'cover')} className="h-5 w-5 accent-[#0b3dd0]" />Fit inside
      </label>
      <span className="shrink-0 text-xs font-medium text-[#64748b]">Drag the corners to resize the picture. It keeps its shape.</span>
    </>)
  }
  return (
    <div className="flex min-h-[48px] items-center gap-3 overflow-x-auto border-b-2 border-foreground bg-[#f8f9fc] px-3 py-1.5" role="group" aria-label="Item style">
      {body}
      {selected && <button type="button" aria-label="Delete selected item" title="Delete (Del)" onClick={onDelete} className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-2 border-foreground bg-white px-2.5 text-[11px] font-heading font-extrabold uppercase text-foreground hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"><Trash2 aria-hidden size={14} />Delete</button>}
    </div>
  )
}
