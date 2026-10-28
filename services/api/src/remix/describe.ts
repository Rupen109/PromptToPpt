import type { Presentation } from '@prompttoppt/validation'

/** Keys that say nothing about a slide's message (pictures, citations, styling): left out so the text stays short. */
const SKIP = new Set(['layout', 'sources', 'imageUrl', 'imageAttribution', 'imagePrompt', 'speakerNotes', 'id'])

const label = (k: string) => k.replace(/([A-Z])/g, ' $1').toLowerCase()

/** One value as compact lines: strings and numbers kept exactly (charts and metrics must keep their figures), lists as bullets. */
function lines(v: unknown, key: string, depth: number): string[] {
  const pad = '  '.repeat(depth)
  if (v === null || v === undefined || v === '') return []
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return [`${pad}${label(key)}: ${v}`]
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string' || typeof x === 'number')) return [`${pad}${label(key)}: ${v.join(' | ')}`]
    return [`${pad}${label(key)}:`, ...v.flatMap((x, i) => (x && typeof x === 'object' ? [`${pad}  ${i + 1}.`, ...Object.entries(x as Record<string, unknown>).flatMap(([k, y]) => (SKIP.has(k) ? [] : lines(y, k, depth + 2)))] : lines(x, key, depth + 1)))]
  }
  if (typeof v === 'object') return [`${pad}${label(key)}:`, ...Object.entries(v as Record<string, unknown>).flatMap(([k, y]) => (SKIP.has(k) ? [] : lines(y, k, depth + 1)))]
  return []
}

type El = { type: string; decorative?: boolean; x: number; y: number; role?: string; paragraphs?: { list?: string; runs: { text: string }[] }[]; chartType?: string; labels?: string[]; series?: { name: string; values: number[] }[]; unit?: string; header?: string[]; rows?: string[][] }

/**
 * What a hand-edited slide shows NOW. Editing by hand changes the slide's pieces but not its stored original text, so for these slides
 * the visible text, chart figures and tables are read in reading order (top to bottom, left to right) instead of the stale original.
 */
function visibleText(elements: El[]): string[] {
  const out: string[] = []
  for (const e of [...elements].filter((x) => !x.decorative).sort((a, b) => a.y - b.y || a.x - b.x)) {
    if (e.type === 'text' && e.paragraphs) {
      const text = e.paragraphs.map((p) => `${p.list === 'bullet' ? '- ' : p.list === 'number' ? '1. ' : ''}${p.runs.map((r) => r.text).join('')}`.trim()).filter(Boolean)
      if (text.length) out.push(...(e.role === 'title' ? [`title: ${text.join(' ')}`] : text))
    } else if (e.type === 'chart' && e.labels && e.series) {
      out.push(`chart (${e.chartType}${e.unit ? `, ${e.unit}` : ''}): labels: ${e.labels.join(' | ')}`, ...e.series.map((s) => `${s.name}: ${s.values.join(' | ')}`))
    } else if (e.type === 'table' && e.header) {
      out.push(`table: ${e.header.join(' | ')}`, ...(e.rows ?? []).map((r) => r.join(' | ')))
    }
  }
  return out
}

export interface RemixText { parts: { locator: string; text: string }[]; skipped: number; chars: number }

/**
 * The deck as plain text the generator can read, one part per slide ("slide 3"). Hand-edited slides are read as they look now; slides with
 * nothing readable (only pictures or shapes) are skipped and counted. Speaker notes are kept short and dropped first when the deck is long.
 */
export function describeDeck(doc: Pick<Presentation, 'slides'>, limitChars = 36_000): RemixText {
  const build = (noteChars: number): RemixText => {
    const parts: RemixText['parts'] = []
    let skipped = 0
    doc.slides.forEach((s, i) => {
      // hand-edited (or content-less) slides: read what is on the slide now; other slides: the stored content is exactly what is shown
      const c = (s.content ?? {}) as Record<string, unknown>
      const body = s.manual || !s.content ? visibleText((s.elements ?? []) as unknown as El[]) : Object.entries(c).flatMap(([k, v]) => (SKIP.has(k) ? [] : lines(v, k, 0)))
      if (body.length === 0) { skipped++; return } // nothing readable on it (only pictures or shapes)
      // the notes box edits the slide's own notes, so those win over the copy stored with the original content
      const note = typeof s.speakerNotes === 'string' && s.speakerNotes.trim() ? s.speakerNotes : typeof c['speakerNotes'] === 'string' ? (c['speakerNotes'] as string) : ''
      const notes = note && noteChars > 0 ? [`notes: ${note.slice(0, noteChars)}`] : []
      parts.push({ locator: `slide ${i + 1}`, text: [`Slide ${i + 1} (${s.layoutId})`, ...body, ...notes].join('\n') })
    })
    return { parts, skipped, chars: parts.reduce((n, p) => n + p.text.length, 0) }
  }
  for (const notes of [400, 120, 0]) { const r = build(notes); if (r.chars <= limitChars) return r }
  return build(0)
}
