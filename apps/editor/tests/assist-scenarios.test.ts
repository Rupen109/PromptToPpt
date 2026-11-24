import { beforeEach, describe, expect, it, vi } from 'vitest'

// the server modules validate their environment when imported; this suite never opens a database or calls a model, so fixed dummy values are enough
vi.hoisted(() => {
  const e = process.env
  e['DATABASE_URL'] ??= 'postgres://scenario:scenario@localhost:5432/scenario'; e['AUTH_SECRET'] ??= 'scenario-suite-secret-not-used-0123456789'
  e['API_URL'] ??= 'http://localhost:4000'; e['WEB_URL'] ??= 'http://localhost:3100'; e['EDITOR_URL'] ??= 'http://localhost:3001'; e['AI_PROVIDER'] = 'mock'
})

import { composeSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { mockWrite } from '../../../services/api/src/ai/mock-assistant.ts'
import { buildAnswer, changesTheDeck } from '../../../services/api/src/assistant/answer.ts'
import { META } from '../../../services/api/src/assistant/capabilities/meta.ts'
import { runAssistant, type AssistantOutcome } from '../../../services/api/src/assistant/pipeline.ts'
import { isReady } from '../../../services/api/src/assistant/registry.ts'
import { SCENARIOS, SCENARIO_FAMILIES, type Scenario } from '../../../services/api/src/assistant/scenarios.ts'
import { FAMILIES, intentSchema } from '../../../services/api/src/assistant/understand.ts'
import { useUi } from '../src/editor/ui'
import { applyAssistVerified, type AssistAnswer } from '../src/editor/assist-apply'
import * as C from '../src/editor/commands'
import { useDoc } from '../src/editor/store'

/**
 * Every scenario of the catalogue (assistant/scenarios.ts), end to end and offline: a PERFECT understanding goes through the real pipeline (resolve, admit, capabilities, validation), the
 * answer is assembled as the server does, applied with the editor's own commands as one transaction, verified on the document, and the message is composed from the verified results.
 * What is checked is the honesty rule itself: the message says "Done" only when the deck changed, "nothing" leaves the deck and its history untouched, notes say why.
 */
let n = 0
const gen = () => `id${++n}`
const contents: SlideContent[] = [
  { layout: 'title', title: 'Deck', subtitle: 'Sub', speakerNotes: 'notes', sources: [] },
  { layout: 'title-body', title: 'Body one', bullets: ['alpha point', 'beta point', 'gamma point'], speakerNotes: '', sources: [] },
  { layout: 'process', title: 'Steps', steps: [1, 2, 3].map((i) => ({ label: `S${i}`, detail: 'd' })), speakerNotes: '', sources: [] },
  { layout: 'title-body', title: 'Body two', bullets: ['x one', 'y two'], speakerNotes: '', sources: [] },
  { layout: 'title-body', title: 'Body three', bullets: ['p one', 'q two'], speakerNotes: '', sources: [] },
  { layout: 'thank-you', title: 'Thank you', speakerNotes: '', sources: [] },
]
const deck = (): Presentation => {
  const theme = getTheme('cobalt')
  const d: Presentation = { schemaVersion: 1, id: 'p1', title: 'T', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: contents.map((c, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending' as const, issues: [] }, ...composeSlide(c, theme, '16:9', gen) })) }
  d.slides[0]!.elements.push({ id: 'pic', type: 'image', src: 'https://x.test/a.png', alt: 'cup', x: 0, y: 0, width: 300, height: 200, rotation: 0, locked: false, zIndex: 9, opacity: 1, fit: 'cover', clip: 'none' } as never)
  return d
}
const doc = () => useDoc.getState().doc!
let nid = 0

interface Run { outcome: string; applied: string[]; notes: string[]; text: string; changed: boolean; writes: number; historyAdded: number; collateral: number[]; /** the "do the rest?" question a partly blocked request asked first */ asked?: string }

async function run(sc: Scenario): Promise<Run> {
  const stack: C.AssistUndo[] = []
  const history0 = () => useDoc.getState().past.length
  const step = async (say: string, intent: Scenario['intent'], ctx: Scenario['ctx'], slideNo: number | undefined, withSetup: boolean, confirm: Scenario['confirm'] = sc.confirm): Promise<Run> => {
    let writes = 0
    const before = doc()
    // (picture/findSubject below: the stored picture and the vision step, as the route gives them; the network is not part of these tests)
    const out: AssistantOutcome = await runAssistant(
      {
        doc: before, ent: { features: { morph: ctx?.morph ?? true, premiumTemplates: ctx?.premiumTemplates ?? true, advancedEditor: ctx?.advancedEditor ?? true, brandKit: ctx?.brandKit ?? true, exportFormats: ctx?.exportFormats ?? ['pptx', 'pdf', 'png', 'jpg', 'html'], livePreview: true } } as never, selection: { slideIds: [], elementIds: sc.selected ?? [] }, uploads: ctx?.uploads ?? [], brand: ctx?.brand ?? null, siteBrand: ctx?.site ? async () => ctx.site! : undefined, logoBrand: ctx?.logo ? async () => ctx.logo! : undefined, comments: { list: async () => ctx?.threads ?? [], add: async () => ({ ok: true as const }), resolve: async (ids: string[]) => ids.length }, previousVersion: async () => (ctx?.previousSlides ? { doc: { ...before, slides: before.slides.slice(0, ctx.previousSlides) }, when: '2 hours ago' } : null), brandKits: ctx?.kits ?? [], brandThemeList: ctx?.themes ?? [], kits: { create: async () => ({ ok: true as const }), update: async () => ({ ok: true as const }), remove: async () => ({ ok: true as const }), createTheme: async () => ({ ok: true as const }) }, picture: async (u: string) => (ctx?.noStoredPictures || !u ? null : { aspect: 1.5, bytes: new Uint8Array([1]), mime: 'image/jpeg' }), findSubject: async (_p: unknown, subject: string) => (/unicorn/i.test(subject) ? null : { x: 0.55, y: 0.2, w: 0.3, h: 0.45 }), instruction: say, conversation: (sc.earlier ?? []).map((text) => ({ role: 'user' as const, text })), activeSlideId: slideNo ? before.slides[slideNo - 1]!.id : undefined,
        ...(confirm ? { confirm } : {}), isOwner: ctx?.isOwner ?? true, flags: ctx?.flags ?? {}, hasSources: !!ctx?.hasSources,
        ...(stack.length ? { recent: [...stack].reverse().slice(0, 5).map((u) => ({ theme: !!u.theme, slideIds: C.undoSlideIds(u).slice(0, 40), summary: u.summary.slice(0, 8) })) } : {}),
      },
      {
        understand: async () => intentSchema.parse({ kind: 'edit', clarity: 'act', ...intent }),
        write: async (pr, schema) => { writes++; if (sc.proposal !== undefined) return schema.parse(sc.proposal); const raw = JSON.parse(mockWrite(pr.system, pr.prompt)); for (const sl of raw.slides ?? []) { const c = sl.content; if (c && Array.isArray(c.bullets)) c.bullets = c.bullets.slice(0, 6) } return schema.parse(raw) },
        newId: () => `gen${++nid}`,
      },
    )
    void withSetup
    const base: Omit<Run, 'outcome' | 'applied' | 'notes' | 'text' | 'changed'> = { writes, historyAdded: 0, collateral: [] }
    if (out.kind === 'answer') return { ...base, outcome: 'answer', applied: [], notes: [], text: out.text, changed: false }
    // a partly blocked request asks first and changes nothing; "Yes, do the rest" sends the very same tasks back (the scenario's expectations are about that answer)
    if (out.kind === 'ask' && sc.proceed && confirm?.kind !== 'proceed') {
      const yes = out.question.options.find((o) => o.confirm?.kind === 'proceed')
      if (!yes) return { ...base, outcome: 'ask', applied: [], notes: [], text: out.question.text, changed: false }
      expect(doc()).toBe(before) // nothing changed while asking
      const r = await step(say, intent, ctx, slideNo, withSetup, yes.confirm)
      return { ...r, writes: r.writes + writes, asked: out.question.text }
    }
    if (out.kind === 'ask') return { ...base, outcome: 'ask', applied: [], notes: [], text: out.question.text, changed: false }
    if (out.kind !== 'done') return { ...base, outcome: out.kind, applied: [], notes: [], text: '', changed: false }
    const g = out.compiled
    const notes = [...new Set([...out.notes, ...g.notes])]
    // (as the route does: every note keeps its kind)
    const refused = [...out.refused], already = [...out.already]
    // what the route does with I/O: free photos are found, cut-outs are made (and refused when they do not come out transparent)
    // (as the route does: a photo for a SELECTED picture replaces it in its frame, everything else is placed)
    const pictures = g.photos.filter((p) => p.placement !== 'replace').map((p) => ({ slideId: p.slideId, placement: p.placement as 'background' | 'beside' | 'floating', url: 'https://x.test/photo.jpg', alt: p.alt })).concat(out.slideOps.uploads.map((u) => ({ slideId: u.slideId, placement: u.placement, url: u.url, alt: u.alt }))) // (and the person's own uploads put on slides with no picture)
    for (const p of g.photos) if (p.placement === 'replace' && p.elementId) out.slideOps.swaps.push({ slideId: p.slideId, elementId: p.elementId, url: 'https://x.test/better.jpg', alt: p.alt, source: 'photo' })
    const pictureSwaps: { slideId: string; elementId: string; url: string; alt: string; transparentShare: number }[] = []
    for (const c of out.slideOps.cutouts) {
      if (sc.cutout === 'opaque') { const t = 'This picture has hardly any background to remove, so nothing was changed.'; notes.push(t); refused.push(t) }
      else pictureSwaps.push({ slideId: c.slideId, elementId: c.elementId, url: 'https://x.test/cut.png', alt: 'Picture without background', transparentShare: 0.4 })
    }
    const { changes, expect: exps } = buildAnswer(before, { compiled: g, slideOps: out.slideOps, pictures, pictureSwaps, newId: () => `add${++nid}` })
    if (g.enrich) return { ...base, outcome: 'info', applied: [], notes, text: '', changed: false }
    // (as the route does: a selection is free and changes nothing; the editor selects the objects)
    // (as the route does: a prepared present / export / share is one button for the person; nothing in the deck changes)
    if (!exps.length && out.answers?.length && !out.outside?.length) return { ...base, outcome: 'answer', applied: [], notes, text: out.answers.join('\n\n'), changed: false }
    if (!exps.length && out.outside?.length) return { ...base, outcome: 'kit', applied: out.outside, notes, text: out.outside.join('; '), changed: false }
    if (!exps.length && out.ui) return { ...base, outcome: 'ui', applied: [], notes, text: JSON.stringify(out.ui), changed: false }
    if (!exps.length && out.slideOps.select.length) { const sel = out.slideOps.select[0]!; useUi.getState().setActiveSlide(sel.slideId); useUi.getState().select(sel.elementIds); return { ...base, outcome: 'select', applied: [], notes, text: sel.say, changed: false } }
    if (!changesTheDeck(exps) && !exps.length) return { ...base, outcome: notes.length && notes.every((t) => already.includes(t)) ? 'already' : 'nothing', applied: [], notes, text: '', changed: false }
    sc.between?.(doc() as never) // (a change made in between: applied through the store so it is a real state)
    if (sc.between) useDoc.getState().apply('between', (d) => sc.between!(d as never))
    const h = history0()
    const r = applyAssistVerified({ ...changes, expect: exps } as AssistAnswer, {
      notes, refused, already,
      extra: (d) => { for (const rv of g.reverts) { const e = stack[stack.length - 1 - rv.change]; if (e) C.revertAssist(d, e, rv.part, rv.slideId) } },
    })
    if (r.changed && !g.reverts.length) stack.push(C.snapshotAssist(r.before, r.after, !!g.theme, r.composed.applied))
    else if (g.reverts.length) stack.pop()
    return { ...base, outcome: r.composed.outcome, applied: r.composed.applied, notes: r.composed.notes, text: r.composed.reply, changed: r.changed, collateral: r.collateral, historyAdded: history0() - h - (sc.between ? 0 : 0) }
  }
  if (sc.prior) await step(sc.prior.say, { tasks: sc.prior.tasks }, sc.ctx, undefined, false)
  return step(sc.say, sc.intent, sc.ctx, sc.slide, true)
}

const startDoc = (sc: Scenario) => { const d = deck(); sc.setup?.(d); return d }
beforeEach(() => { n = 0; nid = 0 })

describe('the scenario catalogue, end to end through the real pipeline, editor commands, verifier and composer', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.cls.padEnd(11)} ${sc.id}: "${sc.say}"`, async () => {
      useDoc.getState().load(startDoc(sc), 1)
      const startJson = JSON.stringify(doc())
      const r = await run(sc)
      const x = sc.expect
      expect(r.outcome, `outcome (applied: ${r.applied.join(' | ')}; notes: ${r.notes.join(' | ')}; text: ${r.text.slice(0, 120)})`).toBe(x.outcome)
      for (const re of x.applied ?? []) expect(r.applied.some((a) => re.test(a)), `applied should match ${re}: ${r.applied.join(' | ')}`).toBe(true)
      for (const re of x.notes ?? []) expect(r.notes.some((a) => re.test(a)), `notes should match ${re}: ${r.notes.join(' | ')}`).toBe(true)
      for (const re of x.text ?? []) expect(re.test(r.text), `text should match ${re}: ${r.text}`).toBe(true)
      for (const re of x.notText ?? []) expect(re.test(r.text), `text must not match ${re}`).toBe(false)
      if (x.noWriting) expect(r.writes, 'the model was asked to write although nothing could be done').toBe(0)
      // a partly blocked request was asked about FIRST, with the reasons, before anything changed (owner rule 2026-11-21: ask first)
      if (sc.proceed) { expect(r.asked, 'a partly blocked request must ask "do the rest?" first').toMatch(/but not on slides? .+\(.+\)\. Nothing was changed yet\. Shall I do the rest\?$/) }
      // the honesty rule itself
      expect(r.collateral, 'nothing that was not asked for may change (R6)').toEqual([])
      if (x.outcome === 'nothing' || x.outcome === 'already' || x.outcome === 'answer' || x.outcome === 'info' || x.outcome === 'ask') {
        expect(r.applied, 'nothing was done, so nothing may be ticked').toEqual([])
        if (!sc.prior && !sc.between) expect(JSON.stringify(doc()), 'the deck must be untouched').toBe(startJson)
      }
      if (x.outcome === 'done' || x.outcome === 'partial') { expect(r.changed, 'a "Done" must mean the deck really changed').toBe(true); expect(r.historyAdded, 'one undo step for the whole request').toBe(1) }
    })
  }

  it('C36: "replace this image with a better one" leaves ONE picture, the same object in the same frame, now showing the new photo', async () => {
    const sc = SCENARIOS.find((s) => s.id === 'picture-replace-selected-with-photo')!
    useDoc.getState().load(startDoc(sc), 1)
    const before = doc().slides[0]!.elements.find((e) => e.id === 'pic')!
    await run(sc)
    const pics = doc().slides[0]!.elements.filter((e) => e.type === 'image' && !e.decorative)
    expect(pics.map((e) => e.id)).toEqual(['pic'])
    expect(pics[0]).toMatchObject({ src: 'https://x.test/better.jpg', x: before.x, y: before.y, width: before.width, height: before.height })
  })

  it('undo then redo of a whole multi-change request moves the deck back and forth exactly (one history step)', async () => {
    const sc = SCENARIOS.find((s) => s.id === 'multi-step')!
    useDoc.getState().load(startDoc(sc), 1)
    const start = JSON.stringify(doc())
    await run(sc)
    const done = JSON.stringify(doc())
    expect(done).not.toBe(start)
    useDoc.getState().undo()
    expect(JSON.stringify(doc())).toBe(start)
    useDoc.getState().redo()
    expect(JSON.stringify(doc())).toBe(done)
  })
})

describe('the registry cannot promise what is not proven', () => {
  it('every capability family is declared, and every one declared ready is covered by a success (or undo) scenario and names what verifies it', () => {
    for (const f of FAMILIES) {
      expect(META[f], `${f} has no metadata`).toBeDefined()
      if (META[f].ready) {
        expect(SCENARIO_FAMILIES.has(f), `${f} is declared ready but no scenario covers it`).toBe(true)
        if (!META[f].changesNothing) expect(META[f].verifiedBy.length, `${f} names no verifier`).toBeGreaterThan(0) // (a family that never changes the deck has nothing on it to verify: the person's click is the confirmation)
        expect(isReady(f)).toBe(true)
      }
    }
  })
  it('the catalogue exercises every outcome class the owner asked for', () => {
    const classes = new Set(SCENARIOS.map((s) => s.cls))
    for (const c of ['success', 'partial', 'already', 'locked', 'missing', 'failed', 'unsupported', 'plan', 'template', 'flag', 'owner', 'multi', 'undo', 'discovery'] as const) expect(classes.has(c), `no ${c} scenario`).toBe(true)
  })
})

/**
 * The honesty PROPERTY (section 3.7b of docs/AI_EDIT_HONESTY_AND_SCENARIOS.md): whatever state the deck is in, no answer may claim a change that did not happen or change what it did not name.
 * Every scenario runs on decks that are randomly made worse (slides locked, objects missing, slides hand-edited), from a fixed seed so a failure can be replayed. The expected outcome of a scenario no longer
 * holds on such a deck, so only the rules that must ALWAYS hold are checked.
 */
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const SEEDS = [1, 2, 3, 4, 5, 6]
describe('honesty property: random locks, missing objects and hand-edited slides never produce a false claim or a stray change', () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: every scenario (${SCENARIOS.length})`, async () => {
      const bad: string[] = []
      for (const sc of SCENARIOS) {
        const r0 = rng(seed * 1000 + SCENARIOS.indexOf(sc))
        n = 0; nid = 0
        const d = startDoc(sc)
        // make the deck worse, at random
        for (const s of d.slides) { if (r0() < 0.18) s.locked = true; else if (r0() < 0.12) s.manual = true }
        if (r0() < 0.4) { const s = d.slides[Math.floor(r0() * d.slides.length)]!; if (s.elements.length > 1) s.elements.splice(Math.floor(r0() * s.elements.length), 1) }
        useDoc.getState().load(d, 1)
        const startJson = JSON.stringify(doc())
        let r: Run
        try { r = await run(sc) } catch (e) { bad.push(`${sc.id}: threw ${(e as Error).message.slice(0, 120)}`); continue }
        if (r.collateral.length) bad.push(`${sc.id}: slides ${r.collateral.join(',')} changed without being named`)
        if (r.applied.length && !r.changed && r.outcome !== 'kit' && r.outcome !== 'answer') bad.push(`${sc.id}: ticked ${r.applied.length} change(s) but the deck did not change`)
        if ((r.outcome === 'done' || r.outcome === 'partial') && !r.changed) bad.push(`${sc.id}: said ${r.outcome} but nothing changed`)
        if ((r.outcome === 'done' || r.outcome === 'partial') && !sc.prior && !sc.between && r.historyAdded !== 1) bad.push(`${sc.id}: ${r.historyAdded} undo steps for one request`)
        if (['nothing', 'already', 'answer', 'info', 'ask'].includes(r.outcome) && !sc.prior && !sc.between) {
          if (r.applied.length) bad.push(`${sc.id}: ticked changes although the outcome was ${r.outcome}`)
          if (JSON.stringify(doc()) !== startJson) bad.push(`${sc.id}: the deck changed although the outcome was ${r.outcome}`)
        }
      }
      expect(bad, bad.join('\n')).toEqual([])
    }, 120_000)
  }
})
