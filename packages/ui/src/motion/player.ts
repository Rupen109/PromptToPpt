import type { Slide } from '@prompttoppt/validation'
import { buildKeyframes, easingCss } from './keyframes'
import { compileTimeline, compileTriggers, initiallyHidden, type Step } from './timeline'

/**
 * Plays one slide's effects. The slide must be drawn with its effects switched on (SlideCanvas `effects`): every element that has an effect sits in a wrapper marked
 * `data-pt-el="<element id>"`, and the elements that start hidden are already hidden, so there is no flash before the player starts.
 *
 * It keeps no timers. A step is handed to the browser's animation clock in one go (each effect with its own start offset), which is why effects that run together stay
 * together however the page is loaded. Nothing in the saved slide is touched: everything it does lives in animations that `reset()` / `destroy()` cancel.
 *
 * Steps: step 0 is the automatic one (`start()`), then one step per On Click. `advance()` is what a click or the Space key does while the slide is on screen.
 */
export interface PlayerOptions {
  /** honour prefers-reduced-motion: the effects still happen (what is hidden appears) but at once */
  reducedMotion?: boolean
  /** tells the page when something changed that it shows (a step started, or finished) */
  onChange?: () => void
  /** for tests: how an animation is made */
  animate?: (el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => Animation
}

export class SlidePlayer {
  private steps: Step[]
  private triggers: Map<string, Step>
  private types = new Map<string, string>()
  private played = 0
  private live: Animation[] = []
  private held: Animation[] = []
  private token = 0
  private dead = false

  constructor(private root: ParentNode, slide: Pick<Slide, 'elements' | 'effects'>, private opts: PlayerOptions = {}) {
    for (const e of slide.elements) if (!e.hidden) this.types.set(e.id, e.type) // an object switched off is not there: its effects (and clicks) are left out
    const ids = new Set(this.types.keys())
    this.steps = compileTimeline(slide.effects ?? [], ids)
    this.triggers = compileTriggers(slide.effects ?? [], ids)
  }

  /** the effects of a slide are worth playing only when there is at least one that can play */
  get hasEffects() { return this.steps.some((s) => s.effects.length > 0) || this.triggers.size > 0 }
  /** does a click on this object play something? */
  hasTrigger(elementId: string) { return this.triggers.has(elementId) }
  /** Plays the effects that wait for a click on this object. False when there are none. */
  trigger(elementId: string): boolean {
    const step = this.triggers.get(elementId)
    if (this.dead || !step) return false
    this.run(step, false)
    return true
  }
  /** steps still to play (the next click plays one) */
  get remaining() { return Math.max(0, this.steps.length - this.played) }
  /** how many On Click steps have played */
  get clicks() { return Math.max(0, this.played - 1) }
  get totalClicks() { return this.steps.length - 1 }
  get running() { return this.live.length > 0 }

  /** Plays the automatic step (everything before the first On Click). Call once when the slide appears. */
  start() {
    if (this.dead || this.played > 0) return
    this.playStep(0, false)
    this.played = 1
    this.changed()
  }

  /**
   * What a click does: while something is moving it finishes that at once; otherwise it plays the next step. Returns what it did, and 'none' when the slide has
   * nothing more to show (the caller then goes to the next slide).
   */
  advance(): 'finished' | 'played' | 'none' {
    if (this.dead) return 'none'
    if (this.running) { this.finishLive(); return 'finished' }
    if (this.played === 0) { this.start(); return this.running ? 'played' : this.advance() }
    if (this.played >= this.steps.length) return 'none'
    this.playStep(this.played, false)
    this.played += 1
    this.changed()
    return 'played'
  }

  /** One step back, shown at once (no animation). False when there is nothing to take back: the caller goes to the previous slide. */
  back(): boolean {
    if (this.dead) return false
    if (this.running) { this.finishLive(); return true }
    if (this.played <= 1) return false
    this.jumpTo(this.played - 1)
    return true
  }

  /** Everything played and finished, at once: how a slide looks when you come back to it from the next one. */
  showAll() { if (!this.dead) this.jumpTo(this.steps.length) }

