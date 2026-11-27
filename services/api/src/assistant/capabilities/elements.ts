import type { z } from 'zod'
import { alreadyAsked, effectAlready, groupAlready, layerAlready, planDistribute, planGroup, newOverlaps, describeElement, planChartFromTable, planCopy, planElementChange, planLayer, planShapeAdd, planShapeRow, planNewChart, planCrop, planCopyLook, type ElementOp } from '@prompttoppt/theme'
import { planEffect } from '../effects-plan.ts'
import { figuresInTextNotIn, figuresOf } from '../../generation/policy.ts'
import type { ElementChange, PaintedEffect, SlideElement, TextElement } from '@prompttoppt/validation'
import { numberOf, type DeckState } from '../state.ts'
import { COLOUR_NAMES, needsObjects, resolveElements } from '../resolve.ts'
import { z as zod } from 'zod'
import { VALUES } from '../understand.ts'
import type { Capability, RunCtx, Step } from './types.ts'
import { lockedSlides } from './preflight.ts'
import { colourWord } from './colour-words.ts'

/** Two operations on the same object as ONE change: the later values win (they were planned from the earlier result), and the wording keeps both. */
function mergeChange(a: ElementChange, c: ElementChange): ElementChange {
  const patch = { ...(a.patch ?? {}), ...(c.patch ?? {}) }
  return { ...a, ...(Object.keys(patch).length ? { patch } : {}), ...(c.bold !== undefined ? { bold: c.bold } : {}), ...(c.italic !== undefined ? { italic: c.italic } : {}), ...(c.underline !== undefined ? { underline: c.underline } : {}), ...(c.remove ? { remove: true as const } : {}), ...(c.layer ? { layer: c.layer } : {}), alsoVerbs: [...(a.alsoVerbs ?? []), c.verb] }
}

/**
 * Objects on a slide: bigger, smaller, moved, aligned, a text size, bold, a colour, deleted. The operations are a closed set; the NUMBERS are worked out here by one shared pure function
 * (packages/theme/src/assist/element-ops.ts) and the editor applies them with its own commands, so no model ever writes a coordinate. Whatever cannot be done is said, per object, with the reason.
 */
/** at most this many pictures are cropped in one request (each may need a vision step) */
const MAX_CROPS = 6

/** a decoration the layout locked itself (so a click on the slide never grabs it): when the person NAMES the decorations, that lock is not theirs and does not stop a delete, hide or show */
const DESIGN_LOCK_OPS = new Set(['delete', 'hide', 'show'])
const designLockOpen = (v: { elements: { by: string }[]; ops: { op: string }[] }) => v.elements.some((r) => r.by === 'decorative') && v.ops.every((o) => DESIGN_LOCK_OPS.has(o.op))
/** "make all the pictures look like THIS one": the selection names the object copied FROM, so it does not narrow the objects changed ("the pictures" stays all of them) */
const targetState = (state0: DeckState, v: { ops: { op: string; from?: unknown }[] }, virtual?: DeckState['doc']): DeckState => { const state = virtual ? { ...state0, doc: virtual } : state0; return (v.ops.some((o) => o.op === 'copy_look' && (o.from as { by?: string } | undefined)?.by === 'selected') && v.ops.every((o) => o.op === 'copy_look') ? { ...state, selection: { ...state.selection, elementIds: [] } } : state) }
/** references that name a SET of objects ("all the objects", "all the text"): members with nothing to change are not part of the request */
const SET_NAMES = new Set(['all_objects', 'all_text', 'decorative', 'hidden'])
const isDesignLocked = (e: { decorative?: boolean | undefined; locked: boolean }) => !!e.decorative && e.locked

