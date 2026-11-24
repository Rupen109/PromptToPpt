import { useState } from 'react'
import { ArrowDown, ArrowUp, BringToFront, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, SendToBack } from '@prompttoppt/ui/icons'
import { canFlip, canRotate, isWholeGroup, normAngle, type Slide } from '@prompttoppt/validation'
import * as A from '@/editor/object-actions'
import { stackOrder } from '@/editor/selection-commands'

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** the keys of an action, as this computer writes them */
export const arrangeKeys = {
  front: mac ? '⇧⌘]' : 'Ctrl+Shift+]', up: mac ? '⌘]' : 'Ctrl+]', down: mac ? '⌘[' : 'Ctrl+[', back: mac ? '⇧⌘[' : 'Ctrl+Shift+[',
  left: mac ? '⌥←' : 'Alt+←', right: mac ? '⌥→' : 'Alt+→',
} as const
const btn = 'h-8 px-2 rounded-md text-xs font-medium hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent inline-flex items-center gap-1.5 whitespace-nowrap'

/**
 * The Arrange panel of the object toolbar: what is in front of what, and how the object is turned. Every button is an action of editor/object-actions.ts (the same as the
 * keys and the right-click menu). Buttons that would do nothing right now (already at the front, already straight) are shown disabled, so the panel never seems to ignore a click.
 */
export function ArrangePanel({ slide, selection, gate }: { slide: Slide; selection: string[]; gate: A.Gate }) {
  const els = slide.elements.filter((e) => selection.includes(e.id))
  const order = stackOrder(slide).map((e) => e.id)
  const places = els.map((e) => order.indexOf(e.id)).sort((a, b) => a - b)
  // the selection is already the frontmost (or backmost) objects, in a block
  const atFront = places.every((p, i) => p === i)
  const atBack = places.every((p, i) => p === order.length - places.length + i)
  const editable = !slide.locked && !slide.writing && els.some((e) => !e.locked)
  const turnable = els.filter((e) => canRotate(e) && !e.locked)
  const one = els.length === 1 ? els[0]! : null
  // a whole group mirrors as one piece (its words only move); otherwise pictures and shapes
  const flippable = (els.length > 1 && isWholeGroup(slide.elements, els.map((e) => e.id))) || els.some((e) => canFlip(e) && !e.locked)
  const angle = one ? normAngle(one.rotation ?? 0) : 0
  const [why, setWhy] = useState<string | null>(null)
  // what is typed in the angle box belongs to the angle it was typed for: when the object turns another way (handle, keys, undo), the box shows the new angle
  const [typed, setTyped] = useState<{ for: number; text: string } | null>(null)
  const draft = typed && typed.for === angle ? typed.text : String(angle)
  const setDraft = (text: string) => setTyped({ for: angle, text })
  const turn = (how: { to: number } | { by: number }) => { const r = A.rotate(how, gate); setWhy(r.ok ? null : r.why ?? null) }
  const commitAngle = () => {
    const n = Number(draft.replace(',', '.').replace('°', '').trim())
    setTyped(null)
    if (Number.isFinite(n) && normAngle(n) !== angle) turn({ to: n })
  }

  return (
    <div data-testid="arrange-panel" className="basis-full flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 border-t border-border mt-1 text-xs text-slate-600">
      <div role="group" aria-label="Order" className="flex items-center gap-0.5">
        <span className="w-12 shrink-0">Order</span>
        <button type="button" className={btn} disabled={!editable || atFront} title={`Bring to front (${arrangeKeys.front})`} onClick={() => A.layer('front', gate)}><BringToFront aria-hidden size={15} />Front</button>
        <button type="button" className={btn} disabled={!editable || atFront} title={`Bring forward (${arrangeKeys.up})`} onClick={() => A.layer('up', gate)}><ArrowUp aria-hidden size={15} />Forward</button>
        <button type="button" className={btn} disabled={!editable || atBack} title={`Send backward (${arrangeKeys.down})`} onClick={() => A.layer('down', gate)}><ArrowDown aria-hidden size={15} />Backward</button>
        <button type="button" className={btn} disabled={!editable || atBack} title={`Send to back (${arrangeKeys.back})`} onClick={() => A.layer('back', gate)}><SendToBack aria-hidden size={15} />Back</button>
      </div>
      <div role="group" aria-label="Rotate" className="flex items-center gap-0.5">
        <span className="w-12 shrink-0">Rotate</span>
        {turnable.length ? (
          <>
            <button type="button" className={btn} disabled={!editable} title={`Rotate left 90° (${arrangeKeys.left} turns 15°)`} aria-label="Rotate left 90°" onClick={() => turn({ by: -90 })}><RotateCcw aria-hidden size={15} />90°</button>
            <button type="button" className={btn} disabled={!editable} title={`Rotate right 90° (${arrangeKeys.right} turns 15°)`} aria-label="Rotate right 90°" onClick={() => turn({ by: 90 })}><RotateCw aria-hidden size={15} />90°</button>
            {one && (
              <label className="inline-flex items-center gap-1 ml-1">
                <span className="sr-only">Angle in degrees</span>
                <input aria-label="Angle" data-testid="rotate-angle-input" inputMode="decimal" value={draft} disabled={!editable} onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitAngle} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitAngle() } if (e.key === 'Escape') setTyped(null) }}
                  className="w-14 h-7 border border-border rounded-md px-1.5 text-right tabular-nums" />
                <span>°</span>
              </label>
            )}
            <button type="button" className={btn} disabled={!editable || turnable.every((e) => !normAngle(e.rotation ?? 0))} title="Turn it back upright" onClick={() => turn({ to: 0 })}>Straighten</button>
          </>
        ) : (
          <span className="text-slate-500">{els.some((e) => e.locked) ? 'Unlock it first to turn it.' : 'Charts and tables cannot be turned (PowerPoint cannot turn them either).'}</span>
        )}
      </div>
      <div role="group" aria-label="Flip" className="flex items-center gap-0.5">
        <span className="w-12 shrink-0">Flip</span>
        {flippable ? (
          <>
            <button type="button" className={`${btn} ${one?.flipH ? 'bg-slate-100 text-slate-900' : ''}`} disabled={!editable} aria-pressed={one ? !!one.flipH : undefined} title="Mirror left to right" onClick={() => { const r = A.flip('h', gate); setWhy(r.ok ? null : r.why ?? null) }}><FlipHorizontal2 aria-hidden size={15} />Horizontal</button>
            <button type="button" className={`${btn} ${one?.flipV ? 'bg-slate-100 text-slate-900' : ''}`} disabled={!editable} aria-pressed={one ? !!one.flipV : undefined} title="Turn upside down as in a mirror" onClick={() => { const r = A.flip('v', gate); setWhy(r.ok ? null : r.why ?? null) }}><FlipVertical2 aria-hidden size={15} />Vertical</button>
          </>
        ) : (
          <span className="text-slate-500">{one?.type === 'text' ? 'Text cannot be flipped (its words would read backwards).' : 'Only pictures and shapes can be flipped.'}</span>
        )}
      </div>
      {why && <p role="status" className="basis-full text-amber-700">{why}</p>}
    </div>
  )
}