  /** Skips ahead without animation: the first `n` steps (0 = the automatic one) shown as finished. For "play from here". */
  skipTo(n: number) { if (!this.dead) this.jumpTo(Math.max(0, Math.min(n, this.steps.length))) }

  /** Back to the start state (everything that has an entrance hidden again). */
  reset() { if (!this.dead) this.jumpTo(0) }

  /** Cancels every animation. The player cannot be used afterwards. */
  destroy() {
    this.dead = true
    this.token++
    for (const a of this.held) { try { a.cancel() } catch { /* already gone */ } }
    this.held = []; this.live = []
  }

  private jumpTo(n: number) {
    this.token++
    for (const a of this.held) { try { a.cancel() } catch { /* already gone */ } }
    this.held = []; this.live = []
    for (let i = 0; i < n && i < this.steps.length; i++) this.playStep(i, true)
    this.played = n
    this.changed()
  }

  private finishLive() {
    this.token++
    for (const a of this.live) { try { a.finish() } catch { /* already gone */ } }
    this.live = []
    this.changed()
  }

  private playStep(i: number, instant: boolean) {
    const step = this.steps[i]
    if (step) this.run(step, instant)
  }

  private run(step: Step, instant: boolean) {
    const token = ++this.token
    const make = this.opts.animate ?? ((el, kf, o) => el.animate(kf, o))
    const now: Animation[] = []
    for (const { effect, begin } of step.effects) {
      const wrapper = this.root.querySelector(`[data-pt-el="${cssEscape(effect.elementId)}"]`)
      if (!wrapper) continue
      const built = buildKeyframes(effect, { type: this.types.get(effect.elementId) as never })
      const parts = effect.textBy && effect.textBy !== 'object' && !built.inner ? Array.from(wrapper.querySelectorAll(`[data-pt-part="${effect.textBy === 'paragraph' ? 'p' : effect.textBy === 'word' ? 'w' : 'l'}"]`)) : []
      const targets: Element[] = parts.length ? parts : [built.inner ? ((wrapper.firstElementChild as Element | null) ?? wrapper) : wrapper]
      const stagger = effect.stagger ?? (effect.textBy === 'letter' ? 40 : effect.textBy === 'word' ? 120 : 250)
      const loop = !!effect.loop
      if (parts.length && effect.category === 'entrance') {
        // the box itself is hidden until its first part shows: reveal it from the start of the effect
        const reveal = make(wrapper, [{ visibility: 'visible' }, { visibility: 'visible' }], { duration: 1, delay: instant ? 0 : begin, fill: 'both' })
        this.held.push(reveal); if (instant || this.opts.reducedMotion) reveal.finish()
      }
      targets.forEach((target, k) => {
        const anim = make(target, built.keyframes, {
          duration: effect.duration, delay: instant ? 0 : begin + k * stagger, fill: built.fill,
          easing: built.linear ? 'linear' : easingCss(effect.easing),
          iterations: loop ? (instant ? 1 : Infinity) : effect.repeat * (effect.reverse ? 2 : 1), direction: effect.reverse ? 'alternate' : 'normal',
        })
        this.held.push(anim)
        if (!loop) now.push(anim) // a loop runs until the slide is left: a click never waits for it
        if (instant || this.opts.reducedMotion) anim.finish()
      })
    }
    const moving = now.filter((a) => a.playState !== 'finished')
    if (moving.length === 0) return
    this.live.push(...moving)
    void Promise.all(moving.map((a) => a.finished.catch(() => undefined))).then(() => {
      if (token !== this.token || this.dead) return // another step, a skip or a reset took over
      this.live = this.live.filter((a) => !moving.includes(a))
      this.changed()
    })
  }

  private changed() { this.opts.onChange?.() }
}

const cssEscape = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'))

/** The ids of the elements to draw hidden before the player starts (see SlideCanvas). */
export function hiddenAtStart(slide: Pick<Slide, 'elements' | 'effects'>): Set<string> {
  return initiallyHidden(slide.effects ?? [], new Set(slide.elements.filter((e) => !e.hidden).map((e) => e.id)))
}
