/**
 * The honesty floor with the REAL understanding model (cheapest route; a few cents; refuses in production). Does a real model
 *   - route "what can you do?" to discovery,
 *   - keep what the assistant cannot do OUT of the edits (shapes, charts, transitions, per-object animation, crop, group...) instead of doing something nearby,
 *   - use the selection for "this" / "it", ask ONE question when nothing is selected or several objects match, and never guess,
 *   - pick the right object operation, the saved brand, the person's own upload?
 * Every case checks the RESULT (what would be applied), never the model's wording.
 *   pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/assistant-eval-honesty.ts [filter-word]
 * Add a phrase whenever a real chat goes wrong: every bad chat becomes a case here, never a new prompt rule.
 */
import { templateSlides } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import { gateway } from '../src/ai/gateway.ts'
import { runAssistant, type AssistantOutcome } from '../src/assistant/pipeline.ts'
import { elementOpsAnswer, intentSchema } from '../src/assistant/understand.ts'
import { isProd } from '../src/env.ts'
import { pool } from '../src/db/index.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
/** the websites the assistant asked to read in the case that is running (the reader here is a fake: no network) */
let siteAsked: string[] = []
let n = 0
const built = templateSlides('pitch-seed-round', '16:9', () => `e${n++}`, 'https://x/template-assets')!
const doc = {
  schemaVersion: 1, id: 'eval', title: 'Seed round', aspectRatio: '16:9', language: 'en', theme: built.theme, sources: [],
  slides: built.slides.map((s, i) => ({ id: `s${i + 1}`, locked: false, validation: { status: 'passed', issues: [] }, ...s })),
} as unknown as Presentation
const pic = (id: string, x: number, y: number) => ({ id, type: 'image', src: 'https://x/a.png', alt: 'a', x, y, width: 500, height: 320, rotation: 0, locked: false, zIndex: 9, opacity: 1, fit: 'cover', clip: 'none' }) as never
// slides picked by what they CONTAIN (never by number): one with a title and body text and no picture of its own (it gets ONE picture), another such slide that gets TWO pictures
const hasRole = (s: Presentation['slides'][number], role: string) => s.elements.some((e) => e.type === 'text' && e.role === role)
const plain = doc.slides.filter((s) => hasRole(s, 'title') && hasRole(s, 'body') && !s.elements.some((e) => e.type === 'image'))
const ONE = plain[0]!, TWO = plain[1]!
ONE.elements.push(pic('pic', 1100, 300), { id: 'tbl', type: 'table', x: 100, y: 450, width: 900, height: 300, rotation: 0, locked: false, zIndex: 2, opacity: 1, header: ['Plan', 'Price', 'Seats'], rows: [['Basic', '$1,150', '5'], ['Pro', '$2,340', '20'], ['Team', '$1,875', '10']] } as never, { id: 'cht', type: 'chart', x: 1000, y: 450, width: 700, height: 400, rotation: 0, locked: false, zIndex: 2, opacity: 1, chartType: 'bar', labels: ['A', 'B', 'C'], series: [{ name: 'S', values: [3, 9, 5] }] } as never, { id: 'shp', type: 'shape', shape: 'rect', x: 100, y: 800, width: 300, height: 120, rotation: 0, locked: false, zIndex: 2, opacity: 1, fill: 'primary', radius: 0 } as never); TWO.elements.push(pic('picA', 100, 300), pic('picB', 1100, 300))
const textOf = (s: Presentation['slides'][number], role: string) => s.elements.find((e) => e.type === 'text' && e.role === role)?.id
const title2 = textOf(ONE, 'title'), body2 = textOf(ONE, 'body')
const S1 = ONE.id, S2 = TWO.id
const ent = { features: { advancedEditor: true, aiEdits: true, brandKit: true, modelTiers: ['starter', 'premium', 'frontier'], premiumTemplates: true }, plan: { id: 'gold', name: 'Gold' } } as never
const brand = { name: 'Acme', primary: '#0A7D5A', accent: '#F59E0B', headingFont: 'Poppins', bodyFont: 'Inter', logo: null }
const uploads = [{ id: 'u1', url: 'https://x/tea.png', name: 'tea leaves' }, { id: 'u2', url: 'https://x/coffee.png', name: 'coffee beans' }]