export const element: Capability<z.infer<typeof VALUES.element>> = {
  family: 'element', values: VALUES.element, scope: 'slides', cost: 'action',
  // PREFLIGHT: the objects the request is about that sit on a locked slide or are locked themselves (a new shape: the locked slides); worked out before anything runs
  preflight(ctx, ids, v) {
    if (!needsObjects(v.ops)) return lockedSlides(ctx, ids)
    const r = resolveElements(targetState(ctx.state, v, ctx.virtual), ids, v.elements, v.ops.map((o) => o.op))
    if (!r.ok) return { blocked: [], doable: 0, unit: 'objects' } // a question or a refusal: said by the run itself
    const slideLocked = (id: string) => !!ctx.virtual.slides.find((s) => s.id === id)?.locked
    const forLocks = v.ops.every((o) => o.op === 'unlock' || o.op === 'lock' || o.op === 'select')
    const open = designLockOpen(v)
    const blocked = r.items.filter((i) => slideLocked(i.slideId) || (i.element.locked && !forLocks && !(open && isDesignLocked(i.element)))).map((i) => ({ slideId: i.slideId, elementId: i.element.id, why: slideLocked(i.slideId) ? 'it is locked' : 'the object is locked' }))
    return { blocked, doable: r.items.length - blocked.length, unit: 'objects' }
  },
  async run(ctx, ids, v): Promise<Step> {
    // a NEW shape is not an operation on an object: it is planned per slide (or around the objects named, behind them); everything else works on the objects named
    const adds = v.ops.filter((o): o is Extract<ElementOp, { op: 'add_shape' }> => o.op === 'add_shape')
    const copies = v.ops.filter((o): o is Extract<ElementOp, { op: 'copy_object' }> => o.op === 'copy_object')
    const newCharts = v.ops.filter((o): o is Extract<ElementOp, { op: 'add_chart' }> => o.op === 'add_chart')
    // the WORDS of the objects named: one writing call, before the planning loop (everything else here is worked out by code)
    const rewrites = v.ops.filter((o): o is { op: 'rewrite_text'; request: string } => o.op === 'rewrite_text') // (its own op: it never reaches the geometry planner)
    let rest = v.ops.filter((o) => o.op !== 'add_shape' && o.op !== 'copy_object' && o.op !== 'add_chart' && o.op !== 'rewrite_text')
    // everything a typed value (a cell, a figure) may be traced to: the person's own words, the deck as it is, the sources and pages
    const deckText = JSON.stringify(ctx.state.doc.slides.map((s) => s.elements.map((e) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((x) => x.text).join('')) : e.type === 'table' ? [e.header, e.rows] : e.type === 'chart' ? [e.labels, e.series] : ''))))
    const corpus = [ctx.instruction, ...ctx.material.map((m) => m.text), deckText].join('\n')
    const needObjects = needsObjects(v.ops)
    const r = needObjects ? resolveElements(targetState(ctx.state, v, ctx.virtual), ids, v.elements, v.ops.map((o) => o.op)) : { ok: true as const, items: [] as { slideId: string; element: import('@prompttoppt/validation').SlideElement }[], notes: [] as string[] }
    if (!r.ok) return { ops: [], refused: ['refuse' in r ? [r.refuse] : [r.ask.text]].flat() }
    const notes = [...r.notes], refused: string[] = [], already: string[] = []
    // "already so" is said ONCE per kind of object and state, with all its slides ("The title on slides 1 to 10 already is like that"), never one line per slide
    const same = new Map<string, number[]>()
    const alreadyAt = (desc: string, state: string, n: number) => { const k = `${desc}|${state}`; same.set(k, [...(same.get(k) ?? []), n]) }
    // "make them all the same size": the size is chosen HERE from what the matched text already has (the most common one, the larger on a tie), never by the model
    rest = rest.map((o) => {
      if (o.op !== 'font_size' || !o.same) return o
      const sizes = r.items.flatMap((i) => (i.element.type === 'text' ? [Math.round(i.element.fontSize)] : []))
      if (sizes.length < 2) { already.push('There is only one piece of text there, so there is nothing to match.'); return { op: 'font_size' as const } }
      const count = new Map<number, number>()
      for (const z of sizes) count.set(z, (count.get(z) ?? 0) + 1)
      const best = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]
      if (count.size > 1) notes.push(`I used ${best} pt for all ${sizes.length}: the size most of them already had.`)
      return { op: 'font_size' as const, size: best }
    })
    // colours named by word ("our brand colour", "the accent colour"): turned into the deck's token or the saved brand's colour by code, or refused with the reason
    const colourRefused: string[] = []
    const word = (c: string | undefined, as: 'token' | 'hex' = 'token'): string | undefined => {
      if (c === undefined) return undefined
      const r = colourWord(ctx, c, as)
      if (!r.ok) { colourRefused.push(`I did not change the colour: ${r.why}.`); return undefined }
      return r.value
    }
    rest = rest.flatMap((o) => {
      if (o.op === 'text_style' && o.color !== undefined) { const c = word(o.color); if (c === undefined && Object.keys(o).length === 2) return []; return [{ ...o, color: c }] }
      if (o.op === 'chart_style' && o.seriesColor) { const k = o.seriesColor.color.trim().toLowerCase(); const named = COLOUR_NAMES[k]; const c = named ?? (/^brand_/.test(k) ? word(k, 'hex') : o.seriesColor.color); if (c === undefined) return []; return [{ ...o, seriesColor: { ...o.seriesColor, color: c } }] }
      if (o.op === 'shape_style' && (o.fill !== undefined || o.stroke !== undefined)) { const f = o.fill !== undefined && /^brand_/.test(o.fill) ? word(o.fill, 'hex') : o.fill, k = o.stroke !== undefined && /^brand_/.test(o.stroke) ? word(o.stroke, 'hex') : o.stroke; return [{ ...o, fill: f, stroke: k }] }
      return [o]
    })
    for (const a of adds) if (a.fill && /^brand_/.test(a.fill)) a.fill = word(a.fill, 'hex')
    refused.push(...new Set(colourRefused))
    const elementChanges: NonNullable<Step['slideOps']>['elementChanges'] = []
    let crops = 0, sourceOnly = 0, quietSkips = 0
    let written = 0
    // THE WORDS OF THE OBJECTS NAMED (a selected text box): one call for all of them together; each result keeps the box's own styling and every figure it had,
    // or that box is left exactly as it was and said. Nothing else on the slide is touched.
    if (rewrites.length) {
      const texts = r.items.filter((i) => i.element.type === 'text' && !i.element.locked && !ctx.virtual.slides.find((s) => s.id === i.slideId)?.locked)
      const others = r.items.filter((i) => i.element.type !== 'text')
      for (const o of others) refused.push(`${describeElement(o.element).replace(/^(the|a) /, '')} is not text, so I could not rewrite its words.`)
      if (!texts.length) { if (!others.length) refused.push('There is no text selected to rewrite, so nothing was changed.') }
      else {
        const request = rewrites.map((x) => x.request).join('; ')
        const lineOf = (e: SlideElement) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((x) => x.text).join('')) : [])
        ctx.progress?.(texts.length === 1 ? 'Rewriting the text you selected' : `Rewriting ${texts.length} pieces of text`)
        const out = await ctx.write({
          card: 'element_text', route: 'quality', schema: rewriteOut, material: ctx.material.length ? ctx.material : undefined,
          rules: REWRITE_RULES,
          input: {
            request,
            objects: texts.map((i) => ({ id: i.element.id, what: describeElement(i.element), slide: numberOf(ctx.state, i.slideId) || undefined, role: i.element.type === 'text' ? i.element.role : undefined, lines: lineOf(i.element), isList: i.element.type === 'text' && !!i.element.paragraphs[0]?.list, mustKeepFigures: figuresOf(lineOf(i.element).join(' ')) })),
            slide: { title: slideTitleOf(ctx, texts[0]!.slideId), otherText: otherTextOf(ctx, texts[0]!.slideId, texts.map((i) => i.element.id)) },
          },
        })
        const byId = new Map(out.objects.map((x) => [x.id, x.lines.map((l) => l.trim()).filter(Boolean)]))
        for (const i of texts) {
          const el = i.element
          if (el.type !== 'text') continue
          const was = lineOf(el)
          const lines = byId.get(el.id) ?? []
          const lost = figuresOf(was.join(' ')).filter((f) => !figuresOf(lines.join(' ')).includes(f))
          const why = !lines.length ? 'it came back empty' : lines.join('\n') === was.join('\n') ? 'it came back with the same words' : lost.length ? `it dropped the figure${lost.length === 1 ? '' : 's'} ${lost.slice(0, 5).join(', ')}` : lines.join(' ').length > Math.max(400, was.join(' ').length * 3) ? 'it came back far longer than the box can hold' : ''
          if (why) { refused.push(`I couldn't rewrite ${describeElement(el)} (${why}), so I left it exactly as it was.`); continue }
          elementChanges.push({ slideId: i.slideId, elementId: el.id, patch: { paragraphs: rebuiltParagraphs(el.paragraphs, lines) }, verb: 'Rewrote the words of {}', desc: describeElement(el) })
          written++
        }
      }
    }
    // objects of slides this message added (a Morph copy) are found too
    const st = { ...ctx.state, doc: ctx.virtual }
    /** the animations to paint on `el`: from one object, or (from all_objects) from the object of the source slide in the same place of the same kind; null = this IS the source */
    const paintFor = (slideId: string, el: SlideElement, op: Extract<ElementOp, { op: 'copy_animation' }>): { paint: PaintedEffect[]; from: string } | { why: string } | null => {
      const from = op.from as { by: string }
      const srcSlide = op.fromSlide ? ctx.virtual.slides[op.fromSlide - 1] : ctx.virtual.slides.find((x) => x.id === slideId)
      if (!srcSlide) return { why: `there is no slide ${op.fromSlide} to copy the animations from` }
      let src: SlideElement | undefined
      if (from.by === 'all_objects') {
        // slide to slide: the object of the same kind (and text role) in the same order
        const kind = (e: SlideElement) => (e.type === 'text' ? `text:${e.role}` : e.type)
        const mine = (ctx.virtual.slides.find((x) => x.id === slideId)?.elements ?? []).filter((e) => kind(e) === kind(el))
        const theirs = srcSlide.elements.filter((e) => kind(e) === kind(el) && (srcSlide.effects ?? []).some((x) => x.elementId === e.id))
        src = theirs[mine.findIndex((e) => e.id === el.id)]
        if (!src) return { why: `slide ${op.fromSlide ?? ''} has no animated ${describeElement(el).replace(/^(the|a) /, '')} to match ${describeElement(el)}` }
        if (srcSlide.id === slideId && src.id === el.id) return null
      } else {
        if (from.by === 'selected' && ctx.selection.elementIds.includes(el.id) && !op.fromSlide) return null
        const f = resolveElements(st, [srcSlide.id], [from as never], ['copy_animation'])
        const list = f.ok ? f.items.map((i) => i.element).filter((x) => x.id !== el.id || srcSlide.id !== slideId) : []
        if (list.length !== 1) return { why: 'I could not tell which object\'s animations to copy' }
        src = list[0]!
      }
      const fx = (srcSlide.effects ?? []).filter((x) => x.elementId === src!.id && !x.trigger)
      if (!fx.length) return { why: `${describeElement(src)} has no animation to copy` }
      const paint: PaintedEffect[] = fx.map((x) => ({ type: x.type, start: x.start, duration: x.duration, delay: x.delay, repeat: x.repeat, ...(x.loop ? { loop: true } : {}), ...(x.distance !== undefined ? { distance: x.distance } : {}), ...(x.direction ? { direction: x.direction } : {}), ...(x.textBy ? { textBy: x.textBy } : {}), ...(x.easing ? { easing: x.easing } : {}), ...(x.reverse ? { reverse: true } : {}) }))
      return { paint, from: `${describeElement(src)}${op.fromSlide ? ` on slide ${op.fromSlide}` : ''}` }
    }
    // SELECT: the objects found are selected in the editor (one slide at a time, the one on screen first); nothing in the deck changes, so nothing is charged
    if (rest.some((o) => o.op === 'select')) {
      const slides = [...new Set(r.items.map((i) => i.slideId))]
      const sid = slides.includes(ctx.state.focus.current ?? '') ? ctx.state.focus.current! : slides[0]
      if (!sid) return { ops: [], refused: ['I found nothing to select.'] }
      const picked = r.items.filter((i) => i.slideId === sid).map((i) => i.element)
      const n = numberOf(ctx.state, sid)
      const kinds = [...new Set(picked.map(describeElement))]
      const say = `Selected ${picked.length === 1 ? kinds[0] : `${picked.length} objects (${kinds.slice(0, 3).map((k) => k.replace(/^(the|a) /, '')).join(', ')})`} on slide ${n}.`
      const more = slides.length > 1 ? [`I can select on one slide at a time, so I selected on slide ${n}; there are more on slide${slides.length > 2 ? 's' : ''} ${slides.filter((x) => x !== sid).map((x) => numberOf(ctx.state, x)).join(', ')}.`] : []
      return { ops: [], notes: more, slideOps: { select: [{ slideId: sid, elementIds: picked.map((e) => e.id), say }] } }
    }
    // DELETE three or more objects at once: shown first and confirmed (Ctrl+Z puts them back right after)
    const deletable = r.items.filter((i) => !ctx.virtual.slides.find((x) => x.id === i.slideId)?.locked && (!i.element.locked || (designLockOpen(v) && isDesignLocked(i.element))))
    if (rest.some((o) => o.op === 'delete') && deletable.length >= 3 && ctx.confirm?.kind !== 'proceed') {
      const kinds = [...new Set(deletable.map((i) => describeElement(i.element).replace(/^(the|a) /, '')))]
      return { ops: [], ask: { text: `This deletes ${deletable.length} objects (${kinds.slice(0, 4).join(', ')}) on ${[...new Set(deletable.map((i) => numberOf(ctx.state, i.slideId)))].length === 1 ? `slide ${numberOf(ctx.state, deletable[0]!.slideId)}` : 'several slides'}. Ctrl+Z puts them back right after. Delete them?`, options: [{ label: 'Yes, delete them', reply: 'Yes, delete them', confirm: { kind: 'proceed', tasks: [{ family: 'element', targets: ids.map((id) => ({ by: 'number', n: numberOf(ctx.state, id) })), values: v as Record<string, unknown> }] } }, { label: 'No, keep them', reply: 'No, keep them' }] } }
    }
    // a copy of objects of ANOTHER slide: the objects are found on that slide, the copies go onto the slides named
    for (const cp of copies) {
      const src = ctx.resolveAnchor([{ by: 'number', n: cp.fromSlide }])
      if (!src.ok) { refused.push('refuse' in src ? src.refuse : src.ask.text); continue }
      const srcId = src.ids[0]!
      const found = resolveElements(ctx.state, [srcId], v.elements, ['copy_object'])
      if (!found.ok) { if ('ask' in found) return { ops: [], ask: found.ask }; refused.push(found.refuse); continue }
      const from = ctx.virtual.slides.find((x) => x.id === srcId)!
      for (const to of ids.filter((id) => id !== srcId).map((id) => ctx.virtual.slides.find((x) => x.id === id)!).filter(Boolean)) {
        for (const it of found.items) {
          const planned = planCopy(ctx.virtual, from, it.element, to, ctx.newId())
          if (!planned.ok) refused.push(`Slide ${numberOf(ctx.state, to.id)}: ${planned.why}, so I copied nothing there.`)
          else elementChanges.push(planned.change)
        }
      }
      if (ids.every((id) => id === srcId)) refused.push(`Say which slide to copy it to: slide ${cp.fromSlide} is the one it comes from.`)
    }
    for (const a of adds) {
      const targets = a.around ? r.items.map((i) => ({ slideId: i.slideId, around: i.element })) : ids.map((slideId) => ({ slideId, around: undefined }))
      for (const t of targets) {
        const slide = ctx.virtual.slides.find((x) => x.id === t.slideId)
        if (!slide) continue
        const n = numberOf(ctx.state, t.slideId) || ctx.virtual.slides.indexOf(slide) + 1
        // several equal shapes in a row: one plan for the whole row (one size, equal gaps, free room)
        if (a.count && a.count >= 2 && !t.around) { const row = planShapeRow(ctx.virtual, slide, a, ctx.newId); if (!row.ok) refused.push(`Slide ${n}: ${row.why}, so I added nothing there.`); else elementChanges.push(...row.changes); continue }
        const planned = planShapeAdd(ctx.virtual, slide, a, ctx.newId(), t.around)
        if (!planned.ok) refused.push(`Slide ${n}: ${planned.why}, so I added nothing there.`)
        else elementChanges.push(planned.change)
      }
    }
    // a NEW chart from figures the person typed: every figure must be in their message (never made up), and it goes in free room on each slide named
    for (const ch of newCharts) {
      const bad = figuresInTextNotIn(ch.series.flatMap((x) => x.values).join(' '), [ctx.instruction, ...ctx.material.map((m) => m.text)].join('\n'))
      if (bad.length) { refused.push(`I did not add the chart: the figure${bad.length === 1 ? '' : 's'} ${bad.slice(0, 5).join(', ')} ${bad.length === 1 ? 'is' : 'are'} not in your message or your sources, and I never make up numbers. Tell me the figures and I will chart them.`); continue }
      for (const sid of ids) {
        const slide = ctx.virtual.slides.find((x) => x.id === sid)
        if (!slide) continue
        const n = numberOf(ctx.state, sid) || ctx.virtual.slides.indexOf(slide) + 1
        const planned = planNewChart(ctx.virtual, slide, ch, ctx.newId())
        if (!planned.ok) refused.push(`Slide ${n}: ${planned.why}, so I added no chart there.`)
        else elementChanges.push(planned.change)
      }
    }
    // spreading objects evenly works on the objects of a slide TOGETHER
    for (const d of rest.filter((o): o is Extract<ElementOp, { op: 'distribute' }> => o.op === 'distribute')) {
      for (const sid of [...new Set(r.items.map((i) => i.slideId))]) {
        const slide = ctx.virtual.slides.find((x) => x.id === sid)
        if (!slide) continue
        const n = numberOf(ctx.state, sid) || ctx.virtual.slides.indexOf(slide) + 1
        const planned = planDistribute(ctx.virtual, slide, r.items.filter((i) => i.slideId === sid).map((i) => i.element), d.axis)
        if (!planned.ok) { refused.push(`Slide ${n}: ${planned.why}, so I left it.`); continue }
        notes.push(...planned.notes.map((t) => `Slide ${n}: ${t}`))
        if (!planned.changes.length) already.push(`Slide ${n}: those objects are already spread evenly.`)
        elementChanges.push(...planned.changes)
      }
    }
    // grouping works on the objects of a slide TOGETHER too
    for (const g of rest.filter((o): o is Extract<ElementOp, { op: 'group' | 'ungroup' }> => o.op === 'group' || o.op === 'ungroup')) {
      for (const sid of [...new Set(r.items.map((i) => i.slideId))]) {
        const slide = ctx.virtual.slides.find((x) => x.id === sid)
        if (!slide) continue
        const n = numberOf(ctx.state, sid) || ctx.virtual.slides.indexOf(slide) + 1
        const planned = planGroup(slide, r.items.filter((i) => i.slideId === sid).map((i) => i.element), g.op, ctx.newId())
        if (!planned.ok) { refused.push(`Slide ${n}: ${planned.why}, so I left it.`); continue }
        if (groupAlready(planned.change.group!, slide)) already.push(`Slide ${n}: ${g.op === 'group' ? 'those objects are already one group' : 'none of those objects is in a group'}.`)
        else elementChanges.push(planned.change)
      }
    }
    for (const { slideId, element: el } of rest.filter((o) => o.op !== 'group' && o.op !== 'ungroup').length ? r.items : []) {
      const slide = ctx.virtual.slides.find((x) => x.id === slideId)
      if (!slide) continue
      const n = numberOf(ctx.state, slideId) || ctx.virtual.slides.indexOf(slide) + 1
      const templateText = slide.layoutId === 'morph-template' || slide.layoutId === 'morph'
      // an object's operations are planned ONE AFTER THE OTHER, each from what the previous one made ("make it bigger and move it right"), and merged into one change for that object
      // a design-locked decoration the person named: planned as unlocked, and the change unlocks it first (the editor's own lock command)
      const openLock = designLockOpen(v) && isDesignLocked(el)
      let working = openLock ? { ...structuredClone(el), locked: false } : structuredClone(el)
      let merged = null as ElementChange | null
      let alreadyPart: string | null = null // (one of several asks that already holds: left out of the change, never claimed as done)
      // objects an operation moved to make room (they swap places with it): later operations and the overlap check see them where they went
      let workSlide = slide
      const roomMade: ElementChange[] = []
      // animations are planned from the effect catalogue and kept as their OWN change each (an object can get an entrance and then an exit)
      for (const op of rest.filter((o) => o.op === 'animate' || o.op === 'animate_clear' || o.op === 'animate_order' || o.op === 'animate_start')) {
        // "when the button is clicked": the object that starts it is found on the SAME slide by code (one object, or a question); the editor's own trigger command sets it
        let trig: { id: string; desc: string } | undefined
        const wc = op.op === 'animate' ? op.whenClicked : undefined
        if (wc) {
          const t = resolveElements(ctx.state, [slideId], [wc as never], ['trigger_object'])
          if (!t.ok) { refused.push(`Slide ${n}: ${'ask' in t ? t.ask.text : t.refuse}`); continue }
          const found = t.items.filter((i) => i.slideId === slideId)
          if (found.length !== 1) { refused.push(`Slide ${n}: I could not tell which object should start it when clicked. Select it and ask again.`); continue }
          trig = { id: found[0]!.element.id, desc: describeElement(found[0]!.element) }
        }
        // "make all the animations start automatically": objects named as a set that have no animation are simply not part of it
        if (op.op === 'animate_start' && !(slide.effects ?? []).some((x) => x.elementId === el.id) && v.elements.some((x) => SET_NAMES.has(x.by))) { quietSkips++; continue }
        const fx = planEffect(slide, el, op as Extract<ElementOp, { op: 'animate' | 'animate_clear' | 'animate_order' | 'animate_start' }>, trig)
        if (!fx.ok) { refused.push(`Slide ${n}: ${fx.why}, so I left it.`); continue }
        notes.push(...fx.notes.map((t) => `Slide ${n}: ${t}`))
        if (effectAlready(slide, fx.change)) alreadyAt(fx.change.desc, 'clear' in fx.change.effect! ? 'has no animation' : 'has that animation', n)
        else elementChanges.push(fx.change)
      }
      for (const op of rest.filter((o) => o.op === 'chart_from_table')) {
        const made = planChartFromTable(ctx.virtual, slide, el, op as Extract<ElementOp, { op: 'chart_from_table' }>, ctx.newId())
        if (!made.ok) refused.push(`Slide ${n}: ${made.why}, so I left it.`)
        else { if (made.also) elementChanges.push(made.also); elementChanges.push(made.change) }
      }
      // the Animation Painter: this object gets the animations of another (same slide, another slide, or object by object from a whole slide)
      for (const op of rest.filter((o) => o.op === 'copy_animation')) {
        const p = paintFor(slideId, el, op as Extract<ElementOp, { op: 'copy_animation' }>)
        if (p === null) continue // (the object copied FROM keeps its own)
        if ('why' in p && (op as { from: { by: string } }).from.by === 'all_objects' && p.why.includes('to match')) { quietSkips++; continue } // (slide to slide: an object with nothing to match on the source slide simply has nothing to copy)
        if ('why' in p) { refused.push(`Slide ${n}: ${p.why}, so I left it.`); continue }
        const ch = { slideId, elementId: el.id, desc: describeElement(el), effect: { paint: p.paint }, verb: `Gave {} the animations of ${p.from}` }
        if (effectAlready(slide, ch)) alreadyAt(describeElement(el), `has those animations`, n)
        else elementChanges.push(ch)
      }
      for (const op of rest.filter((o) => o.op !== 'animate' && o.op !== 'animate_clear' && o.op !== 'animate_order' && o.op !== 'animate_start' && o.op !== 'copy_animation' && o.op !== 'chart_from_table' && o.op !== 'distribute' && o.op !== 'group' && o.op !== 'ungroup')) {
        // a value typed into data must be the person's own: a number that is nowhere in their message, the deck or the sources is refused
        if (op.op === 'table_cell' || op.op === 'chart_value' || op.op === 'chart_add') {
          const bad = figuresInTextNotIn(op.op === 'table_cell' ? op.text : op.op === 'chart_add' ? op.values.join(' ') : String(op.value), corpus)
          if (bad.length) { refused.push(`Slide ${n}: I did not set that: the figure ${bad.join(', ')} is not in your message, your deck or your sources, and I never make up numbers. Tell me the figure and I will use it.`); continue }
        }
        // a name is the person's own words: one that is not in their message is never set
        if (op.op === 'rename' && !ctx.instruction.toLowerCase().includes(op.name.trim().toLowerCase())) { refused.push(`Slide ${n}: I did not rename it: the name must be your own words, written in your message. Tell me exactly what to call it.`); continue }
        let planned
        if (op.op === 'crop') {
          // a crop needs the picture's own shape (and, for a subject, where the subject is): read from the STORED picture by the server, never guessed
          if (el.type !== 'image' || !el.src) { refused.push(`Slide ${n}: ${describeElement(el)} is not a picture, so I left it.`); continue }
          if (++crops > MAX_CROPS) { refused.push(`Slide ${n}: I crop up to ${MAX_CROPS} pictures in one request, so I left ${describeElement(el)}. Ask again for the rest.`); continue }
          const info = ctx.picture ? await ctx.picture(el.src) : null
          if (!info) { refused.push(`Slide ${n}: I could not open that picture (I can crop your uploads, AI pictures, template pictures and the free photos added here), so I left ${describeElement(el)}.`); continue }
          const box = op.subject ? (ctx.findSubject ? await ctx.findSubject(info, op.subject).catch(() => null) : null) : undefined // (a vision step that fails is "not found" for that picture, never a failed request)
          planned = planCrop(ctx.virtual, workSlide, working, op, info.aspect, box, templateText)
        } else if (op.op === 'match_size' || op.op === 'same_size') {
          // a size taken from other objects, done as a RESIZE (so it grows only into free room, like any resize): "as big as the picture" = that object's size; "the same size" = the largest of those named on this slide
          let size: { width: number; height: number; desc: string } | null = null
          if (op.op === 'match_size') {
            const near = resolveElements(ctx.state, [slideId], [op.of as never], ['match_size'])
            let other = near.ok ? near.items.map((i) => i.element).filter((x) => x.id !== el.id) : []
            if (!other.length) { const all = resolveElements(ctx.state, ctx.state.doc.slides.map((x) => x.id), [op.of as never], ['match_size']); other = all.ok ? all.items.map((i) => i.element).filter((x) => x.id !== el.id) : [] }
            if (other.length !== 1) { refused.push(`Slide ${n}: I could not tell which object's size to use. Select it (or name it: the picture, the title) and say it again.`); continue }
            size = { width: other[0]!.width, height: other[0]!.height, desc: describeElement(other[0]!) }
          } else {
            const mates = r.items.filter((i) => i.slideId === slideId).map((i) => i.element)
            if (mates.length < 2) { refused.push(`Slide ${n}: "the same size" needs two or more objects: select them, or name them (all the shapes, the cards).`); continue }
            const big = [...mates].sort((a, b) => b.width * b.height - a.width * a.height)[0]!
            if (big.id === el.id) continue // (the largest keeps its size: the others take it)
            size = { width: big.width, height: big.height, desc: describeElement(big) }
          }
          const dim = op.dimension ?? 'both'
          planned = planElementChange(ctx.virtual, workSlide, working, { op: 'resize', width: dim === 'height' ? working.width : size.width, height: dim === 'width' ? working.height : size.height } as ElementOp, templateText)
          if (planned.ok) planned.change.verb = `Made {} ${dim === 'both' ? 'the same size as' : dim === 'width' ? 'as wide as' : 'as tall as'} ${size.desc}`
        } else if (op.op === 'copy_look') {
          // the object whose look is copied: on the slide named, else on this slide, else the one object the reference names in the deck; never the object itself
          const from = op.from as { by: string }
          if (from.by === 'selected' && ctx.selection.elementIds.includes(el.id)) { sourceOnly++; continue } // (the selected object is the one copied FROM: it keeps its own look)
          const look = (slides: string[]) => { const f = resolveElements(ctx.state, slides, [from as never], ['copy_look']); return f.ok ? f.items.map((i) => i.element).filter((x) => x.id !== el.id) : [] }
          const named = op.fromSlide ? ctx.resolveAnchor([{ by: 'number', n: op.fromSlide }]) : null
          if (named && !named.ok) { refused.push(`Slide ${n}: there is no slide ${op.fromSlide} to copy the look from.`); continue }
          let src = named ? look(named.ids) : look([slideId])
          if (!src.length && !named) src = look(ctx.state.doc.slides.map((x) => x.id))
          if (src.length !== 1) { refused.push(`Slide ${n}: I could not tell which object's look to copy. Select it (or name it: the first picture, the title) and say it again.`); continue }
          planned = planCopyLook(workSlide, working, src[0]!, templateText)
        } else if (op.op === 'layer' && op.to !== 'front' && op.to !== 'back') {
          // the other object ("behind the picture") is found on the SAME slide by code: exactly one, or a question
          let other: typeof el | undefined
          if (op.to === 'behind' || op.to === 'above') {
            const found = op.of ? resolveElements(ctx.state, [slideId], [op.of as never], ['trigger_object']) : null
            const list = found && found.ok ? found.items.filter((i) => i.slideId === slideId && i.element.id !== el.id) : []
            if (list.length !== 1) { refused.push(`Slide ${n}: I could not tell which object to put ${describeElement(el)} ${op.to === 'behind' ? 'behind' : 'in front of'}. Select both and say it again, or name the other one (the title, the picture).`); continue }
            other = list[0]!.element
          }
          planned = planLayer(ctx.virtual, workSlide, working, op.to, other, templateText)
        } else planned = planElementChange(ctx.virtual, workSlide, working, op as ElementOp, templateText)
        if (planned.ok && openLock) planned.change.patch = { ...(planned.change.patch ?? {}), locked: false }
        if (!planned.ok) { refused.push(`Slide ${n}: ${planned.why}, so I left it.`); continue }
        if (planned.note) notes.push(`Slide ${n}: ${planned.note}.`)
        if (planned.others?.length) {
          const moved = planned.others
          roomMade.push(...moved)
          workSlide = { ...workSlide, elements: workSlide.elements.map((e) => { const o = moved.find((x) => x.elementId === e.id); return o ? ({ ...e, ...o.patch } as typeof e) : e }) }
        }
        const c = planned.change
        // a part of the ask that is already true of the object as it stands now ("a bar chart" that is one) is not a change: leaving it out keeps the reply to what was really done
        if (!planned.others?.length && alreadyAsked(working, c)) { alreadyPart = c.desc; continue }
        merged = merged ? mergeChange(merged, c) : { ...c }
        if (c.remove) break
        working = { ...working, ...(c.patch ?? {}) } as typeof working
      }
      if (!merged) { if (alreadyPart) alreadyAt(alreadyPart, 'is like that', n); continue }
      if (merged.layer && !merged.patch && layerAlready(slide, merged)) { alreadyAt(merged.desc, merged.layer === 'above' || merged.layer === 'behind' ? `is ${merged.layer === 'above' ? 'in front of' : 'behind'} that object` : `is at the ${merged.layer}`, n); continue }
      // something that already is as asked is not "changed": no step, no history entry, and the person is told
      if (alreadyAsked(el, merged)) alreadyAt(merged.desc, 'is like that', n)
      else {
        elementChanges.push(...roomMade, merged)
        // moving or growing something onto another object only happens when the person said so ("anyway"), and never silently
        const hit = merged.remove || !merged.patch ? [] : newOverlaps(ctx.virtual, workSlide, el, merged.patch)
        if (hit.length) notes.push(`Slide ${n}: ${merged.desc} now overlaps ${[...new Set(hit.map(describeElement))].slice(0, 3).join(' and ')}. Say if you want it moved somewhere else.`)
      }
    }
    for (const [k, ns] of same) {
      const [desc, state] = k.split('|') as [string, string]
      const u = [...new Set(ns)].sort((a, b) => a - b)
      const where = u.length === 1 ? `slide ${u[0]}` : u.length > 2 && u.every((x, i) => i === 0 || x === u[i - 1]! + 1) ? `slides ${u[0]} to ${u.at(-1)}` : `slides ${u.slice(0, -1).join(', ')} and ${u.at(-1)}`
      already.push(`${desc.charAt(0).toUpperCase()}${desc.slice(1)} on ${where} already ${state}.`)
    }
    if (sourceOnly && !elementChanges.length && !refused.length && !already.length) refused.push('The only object named is the one whose look you want copied. Say which objects should get its look (for example "all the other pictures").')
    // the play order of a slide in one go ("title, then subtitle, then picture"), and "remove the 3rd animation": slide-level, worked out from the slide's own list of animations
    for (const op of v.ops) {
      if (op.op !== 'animate_sequence' && op.op !== 'animate_remove_at') continue
      for (const sid of ids) {
        const slide = ctx.virtual.slides.find((x) => x.id === sid)
        if (!slide) continue
        const n = numberOf(ctx.state, sid) || ctx.virtual.slides.indexOf(slide) + 1
        if (slide.locked) { refused.push(`Slide ${n} is locked, so I left it.`); continue }
        const all = slide.effects ?? []
        if (op.op === 'animate_remove_at') {
          const fx = all[op.position - 1]
          if (!fx) { refused.push(`Slide ${n} has ${all.length} animation${all.length === 1 ? '' : 's'}, so there is no number ${op.position}.`); continue }
          const owner = slide.elements.find((e) => e.id === fx.elementId)
          elementChanges.push({ slideId: sid, elementId: fx.elementId, desc: owner ? describeElement(owner) : 'an object', effect: { clear: true, effectId: fx.id }, verb: `Removed animation ${op.position} (${fx.type.replace(/-/g, ' ')} on {})` })
          continue
        }
        const order: string[] = []
        for (const ref of op.order) {
          const f = resolveElements(st, [sid], [ref as never], ['animate_sequence'])
          const found = (f.ok ? f.items.filter((i) => i.slideId === sid) : []).filter((i) => all.some((x) => x.elementId === i.element.id))
          if (!found.length) { refused.push(`Slide ${n}: ${f.ok && f.items.length ? `${describeElement(f.items[0]!.element)} has no animation to put in order` : 'I could not find one of the objects named'}, so I left the order as it was.`); order.length = 0; break }
          // (a name that matches several objects, "the body text", takes its place in the order together, in their own order)
          for (const i of found) if (!order.includes(i.element.id)) order.push(i.element.id)
        }
        if (order.length < 2) continue
        const ch = { slideId: sid, elementId: order[0]!, desc: 'the animations', effect: { sequence: order }, verb: `Put the animations of slide ${n} in the order asked` }
        if (effectAlready(slide, ch)) already.push(`The animations of slide ${n} already play in that order.`)
        else elementChanges.push(ch)
      }
    }
    if (quietSkips && !elementChanges.length && !refused.length && !already.length) refused.push('None of those objects has an animation to change or to copy.')
    const bySlide = new Map<string, number>()
    for (const c of elementChanges) bySlide.set(c.slideId, (bySlide.get(c.slideId) ?? 0) + 1)
    const applied = [...bySlide].map(([id, k]) => `Changed ${k} object${k === 1 ? '' : 's'} on slide ${numberOf(ctx.state, id)}`)
    return { ops: [], notes, refused, already, applied, slideOps: { elementChanges }, ...(written ? { written } : {}) }
  },
}


