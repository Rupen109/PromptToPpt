import { canFlip, canRotate, expandToGroups, isWholeGroup, type Effect, type SlideElement } from '@prompttoppt/validation'
import * as C from './commands'
import { moveLayer, setHidden, stackOrder } from './selection-commands'
import { flipElements, rotateElements } from './rotate'
import { useDoc } from './store'
import { useUi } from './ui'

/**
 * What can be done to the selected objects, ONE implementation each: the keyboard shortcuts, the right-click menu and the format bar call these, so they always behave the same.
 * Each one works on the active slide and the current selection, is one undo step, and returns false when nothing was done (nothing selected, a locked slide, a plan gate).
 * `gate` is the Advanced-editor check (moving, arranging and formatting objects is a Pro feature); copying never needs it.
 */
export type Gate = () => boolean
export type Layer = 'front' | 'up' | 'down' | 'back'

function current() {
  const ui = useUi.getState()
  const st = useDoc.getState()
  const slide = st.doc?.slides.find((s) => s.id === ui.activeSlideId) ?? null
  const els = slide ? slide.elements.filter((x) => ui.selection.includes(x.id)) : []
  return { ui, st, slide, els, editable: !!slide && !slide.locked && !slide.writing }
}

export function copySelection(): boolean {
  const { ui, slide, els } = current()
  if (!slide || !els.length) return false
  ui.setClipboard(structuredClone(els) as SlideElement[], structuredClone((slide.effects ?? []).filter((fx) => els.some((x) => x.id === fx.elementId))) as Effect[])
  return true
}

export function paste(gate: Gate): boolean {
  const { ui, st, slide, editable } = current()
  if (!slide || !editable || !ui.clipboard.length || !gate()) return false
  let ids: string[] = []
  st.apply('Paste', (d) => { ids = C.pasteElements(d, slide.id, ui.clipboard, undefined, ui.clipboardEffects) })
  ui.select(ids)
  return ids.length > 0
}

export function duplicate(gate: Gate): boolean {
  const { ui, st, slide, els, editable } = current()
  if (!slide || !editable || !els.length || !gate()) return false
  let ids: string[] = []
  st.apply('Duplicate', (d) => { ids = C.duplicateElements(d, slide.id, els.map((x) => x.id)) })
  ui.select(ids)
  return ids.length > 0
}

export function remove(gate: Gate): boolean {
  const { ui, st, slide, els, editable } = current()
  if (!slide || !editable || !els.length || !gate()) return false
  st.apply('Delete', (d) => C.deleteElements(d, slide.id, els.map((x) => x.id)))
  ui.select([])
  return true
}

export function cut(gate: Gate): boolean {
  const { slide, editable } = current()
  if (!slide || !editable || !gate()) return false
  return copySelection() && remove(() => true)
}

export function group(gate: Gate): boolean {
  const { ui, st, slide, els, editable } = current()
  if (!slide || !editable || !gate()) return false
  const ids = expandToGroups(slide.elements, els.map((x) => x.id))
  if (ids.length < 2) return false
  let g: string | null = null
  st.apply('Group', (d) => { g = C.groupElements(d, slide.id, ids) })
  if (g) ui.select(ids)
  return !!g
}

export function ungroup(gate: Gate): boolean {
  const { st, slide, els, editable } = current()
  if (!slide || !editable || !els.some((x) => x.groupId) || !gate()) return false
  let n = 0
  st.apply('Ungroup', (d) => { n = C.ungroupElements(d, slide.id, expandToGroups(slide.elements, els.map((x) => x.id))) })
  return n > 0
}

/** Bring to front / forward, send backward / to back. Several objects keep their order among themselves. */
export function layer(to: Layer, gate: Gate): boolean {
  const { st, slide, els, editable } = current()
  if (!slide || !editable || !els.length || !gate()) return false
  const order = stackOrder(slide).filter((e) => els.some((x) => x.id === e.id)).map((e) => e.id) // front to back
  // moving to the front: the backmost first, so the frontmost ends on top; to the back: the frontmost first
  const ids = to === 'front' || to === 'up' ? [...order].reverse() : order
  let any = false
  st.apply(LAYER_LABEL[to], (d) => { for (const id of ids) any = moveLayer(d, slide.id, id, to) || any })
  return any
}
export const LAYER_LABEL: Record<Layer, string> = { front: 'Bring to front', up: 'Bring forward', down: 'Send backward', back: 'Send to back' }

