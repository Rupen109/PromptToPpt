import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { CANVAS, type AspectRatio, type Slide, type Theme } from '@prompttoppt/validation'
import { ElementView, Watermark, backgroundCss } from '../SlideCanvas'
import { carry, planMorph } from './morph'

/** What the page can do to a Morph that is running. */
export interface MorphHandle { /** jump to the end at once (a key pressed during the transition) */ finish: () => void }

export interface MorphLayerProps {
  from: Slide
  to: Slide
  theme: Theme
  aspect: AspectRatio
  width: number
  /** ms */
  duration: number
  /** a CSS timing function */
  easing: string
  watermark?: boolean
  /** how objects that are not the same picture or words give way to each other (see the transition's `blend`) */
  blend?: 'through' | 'cross'
  /** elements of `from` that are not on screen (an exit effect removed them) */
  hiddenFrom?: ReadonlySet<string>
  handleRef?: MutableRefObject<MorphHandle | null>
  /** called once, when the transition has finished (or was finished early); the page then shows `to` itself */
  onDone: () => void
}

const MIN_SCALE = 'scale(0.92)'

/**
 * How an object that is new on the slide arrives in a template's Morph (the way the original decks play): it comes in from the edge of the slide nearest to where it ends up, the
 * way a planet rises from the bottom and an astronaut slides in from the side, and grows to its size as it fades in. An object that already waits outside the slide just fades in.
 */
