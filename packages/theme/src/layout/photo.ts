import type { SlideContent } from '@prompttoppt/validation'
import { groundOf } from './photoKit'
import { deco, pal, para, rect, text, type Ctx } from './primitives'

/** Layouts that can sit on a full-bleed photograph. Card-based layouts can't (text on cards would sit on the wrong colour). */
export const IMAGE_BG_LAYOUTS = ['title', 'section-divider', 'thank-you', 'quote', 'big-number'] as const

/** A scrim in the design's own ground colour (≥ 0.88 opaque) carries the design's own text colour on ANY photo, so full-bleed photo slides stay in the deck's light/dark mood. */
const SCRIM_OPACITY = 0.88

/**
 * The "photo" composition: a full-canvas dark scrim over the picture, then big white type. Used instead of the template's
 * normal title/quote/number compositions when a slide has a picture background, because those assume a flat colour behind them.
 */
export function photoSlide(c: Ctx, s: SlideContent): void {
  const { W, H, M } = c
  const k = pal(c)
  const w = W - 2 * M
  deco(c, groundOf(c), 0, 0, W, H, { opacity: SCRIM_OPACITY })
  switch (s.layout) {
    case 'title':
    case 'section-divider':
    case 'thank-you': {
      rect(c, k.accent, M, H * 0.3 - 40, 120, 10, { radius: 5, animate: 'accent' })
      text(c, 'title', [para(s.title)], M, H * 0.3, w * 0.8, H * 0.3, 104, { color: 'textPrimary', valign: 'bottom', min: 44 })
      if (s.subtitle) text(c, 'body', [para(s.subtitle)], M, H * 0.3 + H * 0.3 + 28, w * 0.7, H * 0.2, 44, { color: 'textSecondary', min: 22 })
      break
    }
    case 'quote': {
      rect(c, k.accent, M, H * 0.18, 120, 10, { radius: 5, animate: 'accent' })
      text(c, 'title', [para(`“${s.quote}”`)], M, H * 0.22, w * 0.85, H * 0.45, 68, { color: 'textPrimary', valign: 'middle', min: 30 })
      if (s.attribution) text(c, 'caption', [para(`— ${s.attribution}`)], M, H * 0.7, w * 0.7, H * 0.1, 34, { color: 'textSecondary', min: 18 })
      break
    }
    case 'big-number': {
      if (s.title) text(c, 'heading', [para(s.title)], M, H * 0.1, w, H * 0.12, 44, { color: 'textSecondary', min: 22 })
      text(c, 'metric', [para(s.value)], M, H * 0.22, w * 0.9, H * 0.38, 260, { color: 'textPrimary', valign: 'bottom', min: 80, weight: 900 })
      text(c, 'heading', [para(s.label)], M, H * 0.62, w * 0.8, H * 0.12, 48, { color: 'textPrimary', min: 24 })
      if (s.context.length) text(c, 'body', s.context.map((x) => para(x, 'bullet')), M, H * 0.76, w * 0.8, H * 0.16, 32, { color: 'textSecondary', min: 18 })
      break
    }
    default:
      break
  }
}