/**
 * Turns the selected objects to an angle or by an angle (the Arrange menu, Alt+arrow keys, the right-click menu). A selected whole group turns as one piece around its middle.
 * Charts and tables cannot be turned (PowerPoint cannot either); when nothing in the selection can turn, the reason is returned so the person is told, never a silent no.
 */
export function rotate(how: { to: number } | { by: number }, gate: Gate): { ok: true } | { ok: false; why?: string } {
  const { st, slide, els, editable } = current()
  if (!slide || !editable || !els.length) return { ok: false }
  if (!els.some((e) => canRotate(e))) return { ok: false, why: els.length === 1 ? `A ${els[0]!.type} cannot be turned (PowerPoint cannot turn one either).` : 'Charts and tables cannot be turned.' }
  if (els.every((e) => e.locked)) return { ok: false, why: 'Unlock it first to turn it.' }
  if (!gate()) return { ok: false }
  const ids = els.map((e) => e.id)
  const together = ids.length > 1 && isWholeGroup(slide.elements, ids)
  if (together && els.some((e) => !canRotate(e) || e.locked)) return { ok: false, why: 'This group holds a chart, a table or a locked object, so it cannot be turned as one piece.' }
  let n = 0
  st.apply('Rotate', (d) => { n = rotateElements(d, slide.id, ids, how, together) }, { mergeKey: `rotate:${ids.join(',')}` })
  return n ? { ok: true } : { ok: false }
}

/**
 * Mirrors the selected objects left-right or upside down (the Arrange menu, the right-click menu). A selected whole group mirrors as one piece. Text boxes, charts and tables
 * cannot be mirrored on their own; when nothing selected can be, the reason is returned so the person is told.
 */
export function flip(axis: 'h' | 'v', gate: Gate): { ok: true } | { ok: false; why?: string } {
  const { st, slide, els, editable } = current()
  if (!slide || !editable || !els.length) return { ok: false }
  const ids = els.map((e) => e.id)
  const together = ids.length > 1 && isWholeGroup(slide.elements, ids)
  if (!together && !els.some((e) => canFlip(e))) return { ok: false, why: els.length === 1 ? (els[0]!.type === 'text' ? 'Text cannot be flipped: its words would read backwards.' : `A ${els[0]!.type} cannot be flipped (PowerPoint cannot flip one either).`) : 'Only pictures and shapes can be flipped.' }
  if (els.every((e) => e.locked) || (together && els.some((e) => e.locked))) return { ok: false, why: 'Unlock it first to flip it.' }
  if (!gate()) return { ok: false }
  let n = 0
  st.apply(axis === 'h' ? 'Flip horizontal' : 'Flip vertical', (d) => { n = flipElements(d, slide.id, ids, axis, together) })
  return n ? { ok: true } : { ok: false }
}

/** Locks the selected objects, or unlocks them when they are all locked already. */
export function toggleLockSelection(gate: Gate): boolean {
  const { st, slide, els } = current()
  if (!slide || slide.locked || !els.length || !gate()) return false
  const lockAll = !els.every((x) => x.locked)
  st.apply(lockAll ? 'Lock' : 'Unlock', (d) => { for (const x of els) if (!!x.locked !== lockAll) C.toggleLock(d, slide.id, x.id) })
  return true
}

export function hideSelection(gate: Gate): boolean {
  const { ui, st, slide, els, editable } = current()
  if (!slide || !editable || !els.length || !gate()) return false
  st.apply('Hide', (d) => { for (const x of els) setHidden(d, slide.id, x.id, true) })
  ui.select([])
  return true
}

export function selectAll(): boolean {
  const { ui, slide } = current()
  if (!slide) return false
  ui.select(slide.elements.filter((e) => !e.hidden && !e.decorative).map((e) => e.id))
  return true
}
