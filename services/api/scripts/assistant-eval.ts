/**
 * Does the AI assistant (v2 pipeline) do the right thing for real phrasings? Runs each phrase through the REAL models (costs a few cents,
 * refuses in production): understand on the cheapest route, writing on EVAL_MODEL (or the default quality route), and checks the RESULT.
 *   pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/assistant-eval.ts [filter-word]
 *   EVAL_MODEL=vertex:gemini-3.1-flash-lite …   the model that writes (the cheapest one is the first to suffer)
 * Add a phrase whenever a real chat goes wrong: every bad chat becomes a case here, never a new prompt rule.
 */
import { composeSlide, templateSlides } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import { gateway } from '../src/ai/gateway.ts'
import { runAssistant, type AssistantOutcome } from '../src/assistant/pipeline.ts'
import { intentSchema } from '../src/assistant/understand.ts'
import { isProd } from '../src/env.ts'
import { pool } from '../src/db/index.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
let n = 0
const built = templateSlides('pitch-seed-round', '16:9', () => `e${n++}`, 'https://x/template-assets')!
const doc = {
  schemaVersion: 1, id: 'eval', title: 'Seed round', aspectRatio: '16:9', language: 'en', theme: built.theme, sources: [],
  slides: built.slides.map((s, i) => ({ id: `s${i + 1}`, locked: false, validation: { status: 'passed', issues: [] }, ...s, ...(i === 0 ? { background: { type: 'image', value: 'https://x/a.jpg' } } : {}) })),
} as unknown as Presentation
const ent = { features: { advancedEditor: true, aiEdits: true, modelTiers: ['starter', 'premium', 'frontier'], premiumTemplates: true }, plan: { id: 'gold' } } as never

// the customer's deck: four slides in a row with the SAME picture + text layout (slides 7-10)
const SAME = [['Architect of Pokhran-II', ['Coordinated DRDO and the Atomic Energy Commission', 'Kept operations secret under desert conditions', 'Built reliable strategic partnerships']], ['Scientific leadership', ['Guided the team through design reviews', 'Balanced speed with safety', 'Mentored a new generation of engineers']], ['Missile programme', ['Drove the integrated guided missile effort', 'Moved prototypes into production', 'Linked labs, industry and the services']], ['Presidency and legacy', ['Inspired students across the country', 'Wrote about science and service', 'Remembered as the People\'s President']]] as const
SAME.forEach(([title, bullets], i) => {
  const c = { layout: 'split-image-text', title, bullets: [...bullets], imagePrompt: `Scene for ${title}`, imageAlt: title, speakerNotes: '', sources: [] } as never
  ;(doc.slides as unknown[])[6 + i] = { id: `s${7 + i}`, locked: false, validation: { status: 'passed', issues: [] }, ...composeSlide(c, doc.theme as never, '16:9', () => `r${i}x${n++}`) }
})
const LAST = doc.slides.at(-1)!.id
const layoutOf = (id: string) => doc.slides.find((s) => s.id === id)?.layoutId
const bodySlide = doc.slides.find((x) => { const b = (x as { content?: { bullets?: unknown[] } }).content?.bullets; return Array.isArray(b) && b.length >= 2 && b.length <= 4 })?.id

/** what the person would get, flattened for the checks */
type Got = Extract<AssistantOutcome, { kind: 'done' }>
const D = (o: AssistantOutcome): Got | null => (o.kind === 'done' ? o : null)
const relaid = (g: Got | null, ids: string[]) => { const mine = (g?.compiled.edits ?? []).filter((e) => ids.includes(e.slideId)); return mine.length >= 3 && new Set(mine.map((e) => e.content.layout)).size >= 2 && mine.every((e) => e.content.layout !== layoutOf(e.slideId)) }
const bg = (g: Got | null, id: string, color?: string) => (g?.compiled.backgrounds ?? []).some((b) => b.slideId === id && (!color || b.color === color))
const deckColour = (g: Got | null) => !!g?.compiled.theme

