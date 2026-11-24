/**
 * The deck's SECTIONS: a section starts at a section-divider slide and runs until the next one; slides before the first divider are the opening section. ONE rule for
 * the editor ("use this background on this section") and the assistant ({"by":"section"} targets). A deck without dividers is one section.
 */
type SlideLike = { layoutId?: string | undefined }

export const isSectionStart = (s: SlideLike) => s.layoutId === 'section-divider'

/** each section as the 0-based indices of its first and last slide, in deck order */
export function sectionsOf(slides: readonly SlideLike[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  slides.forEach((s, i) => { if (i === 0 || isSectionStart(s)) out.push({ start: i, end: i }); else out[out.length - 1]!.end = i })
  return out
}

/** the indices of the slides in the same section as slide `index` */
export function sectionSlides(slides: readonly SlideLike[], index: number): number[] {
  const sec = sectionsOf(slides).find((x) => index >= x.start && index <= x.end)
  return sec ? Array.from({ length: sec.end - sec.start + 1 }, (_, k) => sec.start + k) : []
}
