import type { Presentation, Slide, SlideElement, TransitionSpec } from '@prompttoppt/validation'
import { alreadyAsked, effectAlready, groupAlready, layerAlready } from './element-ops'
import { unreadableTexts, type Expectation } from './expectations'

/**
 * Did it really happen? A pure check of ONE expectation against a DOCUMENT (never against what a command returned). The editor runs it on its live deck right after applying an answer, the
 * server on the saved deck when credits are settled.
 */
export type SkipReason = 'locked' | 'missing_slide' | 'missing_element' | 'not_image' | 'not_applied' | 'no_transparency' | 'last_slide'
export type Status = 'done' | 'unchanged' | 'failed' | 'skipped' | 'info'

export interface Check {
  key: string
  kind: Expectation['kind']
  status: Status
  /** why not done (failed or skipped) */
  reason?: SkipReason
  slideId?: string
  elementId?: string
  /** facts that prove it (shown to nobody; kept in the settlement record) */
  evidence: string[]
}

const slideOf = (d: Presentation, id: string): Slide | undefined => d.slides.find((s) => s.id === id)
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** every key of `want` is in `got` with an equal value (strings, numbers, booleans; lists by position and length): composing a slide may add defaults, never change what was asked */
export function contains(want: unknown, got: unknown): boolean {
  if (want === undefined) return true
  if (want === null || typeof want !== 'object') return want === got
  if (Array.isArray(want)) return Array.isArray(got) && got.length === want.length && want.every((w, i) => contains(w, got[i]))
  if (got === null || typeof got !== 'object' || Array.isArray(got)) return false
  return Object.entries(want as Record<string, unknown>).every(([k, v]) => contains(v, (got as Record<string, unknown>)[k]))
}

const ok = (e: Expectation, evidence: string[], extra: Partial<Check> = {}): Check => ({ key: e.key, kind: e.kind, status: 'done', evidence, ...extra })
/** Whether a slide already arrives as the spec says: the type, and each option the spec names. */
export const transitionMatches = (t: Slide['transition'] | undefined, to: TransitionSpec): boolean => (t?.type ?? 'none') === to.type && (to.duration === undefined || t?.duration === to.duration) && (to.direction === undefined || t?.direction === to.direction) && (to.advanceAfter === undefined || t?.advanceAfter === to.advanceAfter)

const no = (e: Expectation, reason: SkipReason, extra: Partial<Check> = {}): Check => ({ key: e.key, kind: e.kind, status: reason === 'locked' ? 'skipped' : 'failed', reason, evidence: [], ...extra })
const same = (e: Expectation, evidence: string[], extra: Partial<Check> = {}): Check => ({ key: e.key, kind: e.kind, status: 'unchanged', evidence, ...extra })