type Case = { say: string; on?: string; conversation?: { role: 'user' | 'assistant'; text: string }[]; recent?: { theme: boolean; slideIds: string[]; summary: string[] }[]; ok: (o: AssistantOutcome, g: Got | null) => boolean; want: string }
const CASES: Case[] = [
  // pictures: a free photo unless the person says "generate / AI"; behind the slide only when they say so
  { say: 'update the bg image', ok: (_o, g) => !!g?.compiled.photos.some((p) => p.slideId === 's1' && p.placement === 'background'), want: 'a free photo behind the slide they are on' },
  { say: 'put a photo of the mumbai skyline behind this slide', ok: (_o, g) => !!g?.compiled.photos.some((p) => /mumbai/i.test(p.query)), want: 'a photo of mumbai' },
  { say: 'new background picture for slide 3', ok: (_o, g) => !!g?.compiled.photos.some((p) => p.slideId === 's3'), want: 'a photo on slide 3' },
  { say: 'generate an AI image for the background of this slide', ok: (_o, g) => !!g?.compiled.images.some((i) => i.placement === 'background' && i.slideId === 's1'), want: 'a paid AI picture proposal, behind slide 1' },
  { say: 'add a picture beside the text on slide 2', ok: (_o, g) => !!g && [...g.compiled.photos, ...g.compiled.images].some((p) => p.slideId === 's2' && p.placement !== 'background'), want: 'a picture on slide 2, not behind it' },
  { say: 'remove the picture from slide 7', ok: (_o, g) => !!g?.slideOps.clearPictures.includes('s7'), want: 'pictures removed from slide 7' },
  // real chat (2026-11-01): slides 7-10 looked alike; v1 rewrote text, then said "not supported", then asked which layout
  { say: 'what the fuck man i said update layout of slide no : 7,8,9 and 10, currently all are in same layouts, update that', on: 's7', ok: (_o, g) => relaid(g, ['s7', 's8', 's9', 's10']), want: 'slides 7-10 in different layouts' },
  { say: 'all 4 slides(slide : 7,8,9,10) format is same so update all 4 slides format', on: 's7', ok: (_o, g) => relaid(g, ['s7', 's8', 's9', 's10']), want: 'slides 7-10 in different layouts (not a text rewrite)' },
  { say: 'you create new layout based on our theme of slides', on: 's7', conversation: [{ role: 'user', text: 'update layout of slide no : 7,8,9 and 10, currently all are in same layouts, update that' }, { role: 'assistant', text: 'Which format or layout would you like slides 7, 8, 9, and 10 to use?' }], ok: (_o, g) => relaid(g, ['s7', 's8', 's9', 's10']), want: 'decides and re-lays out 7-10 (no second question)' },
  { say: 'make slide 5 a timeline', ok: (_o, g) => !!g?.compiled.edits.some((e) => e.slideId === 's5' && e.content.layout === 'timeline'), want: 'slide 5 as a timeline' },
  // real chat: after "add thank you page", a colour is about THAT page
  { say: 'color should be brown', on: 's1', recent: [{ theme: false, slideIds: [LAST], summary: ['Added a new slide at the end'] }], conversation: [{ role: 'user', text: 'add thank you page also' }, { role: 'assistant', text: 'Done — added a new slide at the end.' }], ok: (o, g) => o.kind === 'ask' || (bg(g, LAST) && !deckColour(g)), want: 'the new page brown (or a question), never the whole deck' },
  { say: 'means it should match with our other slides', on: 's1', recent: [{ theme: false, slideIds: [LAST], summary: ['Changed the background of the last slide'] }], conversation: [{ role: 'user', text: 'color should be brown' }, { role: 'assistant', text: 'Done — changed the background of slide 12.' }], ok: (_o, g) => bg(g, LAST) && !deckColour(g) && !g?.compiled.reverts.length, want: 'that page gets the others\' background' },
  { say: 'add a thank you page and make it brown', ok: (_o, g) => !!g && g.compiled.additions.length === 1 && bg(g, g.compiled.additions[0]!.id ?? '-'), want: 'one new slide, brown, in one answer' },
  { say: 'green color is not good, update it with orange', ok: (_o, g) => deckColour(g), want: 'a deck-wide colour change' },
  { say: 'make the background of slide 3 dark blue', ok: (_o, g) => bg(g, 's3') && !deckColour(g), want: 'slide 3 background only' },
  { say: 'change the colours to deep purple and gold', on: 's2', recent: [{ theme: false, slideIds: ['s2'], summary: ['Put a modern city skyline dawn photo on slide 2'] }], ok: (_o, g) => deckColour(g), want: 'the deck palette, even right after a one-slide picture' },
  { say: 'make the theme dark', ok: (_o, g) => deckColour(g), want: 'a deck-wide dark mode' },
  { say: 'use a more modern template', ok: (_o, g) => deckColour(g), want: 'another template' },
  { say: 'the images do not match the slides, use better pictures', ok: (_o, g) => !!g?.compiled.rewrite?.picturesOnly, want: 'refresh every picture' },
  // words
  { say: 'make the title of slide 2 shorter', ok: (_o, g) => !!g?.compiled.edits.some((e) => e.slideId === 's2'), want: 'slide 2 rewritten' },
  ...(bodySlide ? [{ say: 'please add 2 more bullet points here', on: bodySlide, ok: (_o: AssistantOutcome, g: Got | null) => !!g?.compiled.edits.some((e) => e.slideId === bodySlide) && !g.notes.some((x) => x.startsWith('Not done:')), want: 'the points really added' } as Case] : []),
  { say: 'translate slide 2 to Hindi', ok: (_o, g) => !!g?.compiled.edits.some((e) => e.slideId === 's2' && /[ऀ-ॿ]/.test(JSON.stringify(e.content))), want: 'slide 2 in Hindi' },
  // slides
  { say: 'add 2 slides after slide 3 about our pricing', ok: (_o, g) => g?.compiled.additions.length === 2 && g.compiled.additions[0]!.afterSlideId === 's3', want: 'two new slides after slide 3' },
  { say: 'delete slide 4', ok: (_o, g) => !!g?.slideOps.removals.includes('s4'), want: 'slide 4 deleted' },
  { say: 'move slide 2 to the end', ok: (_o, g) => g?.slideOps.moves[0]?.slideId === 's2', want: 'slide 2 moved to the end' },
  // history and talk
  { say: 'why did you change the theme?', recent: [{ theme: true, slideIds: [], summary: ['New light colour scheme (#4C1D95 + #D97706)'] }], ok: (_o, g) => !!g?.compiled.reverts.length, want: 'the change put back' },
  { say: 'revert it', recent: [{ theme: true, slideIds: [], summary: ['New light colour scheme'] }], ok: (_o, g) => !!g?.compiled.reverts.length, want: 'the change put back' },
  { say: 'how many slides does this deck have?', ok: (o) => o.kind === 'answer', want: 'an answer, no change' },
  { say: 'hi', ok: (o) => o.kind === 'chat', want: 'small talk, no change' },
]

