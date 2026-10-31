/**
 * Typography audit: how big is the text on real slides, and how consistent is it across a deck?
 *   tsx --env-file-if-exists=.env scripts/type-audit.ts            → AI-generated decks stored in the database + every template design
 * Canvas is 1920 px wide = 13.33 in, so 1 pt = 2 px: body 18 pt = 36 px, titles 36 pt = 72 px.
 */
import { and, eq, sql } from 'drizzle-orm'
import { DESIGNS, composeDeck, designById, estimateTextHeight, metricOptsFor, templateSlides, validateSlide } from '@prompttoppt/theme'
import type { Presentation, Slide, SlideContent, TextElement } from '@prompttoppt/validation'
import { db, pool } from '../src/db/index.ts'
import { presentation, presentationVersion } from '../src/db/schema.ts'

const FLOOR: Record<string, number> = { title: 56, subtitle: 28, heading: 30, body: 30, quote: 40, caption: 24, metric: 30 }
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0 }
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–')

const COVER = new Set(['title', 'section-divider', 'thank-you'])
function audit(label: string, docs: Presentation[]) {
  const sizes: Record<string, number[]> = {}
  let groups = 0, uniform = 0, ratioSum = 0, deckCount = 0, tiny = 0, texts = 0
  for (const d of docs) {
    deckCount++
    // like text = same role on the same layout (all content-slide titles are one group): inside a group the size should not wander
    const by = new Map<string, number[]>()
    for (const s of d.slides) for (const e of s.elements) {
      if (e.type !== 'text') continue
      const t = e as TextElement
      texts++; (sizes[t.role] ??= []).push(t.fontSize)
      if (t.fontSize < 24) tiny++
      if (t.role === 'metric' || t.role === 'quote' || t.rotation) continue
      const k = t.role === 'title' && !COVER.has(s.layoutId) ? 'title|content' : `${t.role}|${s.layoutId}`
      by.set(k, [...(by.get(k) ?? []), t.fontSize])
    }
    for (const arr of by.values()) if (arr.length >= 2) { groups++; const r = Math.max(...arr) / Math.min(...arr); ratioSum += r; if (r === 1) uniform++ }
  }
  console.log(`\n── ${label}: ${deckCount} decks, ${texts} text boxes, ${pct(tiny, texts)} under 24 px (12 pt)`)
  console.log('role       n     min  median  max   below-floor')
  for (const [role, arr] of Object.entries(sizes).sort()) {
    const f = FLOOR[role] ?? 24
    console.log(`${role.padEnd(9)} ${String(arr.length).padStart(5)}  ${String(Math.min(...arr)).padStart(4)}  ${String(med(arr)).padStart(5)}  ${String(Math.max(...arr)).padStart(4)}   ${pct(arr.filter((x) => x < f).length, arr.length)} (< ${f}px)`)
  }
  console.log(`like text (same role, same layout) at ONE size: ${pct(uniform, groups)} of groups; average wander (largest ÷ smallest) ${(ratioSum / Math.max(1, groups)).toFixed(2)}×  (1.00× = consistent)`)
}

const rows = await db
  .select({ doc: presentationVersion.document })
  .from(presentation)
  .innerJoin(presentationVersion, and(eq(presentationVersion.presentationId, presentation.id), eq(presentationVersion.version, presentation.latestVersion)))
  .where(sql`${presentationVersion.createdBy} = 'generation' and ${presentation.title} not like 'QA-GALLERY%'`)
const gen = rows.map((r) => r.doc as Presentation)
if (gen.length) {
  audit('AI-generated decks in the database', gen)
  const ids = gen.map((d) => d.theme.templateId ?? '(none)'), modes = gen.map((d) => d.theme.colors.background)
  console.log(`designs used: ${[...new Set(ids)].join(', ')}   backgrounds: ${[...new Set(modes)].join(', ')}`)
} else console.log('no AI-generated decks in this database')
let k = 0
const tpl = DESIGNS.map((d) => { const t = templateSlides(d.id, '16:9', () => `i${k++}`); return t ? ({ schemaVersion: 1, id: d.id, title: d.name, aspectRatio: '16:9', language: 'en', theme: t.theme, sources: [], slides: t.slides.map((s, i) => ({ id: `s${i}`, locked: false, validation: { status: 'pending', issues: [] }, ...s })) } as unknown as Presentation) : null }).filter((x): x is Presentation => !!x)
// Re-compose the stored slide contents of every 4th AI deck with TODAY'S layout code: sizes plus how many boxes overflow (the same contents, so before/after is comparable)
const photo = { src: 'https://x.test/p.jpg', alt: 'p' }
let overflow = 0, slidesN = 0, k2 = 0
const fills: Record<string, number[]> = {}
const re = gen.filter((_, i) => i % 4 === 0).map((d) => {
  const kept = d.slides.filter((sl) => sl.content)
  const design = { ...((d.theme.templateId ? designById(d.theme.templateId) : undefined) ?? DESIGNS[0]!), theme: d.theme }
  const composed = composeDeck(kept.map((sl) => sl.content as SlideContent), design, d.aspectRatio, () => `r${k2++}`, 'https://x.test/template-assets', undefined, kept.map(() => photo))
  const slides = composed.map((c, i) => {
    const full = { id: `s${i}`, locked: false, validation: { status: 'pending', issues: [] }, ...c } as unknown as Slide
    slidesN++; overflow += validateSlide(full, d.theme).filter((x) => x.code === 'overflow' && x.severity === 'error').length
    // how much of each tall text box the words really fill (text height ÷ box height): low = text looks lost in a big empty box
    for (const e of c.elements) if (e.type === 'text' && (e.role === 'body' || e.role === 'caption') && e.height > 120) (fills[c.layoutId] ??= []).push(Math.min(1.2, estimateTextHeight(e.paragraphs, e.fontSize, e.width, metricOptsFor(e as TextElement, d.theme)) / e.height))
    return full
  })
  return { ...d, slides } as Presentation
})
audit('the SAME stored contents re-composed with the current layout code (sample)', re)
console.log(`overflowing text boxes in that sample: ${overflow} over ${slidesN} slides`)
console.log('median fill of tall text boxes by layout: ' + Object.entries(fills).filter(([, v]) => v.length >= 20).map(([l, v]) => `${l} ${Math.round([...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]! * 100)}%`).join(' · '))
audit(`template decks (all ${tpl.length} designs)`, tpl)
await pool.end()
