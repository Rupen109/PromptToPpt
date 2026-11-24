import type { Slide, Theme } from '@prompttoppt/validation'
import { applyBrandToTheme } from './brand'

/**
 * The theme as it applies to ONE slide: the deck's theme, with the slide's own brand on it (a brand applied to some slides only), then the slide's own look
 * (`themeOverrides`, a hand-picked background and the text colours that go with it) on top. ONE rule for the screen, the PowerPoint file, the checks, colour
 * resolving and re-layout: a slide is always drawn, measured and checked in the theme it is really shown in.
 *
 * `slideBase` is the theme before the own look: what an own look is worked out against, and what a slide is composed with (its own look is put back after).
 */
type SlideLike = Pick<Slide, 'brand' | 'themeOverrides'> | undefined | null

const memo = new WeakMap<Theme, Map<string, Theme>>()

export function slideBase(deck: Theme, slide: SlideLike): Theme {
  const b = slide?.brand
  if (!b) return deck
  // remembered only for a settled (frozen) theme: an editing draft changes under the key, and a theme built from it would hold the draft's parts
  if (!Object.isFrozen(deck)) return applyBrandToTheme(deck, b, { colors: !!(b.primary && b.accent), fonts: !!(b.headingFont && b.bodyFont), logo: !!b.logo })
  const key = JSON.stringify(b)
  let per = memo.get(deck)
  if (!per) memo.set(deck, (per = new Map()))
  const hit = per.get(key)
  if (hit) return hit
  const t = applyBrandToTheme(deck, b, { colors: !!(b.primary && b.accent), fonts: !!(b.headingFont && b.bodyFont), logo: !!b.logo })
  per.set(key, t)
  return t
}

export function slideTheme(deck: Theme, slide: SlideLike): Theme {
  const base = slideBase(deck, slide)
  const own = slide?.themeOverrides
  if (!own || !Object.keys(own).length) return base
  return { ...base, colors: { ...base.colors, ...(Object.fromEntries(Object.entries(own).filter(([, v]) => typeof v === 'string')) as Partial<Theme['colors']>) } }
}

/** the slides that carry a brand of their own (for the editor's list and the assistant's replies) */
export const brandedSlides = (slides: Pick<Slide, 'brand'>[]): number[] => slides.flatMap((s, i) => (s.brand ? [i] : []))