const filter = process.argv[2]?.toLowerCase()
let pass = 0, ran = 0
const tokens = { understand: [] as number[], write: [] as number[] }
const size = (p: { system: string; prompt: string }) => Math.round((p.system.length + p.prompt.length) / 4)
for (const c of CASES.filter((x) => !filter || x.say.toLowerCase().includes(filter))) {
  ran++
  const calls: string[] = []
  try {
    const out = await runAssistant(
      { doc, ent, instruction: c.say, activeSlideId: c.on ?? 's1', ...(c.recent ? { recent: c.recent } : {}), ...(c.conversation ? { conversation: c.conversation } : {}) },
      {
        understand: (p) => { tokens.understand.push(size(p)); calls.push(`understand ~${size(p)}`); return gateway.run({ route: 'fast', requestType: 'assist_understand', ...p, schema: intentSchema, ctx: { userId: 'assistant-eval' }, maxOutputTokens: 900, thinkingBudget: 0 }) },
        write: (p, schema, route, card) => { tokens.write.push(size(p)); calls.push(`${card} ~${size(p)}`); return gateway.run({ route, ...(route === 'quality' && process.env['EVAL_MODEL'] ? { model: process.env['EVAL_MODEL'] } : {}), requestType: 'assist_write', ...p, schema, ctx: { userId: 'assistant-eval' }, maxOutputTokens: 8000 }) },
      },
    )
    const g = D(out)
    const ok = c.ok(out, g)
    if (ok) pass++
    const what = !g ? out.kind : [
      ...g.compiled.edits.map((e) => `${e.slideId}:${e.content.layout}`), ...g.compiled.backgrounds.map((b) => `bg ${b.slideId} ${b.color}`), ...(g.compiled.theme ? ['deck theme'] : []),
      ...g.compiled.photos.map((p) => `photo ${p.slideId}/${p.placement} [${p.query}]`), ...g.compiled.images.map((i) => `AI picture ${i.slideId}/${i.placement}`), ...g.compiled.additions.map((a) => `new slide after ${a.afterSlideId ?? 'start/end'}`),
      ...g.compiled.reverts.map(() => 'put back'), ...(g.compiled.rewrite ? ['rewrite'] : []), ...g.slideOps.removals.map((x) => `delete ${x}`), ...g.slideOps.moves.map((m) => `move ${m.slideId}`), ...g.slideOps.clearPictures.map((x) => `clear pictures ${x}`),
    ].join(', ') || '(nothing)'
    console.log(`${ok ? 'PASS' : 'FAIL'}  "${c.say}"\n        wanted: ${c.want}\n        got:    ${what}${g?.notes.length ? `\n        notes:  ${g.notes.join(' | ')}` : ''}${out.kind === 'ask' ? `\n        asked:  ${out.question.text}` : ''}\n        calls:  ${calls.join(', ')}`)
  } catch (e) {
    console.log(`ERROR "${c.say}": ${(e as Error).message.slice(0, 200)}\n        calls:  ${calls.join(', ')}`)
  }
}
const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length))
console.log(`\n${pass}/${ran} right | understand: ${tokens.understand.length} calls, ~${avg(tokens.understand)} tokens in each | writing: ${tokens.write.length} calls, ~${avg(tokens.write)} tokens in each (largest ~${Math.max(0, ...tokens.write)})`)
await pool.end()
process.exit(pass === ran ? 0 : 1)
