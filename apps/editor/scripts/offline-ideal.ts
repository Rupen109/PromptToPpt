/**
 * "Perfect model" run of the load-test flow, with NO AI and NO cost: the understanding is always what the person meant, the writing is valid.
 * Everything else is the real thing: the server pipeline (resolve → capabilities → check → compileAssist) and the editor's own apply / undo /
 * history. Whatever still goes wrong here is a defect in OUR code or state handling, not in the model.
 *   cd apps/editor && npx tsx --env-file=../../services/api/.env scripts/offline-ideal.ts      env: PEOPLE=300 SEED=1
 */
import { produce } from 'immer'
import { DESIGNS, SAMPLES, composeDeck } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import { mockWrite } from '../../../services/api/src/ai/mock-assistant.ts'
import { runAssistant } from '../../../services/api/src/assistant/pipeline.ts'
import { intentSchema, type Intent } from '../../../services/api/src/assistant/understand.ts'
import * as C from '../src/editor/commands.ts'

let seed = Number(process.env['SEED'] ?? 1)
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!
const PEOPLE = Number(process.env['PEOPLE'] ?? 300)
const ent = { features: { premiumTemplates: true } } as never

type Fam = string
interface Phrase { family: Fam; say: (n: number, t: number) => string; intent: (n: number, t: number) => Partial<Intent>; ok: (r: any) => boolean }
const T = (family: string, targets: unknown[] = [], values: unknown = {}) => ({ tasks: [{ family, targets, values }] }) as Partial<Intent>
const PHRASES: Phrase[] = [
  { family: 'layout', say: (n) => `update the layout of slide ${n}, it looks boring`, intent: (n) => T('layout', [{ by: 'number', n }]), ok: (r) => r.edits.length > 0 },
  { family: 'layout', say: (n, t) => { const a = Math.max(2, Math.min(n, t - 3)); return `slides ${a} to ${a + 2} all look the same, give them different layouts` }, intent: (n, t) => { const a = Math.max(2, Math.min(n, t - 3)); return T('layout', [{ by: 'range', from: a, to: a + 2 }]) }, ok: (r) => r.edits.length >= 2 },
  { family: 'text', say: (n) => `make slide ${n} shorter`, intent: (n) => T('text', [{ by: 'number', n }], { request: 'make it shorter' }), ok: (r) => r.edits.length > 0 },
  { family: 'text', say: () => 'please add 2 more bullet points here', intent: () => T('text', [], { request: 'add 2 more bullet points', addPoints: 2 }), ok: (r) => r.edits.length > 0 },
  { family: 'text', say: (n) => `rewrite the title of slide ${n} to be more catchy`, intent: (n) => T('text', [{ by: 'number', n }], { request: 'catchier title' }), ok: (r) => r.edits.length > 0 },
  { family: 'text', say: (n) => `translate slide ${n} to Hindi`, intent: (n) => T('text', [{ by: 'number', n }], { request: 'translate to Hindi' }), ok: (r) => r.edits.length > 0 },
  { family: 'add_slide', say: () => 'add a thank you page at the end', intent: () => T('add_slide', [], { count: 1, where: 'end', about: 'thank you' }), ok: (r) => r.additions.length === 1 },
  { family: 'add_slide', say: (n) => `add 2 slides after slide ${n} about the key challenges`, intent: (n) => T('add_slide', [], { count: 2, where: 'after', after: { by: 'number', n }, about: 'key challenges' }), ok: (r) => r.additions.length === 2 },
  { family: 'palette', say: () => 'change the colours to deep blue and orange', intent: () => T('palette', [], { primary: '#1E3A8A', accent: '#F97316' }), ok: (r) => !!r.theme },
  { family: 'palette', say: () => 'make the theme dark', intent: () => T('palette', [], { mode: 'dark' }), ok: (r) => !!r.theme },
  { family: 'background', say: (n) => `make the background of slide ${n} light grey`, intent: (n) => T('background', [{ by: 'number', n }], { color: '#E5E7EB' }), ok: (r) => r.backgrounds.length > 0 },
  { family: 'picture', say: () => 'update the background image of this slide', intent: () => T('picture', [{ by: 'current' }], { source: 'photo', placement: 'background', subject: 'city skyline' }), ok: (r) => r.pictures.length > 0 || r.images.length > 0 },
  { family: 'fonts', say: () => 'use a more professional font', intent: () => T('fonts', [], { pair: 'manrope' }), ok: (r) => !!r.theme },
  { family: 'motion', say: () => 'animate every slide', intent: () => T('motion', [], { preset: 'zoom' }), ok: (r) => !!r.theme },
  { family: 'template', say: () => 'try a more modern template', intent: () => T('template', [], { mood: 'modern' }), ok: (r) => !!r.theme },
  { family: 'remove_slide', say: (n) => `delete slide ${n}`, intent: (n) => T('remove_slide', [{ by: 'number', n }]), ok: (r) => r.removals.length === 1 },
  { family: 'move_slide', say: (n) => `move slide ${n} to the end`, intent: (n) => T('move_slide', [{ by: 'number', n }], { where: 'end' }), ok: (r) => r.moves.length === 1 },
]
const UNDO: Phrase = { family: 'undo', say: () => 'undo that, I did not like it', intent: () => T('undo', [{ by: 'just_changed' }], { part: 'slide' }), /* the model's wrong scope that used to dead-end */ ok: (r) => r.reverts.length > 0 }

