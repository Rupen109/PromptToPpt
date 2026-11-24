import { commentPinOf, type Slide } from '@prompttoppt/validation'
import { useComments } from '@/editor/comments'
import { useDoc } from '@/editor/store'
import * as A from '@/editor/object-actions'
import { useUi } from '@/editor/ui'
import type { MenuItem } from './ContextMenu'
import { canFlip, canRotate, isWholeGroup } from '@prompttoppt/validation'
import { arrangeKeys } from './ArrangePanel'

const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const key = (k: string, shift = false) => `${shift ? (mac ? '⇧' : 'Shift+') : ''}${mac ? '⌘' : 'Ctrl+'}${k}`
/** opens a side panel or ribbon (never toggles it closed: the person asked for it) */
const open = (part: { drawer?: 'ai' | 'selection'; ribbon?: 'animations' }) => useUi.setState(part)

/**
 * The right-click menu on the slide: for the selected objects, or for the empty slide. Every item is an action of editor/object-actions.ts (the same the keyboard uses)
 * or opens an existing panel, so nothing here can behave differently from the rest of the editor. Items that cannot apply now are shown disabled, never hidden.
 */
export function objectMenuItems(slide: Slide, selection: string[], gate: A.Gate): MenuItem[] {
  const els = slide.elements.filter((e) => selection.includes(e.id))
  // a viewer (read-only copy) can copy and comment, nothing else
  if (useDoc.getState().readOnly) return [{ label: 'Copy', hint: key('C'), onClick: () => void A.copySelection() }, commentItem(slide, els)]
  const editable = !slide.locked && !slide.writing
  const ui = useUi.getState()
  const allLocked = els.length > 0 && els.every((e) => e.locked)
  const grouped = els.some((e) => e.groupId)
  const canMirror = els.some(canFlip) || (els.length > 1 && isWholeGroup(slide.elements, els.map((e) => e.id)))
  return [
    { label: 'Cut', hint: key('X'), disabled: !editable, onClick: () => void A.cut(gate) },
    { label: 'Copy', hint: key('C'), onClick: () => void A.copySelection() },
    { label: 'Paste', hint: key('V'), disabled: !editable || !ui.clipboard.length, onClick: () => void A.paste(gate) },
    { label: 'Duplicate', hint: key('D'), disabled: !editable, onClick: () => void A.duplicate(gate) },
    { label: 'Delete', hint: mac ? '⌫' : 'Del', danger: true, disabled: !editable || allLocked, onClick: () => void A.remove(gate) },
    { type: 'divider' },
    { label: 'Bring to front', hint: arrangeKeys.front, disabled: !editable, onClick: () => void A.layer('front', gate) },
    { label: 'Bring forward', hint: arrangeKeys.up, disabled: !editable, onClick: () => void A.layer('up', gate) },
    { label: 'Send backward', hint: arrangeKeys.down, disabled: !editable, onClick: () => void A.layer('down', gate) },
    { label: 'Send to back', hint: arrangeKeys.back, disabled: !editable, onClick: () => void A.layer('back', gate) },
    { type: 'divider' },
    { label: 'Rotate right 90°', disabled: !editable || allLocked || !els.some(canRotate), onClick: () => void A.rotate({ by: 90 }, gate) },
    { label: 'Rotate left 90°', disabled: !editable || allLocked || !els.some(canRotate), onClick: () => void A.rotate({ by: -90 }, gate) },
    { label: 'Flip horizontal', disabled: !editable || allLocked || !canMirror, onClick: () => void A.flip('h', gate) },
    { label: 'Flip vertical', disabled: !editable || allLocked || !canMirror, onClick: () => void A.flip('v', gate) },
    { type: 'divider' },
    grouped ? { label: 'Ungroup', hint: key('G', true), disabled: !editable, onClick: () => void A.ungroup(gate) } : { label: 'Group', hint: key('G'), disabled: !editable || els.length < 2, onClick: () => void A.group(gate) },
    { label: allLocked ? 'Unlock' : 'Lock', disabled: slide.locked, onClick: () => void A.toggleLockSelection(gate) },
    { label: 'Hide', disabled: !editable || allLocked, onClick: () => void A.hideSelection(gate) },
    { label: 'Rename…', hint: 'Selection pane', onClick: () => open({ drawer: 'selection' }) },
    { type: 'divider' },
    // a comment ON this object: its pin follows the object (comment-pin.ts); one object at a time, like PowerPoint's "New Comment" on a shape
    commentItem(slide, els),
    { label: 'Animate…', onClick: () => open({ ribbon: 'animations' }) },
    { label: 'Edit with AI…', onClick: () => open({ drawer: 'ai' }) },
  ]
}

/** a comment ON the one selected object: its pin follows the object (comment-pin.ts), like PowerPoint's "New Comment" on a shape */
function commentItem(slide: Slide, els: Slide['elements']): MenuItem {
  return { label: 'Comment…', disabled: els.length !== 1, onClick: () => { const el = els[0]!; useComments.getState().setPending({ slideId: slide.id, ...commentPinOf(el, useDoc.getState().doc?.aspectRatio ?? '16:9'), elementId: el.id }); useUi.setState({ drawer: 'comments' }) } }
}

/** The right-click menu on the empty part of the slide. */
export function slideMenuItems(slide: Slide, gate: A.Gate): MenuItem[] {
  const editable = !slide.locked && !slide.writing && !useDoc.getState().readOnly
  const ui = useUi.getState()
  return [
    { label: 'Paste', hint: key('V'), disabled: !editable || !ui.clipboard.length, onClick: () => void A.paste(gate) },
    { label: 'Select all', hint: key('A'), onClick: () => void A.selectAll() },
    { type: 'divider' },
    { label: 'Selection pane', onClick: () => open({ drawer: 'selection' }) },
    { label: 'Speaker notes', onClick: () => ui.toggleNotes(true) },
    { label: 'Edit with AI…', onClick: () => open({ drawer: 'ai' }) },
  ]
}
