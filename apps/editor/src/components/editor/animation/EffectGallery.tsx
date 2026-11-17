import { useRef, type KeyboardEvent } from 'react'
import { Ban } from '@prompttoppt/ui/icons'
import { effectApplies, EFFECT_INFO } from '@prompttoppt/ui'
import type { Effect, SlideElement } from '@prompttoppt/validation'
import { GALLERY } from '@/editor/animation-model'
import { EFFECT_ICON } from './effectIcons'

/**
 * The effect gallery (PowerPoint's): None, then every effect grouped Entrance / Emphasis / Exit / Motion paths, each a button with an icon, its name as the tooltip and accessible
 * name. Left and Right (and Home / End) move between the buttons. An effect the selected objects cannot all play on is greyed out.
 */
export function EffectGallery({ onPick, onNone, current, targets, disabled, testPrefix = 'fx-gal', compact = false }: { onPick: (type: Effect['type']) => void; onNone?: (() => void) | undefined; current?: Effect['type'] | undefined; targets: SlideElement[]; disabled?: boolean | undefined; testPrefix?: string; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  function key(e: KeyboardEvent) {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const btns = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length
    btns[next]?.focus()
  }
  const btn = `shrink-0 ${compact ? 'w-[60px] h-[48px]' : 'w-[62px] h-[50px]'} rounded-md border border-transparent hover:bg-slate-100 hover:border-border focus-visible:outline-2 focus-visible:outline-primary flex flex-col items-center justify-center gap-0.5 text-[11px] leading-tight text-slate-700 disabled:opacity-35 disabled:hover:bg-transparent`
  return (
    <div ref={root} data-own-keys="" onKeyDown={key} role="group" aria-label="Animation effects" data-testid={`${testPrefix}-root`} className="flex items-stretch gap-1">
      {onNone && (
        <button type="button" data-testid={`${testPrefix}-none`} title="None: remove the animation" aria-label="None" disabled={disabled || targets.length === 0} onClick={onNone} className={btn}><Ban aria-hidden size={18} />None</button>
      )}
      {GALLERY.map((g, gi) => (
        <div key={g.category} role="group" aria-label={g.label} className={`flex flex-col ${gi > 0 || onNone ? 'border-l border-border pl-1' : ''}`}>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 px-1 leading-3 select-none">{g.label}</div>
          <div className="flex gap-0.5">
            {g.types.map((t) => {
              const Icon = EFFECT_ICON[t]
              const ok = targets.length > 0 && targets.every((el) => effectApplies(t, el))
              return (
                <button key={t} type="button" data-testid={`${testPrefix}-${t}`} aria-pressed={current === t} title={EFFECT_INFO[t].label} aria-label={EFFECT_INFO[t].label} disabled={disabled || !ok} onClick={() => onPick(t)} className={`${btn} ${current === t ? 'bg-primary/10 border-primary/40 font-semibold' : ''}`}>
                  <Icon aria-hidden size={18} />
                  <span className="max-w-full truncate px-0.5">{EFFECT_INFO[t].label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
