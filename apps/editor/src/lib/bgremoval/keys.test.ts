import { describe, expect, it } from 'vitest'
import { isInteractive, spaceIsForStage, type KeyTarget } from './keys'

const el = (tagName: string, attrs: Record<string, string> = {}, editable = false): KeyTarget => ({ tagName, isContentEditable: editable, getAttribute: (n) => attrs[n] ?? null })

describe('keyboard scoping of the stage', () => {
  it('controls keep their keys: buttons, radios, checkboxes, sliders, links, inputs, selects, editable text', () => {
    for (const t of [el('BUTTON'), el('A'), el('INPUT'), el('SELECT'), el('TEXTAREA'), el('LABEL'), el('DIV', { role: 'radio' }), el('DIV', { role: 'button' }), el('DIV', { role: 'slider' }), el('SPAN', { role: 'checkbox' }), el('DIV', {}, true)]) {
      expect(isInteractive(t), t.tagName + (t.getAttribute?.('role') ?? '')).toBe(true)
    }
    expect(isInteractive(el('DIV'))).toBe(false)
    expect(isInteractive(el('CANVAS'))).toBe(false)
    expect(isInteractive(null)).toBe(false)
  })

  it('Space is the stage\'s only when the stage has focus or the pointer is over it, and never when a control is the target', () => {
    const stage = el('DIV'), button = el('BUTTON')
    expect(spaceIsForStage({ target: stage, stageHasFocus: true, pointerOverStage: false })).toBe(true)
    expect(spaceIsForStage({ target: el('BODY'), stageHasFocus: false, pointerOverStage: true })).toBe(true)
    expect(spaceIsForStage({ target: stage, stageHasFocus: false, pointerOverStage: false })).toBe(false) // elsewhere on the page
    expect(spaceIsForStage({ target: button, stageHasFocus: false, pointerOverStage: true })).toBe(false) // a focused button gets its Space
    expect(spaceIsForStage({ target: el('DIV', { role: 'radio' }), stageHasFocus: true, pointerOverStage: true })).toBe(false)
  })
})
