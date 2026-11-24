import type { Slide, TextElement, Theme } from '@prompttoppt/validation'
import { TEXT_OUTLINE_MAX } from '@prompttoppt/validation'
import { useDoc } from '@/editor/store'
import { setTextEffects, type TextEffects } from '@/editor/text-effects'

const chip = 'h-7 px-2 rounded-md text-xs font-medium border border-transparent hover:bg-slate-100 disabled:opacity-40'
const OUTLINE_COLOURS = [{ v: 'textPrimary', label: 'Text' }, { v: 'onPrimary', label: 'Light' }, { v: 'primary', label: 'Primary' }, { v: 'accent', label: 'Accent' }, { v: '#111111', label: 'Black' }, { v: '#FFFFFF', label: 'White' }] as const

/**
 * Effects of whole text boxes: a shadow under the letters (none / soft / strong) and an outline round them (a colour and a width). Every selected text box gets them in one
 * step; a width drag is ONE undo step. The same numbers as the slide and the PowerPoint file (packages/validation text-effects.ts). Highlighting single words is in the
 * typing bar (it is per word, like bold).
 */
export function TextEffectsPanel({ slide, selection, theme, gate }: { slide: Slide; selection: string[]; theme: Theme; gate: () => boolean }) {
  const apply = useDoc((s) => s.apply)
  const boxes = slide.elements.filter((e): e is TextElement => e.type === 'text' && selection.includes(e.id))
  const first = boxes[0]
  if (!first) return null
  const editable = !slide.locked && !slide.writing && boxes.some((b) => !b.locked)
  const ids = boxes.map((b) => b.id)
  const set = (fx: TextEffects, key: string, merge = false) => { if (gate()) apply('Text effect', (d) => { setTextEffects(d, slide.id, ids, fx) }, merge ? { mergeKey: `tfx:${key}:${ids.join(',')}` } : undefined) }
  const shadow = first.textShadow ?? null
  const outline = first.textOutline ?? null
  const colourOf = (c: string) => (c.startsWith('#') ? c : (theme.colors as Record<string, string>)[c] ?? c)

  return (
    <div data-testid="text-effects-panel" className="basis-full flex flex-col gap-1.5 px-2 py-2 border-t border-border mt-1 text-xs text-slate-600">
      <div role="group" aria-label="Text shadow" className="flex items-center gap-1">
        <span className="w-20 shrink-0">Shadow</span>
        {([[null, 'None'], ['soft', 'Soft'], ['strong', 'Strong']] as const).map(([v, label]) => (
          <button key={label} type="button" aria-pressed={shadow === v} disabled={!editable} onClick={() => set({ textShadow: v }, 'shadow')} className={`${chip} ${shadow === v ? 'bg-slate-100 border-slate-300 text-slate-900' : ''}`}>{label}</button>
        ))}
      </div>
      <div role="group" aria-label="Text outline" className="flex items-center gap-1 flex-wrap">
        <span className="w-20 shrink-0">Outline</span>
        <button type="button" aria-pressed={!outline} disabled={!editable} onClick={() => set({ textOutline: null }, 'outline')} className={`${chip} ${!outline ? 'bg-slate-100 border-slate-300 text-slate-900' : ''}`}>None</button>
        {OUTLINE_COLOURS.map((c) => {
          const on = outline?.color === c.v
          return <button key={c.v} type="button" aria-label={`Outline ${c.label}`} title={`${c.label} outline`} aria-pressed={on} disabled={!editable} onClick={() => set({ textOutline: { color: c.v as NonNullable<TextElement['textOutline']>['color'], width: outline?.width ?? Math.max(1, Math.round(first.fontSize / 30)) } }, 'outline')}
            className="w-5 h-5 rounded-full border border-slate-300 mx-0.5" style={{ background: colourOf(c.v), outline: on ? '2px solid #2563eb' : undefined, outlineOffset: 1 }} />
        })}
        {outline && (
          <label className="flex items-center gap-2 ml-2 flex-1 min-w-40">
            <span>Width</span>
            <input type="range" aria-label="Outline width" min={0.5} max={TEXT_OUTLINE_MAX} step={0.5} value={outline.width} disabled={!editable} onChange={(e) => set({ textOutline: { ...outline, width: Number(e.target.value) } }, 'ow', true)} className="flex-1" />
            <span className="w-10 text-right tabular-nums">{outline.width}px</span>
          </label>
        )}
      </div>
    </div>
  )
}
