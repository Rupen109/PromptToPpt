import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { CANVAS, transformOf, type AspectRatio, type Slide, type Theme } from '@prompttoppt/validation'
import { ElementView, SlideBackground, Watermark, backgroundCss } from '../SlideCanvas'
import { carry, planMorph } from './morph'

/** What the page can do to a Morph that is running. */
export interface MorphHandle {
  /** jump to the end at once (a key pressed during the transition) */
  finish: () => void
  /** the editor's scrubber: hold the transition at this point (0 = the first slide, 1 = the second) */
  seek?: (fraction: number) => void
  /** play (again) from the start */
  replay?: () => void
}

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
  /** how matched text travels: as one object (default), word by word or character by character (see planMorph: texts that share too little, or are too long, still move as one object) */
  by?: 'object' | 'word' | 'character'
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
export function MorphLayer({ from, to, theme, aspect, width, duration, easing, blend = 'through', by = 'object', watermark = false, hiddenFrom, handleRef, onDone }: MorphLayerProps) {
  const root = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  const { width: W, height: H } = CANVAS[aspect]
  const scale = width / W
  const fromEls = from.elements.filter((e) => !hiddenFrom?.has(e.id) && !e.hidden)
  const toEls = to.elements.filter((e) => !e.hidden)
  const plan = useMemo(() => planMorph(from, to, hiddenFrom, by), [from, to, hiddenFrom, by])
  // the texts that travel piece by piece are drawn with their words / letters marked, on both sides
  const parts = useMemo(() => new Map(plan.pairs.filter((p) => p.pieces).map((p) => [p.to.id, p.pieces!.level === 'word' ? ('word' as const) : ('letter' as const)])), [plan])

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

    // where every piece of a text that travels in pieces sits NOW (before anything moves), in canvas units: measured from the screen and divided by the scale of the stage
    const pieceSel = (level: 'word' | 'letter') => (level === 'word' ? '[data-pt-part="w"]' : '[data-pt-part="l"]')
    const unit = host.getBoundingClientRect().width / W || 1
    const measured = new Map<string, { src: HTMLElement[]; dst: HTMLElement[]; from: DOMRect[]; to: DOMRect[] }>()
    for (const pair of plan.pairs) {
      const pc = pair.pieces; if (!pc) continue
      const src = find('from', pair.from.id), dst = find('to', pair.to.id)
      const sp = src ? [...src.querySelectorAll<HTMLElement>(pieceSel(pc.level))] : [], dp = dst ? [...dst.querySelectorAll<HTMLElement>(pieceSel(pc.level))] : []
      if (sp.length !== pc.from || dp.length !== pc.to) continue // the drawing and the plan disagree: this text moves as one object
      measured.set(pair.to.id, { src: sp, dst: dp, from: sp.map((n) => n.getBoundingClientRect()), to: dp.map((n) => n.getBoundingClientRect()) })
    }

    play(host.querySelector('[data-morph-bg="to"]'), [{ opacity: 0 }, { opacity: 1 }])
    // layering follows the slide being arrived at from the first frame (as in PowerPoint): every object is stacked by its place on the destination slide, a pair's two copies sit together
    const layer = (n: HTMLElement | null, z: number) => { if (n) n.style.zIndex = String(Math.round(z * 2)) }
    for (const { from: a, to: b, crossfade, pieces } of plan.pairs) {
      const src = find('from', a.id), dst = find('to', b.id)
      if (!src || !dst) continue
      const m = pieces ? measured.get(b.id) : undefined
      if (pieces && m) {
        // word by word / letter by letter: a piece that exists in both texts travels from where it was to where it is (the old copy of it is hidden, so there is only one), the rest fade out / in
        layer(src, b.zIndex); layer(dst, b.zIndex); dst.style.zIndex = String(Math.round(b.zIndex * 2) + 1)
        const k = a.type === 'text' && b.type === 'text' && b.fontSize > 0 ? a.fontSize / b.fontSize : 1
        const matchedFrom = new Set(pieces.matches.map(([i]) => i)), matchedTo = new Set(pieces.matches.map(([, j]) => j))
        for (const [i, j] of pieces.matches) {
          const dx = (m.from[i]!.left - m.to[j]!.left) / unit, dy = (m.from[i]!.top - m.to[j]!.top) / unit
          m.src[i]!.style.opacity = '0'
          m.dst[j]!.style.transformOrigin = '0 0'
          play(m.dst[j]!, [{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }, { transform: 'translate(0px, 0px) scale(1)' }], b.id)
        }
        m.src.forEach((n, i) => { if (!matchedFrom.has(i)) play(n, [{ opacity: 1 }, { opacity: 0 }], a.id) })
        m.dst.forEach((n, j) => { if (!matchedTo.has(j)) play(n, [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1, offset: 1 }], b.id) })
        continue
      }
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
      // (with its mirroring: a picture flipped between the two slides turns over through its edge, never jumps)
      if (transformOf(a) !== transformOf(b)) for (const n of [src, dst]) play(n.firstElementChild, [{ transform: transformOf(a, true)! }, { transform: transformOf(b, true)! }], a.id)
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

    if (handleRef) handleRef.current = {
      finish: () => { for (const a of anims) { try { a.finish() } catch { /* gone */ } } },
      seek: (fraction) => { for (const a of anims) { try { a.pause(); a.currentTime = Math.max(0, Math.min(1, fraction)) * duration } catch { /* gone */ } } },
      replay: () => { for (const a of anims) { try { a.currentTime = 0; a.play() } catch { /* gone */ } } },
    }
    void Promise.all(anims.map((a) => a.finished)).then(() => { if (!cancelled) done.current() }, () => undefined)
    return () => {
      cancelled = true
      if (handleRef) handleRef.current = null
      for (const a of anims) { try { a.cancel() } catch { /* gone */ } }
    }
  }, [from, to, hiddenFrom, duration, easing, blend, handleRef, plan, W])

  return (
    <div ref={root} data-testid="morph" style={{ width, height: H * scale, overflow: 'hidden', position: 'relative', isolation: 'isolate', background: backgroundCss(from, theme), borderRadius: 4 }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}>
        <div data-morph-bg="to" style={{ position: 'absolute', inset: 0, background: backgroundCss(to, theme) }}><SlideBackground slide={to} scale={scale} W={W} H={H} /></div>
        <div data-morph-side="from" style={{ display: 'contents' }}>{fromEls.map((el) => <ElementView key={el.id} el={el} theme={theme} slide={from} fx={{ hidden: false, ...(parts.has(el.id) ? { parts: parts.get(el.id)! } : {}) }} />)}</div>
        <div data-morph-side="to" style={{ display: 'contents' }}>{toEls.map((el) => <ElementView key={el.id} el={el} theme={theme} slide={to} fx={{ hidden: false, ...(parts.has(el.id) ? { parts: parts.get(el.id)! } : {}) }} />)}</div>
        {watermark && <Watermark />}
      </div>
    </div>
  )
}
