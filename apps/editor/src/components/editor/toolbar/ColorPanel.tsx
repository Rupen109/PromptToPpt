import { useState } from 'react'
import { ChevronDown, ChevronRight } from '@prompttoppt/ui/icons'
import type { Theme } from '@prompttoppt/validation'
import { STANDARD_COLORS } from './data'

const HEX = /^#[0-9a-fA-F]{6}$/
const norm = (v: string) => { const t = v.trim().replace(/^#?/, '#').toUpperCase(); return HEX.test(t) ? t : null }

/** Colour picker like the reference: current colour, Theme Colors, Standard Colors, a custom colour with hex and strength. `onPick` fires on every change (the editor undoes it in one step). */
export function ColorPanel({ theme, value, onPick, title = 'Background colour', showOpacity = true }: { theme: Theme; value: string; onPick: (hex: string, opacity: number) => void; title?: string; showOpacity?: boolean }) {
  const [hex, setHex] = useState(value.toUpperCase())
  const [opacity, setOpacity] = useState(100)
  const [open, setOpen] = useState({ theme: true, standard: true })
  const commit = (h: string, o = opacity) => { setHex(h); onPick(h, o) }
  const themeColors = [theme.colors.background, theme.colors.surface, theme.colors.primary, theme.colors.secondary, theme.colors.accent, theme.colors.textPrimary, theme.colors.textSecondary].map((c) => c.toUpperCase())
  const Swatch = ({ c }: { c: string }) => <button type="button" title={c} aria-label={`Colour ${c}`} onClick={() => commit(c)} style={{ background: c }} className={`w-7 h-7 rounded-md border ${hex === c ? 'ring-2 ring-primary border-white' : 'border-slate-300'}`} />
  return (
    <div className="w-72 p-3 text-sm" data-testid="color-panel">
      <div className="font-semibold mb-2">{title}</div>
      <div className="flex items-center gap-2 mb-3">
        <span aria-hidden style={{ background: hex }} className="w-8 h-8 rounded-md border border-slate-300 shrink-0" />
        <input aria-label="Hex colour" value={hex} maxLength={7} onChange={(e) => { const v = e.target.value.toUpperCase(); setHex(v); const n = norm(v); if (n) onPick(n, opacity) }} className="flex-1 h-9 px-2 rounded-lg border border-border font-mono uppercase" />
      </div>
      <button type="button" aria-expanded={open.theme} onClick={() => setOpen((o) => ({ ...o, theme: !o.theme }))} className="w-full flex items-center justify-between py-1.5 font-medium">Theme Colors {open.theme ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}</button>
      {open.theme && <div className="flex flex-wrap gap-1.5 pb-2">{themeColors.map((c, i) => <Swatch key={`${c}-${i}`} c={c} />)}</div>}
      <button type="button" aria-expanded={open.standard} onClick={() => setOpen((o) => ({ ...o, standard: !o.standard }))} className="w-full flex items-center justify-between py-1.5 font-medium">Standard Colors {open.standard ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}</button>
      {open.standard && <div className="flex flex-wrap gap-1.5 pb-2">{STANDARD_COLORS.map((c) => <Swatch key={c} c={c} />)}</div>}
      <div className="pt-2 border-t border-border">
        <div className="font-medium mb-2">Custom colour</div>
        <div className="flex items-center gap-2">
          <input type="color" aria-label="Pick a custom colour" value={norm(hex) ?? '#000000'} onChange={(e) => commit(e.target.value.toUpperCase())} className="w-10 h-9 p-0.5 rounded-lg border border-border bg-white" />
          {showOpacity && <label className="flex items-center gap-1.5 ml-auto text-slate-600">Opacity
            <input type="number" aria-label="Opacity percent" min={0} max={100} value={opacity} onChange={(e) => { const o = Math.max(0, Math.min(100, Number(e.target.value) || 0)); setOpacity(o); const n = norm(hex); if (n) onPick(n, o) }} className="w-16 h-9 px-2 rounded-lg border border-border" />%
          </label>}
        </div>
      </div>
    </div>
  )
}
