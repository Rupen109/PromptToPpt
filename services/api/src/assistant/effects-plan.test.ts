import { describe, expect, it } from 'vitest'
import { planEffect } from './effects-plan.ts'

const slide = (o: object = {}) => ({ id: 's', layoutId: 'title-body', locked: false, elements: [], ...o }) as never
const text = { id: 't', type: 'text', role: 'title', locked: false } as never
const pic = { id: 'p', type: 'image', locked: false } as never
const plan = (el: never, op: object) => planEffect(slide(), el, { op: 'animate', ...op } as never)

describe('planEffect: timing, paths and what each effect really has', () => {
  it('seconds become milliseconds, clamped to what the editor allows; "until the slide ends" wins over a repeat count', () => {
    const r = plan(text, { effect: 'fade-in', seconds: 3, delay: 2, repeat: 2 })
    expect(r.ok && r.change.effect).toMatchObject({ type: 'fade-in', duration: 3000, delay: 2000, repeat: 2 })
    const tiny = plan(text, { effect: 'fade-in', seconds: 0.001, delay: 99 })
    expect(tiny.ok && tiny.change.effect).toMatchObject({ duration: 100, delay: 20000 })
    const loop = plan(text, { effect: 'pulse', loop: true, repeat: 5 })
    expect(loop.ok && loop.change.effect).toMatchObject({ loop: true }); expect(loop.ok && (loop.change.effect as { repeat?: number }).repeat).toBeUndefined()
  })
  it('the named speed and the exact seconds: exact seconds win', () => {
    const r = plan(text, { effect: 'fade-in', speed: 'slow', seconds: 2 })
    expect(r.ok && (r.change.effect as { duration: number }).duration).toBe(2000)
  })
  it('a motion path preset is allowed with a direction and a named distance; a hand-drawn path is not', () => {
    const r = plan(pic, { effect: 'path-line', direction: 'left', distance: 'medium' })
    expect(r.ok && r.change.effect).toMatchObject({ type: 'path-line', direction: 'left', distance: 300 })
    expect(plan(pic, { effect: 'path-custom' })).toMatchObject({ ok: false, why: expect.stringMatching(/hand-drawn path needs the editor/) })
  })
  it('options an effect does not have are dropped WITH a note, never passed on', () => {
    const r = plan(text, { effect: 'fade-in', distance: 'large', direction: 'left' })
    expect(r.ok && r.change.effect).toEqual({ type: 'fade-in' })
    expect(r.ok && r.notes.join(' ')).toMatch(/has no distance/); expect(r.ok && r.notes.join(' ')).toMatch(/has no direction/)
  })
})