/** the answer shape of a words rewrite: the new lines of each object named */
const rewriteOut = zod.object({ objects: zod.array(zod.object({ id: zod.string().max(64), lines: zod.array(zod.string().max(600)).max(20).default([]) })).max(12).default([]) })

const REWRITE_RULES = `Return {"objects":[{"id":"<the object's id>","lines":["<line 1>", "..."]}]}: one entry for EVERY object in input.objects, with its new words.
- Do exactly what input.request asks, to those words only. Keep the meaning and every fact.
- KEEP EVERY FIGURE in input.objects[].mustKeepFigures exactly as written. Never add a figure, name, date or claim that is not already in the object, in input.slide, or in a <source> block.
- "lines" are plain text, one per line of the box (input.objects[].lines are the lines it has now). Keep roughly the same number of lines unless the request asks otherwise ("as bullet points" may make more, "one line" fewer). No markdown, no bullet characters: the slide draws the bullets.
- Keep each line about as long as the box can hold: a title stays a title (a few words), a body line stays a line. input.objects[].role says what the box is.
- input.slide gives the slide's title and its other text, so your words fit the slide: never repeat the other text, and never write words for the other objects.
- Never return a line unchanged when the request asks for a change.`

/** the slide's title, for the words rewrite's context */
const slideTitleOf = (ctx: RunCtx, slideId: string) => ctx.state.slides.find((r) => r.id === slideId)?.title ?? ''
/** the text of the OTHER objects on the slide (so a rewrite fits in, and never repeats them) */
const otherTextOf = (ctx: RunCtx, slideId: string, exceptIds: string[]) =>
  (ctx.virtual.slides.find((s) => s.id === slideId)?.elements ?? [])
    .filter((e) => e.type === 'text' && !exceptIds.includes(e.id) && !e.hidden)
    .map((e) => (e.type === 'text' ? e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ') : ''))
    .filter(Boolean).slice(0, 6).map((t) => t.slice(0, 160))

/**
 * The new words in the box's OWN styling: each new line keeps the styling of the line it replaces (the first run's bold, colour, size and the paragraph's list marker);
 * extra lines follow the first line's styling. Mixed styling inside one line (one word in a colour) cannot survive a rewrite of that line, which is why only the lines
 * that really changed are rebuilt.
 */
export function rebuiltParagraphs(old: TextElement['paragraphs'], lines: string[]): TextElement['paragraphs'] {
  return lines.map((text, i) => {
    const from = old[i] ?? old[0]!
    const was = from.runs.map((r) => r.text).join('')
    if (was === text) return from // this line did not change: keep it exactly, mixed styling and all
    const { text: _drop, ...style } = from.runs[0] ?? { text: '' }
    return { ...from, runs: [{ ...style, text }] }
  })
}