function enterFromEdge(e: { x: number; y: number; width: number; height: number }, W: number, H: number): Keyframe[] {
  const cx = e.x + e.width / 2
  let dx = 0, dy = 0, s = 1
  if (cx < W * 0.36 && e.x + e.width > 0) dx = -(e.x + e.width)
  else if (cx > W * 0.64 && e.x < W) dx = W - e.x
  else if (e.y < H) { dy = H - e.y; s = 0.4 }
  const from = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${s})`
  return [{ opacity: 0, transform: from, offset: 0 }, { opacity: 1, offset: 0.55 }, { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 1 }]
}

/**
 * Draws a Morph between two slides. Both slides' elements are on one canvas; every matched element exists as two copies (planMorph) and each is carried onto the other's
 * place with `transform` and `opacity` (the Web Animations API: one clock for all of them, nothing is laid out while it plays, nothing is saved). Elements on one slide only
 * come in or go out; the two backgrounds cross over. When everything has finished it calls `onDone` and the page shows the real slide, which looks the same.
 */
export function MorphLayer({ from, to, theme, aspect, width, duration, easing, blend = 'through', watermark = false, hiddenFrom, handleRef, onDone }: MorphLayerProps) {
  const root = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  const { width: W, height: H } = CANVAS[aspect]
  const scale = width / W
  const fromEls = from.elements.filter((e) => !hiddenFrom?.has(e.id))

  useLayoutEffect(() => {
    const host = root.current
    if (!host) return
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || duration <= 0) { queueMicrotask(() => done.current()); return }
    let cancelled = false
    const anims: Animation[] = []
    const find = (side: 'from' | 'to', id: string) => host.querySelector<HTMLElement>(`[data-morph-side="${side}"] [data-pt-el="${CSS.escape(id)}"]`)
    // the cards of a Morph deck (m-c0 … m-c3) leave one after the other, a little apart, and arrive together: a cascade reads as one connected movement where everything at once reads as a jump
    const lead = (id: string) => { const m = /^m-c(\d)/.exec(id); return m ? Number(m[1]) * Math.round(duration * 0.07) : 0 }
    const play = (node: Element | null, frames: Keyframe[], id = '') => { if (node) { const d = lead(id); anims.push(node.animate(frames, { duration: duration - d, delay: d, easing, fill: 'both' })) } }
    const plan = planMorph(from, to, hiddenFrom)

    play(host.querySelector('[data-morph-bg="to"]'), [{ opacity: 0 }, { opacity: 1 }])
    // layering follows the slide being arrived at from the first frame (as in PowerPoint): every object is stacked by its place on the destination slide, a pair's two copies sit together
    const layer = (n: HTMLElement | null, z: number) => { if (n) n.style.zIndex = String(Math.round(z * 2)) }
    for (const { from: a, to: b, crossfade } of plan.pairs) {
      const src = find('from', a.id), dst = find('to', b.id)
      if (!src || !dst) continue
      const toB = carry(a, b), toA = carry(b, a)
      src.style.transformOrigin = toB.origin
      dst.style.transformOrigin = toA.origin
      layer(src, b.zIndex); layer(dst, b.zIndex); if (dst) dst.style.zIndex = String(Math.round(b.zIndex * 2) + 1)
      // both copies travel together over the whole duration; only their visibility is timed separately
      play(src, [{ transform: 'translate(0px, 0px) scale(1)' }, { transform: toB.transform }], a.id)
      play(dst, [{ transform: toA.transform }, { transform: 'translate(0px, 0px) scale(1)' }], b.id)
      if (crossfade && blend === 'cross') {
        // PowerPoint's Morph: the old copy fades out as the new one fades in, both visible together while they travel
        play(src, [{ opacity: 1 }, { opacity: 0 }], a.id)
        play(dst, [{ opacity: 0 }, { opacity: 1 }], b.id)
      } else if (crossfade) {
        // the two copies do not coincide (other words, or another wrapping): the old one fades out, THEN the new one fades in, so two texts are never on top of each other
        play(src, [{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.34 }, { opacity: 0, offset: 1 }], a.id)
        play(dst, [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.34 }, { opacity: 1, offset: 0.7 }, { opacity: 1, offset: 1 }], b.id)
      } else play(dst, [{ opacity: 0 }, { opacity: 1 }], b.id) // the new copy appears over the old one, which stays solid underneath
      // the element itself carries the rotation (and its own opacity): both copies change it from the old value to the new one
      if (a.rotation !== b.rotation) for (const n of [src, dst]) play(n.firstElementChild, [{ transform: `rotate(${a.rotation}deg)` }, { transform: `rotate(${b.rotation}deg)` }], a.id)
      if (a.opacity !== b.opacity) for (const n of [src, dst]) play(n.firstElementChild, [{ opacity: a.opacity }, { opacity: b.opacity }], a.id)
    }
    // the words of a card never travel on their own: when a card leaves its big form its body is gone before the card has moved, and when a card becomes big its body appears only once it has arrived
    const isBody = (id: string) => /^m-c\d-t$/.test(id)
    for (const e of plan.entering) {
      const n = find('to', e.id); if (!n) continue
      n.style.transformOrigin = 'center'; layer(n, e.zIndex)
      play(n, blend === 'cross' ? enterFromEdge(e, W, H) : isBody(e.id) ? [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.72 }, { opacity: 1, offset: 1 }] : [{ opacity: 0, transform: MIN_SCALE }, { opacity: 1, transform: 'scale(1)' }], e.id)
    }
    for (const e of plan.exiting) {
      const n = find('from', e.id); if (!n) continue
      n.style.transformOrigin = 'center'; layer(n, e.zIndex)
      play(n, blend === 'cross' ? [{ opacity: 1 }, { opacity: 0 }] : isBody(e.id) ? [{ opacity: 1, offset: 0 }, { opacity: 0, offset: 0.22 }, { opacity: 0, offset: 1 }] : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: MIN_SCALE }], e.id)
    }

    if (handleRef) handleRef.current = { finish: () => { for (const a of anims) { try { a.finish() } catch { /* gone */ } } } }
    void Promise.all(anims.map((a) => a.finished)).then(() => { if (!cancelled) done.current() }, () => undefined)
    return () => {
      cancelled = true
      if (handleRef) handleRef.current = null
      for (const a of anims) { try { a.cancel() } catch { /* gone */ } }
    }
  }, [from, to, hiddenFrom, duration, easing, blend, handleRef])

  return (
    <div ref={root} data-testid="morph" style={{ width, height: H * scale, overflow: 'hidden', position: 'relative', isolation: 'isolate', background: backgroundCss(from, theme), borderRadius: 4 }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
        <div data-morph-bg="to" style={{ position: 'absolute', inset: 0, background: backgroundCss(to, theme) }} />
        <div data-morph-side="from" style={{ display: 'contents' }}>{fromEls.map((el) => <ElementView key={el.id} el={el} theme={theme} slide={from} fx={{ hidden: false }} />)}</div>
        <div data-morph-side="to" style={{ display: 'contents' }}>{to.elements.map((el) => <ElementView key={el.id} el={el} theme={theme} slide={to} fx={{ hidden: false }} />)}</div>
        {watermark && <Watermark />}
      </div>
    </div>
  )
}
