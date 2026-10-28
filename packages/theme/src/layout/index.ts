import { brandLogo } from './brand'
import { CANVAS, type AspectRatio, type Slide, type SlideContent, type Theme } from '@prompttoppt/validation'
import { mix } from '../color'
import * as L from './content'
import { COVER_ONLY_DECOR, decor } from './decor'
import { header } from './header'
import { defaultId, isDark, makeCtx, pal, para, rect, text, type IdGen } from './primitives'
import { IMAGE_BG_LAYOUTS, photoSlide } from './photo'
import { PHOTO_LAYOUTS, groundOf, photoNumber, photoQuote, photoTitle, type Photo } from './photoKit'
import { titleSlide } from './title'

export type { IdGen } from './primitives'

type Composed = Pick<Slide, 'layoutId' | 'background' | 'elements' | 'speakerNotes' | 'sources' | 'content' | 'transition'>

/**
 * Semantic content → positioned elements, in the template's style. Pure and deterministic (given idGen): the model never
 * chooses coordinates, so every template × layout × aspect ratio can be tested exhaustively.
 */
export interface ComposeOptions {
  /** full-bleed picture behind the slide; honoured only for IMAGE_BG_LAYOUTS (others ignore it) */
  backgroundImage?: string | undefined
  /** catalogue picture for this slide; used by title/section/thank-you/quote/big-number when the theme has a photo style */
  photo?: Photo | undefined
  /** rotating index so consecutive plain slides take different looks */
  variant?: number | undefined
}

export function composeSlide(content: SlideContent, theme: Theme, aspect: AspectRatio, idGen: IdGen = defaultId, opts: ComposeOptions = {}): Composed {
  const c = makeCtx(theme, aspect, idGen)
  if (opts.variant !== undefined) c.variant = opts.variant
  const k = pal(c)
  if (opts.backgroundImage && (IMAGE_BG_LAYOUTS as readonly string[]).includes(content.layout)) {
    photoSlide(c, content)
    brandLogo(c, true)
    const tr = c.motion.transition
    return {
      layoutId: content.layout, background: { type: 'image', value: opts.backgroundImage }, elements: c.els, speakerNotes: content.speakerNotes, sources: content.sources, content,
      ...(tr !== 'none' && theme.motion ? { transition: { type: tr, duration: 500 } } : {}),
    }
  }
  if (opts.photo && c.style.photo !== 'none' && (PHOTO_LAYOUTS as readonly string[]).includes(content.layout)) {
    if (!['wash', 'banner', 'hex'].includes(c.style.photo)) decor(c, isDark(groundOf(c))) // the design's signature motif sits behind the photograph composition too (the cover styles place it themselves, above the picture)
    const bg = content.layout === 'quote' ? photoQuote(c, content, opts.photo) : content.layout === 'big-number' ? photoNumber(c, content, opts.photo) : photoTitle(c, content as { title: string; subtitle?: string }, content.layout as 'title' | 'section-divider' | 'thank-you', opts.photo)
    brandLogo(c, true)
    const tr = c.motion.transition
    return {
      layoutId: content.layout, background: { type: 'color', value: bg.value }, elements: c.els, speakerNotes: content.speakerNotes, sources: content.sources, content,
      ...(tr !== 'none' && theme.motion ? { transition: { type: tr, duration: 500 } } : {}),
    }
  }
  const isTitleKind = content.layout === 'title' || content.layout === 'section-divider' || content.layout === 'thank-you'

  // body background by style (title-kind slides choose their own)
  let background: Slide['background']
  if (isTitleKind) {
    const bg = titleSlide(c, content, content.layout as 'title' | 'section-divider' | 'thank-you')
    background = bg.gradient ? { type: 'gradient', value: bg.value, gradient: bg.gradient } : { type: 'color', value: bg.value }
  } else {
    if (content.layout === 'quote') c.bodyBg = k.surface
    else if (c.style.bodyBackground === 'tint') c.bodyBg = mix(k.background, k.primary, 0.035)
    background = c.style.bodyBackground === 'gradient' && content.layout !== 'quote'
      ? { type: 'gradient', value: k.background, gradient: { from: k.background, to: mix(k.background, k.primary, 0.1), angle: 160 } }
      : { type: 'color', value: c.bodyBg }
    if (c.style.bodyBackground === 'gradient') c.bodyBg = mix(k.background, k.primary, 0.05) // mid-point, for card contrast decisions
    decor(c, false, COVER_ONLY_DECOR.has(c.style.decor) ? 'none' : c.style.decor)
    switch (content.layout) {
      case 'title-body': L.titleBody(c, content); break
      case 'split-image-text': L.splitImageText(c, content); break
      case 'quote': L.quote(c, content); break
      case 'metrics': (L.editorial(c) ? L.metricsWash : L.metrics)(c, content); break
      case 'process':
      case 'timeline': (L.editorial(c) && content.steps.length <= 5 ? L.stepsChevrons : L.steps)(c, content); break
      case 'comparison': L.comparison(c, content); break
      case 'chart': L.chart(c, content); break
      case 'table': L.table(c, content); break
      case 'agenda': (L.editorial(c) ? L.agendaSplit : L.agenda)(c, content); break
      case 'team': L.team(c, content); break
      case 'matrix': (L.editorial(c) ? L.matrixHub : L.matrix)(c, content); break
      case 'big-number': (L.editorial(c) ? L.bigNumberCorner : L.bigNumber)(c, content); break
      case 'roadmap': L.roadmap(c, content); break
      case 'architecture': L.architecture(c, content); break
      case 'case-study': L.caseStudy(c, content); break
    }
  }

  brandLogo(c, isTitleKind ? isDark(background?.value ?? c.bodyBg) : isDark(c.bodyBg))
  const tr = c.motion.transition
  return {
    layoutId: content.layout,
    background,
    elements: c.els,
    speakerNotes: content.speakerNotes,
    sources: content.sources,
    content,
    ...(tr !== 'none' && theme.motion ? { transition: { type: tr, duration: 500 } } : {}),
  }
}

export { PHOTO_LAYOUTS, type Photo } from './photoKit'
export { brandLogoElements } from './brand'
export { CANVAS, header, rect, text, para, IMAGE_BG_LAYOUTS }
