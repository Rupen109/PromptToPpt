'use client'

import type { ReactNode } from 'react'
import { ArrowUpRight, Circle, Download, Eraser, FolderOpen, Highlighter, ImagePlus, Minus, PanelLeft, Pencil, PenLine, Redo2, Square, TextCursorInput, Maximize2, Minimize2, Type, Undo2, ZoomIn, ZoomOut, MoveHorizontal } from '@prompttoppt/ui/icons'
import { Button } from '@/components/ui/Button'
import type { Tool } from '@/lib/pdf-editor/tools'

const TOOLS: { tool: Tool; label: string; icon: ReactNode }[] = [
  { tool: 'editText', label: 'Edit text', icon: <TextCursorInput aria-hidden size={18} /> },
  { tool: 'text', label: 'Add text', icon: <Type aria-hidden size={18} /> },
  { tool: 'whiteout', label: 'Whiteout', icon: <Eraser aria-hidden size={18} /> },
  { tool: 'highlight', label: 'Highlight', icon: <Highlighter aria-hidden size={18} /> },
  { tool: 'draw', label: 'Draw', icon: <Pencil aria-hidden size={18} /> },
  { tool: 'rect', label: 'Rectangle', icon: <Square aria-hidden size={18} /> },
  { tool: 'ellipse', label: 'Ellipse', icon: <Circle aria-hidden size={18} /> },
  { tool: 'line', label: 'Line', icon: <Minus aria-hidden size={18} /> },
  { tool: 'arrow', label: 'Arrow', icon: <ArrowUpRight aria-hidden size={18} /> },
]

function Btn({ label, onClick, disabled, pressed, children, text }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: ReactNode; text?: string }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}
      className={`flex shrink-0 min-w-[42px] flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-1 py-1 text-[10px] font-heading font-extrabold uppercase leading-none text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-35 ${pressed ? 'border-foreground bg-secondary' : 'border-transparent hover:bg-[#f0f4f8]'}`}>
      {children}{text && <span>{text}</span>}
    </button>
  )
}
const Sep = () => <span aria-hidden className="mx-1 h-8 w-px shrink-0 bg-[#cbd5e1]" />

export interface ToolbarProps {
  tool: Tool; onTool: (t: Tool) => void
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void
  zoom: number; onZoom: (delta: number) => void; onFit: () => void
  onPicture: () => void; onSign: () => void
  onOpenOther: () => void; onToggleRail: () => void; railOpen: boolean
  onDownload: () => void; busy: boolean
  /** Download is off until something is acknowledged (a protected file is saved without its password); `why` is the hint */
  blocked?: string | null
  full: boolean; onFull: () => void
}

/** All tools in one scrolling row (it scrolls sideways on phones). */
export function Toolbar(t: ToolbarProps) {
  return (
    <div role="toolbar" aria-label="PDF editing tools" className="flex items-center gap-0.5 overflow-x-auto border-b-2 border-foreground bg-white px-2 py-1.5">
      <span className="md:hidden"><Btn label={t.railOpen ? 'Hide pages' : 'Show pages'} pressed={t.railOpen} onClick={t.onToggleRail} text="Pages"><PanelLeft aria-hidden size={18} /></Btn></span>
      <Btn label="Undo" disabled={!t.canUndo} onClick={t.onUndo} text="Undo"><Undo2 aria-hidden size={18} /></Btn>
      <Btn label="Redo" disabled={!t.canRedo} onClick={t.onRedo} text="Redo"><Redo2 aria-hidden size={18} /></Btn>
      <Sep />
      {TOOLS.map((x) => <Btn key={x.tool} label={x.label} pressed={t.tool === x.tool} onClick={() => t.onTool(x.tool)} text={x.label}>{x.icon}</Btn>)}
      <Btn label="Add picture" onClick={t.onPicture} text="Picture"><ImagePlus aria-hidden size={18} /></Btn>
      <Btn label="Sign" onClick={t.onSign} text="Sign"><PenLine aria-hidden size={18} /></Btn>
      <Sep />
      <Btn label="Zoom out" onClick={() => t.onZoom(-0.15)}><ZoomOut aria-hidden size={18} /></Btn>
      <span className="w-11 shrink-0 text-center text-xs font-bold text-foreground" aria-label="Zoom level">{Math.round(t.zoom * 100)}%</span>
      <Btn label="Zoom in" onClick={() => t.onZoom(0.15)}><ZoomIn aria-hidden size={18} /></Btn>
      <Btn label="Fit width" onClick={t.onFit}><MoveHorizontal aria-hidden size={18} /></Btn>
      <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
        <Btn label={t.full ? 'Exit full screen' : 'Full screen'} pressed={t.full} onClick={t.onFull} text={t.full ? 'Exit' : 'Full'}>{t.full ? <Minimize2 aria-hidden size={18} /> : <Maximize2 aria-hidden size={18} />}</Btn>
        <Btn label="Open another PDF" onClick={t.onOpenOther} text="Open"><FolderOpen aria-hidden size={18} /></Btn>
        <Button variant="lime" size="sm" disabled={t.busy || !!t.blocked} title={t.blocked ?? undefined} onClick={t.onDownload} aria-label="Download edited PDF"><Download aria-hidden size={16} />{t.busy ? 'Saving…' : 'Download'}</Button>
      </span>
    </div>
  )
}
