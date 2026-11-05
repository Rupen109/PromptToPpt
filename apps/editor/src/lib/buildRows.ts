import type { Slide } from '@prompttoppt/validation'

/** One line of the "your slides" list on the progress screen. */
export interface BuildRow { id: string; title: string; done: boolean }

const MAX = 90

/** The words of a finished slide's heading (its title, or its first heading), or '' when it has none. */
function headingOf(slide: Slide): string {
  const el = slide.elements.find((e) => e.type === 'text' && (e.role === 'title' || e.role === 'heading'))
  if (!el || el.type !== 'text') return ''
  return (el.paragraphs[0]?.runs.map((r) => r.text).join('') ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX)
}

/**
 * One row per slide of a deck that is being written: its title and whether it is written yet. A slide that is still to be written carries its title from the
 * outline (the first moments of a deck can have slides with no title yet: they show "Slide N" until the outline arrives); once a slide is written that title is
 * gone from it, so `known` remembers the outline title (a row never goes blank or changes its words under the reader's eyes). Only real titles are remembered,
 * never the "Slide N" stand-in.
 */
export function buildRows(slides: Slide[], known: Map<string, string>): BuildRow[] {
  return slides.map((s, i) => {
    if (s.writing?.title) known.set(s.id, s.writing.title)
    const title = known.get(s.id) ?? (headingOf(s) || `Slide ${i + 1}`)
    return { id: s.id, title, done: !s.writing }
  })
}

/** The row being written right now: the first one that is not done (slides are written in order, a few at a time). */
export const currentRow = (rows: BuildRow[]): number => rows.findIndex((r) => !r.done)
