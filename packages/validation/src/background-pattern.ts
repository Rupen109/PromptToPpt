/**
 * A pattern over a slide's colour background: dots, a grid, lines or diagonal lines, in one colour at a strength, repeated every `size` canvas units. ONE drawing (an
 * SVG) for the slide (as its background image) and the PowerPoint file (the exporter renders this very SVG to a picture), so the download shows the screen's pattern.
 */
export const PATTERN_KINDS = ['dots', 'grid', 'lines', 'diagonal'] as const
export type PatternKind = (typeof PATTERN_KINDS)[number]
export interface BackgroundPattern { kind: PatternKind; color: string; opacity: number; size: number }

/** a quiet pattern for a background colour: the colour that reads on it (white on dark, black on light), faint; the editor's and the assistant's starting point */
export function defaultPattern(kind: PatternKind, base: string): BackgroundPattern {
  const h = base.replace('#', '')
  const lum = parseInt(h.slice(0, 2), 16) * 0.299 + parseInt(h.slice(2, 4), 16) * 0.587 + parseInt(h.slice(4, 6), 16) * 0.114
  const dark = lum < 140
  return { kind, color: dark ? '#FFFFFF' : '#000000', opacity: dark ? 0.14 : 0.09, size: kind === 'dots' ? 40 : kind === 'grid' ? 64 : 36 }
}

const n = (v: number) => Math.round(v * 100) / 100
/** the pattern as one SVG, w × h canvas units, over the colour `base` (a full drawing: the screen shows it, the exporter renders it) */
export function patternSvg(p: BackgroundPattern, base: string, w: number, h: number): string {
  const s = p.size, line = Math.max(1, s / 32)
  const tile = p.kind === 'dots' ? `<circle cx="${n(s / 2)}" cy="${n(s / 2)}" r="${n(Math.max(1.5, s * 0.09))}" fill="${p.color}"/>`
    : p.kind === 'grid' ? `<path d="M${s} 0H0V${s}" fill="none" stroke="${p.color}" stroke-width="${n(line * 2)}"/>`
    : p.kind === 'lines' ? `<rect x="0" y="0" width="${s}" height="${n(line * 1.5)}" fill="${p.color}"/>`
    : `<path d="M0 ${s}L${s} 0M${n(-s / 2)} ${n(s / 2)}L${n(s / 2)} ${n(-s / 2)}M${n(s / 2)} ${n(s * 1.5)}L${n(s * 1.5)} ${n(s / 2)}" stroke="${p.color}" stroke-width="${n(line * 1.5)}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse">${tile}</pattern></defs><rect width="${w}" height="${h}" fill="${base}"/><rect width="${w}" height="${h}" fill="url(#p)" opacity="${n(p.opacity)}"/></svg>`
}