const slideId = (() => { let i = 0; return () => `n${++i}` })()
const newDeck = (): Presentation => {
  const d = pick(DESIGNS.filter((x) => !x.premium || true))
  const n = 8 + Math.floor(rand() * 5)
  const slides = composeDeck(SAMPLES.slice(0, Math.min(n, SAMPLES.length)), d, '16:9', () => `e${slideId()}`).map((s) => ({ id: `s${slideId()}`, locked: false, validation: { status: 'passed' as const, issues: [] }, ...s }))
  return { schemaVersion: 1, id: 'x', title: 'Deck', aspectRatio: '16:9', language: 'en', theme: d.theme, sources: [], slides } as unknown as Presentation
}

interface Wrong { family: string; say: string; notes: string[]; applied: string[]; prev: string; stack: number }
const wrong: Wrong[] = []
const stat: Record<string, { n: number; ok: number }> = {}
let nid = 0
for (let p = 0; p < PEOPLE; p++) {
  let doc = newDeck()
  const stack: C.AssistUndo[] = []
  let prev = '-'
  const edits = 6 + Math.floor(rand() * 3)
  for (let k = 0; k < edits; k++) {
    const total = doc.slides.length
    const ph = k > 0 && stack.length && rand() < 0.12 ? UNDO : pick(PHRASES)
    const n = 2 + Math.floor(rand() * Math.max(1, total - 2))
    const say = ph.say(n, total)
    const active = doc.slides[Math.min(total - 1, n - 1)]!.id
    const out = await runAssistant(
      { doc, ent, instruction: say, activeSlideId: active, ...(stack.length ? { recent: [...stack].reverse().slice(0, 5).map((u) => ({ theme: !!u.theme, slideIds: C.undoSlideIds(u).slice(0, 40), summary: u.summary.slice(0, 8) })) } : {}) },
      {
        understand: async () => intentSchema.parse({ kind: 'edit', clarity: 'act', ...ph.intent(n, total) }),
        write: async (pr, schema) => {
          const raw = JSON.parse(mockWrite(pr.system, pr.prompt))
          // a careful writer respects each layout's point limit (title-body 6, split-image-text 5); invalid output is counted separately below
          for (const sl of raw.slides ?? []) { const c = sl.content; if (c && Array.isArray(c.bullets)) c.bullets = c.bullets.slice(0, c.layout === 'split-image-text' ? 5 : 6) }
          return schema.parse(raw)
        },
        newId: () => `gen${++nid}`,
      },
    )
    const s = (stat[ph.family] ??= { n: 0, ok: 0 }); s.n++
    if (out.kind !== 'done') { wrong.push({ family: ph.family, say, notes: [`outcome: ${out.kind}`], applied: [], prev, stack: stack.length }); prev = ph.family; continue }
    const g = out.compiled
    const r = { edits: g.edits, additions: g.additions, theme: g.theme, backgrounds: g.backgrounds, readability: g.readability, reverts: g.reverts, pictures: g.photos.map((x) => ({ slideId: x.slideId, url: 'https://example.com/p.jpg', alt: x.alt, placement: x.placement })), images: g.images, ...out.slideOps }
    const applied = [...g.applied, ...out.applied]
    if (ph.ok(r)) s.ok++; else wrong.push({ family: ph.family, say, notes: out.notes, applied, prev, stack: stack.length })
    if (applied.length) {
      const before = doc
      const log = [...stack]
      const after = produce(doc, (d) => { C.applyAssist(d, r as never); for (const rv of g.reverts) { const e = log[log.length - 1 - rv.change]; if (e) C.revertAssist(d, e, rv.part, rv.slideId) } })
      if (!g.reverts.length) stack.push(C.snapshotAssist(before, after, !!g.theme, applied, undefined, [...g.backgrounds.map((b) => b.slideId), ...g.photos.map((x) => x.slideId), ...g.readability]))
      else stack.pop()
      doc = after
    }
    prev = ph.family
  }
}
console.log(`\nPERFECT-MODEL RUN: ${PEOPLE} people`)
let N = 0, OK = 0
for (const [f, s] of Object.entries(stat).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)) { N += s.n; OK += s.ok; console.log(`${f.padEnd(14)} ${String(s.ok).padStart(5)}/${String(s.n).padEnd(5)} ${(100 * s.ok / s.n).toFixed(1)}%`) }
console.log(`TOTAL ${OK}/${N} = ${(100 * OK / N).toFixed(1)}%\n`)
const groups = new Map<string, Wrong[]>()
for (const w of wrong) { const key = `${w.family} | ${w.notes[0] ?? '(no note)'} | applied=${w.applied.length ? 'yes' : 'nothing'}`; groups.set(key, [...(groups.get(key) ?? []), w]) }
for (const [k, v] of [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 14)) console.log(`${String(v.length).padStart(4)}×  ${k.slice(0, 190)}\n        e.g. "${v[0]!.say}" (previous message: ${v[0]!.prev}, history size ${v[0]!.stack})`)
process.exit(0)
