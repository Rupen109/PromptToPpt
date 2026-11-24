import type { Presentation, Slide, TextElement, Theme } from '@prompttoppt/validation'
import { useDoc } from '@/editor/store'
import * as C from '@/editor/commands'
import { LINE_PRESETS, SPACING_DEFAULT, SPACING_RANGE, setTextSpacing, textFit, type Spacing } from '@/editor/spacing'

const chip = 'h-7 px-2 rounded-md text-xs font-medium border border-transparent hover:bg-slate-100 disabled:opacity-40'
const fmt = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 100) / 100))

/**
 * The Spacing panel of the object toolbar for text: space between lines (named steps like PowerPoint's, and a fine slider), between paragraphs and between letters, and Reset.
 * It works on every selected text box at once (three bullet boxes get the same spacing). A slider drag is ONE undo step. When the text no longer fits its box, it says so and
 * offers to make the box fit (grown down, never past the slide).
 */
export function SpacingPanel({ slide, selection, theme, aspect, gate }: { slide: Slide; selection: string[]; theme: Theme; aspect: Presentation['aspectRatio']; gate: () => boolean }) {
  const apply = useDoc((s) => s.apply)
  const boxes = slide.elements.filter((e): e is TextElement => e.type === 'text' && selection.includes(e.id))
  const first = boxes[0]
  if (!first) return null
  const editable = !slide.locked && !slide.writing && boxes.some((b) => !b.locked)
  const val = (k: keyof typeof SPACING_DEFAULT) => first[k] ?? SPACING_DEFAULT[k]
  const mixed = (k: keyof typeof SPACING_DEFAULT) => boxes.some((b) => (b[k] ?? SPACING_DEFAULT[k]) !== val(k))
  const ids = boxes.map((b) => b.id)
  const set = (sp: Spacing, key: string) => { if (gate()) apply('Spacing', (d) => { setTextSpacing(d, slide.id, ids, sp) }, { mergeKey: `spacing:${key}:${ids.join(',')}` }) }
  const custom = (k: keyof typeof SPACING_DEFAULT) => boxes.some((b) => b[k] !== undefined)
  const tooSmall = boxes.map((b) => ({ b, f: textFit(b, theme, aspect) })).filter((x) => !x.f.fits && !x.b.locked)

  const slider = (k: keyof typeof SPACING_DEFAULT, label: string, step: number, show: (v: number) => string) => (
    <label className="flex items-center gap-2 w-full">
      <span className="w-24 shrink-0">{label}</span>
      <input type="range" aria-label={label} min={SPACING_RANGE[k][0]} max={SPACING_RANGE[k][1]} step={step} value={val(k)} disabled={!editable}
        onChange={(e) => set({ [k]: Number(e.target.value) }, k)} className="flex-1" />
      <span className="w-14 text-right tabular-nums" data-testid={`spacing-${k}`}>{mixed(k) ? 'mixed' : show(val(k))}</span>
    </label>
  )

  return (
    <div data-testid="spacing-panel" className="basis-full flex flex-col gap-1.5 px-2 py-2 border-t border-border mt-1 text-xs text-slate-600">
      <div role="group" aria-label="Line spacing" className="flex items-center gap-1">
        <span className="w-24 shrink-0">Line spacing</span>
        {LINE_PRESETS.map((p) => {
          const on = !mixed('lineHeight') && Math.abs(val('lineHeight') - p.v) < 0.005
          return <button key={p.v} type="button" aria-pressed={on} disabled={!editable} title={p.v === SPACING_DEFAULT.lineHeight ? 'The deck’s normal spacing' : `${p.label} lines`} onClick={() => set({ lineHeight: p.v }, `lp${p.v}`)} className={`${chip} ${on ? 'bg-slate-100 border-slate-300 text-slate-900' : ''}`}>{p.label}</button>
        })}
      </div>
      {slider('lineHeight', 'Lines (fine)', 0.05, fmt)}
      {slider('paraGap', 'Paragraphs', 0.05, (v) => (v === 0 ? 'none' : fmt(v)))}
      {slider('letterSpacing', 'Letters', 0.5, (v) => (v === 0 ? 'normal' : `${v > 0 ? '+' : ''}${v}px`))}
      <div className="flex items-center gap-2">
        {tooSmall.length > 0 && (
          <>
            <span role="status" className="text-amber-700">{boxes.length === 1 ? 'The text no longer fits its box.' : `${tooSmall.length} of these boxes are too small for their text.`}</span>
            <button type="button" data-testid="fit-box" className={`${chip} border-amber-300 text-amber-800 hover:bg-amber-50`} disabled={!editable}
              title="Make the box taller so all the text shows (it grows down, never past the slide)"
              onClick={() => { if (gate()) apply('Fit box to text', (d) => { for (const { b, f } of tooSmall) C.setGeometry(d, slide.id, b.id, { x: b.x, y: b.y, width: b.width, height: Math.max(b.height, f.canGrowTo) }) }) }}>Make the box fit</button>
          </>
        )}
        <button type="button" className={`${chip} ml-auto`} disabled={!editable || !(custom('lineHeight') || custom('paraGap') || custom('letterSpacing'))} title="Back to the deck’s normal spacing"
          onClick={() => set({ lineHeight: null, paraGap: null, letterSpacing: null }, 'reset')}>Reset spacing</button>
      </div>
    </div>
  )
}
