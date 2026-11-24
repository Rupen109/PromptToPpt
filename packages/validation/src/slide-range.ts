/**
 * Which slides an export takes ("all", "this slide", "1-3, 5"): ONE reader for the Export menu, the assistant and the API, so a range means the same everywhere.
 * Slide numbers are 1-based positions in the deck; the result is in deck order without repeats (an export keeps the deck's order, as PowerPoint's "Slides: 1-3, 5" does).
 */
export function parseSlideRange(text: string, total: number): { ok: true; numbers: number[] } | { ok: false; why: string } {
  const t = text.trim().replace(/[–—]/g, '-').replace(/\band\b|;/gi, ',').replace(/\s*-\s*/g, '-') // "1 - 3" is 1-3
  if (!t) return { ok: false, why: 'Type the slides, like 3 or 1-3, 5.' }
  const out = new Set<number>()
  for (const part of t.split(/\s*,\s*|\s+(?=\d)/).filter(Boolean)) {
    const m = /^(\d{1,4})\s*(?:-\s*(\d{1,4})?)?$/.exec(part)
    if (!m) return { ok: false, why: `"${part}" is not a slide number. Type the slides, like 3 or 1-3, 5.` }
    const a = Number(m[1]), b = m[2] !== undefined ? Number(m[2]) : part.includes('-') ? total : a // "5-" = from 5 to the end
    const lo = Math.min(a, b), hi = Math.max(a, b)
    if (lo < 1 || hi > total) return { ok: false, why: `This deck has ${total} slide${total === 1 ? '' : 's'}, so there is no slide ${lo < 1 ? lo : hi}.` }
    for (let n = lo; n <= hi; n++) out.add(n)
  }
  return { ok: true, numbers: [...out].sort((x, y) => x - y) }
}

/** Runs of numbers written short: [1,2,3,5] → "1-3, 5". */
export function compactSlides(numbers: readonly number[]): string {
  const s = [...new Set(numbers)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j]! + 1) j++
    parts.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`)
    i = j
  }
  return parts.join(', ')
}

/** In words, for buttons and replies: "slide 7", "slides 1-3, 5", "all 12 slides". */
export function describeSlides(numbers: readonly number[], total: number): string {
  if (!numbers.length || numbers.length === total) return `all ${total} slide${total === 1 ? '' : 's'}`
  return numbers.length === 1 ? `slide ${numbers[0]}` : `slides ${compactSlides(numbers)}`
}

/** What a file name gets for a part of the deck: "" (the whole deck), "-slide-7", "-slides-1-3_5". */
export function slidesFileSuffix(numbers: readonly number[], total: number): string {
  if (!numbers.length || numbers.length === total) return ''
  return numbers.length === 1 ? `-slide-${numbers[0]}` : `-slides-${compactSlides(numbers).replace(/, /g, '_')}`
}
