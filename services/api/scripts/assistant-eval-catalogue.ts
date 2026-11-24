/**
 * The catalogue (src/assistant/catalogue.ts) against the REAL understanding model (the cheapest route; one call per phrasing; refuses in production).
 * Every phrasing is read with its OWN entry left out of the examples, so this measures understanding, not copying. Run it after every guide or catalogue change.
 *   pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/assistant-eval-catalogue.ts [--no-examples] [filter words]
 * Gate (docs/AI_EDIT_V3_ARCHITECTURE.md §11): ≥ 95% of the phrasings read right.
 */
import { composeSlide, getTheme } from '@prompttoppt/theme'
import type { Presentation, SlideContent } from '@prompttoppt/validation'
import { gateway } from '../src/ai/gateway.ts'
import { CATALOGUE, matches } from '../src/assistant/catalogue.ts'
import { buildState } from '../src/assistant/state.ts'
import { resolveTargets } from '../src/assistant/resolve.ts'
import { CAPABILITIES } from '../src/assistant/capabilities/index.ts'
import { intentSchema, understandPrompt, type Intent } from '../src/assistant/understand.ts'
import { isProd } from '../src/env.ts'
import { pool } from '../src/db/index.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const args = process.argv.slice(2)
const noExamples = args.includes('--no-examples')
const filter = args.filter((a) => !a.startsWith('--')).join(' ').toLowerCase()

// a 12-slide deck with the slide kinds people refer to (a timeline, a comparison, picture slides, a thank-you page)
const theme = getTheme('cobalt')
let k = 0
const tb = (title: string): SlideContent => ({ layout: 'title-body', title, bullets: ['A first point about it', 'A second point about it', 'A third point about it'], speakerNotes: '', sources: [] }) as SlideContent
const contents: SlideContent[] = [
  { layout: 'title', title: 'A P J Abdul Kalam', subtitle: 'The Missile Man of India', speakerNotes: '', sources: [] } as SlideContent,
  { layout: 'agenda', title: 'Journey overview', items: [{ label: 'Early life' }, { label: 'Education' }, { label: 'Science' }, { label: 'Presidency' }], speakerNotes: '', sources: [] } as unknown as SlideContent,
  { layout: 'split-image-text', title: 'Early life', bullets: ['Born in Rameswaram', 'Sold newspapers as a boy', 'Loved mathematics'], imagePrompt: 'coastal town', imageAlt: 'coast', speakerNotes: '', sources: [] } as SlideContent,
  { layout: 'timeline', title: 'Academic Pursuits', steps: [{ label: 'School', detail: 'Schwartz school' }, { label: 'Physics', detail: 'St Joseph’s' }, { label: 'Aeronautics', detail: 'MIT Madras' }, { label: 'First project', detail: 'Hovercraft' }], speakerNotes: '', sources: [] } as unknown as SlideContent,
  tb('Work at ISRO and DRDO'), tb('The Missile Man legacy'), tb('The People’s President'), tb('Vision for young people'),
  { layout: 'split-image-text', title: 'National impact', bullets: ['Inspired students', 'Wrote books', 'Visited villages'], imagePrompt: 'students', imageAlt: 'students', speakerNotes: '', sources: [] } as SlideContent,
  tb('Awards and honours'),
  { layout: 'comparison', title: 'Then and now', left: { heading: 'Then', bullets: ['a', 'b', 'c'] }, right: { heading: 'Now', bullets: ['d', 'e', 'f'] }, speakerNotes: '', sources: [] } as unknown as SlideContent,
  { layout: 'thank-you', title: 'Thank you', subtitle: 'Questions are welcome', speakerNotes: '', sources: [] } as SlideContent,
]
const doc = { schemaVersion: 1, id: 'eval', title: 'Kalam', aspectRatio: '16:9', language: 'en', theme, sources: [], slides: contents.map((c, i) => ({ id: `s${i + 1}`, locked: false, validation: { status: 'passed', issues: [] }, ...composeSlide(c, theme, '16:9', () => `e${k++}`) })) } as unknown as Presentation
const pictureOf = (slideNo: number) => doc.slides[slideNo - 1]!.elements.find((e) => e.type === 'image' && !e.decorative)?.id

const entries = CATALOGUE.filter((e) => !filter || e.say.toLowerCase().includes(filter))
const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no answer in ${ms / 1000} s`)), ms))])
const stateFor = (context?: string, screen?: number) => {
  // the screen as the phrasing assumes it: a picture selected on slide 3, else the slide the entry names, else slide 4 (the timeline)
  const picture = context?.includes('picture is selected')
  return buildState(doc, { activeSlideId: picture ? 's3' : `s${screen ?? 4}`, selection: picture ? { slideIds: ['s3'], elementIds: [pictureOf(3)!] } : undefined })
}
async function read(say: string, context?: string, screen?: number): Promise<Intent> {
  const state = stateFor(context, screen)
  const p = understandPrompt(state, say, [], { except: say, examples: !noExamples })
  for (let attempt = 1; ; attempt++) {
    try { return await withTimeout(gateway.run({ route: 'fast', requestType: 'assist_understand', ...p, schema: intentSchema, ctx: { userId: 'assistant-eval' }, maxOutputTokens: 900, thinkingBudget: 0 }) as Promise<Intent>, 60_000) } catch (e) { if (attempt >= 2) throw e }
  }
}

let ok = 0
const misses: string[] = []
const pending: string[] = []
for (const e of entries) {
  if (e.pending) { pending.push(`${e.say} (${e.pending})`); continue }
  try {
    const got = await read(e.say, e.context, e.screen)
    const state = stateFor(e.context, e.screen)
    // targets compared by the slides they mean; a deck-wide family takes no slides
    const slidesOf = (family: string, refs: unknown[]) => { const cap = CAPABILITIES[family as keyof typeof CAPABILITIES]; if (!cap || cap.scope === 'deck' || family === 'add_slide' || family === 'undo') return null; const r = resolveTargets(state, refs as never, { instruction: e.say }); return r.ok ? r.ids : ['(unresolved)'] }
    const m = matches(e, { kind: got.kind, review: got.review, tasks: got.tasks.map((t) => ({ family: t.family, targets: t.targets, values: t.values })) }, slidesOf)
    if (m.ok) { ok++; console.log(`  ✓ ${e.say}`) } else { misses.push(`${e.say}: ${m.why}`); console.log(`  ✗ ${e.say}\n      ${m.why}\n      got ${JSON.stringify({ kind: got.kind, tasks: got.tasks.map((t) => ({ family: t.family, targets: t.targets, values: t.values })) }).slice(0, 300)}`) }
  } catch (err) { misses.push(`${e.say}: ERROR ${(err as Error).message.slice(0, 120)}`); console.log(`  ! ${e.say}: ${(err as Error).message.slice(0, 160)}`) }
}
const judged = entries.length - pending.length
const pct = Math.round((ok / judged) * 1000) / 10
if (pending.length) console.log(`\nnot judged yet (needs a later phase):\n  ${pending.join('\n  ')}`)
console.log(`\n${noExamples ? 'WITHOUT examples' : 'with examples (own entry left out)'}: ${ok}/${judged} read right (${pct}%) — gate 95%`)
await pool.end()
process.exit(0)