/** `before` is only needed for a revert (what "put back" must differ from); every other check needs the document alone. */
export function evaluate(e: Expectation, doc: Presentation, before?: Presentation): Check {
  switch (e.kind) {
    case 'theme': {
      if (e.parts.length === 0) return same(e, ['the design is already like that'])
      const t = doc.theme
      const holds: Record<string, boolean> = {
        colours: contains(e.to.colors, t.colors), fonts: contains(e.to.fonts, t.fonts), style: contains(e.to.style ?? null, t.style ?? null), motion: contains(e.to.motion ?? null, t.motion ?? null),
        design: t.id === e.to.id && (t.templateId ?? null) === (e.to.templateId ?? null), mode: true, logo: (t.brand?.logo?.src ?? null) === (e.to.brand?.logo?.src ?? null) && (t.brand?.logo?.align ?? 'left') === (e.to.brand?.logo?.align ?? 'left'),
      }
      const bad = e.parts.filter((p) => !holds[p])
      return bad.length === 0 ? ok(e, e.parts.map((p) => `theme ${p} is as asked`)) : no(e, 'not_applied', { evidence: [`theme still differs: ${bad.join(', ')}`] })
    }
    case 'edit': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      if (s.locked) return no(e, 'locked', { slideId: e.slideId })
      return s.layoutId === e.content.layout && contains(e.content, s.content) ? ok(e, [`slide content is as written (${e.content.layout})`], { slideId: e.slideId }) : no(e, 'not_applied', { slideId: e.slideId })
    }
    case 'addition': {
      const s = slideOf(doc, e.id)
      return s ? ok(e, [`slide ${e.id} exists (${s.layoutId})`], { slideId: e.id }) : no(e, 'missing_slide', { slideId: e.id })
    }
    case 'background': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      if (s.background?.type === 'color' && eq(s.background.value, e.color)) return e.was && eq(e.was, e.color) ? same(e, ['the slide already had that background'], { slideId: e.slideId }) : ok(e, [`background is ${e.color}`], { slideId: e.slideId })
      return no(e, s.locked ? 'locked' : 'not_applied', { slideId: e.slideId })
    }
    case 'slide_brand': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      // compared by value, key by key (a saved deck may keep keys in another order)
      const flat = (b: unknown) => (b ? JSON.stringify(Object.entries(b as object).filter(([, v]) => v !== undefined).sort(([a], [b2]) => a.localeCompare(b2))) : 'null')
      return flat(s.brand) === flat(e.brand) ? ok(e, [e.brand ? 'the slide carries the brand' : 'the slide is in the deck\'s look'], { slideId: e.slideId }) : no(e, 'not_applied', { slideId: e.slideId })
    }
    case 'background_copy': {
      const s = slideOf(doc, e.slideId), from = slideOf(doc, e.fromSlideId)
      if (!s || !from) return no(e, 'missing_slide', { slideId: e.slideId })
      // compared by value (a saved deck may keep keys in another order); a slide in the deck's own background matches one too
      const flat = (v: unknown): string => v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.map(flat).join(',')}]` : `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${k}:${flat(x)}`).join(',')}}`) : JSON.stringify(v ?? null)
      const look = (x: typeof s) => (x.ownLook ? flat(x.background) : 'deck')
      return look(s) === look(from) ? ok(e, ['the slide has the same background'], { slideId: e.slideId }) : no(e, s.locked ? 'locked' : 'not_applied', { slideId: e.slideId })
    }
    case 'background_pattern': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      const now = s.background?.type === 'color' ? s.background.pattern?.kind ?? null : null
      return now === e.pattern ? ok(e, [e.pattern ? `${e.pattern} pattern is on` : 'no pattern'], { slideId: e.slideId }) : no(e, 'not_applied', { slideId: e.slideId })
    }
    case 'background_blur': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      return s.background?.type === 'image' && Math.abs((s.background.blur ?? 0) - e.blur) < 0.01 ? ok(e, [e.blur ? 'background picture is softened' : 'background picture is sharp'], { slideId: e.slideId }) : no(e, 'not_applied', { slideId: e.slideId })
    }
    case 'gradient': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      return s.background?.type === 'gradient' && s.background.gradient && eq(s.background.gradient.from, e.from) && eq(s.background.gradient.to, e.to) && (s.background.gradient.kind === 'radial') === !!e.radial ? ok(e, ['gradient background is set'], { slideId: e.slideId }) : no(e, 'not_applied', { slideId: e.slideId })
    }
    case 'clear_pictures': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      if (!e.hadPicture) return same(e, ['the slide had no picture to remove'], { slideId: e.slideId })
      const left = s.background?.type === 'image' || ((s.manual || !s.content) && s.elements.some((x) => x.type === 'image' && !x.decorative && !x.locked))
      if (!left) return ok(e, ['no picture is left on the slide'], { slideId: e.slideId })
      return no(e, s.locked ? 'locked' : 'not_applied', { slideId: e.slideId })
    }
    case 'picture_swap': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId, elementId: e.elementId })
      const el = s.elements.find((x) => x.id === e.elementId)
      if (!el) return no(e, 'missing_element', { slideId: e.slideId, elementId: e.elementId })
      if (el.type !== 'image') return no(e, 'not_image', { slideId: e.slideId, elementId: e.elementId })
      if (e.transparentShare !== undefined && e.transparentShare < 0.02) return no(e, 'no_transparency', { slideId: e.slideId, elementId: e.elementId, evidence: [`the new picture is only ${Math.round(e.transparentShare * 100)}% see-through`] })
      if (el.src === e.to) return ok(e, [`element ${e.elementId} now shows the new picture`, ...(e.transparentShare !== undefined ? [`${Math.round(e.transparentShare * 100)}% of the new picture is see-through`] : [])], { slideId: e.slideId, elementId: e.elementId })
      return no(e, s.locked ? 'locked' : 'not_applied', { slideId: e.slideId, elementId: e.elementId })
    }
    case 'readability': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      if (!e.hadIssues) return same(e, ['the text was already readable'], { slideId: e.slideId })
      return unreadableTexts(s, doc.theme) === 0 ? ok(e, ['every text box reads on what is behind it'], { slideId: e.slideId }) : no(e, 'not_applied', { slideId: e.slideId })
    }
    case 'photo': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      const shown = (s.background?.type === 'image' && s.background.value === e.url) || (s.content as { imageUrl?: string } | undefined)?.imageUrl === e.url || s.elements.some((x) => x.type === 'image' && x.src === e.url)
      return shown ? ok(e, ['the picture is on the slide'], { slideId: e.slideId }) : no(e, s.locked ? 'locked' : 'not_applied', { slideId: e.slideId })
    }
    case 'duplicate': {
      const s = slideOf(doc, e.newId)
      return s ? ok(e, [`the copy ${e.newId} exists`], { slideId: e.slideId }) : no(e, slideOf(doc, e.slideId) ? 'not_applied' : 'missing_slide', { slideId: e.slideId })
    }
    case 'move': {
      const i = doc.slides.findIndex((s) => s.id === e.slideId)
      if (i < 0) return no(e, 'missing_slide', { slideId: e.slideId })
      const a = e.afterSlideId ? doc.slides.findIndex((s) => s.id === e.afterSlideId) : -1
      const placed = e.afterSlideId ? (a >= 0 ? i === a + 1 : i === doc.slides.length - 1) : i === 0
      if (!placed) return no(e, 'not_applied', { slideId: e.slideId })
      return e.inPlace ? same(e, ['the slide was already there'], { slideId: e.slideId }) : ok(e, ['the slide is in its new place'], { slideId: e.slideId })
    }
    case 'lock': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      if (!!s.locked !== e.locked) return no(e, 'not_applied', { slideId: e.slideId })
      return e.wasLocked === e.locked ? same(e, [e.locked ? 'already locked' : 'already unlocked'], { slideId: e.slideId }) : ok(e, [e.locked ? 'the slide is locked' : 'the slide is unlocked'], { slideId: e.slideId })
    }
    case 'transition': {
      const s = slideOf(doc, e.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: e.slideId })
      if (!transitionMatches(s.transition, e.to)) return no(e, s.locked ? 'locked' : 'not_applied', { slideId: e.slideId, evidence: [s.locked ? 'the slide is locked' : `the slide arrives with ${s.transition?.type ?? 'no transition'}`] })
      return e.already ? same(e, ['it already arrived like that'], { slideId: e.slideId }) : ok(e, [`the slide arrives with ${e.to.type}`], { slideId: e.slideId })
    }
    case 'removal': {
      const s = slideOf(doc, e.slideId)
      if (!s) return ok(e, ['the slide is gone'], { slideId: e.slideId })
      return no(e, s.locked ? 'locked' : doc.slides.length <= 1 ? 'last_slide' : 'not_applied', { slideId: e.slideId })
    }
    case 'element': {
      const c = e.change
      const s = slideOf(doc, c.slideId)
      if (!s) return no(e, 'missing_slide', { slideId: c.slideId, elementId: c.elementId })
      const el = s.elements.find((x) => x.id === c.elementId)
      if (c.group) {
        // grouped: every object of the change is on the slide and they share ONE group id; ungrouped: none of them is in a group any more
        const g = c.group
        const there = s.elements.filter((x) => g.ids.includes(x.id))
        if (there.length !== g.ids.length) return no(e, s.locked ? 'locked' : 'missing_element', { slideId: c.slideId, elementId: c.elementId })
        if (groupAlready(g, s)) return e.already ? same(e, ['it already was like that'], { slideId: c.slideId, elementId: c.elementId }) : ok(e, [g.to === 'group' ? 'the objects are one group' : 'the objects are no longer grouped'], { slideId: c.slideId, elementId: c.elementId })
        return no(e, s.locked || there.some((x) => x.locked) ? 'locked' : 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: [g.to === 'group' ? 'the objects are not in one group' : 'some objects are still in a group'] })
      }
      if (c.layer) {
        // the object is at the front (or back) of its slide
        if (!el) return no(e, s.locked ? 'locked' : 'missing_element', { slideId: c.slideId, elementId: c.elementId })
        if (layerAlready(s, c)) return e.already ? same(e, ['it already was there'], { slideId: c.slideId, elementId: c.elementId }) : ok(e, [`the object is at the ${c.layer} of the slide`], { slideId: c.slideId, elementId: c.elementId })
        return no(e, s.locked || el.locked ? 'locked' : 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: [el.locked ? 'the element is locked' : s.locked ? 'the slide is locked' : `the object is not at the ${c.layer}`] })
      }
      if (c.effect) {
        // an animation is judged by the slide's own effect list: the effect (with the options asked for) is on the object, or no animation is left on it
        if (!el) return no(e, s.locked ? 'locked' : 'missing_element', { slideId: c.slideId, elementId: c.elementId })
        if (effectAlready(s, c)) return e.already ? same(e, ['it already was like that'], { slideId: c.slideId, elementId: c.elementId }) : ok(e, ['clear' in c.effect ? ['the object has no animation left'] : 'moveTo' in c.effect ? ['the animation is in its new place in the order'] : ['the object has the animation'] ].flat(), { slideId: c.slideId, elementId: c.elementId })
        return no(e, s.locked || el.locked ? 'locked' : 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: [el.locked ? 'the element is locked' : s.locked ? 'the slide is locked' : 'the animation is not on the object'] })
      }
      if (c.addChart) {
        // a chart built from a table: an object with its id, of that kind, with exactly the table's labels and figures
        const a = c.addChart
        if (!el) return no(e, s.locked ? 'locked' : 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: [s.locked ? 'the slide is locked' : 'the chart is not on the slide'] })
        const right = el.type === 'chart' && el.chartType === a.chartType && JSON.stringify(el.labels) === JSON.stringify(a.labels) && JSON.stringify(el.series) === JSON.stringify(a.series)
        return right ? ok(e, ['the chart is on the slide with the table\'s own figures'], { slideId: c.slideId, elementId: c.elementId }) : no(e, 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: ['the chart on the slide is not as planned'] })
      }
      if (c.copy) {
        // a copy: an object of the same kind with the same content as the original (the original is looked up in the same deck)
        if (!el) return no(e, s.locked ? 'locked' : 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: [s.locked ? 'the slide is locked' : 'the copy is not on the slide'] })
        const src = slideOf(doc, c.copy.fromSlideId)?.elements.find((x) => x.id === c.copy!.fromElementId)
        const key = (x: SlideElement) => JSON.stringify(x.type === 'text' ? x.paragraphs : x.type === 'chart' ? [x.chartType, x.labels, x.series] : x.type === 'table' ? [x.header, x.rows] : x.type === 'image' ? x.src : x.type === 'shape' ? [x.shape, x.fill] : x.type)
        const right = !src || (el.type === src.type && key(el) === key(src))
        return right ? ok(e, ['the copy is on the slide'], { slideId: c.slideId, elementId: c.elementId }) : no(e, 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: ['the copy is not like the original'] })
      }
      if (c.add) {
        // a new shape is judged by what is on the slide: an object with its id, of that kind, at that place, with that fill
        const a = c.add
        if (!el) return no(e, s.locked ? 'locked' : 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: [s.locked ? 'the slide is locked' : 'the shape is not on the slide'] })
        const right = el.type === 'shape' && el.shape === a.shape && Math.abs(el.x - a.x) <= 1 && Math.abs(el.y - a.y) <= 1 && Math.abs(el.width - a.width) <= 1 && Math.abs(el.height - a.height) <= 1 && String(el.fill).toLowerCase() === a.fill.toLowerCase()
        return right ? ok(e, ['the shape is on the slide with the asked kind, place, size and colour'], { slideId: c.slideId, elementId: c.elementId }) : no(e, 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: ['the shape on the slide is not as asked'] })
      }
      if (c.remove) {
        if (!el) return ok(e, [`the ${c.desc.replace(/^(the|a) /, '')} is gone`], { slideId: c.slideId, elementId: c.elementId })
        return no(e, s.locked || el.locked ? 'locked' : 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: [el.locked ? 'the element is locked' : s.locked ? 'the slide is locked' : 'the element is still there'] })
      }
      if (!el) return no(e, 'missing_element', { slideId: c.slideId, elementId: c.elementId })
      if (alreadyAsked(el, c)) return e.already ? same(e, ['it already was like that'], { slideId: c.slideId, elementId: c.elementId }) : ok(e, ['the element now has the asked size, place and style'], { slideId: c.slideId, elementId: c.elementId })
      return no(e, s.locked || el.locked ? 'locked' : 'not_applied', { slideId: c.slideId, elementId: c.elementId, evidence: [el.locked ? 'the element is locked' : s.locked ? 'the slide is locked' : 'the element does not have the asked values'] })
    }
    case 'revert':
      // a revert is judged against the deck as it was before: it must have changed something (the server never checks it: putting back is free)
      return before && JSON.stringify(before) === JSON.stringify(doc) ? no(e, 'not_applied') : ok(e, ['the deck changed'])
    case 'proposal':
      return { key: e.key, kind: e.kind, status: 'info', evidence: [`${e.count} picture proposal(s) shown for confirmation`] }
    case 'rewrite':
      return { key: e.key, kind: e.kind, status: 'info', evidence: ['a rebuild was started'] }
  }
}

export const evaluateAll = (list: Expectation[], doc: Presentation, before?: Presentation): Check[] => list.map((e) => evaluate(e, doc, before))
