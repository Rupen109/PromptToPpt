/**
 * Keys that belong to the picture stage (Space = hold to move the picture) must never take a key from a control: Space presses a focused button, ticks a radio or checkbox, moves a
 * slider, opens a menu. These rules decide whether a key press is the stage's. Structural types, so they are tested without a browser.
 */
export interface KeyTarget {
  tagName?: string
  isContentEditable?: boolean
  getAttribute?(name: string): string | null
}

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'OPTION', 'LABEL'])
const INTERACTIVE_ROLES = new Set(['button', 'radio', 'checkbox', 'switch', 'slider', 'tab', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'option', 'link', 'combobox', 'textbox', 'spinbutton'])

/** Whether a key press aimed at `t` is for that control (so the stage must leave it alone). */
export function isInteractive(t: KeyTarget | null | undefined): boolean {
  if (!t) return false
  if (t.isContentEditable) return true // (only the target itself: a focused control is always the event target)
  if (t.tagName && INTERACTIVE_TAGS.has(t.tagName.toUpperCase())) return true
  const role = t.getAttribute?.('role')
  return !!role && INTERACTIVE_ROLES.has(role)
}

/**
 * Space moves the picture only when it is the stage's: the stage has the keyboard focus, or the pointer is over the stage, AND the key press is not aimed at a control.
 */
export function spaceIsForStage(o: { target: KeyTarget | null; stageHasFocus: boolean; pointerOverStage: boolean }): boolean {
  if (isInteractive(o.target)) return false
  return o.stageHasFocus || o.pointerOverStage
}
