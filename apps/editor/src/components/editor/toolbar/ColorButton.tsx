import { useEffect, useRef, useState } from 'react'
import type { Theme } from '@prompttoppt/validation'
import { ColorPanel } from './ColorPanel'

/** A small "label + colour swatch" button of the element toolbar; opens the colour panel under it. `value` null = nothing set (shows a crossed swatch). */
export function ColorButton({ label, value, theme, onPick, onNone, testId }: { label: string; value: string | null; theme: Theme; onPick: (hex: string) => void; onNone?: () => void; testId?: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button type="button" data-testid={testId} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="h-8 px-2 rounded-md text-sm font-medium hover:bg-slate-100 inline-flex items-center gap-1.5">
        <span aria-hidden className="w-4 h-4 rounded border border-slate-400" style={value ? { background: value } : { background: 'linear-gradient(135deg, #fff 45%, #dc2626 45%, #dc2626 55%, #fff 55%)' }} />{label}
      </button>
      {open && (
        <div role="dialog" aria-label={`${label} colour`} className="absolute left-0 top-full mt-1 z-30 bg-white border border-border rounded-xl shadow-xl">
          <ColorPanel theme={theme} value={value ?? '#000000'} title={`${label} colour`} showOpacity={false} onPick={(hex) => onPick(hex)} />
          {onNone && <button type="button" onClick={() => { onNone(); setOpen(false) }} className="w-full text-left px-3 py-2 text-sm border-t border-border hover:bg-slate-50">No {label.toLowerCase()}</button>}
        </div>
      )}
    </div>
  )
}
