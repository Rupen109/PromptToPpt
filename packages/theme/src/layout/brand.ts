import type { SlideElement } from '@prompttoppt/validation'
import type { AspectRatio, Theme } from '@prompttoppt/validation'
import { makeCtx, rect, type Ctx, type IdGen } from './primitives'

/**
 * The company logo ("use my brand"), drawn on every slide in the bottom margin, left aligned, below all content.
 * Logos are normally designed for light backgrounds, so on dark or picture slides it sits on a small white plate.
 */
export function brandLogo(c: Ctx, onDark: boolean): void {
  const logo = c.theme.brand?.logo
  if (!logo) return
  const maxH = Math.round(c.M * 0.6)
  const maxW = Math.round(c.W * 0.14)
  let h = maxH
  let w = Math.round(h * logo.aspect)
  if (w > maxW) { w = maxW; h = Math.round(w / logo.aspect) }
  const x = c.M
  const y = c.H - c.M + Math.round((c.M - h) / 2)
  if (onDark) {
    const pad = Math.round(c.M * 0.1)
    const plate = rect(c, '#FFFFFF', x - pad, y - pad, w + 2 * pad, h + 2 * pad, { radius: pad, animate: false }) as { brand?: boolean; decorative?: boolean }
    plate.brand = true; plate.decorative = true
  }
  c.els.push({
    type: 'image', id: c.id(), x, y, width: w, height: h, rotation: 0, locked: false, zIndex: c.z++, opacity: 1,
    src: logo.src, alt: c.theme.brand?.name ? `${c.theme.brand.name} logo` : 'Company logo', fit: 'contain', clip: 'none', decorative: true, brand: true,
  } as SlideElement)
}

/**
 * The logo (and its plate) as ready-made elements, for slides that were edited by hand: those are never redrawn from their content, so the
 * logo is added to them directly. Same geometry as on composed slides. `onDark`: the slide's background is dark (the logo gets a white plate).
 */
export function brandLogoElements(theme: Theme, aspect: AspectRatio, onDark: boolean, idGen: IdGen): SlideElement[] {
  const c = makeCtx(theme, aspect, idGen)
  brandLogo(c, onDark)
  return c.els
}