type Got = Extract<AssistantOutcome, { kind: 'done' }>
const D = (o: AssistantOutcome): Got | null => (o.kind === 'done' ? o : null)
const changed = (g: Got | null) => !!g && (g.compiled.edits.length + g.compiled.additions.length + g.compiled.backgrounds.length + g.compiled.photos.length + g.compiled.images.length + g.slideOps.elementChanges.length + g.slideOps.transitions.length + g.slideOps.removals.length + g.slideOps.moves.length + g.slideOps.duplicates.length + g.slideOps.locks.length + g.slideOps.swaps.length + g.slideOps.cutouts.length + g.slideOps.gradients.length + g.slideOps.clearPictures.length > 0 || !!g.compiled.theme || g.slideOps.brandThemes.length > 0 || !!g.compiled.rewrite)
const says = (g: Got | null, re: RegExp) => !!g && g.notes.some((x) => re.test(x))
const ops = (g: Got | null) => (g?.slideOps.elementChanges ?? [])

interface Case { say: string; on?: string; selected?: (string | undefined)[]; ctx?: { brand?: typeof brand | null; uploads?: typeof uploads }; ok: (o: AssistantOutcome, g: Got | null) => boolean; want: string }
const UNSUPPORTED = (say: string, selected?: string[]): Case => ({ say, on: S1, ...(selected ? { selected } : {}), ok: (o, g) => (o.kind === 'done' || o.kind === 'answer') && !changed(g) && (o.kind === 'answer' || says(g, /can't do that (yet|from the chat)/i)), want: 'NOT supported: said so, nothing changed (and nothing nearby done instead)' })
const CASES: Case[] = [
  // discovery
  { say: 'what can you do?', ok: (o) => o.kind === 'answer' && /Here is what I can do/.test((o as { text: string }).text), want: 'the generated list of abilities' },
  { say: 'what can you edit on this slide?', on: S1, ok: (o) => o.kind === 'answer' && new RegExp(`On slide ${doc.slides.indexOf(ONE) + 1} I can`).test((o as { text: string }).text), want: 'the generated list for the slide on screen' },
  { say: 'which features are available on my plan?', ok: (o) => o.kind === 'answer' && /plan/.test((o as { text: string }).text), want: 'the generated plan answer' },
  { say: 'help', ok: (o) => o.kind === 'answer' || o.kind === 'chat', want: 'help, not an edit' },
  // what it cannot do: must stay unsupported
  // data it was never given: the slide is NOT made up (a chart or priced table without the person's figures is refused, and the reason is said)
  { say: 'add a pie chart showing our market share', ok: (_o, g) => !g?.compiled.additions.some((a) => a.content.layout === 'chart') && says(g, /figures .* not in your message, your deck or your sources/i), want: 'REFUSED: no invented figures, the reason said' },
  { say: 'add a table of our three support tiers with their monthly prices', ok: (_o, g) => !g?.compiled.additions.some((a) => a.content.layout === 'table') && says(g, /figures .* not in your message, your deck or your sources/i), want: 'REFUSED: no invented prices, the reason said' },
  { say: 'add a chart: our market share is 40% Northwind, 35% Acme and 25% others', ok: (_o, g) => !!g?.compiled.additions.some((a) => a.content.layout === 'chart') && !says(g, /figures/i), want: 'a chart made from the figures the person GAVE' },
  { say: 'add a rectangle behind the heading', on: S1, ok: (_o, g) => ops(g).some((c) => c.add?.shape === 'rect' && c.add.zIndex !== undefined), want: 'a rectangle added around the heading, behind it' },
  { say: 'add a circle in the centre of this slide', on: S1, ok: (_o, g) => ops(g).some((c) => c.add?.shape === 'ellipse'), want: 'a circle added' },
  { say: 'make this shape orange', on: S1, selected: ['shp'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'shp' && !!c.patch?.fill), want: 'the selected shape recoloured' },
  { say: 'sort the table by price, highest first', on: S1, ok: (_o, g) => ops(g).some((c) => c.elementId === 'tbl' && c.patch?.rows?.[0]?.[0] === 'Pro'), want: 'table rows re-ordered by price (Pro first)' },
  { say: 'rename the Price column to Cost', on: S1, selected: ['tbl'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'tbl' && c.patch?.header?.[1] === 'Cost'), want: 'header renamed, nothing else touched' },
  { say: 'set the price of Basic to $1,200', on: S1, selected: ['tbl'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'tbl' && c.patch?.rows?.[0]?.[1]?.includes('1,200')), want: 'ONE cell set to the figure the person typed' },
  { say: 'raise the price of Pro a bit', on: S1, selected: ['tbl'], ok: (_o, g) => !ops(g).some((c) => c.elementId === 'tbl' && c.patch?.rows?.some((r) => /\d/.test(r[1] ?? '') && !['$1,150', '$2,340', '$1,875'].includes(r[1]!))), want: 'never invents the new price (refused, asked, or unchanged)' },
  { say: 'set B to 12 in the chart', on: S1, selected: ['cht'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'cht' && c.patch?.series?.[0]?.values?.[1] === 12), want: 'one figure set to the typed number' },
  { say: 'make B in the chart much bigger', on: S1, selected: ['cht'], ok: (_o, g) => !ops(g).some((c) => c.elementId === 'cht' && c.patch?.series), want: 'never invents the new figure' },
  { say: 'add two more rows to the table', on: S1, ok: (_o, g) => ops(g).some((c) => c.elementId === 'tbl' && c.patch?.rows?.length === 5 && c.patch.rows.slice(3).every((r) => r.every((x) => x === ''))), want: 'two EMPTY rows added (no invented text)' },
  { say: 'make the chart a line chart', on: S1, selected: ['cht'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'cht' && c.patch?.chartType === 'line'), want: 'chart type line' },
  { say: 'sort the chart from high to low', on: S1, selected: ['cht'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'cht' && c.patch?.labels?.[0] === 'B'), want: 'chart sorted (B first)' },
  { say: 'add a row to the table with the numbers for our Enterprise plan', on: S1, ok: (_o, g) => !ops(g).some((c) => c.elementId === 'tbl' && c.patch?.rows?.some((r) => r.some((x) => /enterprise/i.test(x)))), want: 'never writes Enterprise figures: at most an EMPTY row' },
  { say: 'make this picture red', on: S1, selected: ['pic'], ok: (_o, g) => !changed(g) && says(g, /not a shape|can't do that/i), want: 'refused: a picture has no fill, nothing changed' },
  { say: 'add a zoom transition between all the slides', ok: (_o, g) => (g?.slideOps.transitions.length ?? 0) >= 5 && g!.slideOps.transitions.every((t) => t.to.type === 'zoom'), want: 'a zoom transition on every slide' },
  { say: 'make this slide arrive with a slow push from the left', on: S1, ok: (_o, g) => g?.slideOps.transitions.length === 1 && g.slideOps.transitions[0]!.to.type === 'push' && g.slideOps.transitions[0]!.to.direction === 'left' && g.slideOps.transitions[0]!.to.duration === 1000, want: 'push from the left, slow (1000 ms), on this slide only' },
  { say: 'remove all the transitions', ok: (_o, g) => (g?.slideOps.transitions.length ?? 0) >= 5 && g!.slideOps.transitions.every((t) => t.to.type === 'none'), want: 'no transition on every slide' },
  { say: 'animate every slide', ok: (_o, g) => (g?.slideOps.transitions.length ?? 0) === 0, want: 'deck motion (the animation style), NOT slide transitions' },
  { say: 'make the title fly in from the left', on: S1, ok: (_o, g) => ops(g).some((c) => c.elementId === title2 && !!c.effect && 'type' in c.effect && c.effect.type === 'fly-in' && c.effect.direction === 'left'), want: 'fly-in from the left on the title' },
  { say: 'make the title fade in after 2 seconds', on: S1, ok: (_o, g) => ops(g).some((c) => c.elementId === title2 && !!c.effect && 'type' in c.effect && c.effect.type === 'fade-in' && c.effect.delay === 2000), want: 'fade-in with a 2000 ms delay' },
  { say: 'make this picture travel in a big circle', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && !!c.effect && 'type' in c.effect && c.effect.type === 'path-circle'), want: 'a circular motion path on the picture' },
  { say: 'make this picture a circle', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && c.patch?.clip === 'circle'), want: 'the picture cropped to a circle' },
  { say: 'round the corners of this picture a little', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && c.patch?.radius === 16), want: 'small rounded corners' },
  { say: 'make this picture pulse', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && !!c.effect && 'type' in c.effect && c.effect.type === 'pulse'), want: 'a pulse emphasis on the selected picture' },
  { say: 'fade in the body text one paragraph at a time', on: S1, ok: (_o, g) => ops(g).some((c) => c.elementId === body2 && !!c.effect && 'type' in c.effect && c.effect.type === 'fade-in' && c.effect.textBy === 'paragraph'), want: 'fade-in by paragraph on the body text' },
  { say: 'take the animations off this picture', on: S1, selected: ['pic'], ok: (_o, g) => !changed(g) ? true : ops(g).some((c) => c.elementId === 'pic' && !!c.effect && 'clear' in c.effect), want: 'clear (or "nothing to remove": the picture has none)' },
  { say: 'make the picture follow a curved path across the slide', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && !!c.effect && 'type' in c.effect && String(c.effect.type).startsWith('path-')), want: 'a motion path preset (arc) on the picture' },
  { say: 'add slide numbers to every slide', ok: (_o, g) => (g?.slideOps.brandThemes ?? []).some((t) => t.style?.footer === 'number' || t.style?.footer === 'brand'), want: 'the deck footer set to show slide numbers' },
  { say: 'group the title and the body text together', on: S2, ok: (_o, g) => (g?.slideOps.elementChanges ?? []).some((c) => c.group?.to === 'group' && c.group.ids.length >= 2), want: 'the title and body grouped' },
  { say: 'ungroup these', on: S1, ok: (o, g) => !(g?.slideOps.elementChanges ?? []).some((c) => c.group?.to === 'group'), want: 'never grouped; ungroup or a note that nothing is grouped' },
  UNSUPPORTED('add a video to this slide'),
  UNSUPPORTED('add a trend line to the chart'),
  UNSUPPORTED('show the legend at the right of the chart'),
  UNSUPPORTED('change the colours of the chart bars'),
  { say: 'zoom in on this picture', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && (c.patch?.zoom ?? 0) > 1), want: 'zoom above 1 on the picture' },
  UNSUPPORTED('crop this picture to a square', ['pic']),
  { say: 'make the picture appear when I click the title', on: S1, ok: (_o, g) => ops(g).some((c) => !!c.effect && 'trigger' in c.effect && !!c.effect.trigger), want: 'an animation that plays when the title is clicked' },
  { say: 'crop this image to focus on the left side', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && (c.patch?.focus?.x ?? 1) < 0.5), want: 'the left part showing (zoomed in, or told to zoom to see it)' },
  { say: 'make this picture black and white', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && c.patch?.filter?.grayscale === 1), want: 'black and white' },
  { say: 'make the photo a bit brighter and add more contrast', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && (c.patch?.filter?.brightness ?? 1) > 1 && (c.patch?.filter?.contrast ?? 1) > 1), want: 'brighter with more contrast' },
  { say: 'give this picture a shadow', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && (c.patch?.shadow ?? 'none') !== 'none'), want: 'a shadow' },
  UNSUPPORTED('add a shadow to the heading text'),
  { say: 'bring the picture to the front', on: S1, selected: ['pic'], ok: (_o, g) => !changed(g) || ops(g).some((c) => c.elementId === 'pic' && c.layer === 'front'), want: 'front layer (or "already at the front")' },
  // objects and the selection
  { say: 'make this bigger', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).length === 1 && ops(g)[0]!.elementId === 'pic' && (ops(g)[0]!.patch?.width ?? 0) > 500, want: 'the selected picture, bigger' },
  { say: 'make it smaller', on: S1, selected: [body2], ok: (_o, g) => ops(g).length === 1 && ops(g)[0]!.elementId === body2 && (ops(g)[0]!.patch?.fontSize ?? 999) < 999, want: 'the selected text, smaller' },
  { say: 'move this to the left', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).length === 1 && ops(g)[0]!.elementId === 'pic' && (ops(g)[0]!.patch?.x ?? 9999) < 200, want: 'the selected picture at the left' },
  { say: 'make the title size 48', on: S1, ok: (_o, g) => ops(g).some((c) => c.elementId === title2 && c.patch?.fontSize === 48), want: 'the title of the slide on screen at size 48' },
  { say: 'make this bold', on: S1, selected: [body2], ok: (_o, g) => ops(g).some((c) => c.elementId === body2 && c.bold === true), want: 'the selected text bold' },
  { say: 'delete this', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && c.remove === true), want: 'the selected picture deleted' },
  { say: 'make it bigger', on: S1, ok: (o) => o.kind === 'ask', want: 'ONE question: nothing is selected, nothing named' },
  { say: 'move the picture to the right', on: S1, ok: (_o, g) => ops(g).length === 1 && ops(g)[0]!.elementId === 'pic', want: 'the only picture of that slide, moved' },
  { say: 'move the picture to the right', on: S2, ok: (o) => o.kind === 'ask', want: 'a question: this slide has TWO pictures' },
  { say: 'move this to the right', on: S2, selected: ['picA'], ok: (_o, g) => ops(g).length === 1 && ops(g)[0]!.elementId === 'picA', want: 'only the selected one of two pictures' },
  { say: 'make all the titles size 40', ok: (_o, g) => ops(g).length >= 3 && ops(g).every((c) => c.patch?.fontSize === 40), want: 'every title in the deck at 40' },
  { say: 'make the title bigger and centre it', on: S1, ok: (_o, g) => ops(g).some((c) => c.elementId === title2 && c.patch?.fontSize !== undefined), want: 'the title bigger and centred (one merged change)' },
  // brand and the person's own pictures
  { say: 'reduce the deck to 8 slides', ok: (o) => o.kind === 'ask' && /from 11 to 8 slides/.test(o.question.text) && o.question.options[0]?.confirm?.kind === 'remove' && (o.question.options[0].confirm as { slideIds: string[] }).slideIds.length === 3 && !(o.question.options[0].confirm as { slideIds: string[] }).slideIds.includes('s1'), want: 'a PLAN to confirm: exactly 3 slides to delete, never slide 1, nothing changed yet' },
  { say: 'put the slides in a better order', ok: (o, g) => (o.kind === 'ask' && o.question.options[0]?.confirm?.kind === 'reorder') || (o.kind === 'done' && !changed(g) && says(g, /could not find a better order/)), want: 'a reorder PLAN to confirm (or an honest "no better order")' },
  { say: 'delete the duplicate slides', ok: (o, g) => (o.kind === 'ask' && o.question.options[0]?.confirm?.kind === 'remove') || (o.kind === 'done' && !changed(g) && says(g, /No slide repeats/)), want: 'a plan for the repeated slides, or "none repeat"; never an unconfirmed deletion' },
  { say: 'delete the empty slides', ok: (o, g) => (o.kind === 'ask' && o.question.options[0]?.confirm?.kind === 'remove') || (o.kind === 'done' && !changed(g) && says(g, /No slide is empty/)), want: 'a plan for the empty slides, or "none are empty"' },
  { say: 'delete slide 3', ok: (o, g) => o.kind === 'done' && (g?.slideOps.removals.length ?? 0) === 1, want: 'ONE named slide is deleted directly (no plan to confirm)' },
  { say: 'move slide 2 to the end', ok: (o, g) => o.kind === 'done' && (g?.slideOps.moves.length ?? 0) === 1, want: 'ONE named slide is moved directly' },
  { say: 'merge slides 2 and 3', ok: (_o, g) => (g?.slideOps.removals.length ?? 0) === 1 && ((g?.compiled.edits.length ?? 0) === 1) || (says(g, /edited by hand|every slide involved/) && !changed(g)), want: 'ONE merged slide + the other deleted, or an honest refusal (hand-edited slide); never a deletion without the merged slide' },
  { say: 'split slide 2 into two slides', ok: (_o, g) => ((g?.compiled.additions.length ?? 0) === 1 && (g?.compiled.edits.length ?? 0) === 1) || (says(g, /edited by hand|could not split/) && !changed(g)), want: 'the slide in two (an edit + one new slide), or an honest refusal' },
  { say: 'merge slide 3', ok: (_o, g) => !changed(g), want: 'nothing changed: asks for two slides' },
  { say: 'write speaker notes for slide 2', ok: (_o, g) => (g?.compiled.edits.length ?? 0) === 1 && ((g!.compiled.edits[0]!.content as { speakerNotes?: string }).speakerNotes ?? '').length > 30, want: 'speaker notes written on that ONE slide' },
  { say: 'write speaker notes for slides 2 to 4', ok: (_o, g) => (g?.compiled.edits.length ?? 0) === 3 && g!.compiled.edits.every((x) => ((x.content as { speakerNotes?: string }).speakerNotes ?? '').length > 30), want: 'notes on all three slides' },
  { say: 'fix the problems you found', ok: (o, g) => !(o.kind === 'answer' && /I checked all/.test(o.text)) && (changed(g) || says(g, /Not fixed|nothing to fix/)), want: 'REPAIRS (shortens heavy slides, fixes hard-to-read text) and lists what needs a decision: never just a second report' },
  { say: 'clean up my deck', ok: (o, g) => !(o.kind === 'answer' && /I checked all/.test(o.text)) && (changed(g) || says(g, /Not fixed|nothing to fix/) || o.kind === 'ask'), want: 'repairs, or asks what to clean up' },
  { say: 'group the slides into sections', ok: (o) => o.kind === 'ask' && o.question.options[0]?.confirm?.kind === 'sections' && (o.question.options[0].confirm as { items: { beforeSlideId: string }[] }).items.length >= 2 && !(o.question.options[0].confirm as { items: { beforeSlideId: string }[] }).items.some((i) => i.beforeSlideId === 's1'), want: 'a PLAN of 2-6 section dividers (never before slide 1) to confirm, nothing changed yet' },
  { say: 'add section dividers to the deck', ok: (o) => o.kind === 'ask' && o.question.options[0]?.confirm?.kind === 'sections', want: 'the same section plan' },
  { say: 'how can I improve the story of my deck? what is missing?', ok: (o, g) => o.kind === 'answer' && /my opinion on your story/.test(o.text) && !changed(g), want: 'a labelled opinion on the story, nothing changed' },
  { say: 'make this picture fade in with a bounce', on: S1, selected: ['pic'], ok: (_o, g) => ops(g).some((c) => c.elementId === 'pic' && !!c.effect && 'easing' in c.effect && c.effect.easing === 'back-out'), want: 'a fade in with the back-out (bounce) easing' },
  { say: 'make all the titles the same size', ok: (_o, g) => { const sizes = ops(g).map((c) => c.patch?.fontSize).filter((z) => z !== undefined); return sizes.length >= 1 && new Set(sizes).size === 1 }, want: 'font size changes that all end at one size (or already the same)' },
  { say: 'make the background of slide 1 dark, lock slide 2, duplicate slide 3, move slide 4 to the end, add slide numbers and animate every slide', ok: (o) => o.kind === 'done' && (o.later?.length ?? 0) > 0 && /step by step/.test(o.notes.join(' ')), want: 'the first four parts done, the rest named for the next step' },
  { say: 'update the text color to red', ok: (_o, g) => !g?.compiled.theme && (g?.slideOps.brandThemes.length ?? 0) === 0 && ops(g).length > 0 && ops(g).every((c) => c.patch?.color?.toLowerCase() === '#ff0000' || /^#(f|e)[0-9a-f]0{0,2}[0-3][0-9a-f]{0,3}$/i.test(c.patch?.color ?? '')), want: 'the TEXT colour of the slides changed to red (no theme or background change)' },
  { say: 'i want to update the text color to off white', ok: (_o, g) => !g?.compiled.theme && (g?.slideOps.brandThemes.length ?? 0) === 0 && ops(g).length > 0 && ops(g).every((c) => !!c.patch?.color), want: 'the TEXT colour changed (no theme or background change)' },
  { say: 'make the heading text blue on slide 1', on: S1, ok: (_o, g) => !g?.compiled.theme && ops(g).length > 0 && ops(g).every((c) => !!c.patch?.color), want: 'the heading text colour on slide 1 only' },
  { say: 'change the background colour to dark blue', ok: (_o, g) => ops(g).length === 0 && (!!g?.compiled.theme || g!.compiled.backgrounds.length > 0), want: 'a background or colour-scheme change, NOT a text-colour change' },
  { say: 'review my deck', ok: (o, g) => o.kind === 'answer' && /I checked all \d+ slides/.test(o.text) && !changed(g), want: 'the code-built review report, nothing changed' },
  { say: 'what is wrong with my slides?', ok: (o, g) => o.kind === 'answer' && /I checked all \d+ slides/.test(o.text) && !changed(g), want: 'the review report' },
  { say: 'find the slides that have too much text', ok: (o, g) => o.kind === 'answer' && /I checked all \d+ slides/.test(o.text) && /too much text/.test(o.text) && !changed(g), want: 'a review that covers text length (focus text or all)' },
  { say: 'check whether my deck looks consistent and readable', ok: (o, g) => o.kind === 'answer' && /I checked all \d+ slides/.test(o.text) && !changed(g), want: 'the review report (design)' },
  { say: 'shorten every slide that has too much text', ok: (o) => !(o.kind === 'answer' && /I checked all/.test(o.text)), want: 'an EDIT or a question, not the review report' },
  { say: 'make the deck match the brand of acme.com', ctx: { brand }, ok: (_o, g) => (g?.slideOps.brandThemes.length ?? 0) === 1 && siteAsked.length === 1 && /acme\.com/i.test(siteAsked[0]!), want: 'the WEBSITE brand (reads acme.com), not the saved brand' },
  { say: 'match the brand of my company website', ctx: { brand }, ok: (_o, g) => !changed(g) && (g?.slideOps.brandThemes.length ?? 0) === 0 && siteAsked.length === 0, want: 'asks for the address OR reads nothing: never invents one' },
  { say: 'use my uploaded logo and take the colours from it', ctx: { brand, uploads: [{ id: 'u9', url: 'https://x/acme-logo.png', name: 'acme logo' }] }, ok: (_o, g) => (g?.slideOps.brandThemes.length ?? 0) === 1 && g!.slideOps.brandThemes[0]!.brand?.logo?.src === 'https://x/acme-logo.png' && siteAsked.length === 0, want: 'the uploaded logo as the brand logo, colours from it' },
  { say: 'use my brand', ctx: { brand }, ok: (_o, g) => (g?.slideOps.brandThemes.length ?? 0) === 1 && siteAsked.length === 0, want: 'the SAVED brand (no website read)' },
  { say: 'use my brand', ctx: { brand }, ok: (_o, g) => (g?.slideOps.brandThemes.length ?? 0) === 1, want: 'the saved brand applied' },
  { say: 'apply my brand colours but keep the fonts', ctx: { brand }, ok: (_o, g) => (g?.slideOps.brandThemes.length ?? 0) === 1 && g!.slideOps.brandThemes[0]!.fonts.heading !== 'Poppins', want: 'brand colours only' },
  { say: 'use my brand', ctx: { brand: null }, ok: (_o, g) => !changed(g) && says(g, /no saved brand/i), want: 'said: no saved brand, nothing changed' },
  { say: 'use my coffee photo here', on: S1, selected: ['pic'], ctx: { uploads }, ok: (_o, g) => g?.slideOps.swaps[0]?.url === 'https://x/coffee.png', want: "the 'coffee beans' upload replaces the selected picture" },
  { say: 'replace this image with my latest upload', on: S1, selected: ['pic'], ctx: { uploads }, ok: (_o, g) => g?.slideOps.swaps[0]?.url === 'https://x/tea.png', want: 'the newest upload' },
  // vague and multi-step
  { say: 'make this slide look better', on: S1, ok: (o, g) => (o.kind === 'ask' ? !changed(g) : true), want: 'acts on the slide, or ASKS first (a question or a plan to confirm): never applies a deck-wide change unconfirmed' },
  { say: 'make the theme dark and add a thank you slide at the end', ok: (_o, g) => !!g?.compiled.theme && g.compiled.additions.length === 1, want: 'both: dark theme and a new slide' },
  { say: 'make the theme dark, and also add a pie chart of our revenue', ok: (_o, g) => !!g?.compiled.theme && !g.compiled.additions.some((a) => a.content.layout === 'chart') && says(g, /figures|can't do that yet/i), want: 'the dark theme done, the chart refused with the reason (no figures given)' },
]

const filter = process.argv[2]?.toLowerCase()
let pass = 0, ran = 0
const fails: string[] = []
for (const c of CASES.filter((x) => !filter || x.say.toLowerCase().includes(filter))) {
  ran++
  const calls: string[] = []
  siteAsked = []
  try {
    const out = await runAssistant(
      { doc, ent, instruction: c.say, activeSlideId: c.on ?? 's1', selection: { slideIds: [], elementIds: (c.selected ?? []).filter((x): x is string => !!x) }, uploads: c.ctx?.uploads ?? [], logoBrand: async () => ({ ok: true as const, primary: '#0a7d5a', accent: null, aspect: 2 }), brand: c.ctx && 'brand' in c.ctx ? (c.ctx.brand ?? null) : null, siteBrand: async (u: string) => { siteAsked.push(u); return { ok: true as const, brand: { host: 'acme.com', name: 'Acme', primary: '#0A7D5A', accent: '#F59E0B', accentDerived: false, heading: { family: 'Poppins', original: 'Poppins', exact: true }, body: { family: 'Inter', original: 'Inter', exact: true }, logo: null, confidence: 'high' as const } } }, isOwner: true, flags: { background_removal: false, image_generation: true }, planName: 'Gold' },
      {
        understandOps: async (p) => { calls.push('understand_objects'); const r = await gateway.run({ route: 'fast', requestType: 'assist_understand', ...p, schema: elementOpsAnswer, ctx: { userId: 'assistant-eval' }, maxOutputTokens: 1200, thinkingBudget: 0 }); if (process.env['SHOW_INTENT'] && c.say.includes(process.env['SHOW_INTENT'])) console.log('   objects:', JSON.stringify(r).slice(0, 700)); return r },
        understand: async (p) => { calls.push('understand'); const r = await gateway.run({ route: 'fast', requestType: 'assist_understand', ...p, schema: intentSchema, ctx: { userId: 'assistant-eval' }, maxOutputTokens: 900, thinkingBudget: 0 }); if (process.env['SHOW_INTENT'] && c.say.includes(process.env['SHOW_INTENT'])) console.log('   intent:', JSON.stringify((r as { data?: unknown }).data ?? r).slice(0, 700)); return r },
        write: (p, schema, route, card) => { calls.push(card); return gateway.run({ route, requestType: 'assist_write', ...p, schema, ctx: { userId: 'assistant-eval' }, maxOutputTokens: 8000 }) },
      },
    )
    const g = D(out)
    if (process.env['SHOW'] && g) for (const a of g.compiled.additions) console.log('        content:', JSON.stringify(a.content).slice(0, 600))
    const ok = c.ok(out, g)
    if (ok) pass++; else fails.push(c.say)
    const what = !g ? `${out.kind}${out.kind === 'ask' ? `: ${out.question.text}` : out.kind === 'answer' ? `: ${out.text.slice(0, 80)}` : ''}` : [
      ...ops(g).map((x) => `${x.verb.replace('{}', x.desc)} ${JSON.stringify(x.patch ?? {})}${x.bold !== undefined ? ' bold' : ''}${x.remove ? ' delete' : ''}`), ...g.compiled.edits.map((e) => `edit ${e.slideId}:${e.content.layout}`), ...(g.compiled.theme ? ['deck theme'] : []),
      ...g.compiled.readability.map((x) => `readable ${x}`), ...g.compiled.backgrounds.map((b) => `bg ${b.slideId}`), ...g.compiled.photos.map((p) => `photo ${p.slideId}`), ...g.slideOps.brandThemes.map((t) => `brand theme (${t.fonts.heading})`), ...g.slideOps.swaps.map((s) => `swap -> ${s.url}`), ...g.compiled.additions.map(() => 'new slide'),
    ].join(', ') || '(nothing changed)'
    console.log(`${ok ? 'PASS' : 'FAIL'}  "${c.say}"${c.selected ? ` [selected ${c.selected.filter(Boolean).join(',')}]` : ''}\n        wanted: ${c.want}\n        got:    ${what}${g?.notes.length ? `\n        notes:  ${g.notes.join(' | ').slice(0, 220)}` : ''}\n        calls:  ${calls.join(', ')}`)
  } catch (e) {
    fails.push(c.say)
    console.log(`ERROR "${c.say}": ${(e as Error).message.slice(0, 200)}`)
    for (const cause of ((e as { causes?: string[] }).causes ?? []).slice(0, 3)) console.log(`   cause: ${String(cause).slice(0, 420)}`)
  }
}
console.log(`\n${pass}/${ran} right${fails.length ? `\nfailed: ${fails.join(' | ')}` : ''}`)
await pool.end()
process.exit(pass === ran ? 0 : 1)
