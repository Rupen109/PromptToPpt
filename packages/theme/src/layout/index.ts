import { brandLogo } from './brand'
import { CANVAS, type AspectRatio, type Slide, type SlideContent, type Theme } from '@prompttoppt/validation'
import { mix } from '../color'
import * as L from './content'
import { COVER_ONLY_DECOR, decor } from './decor'
import { header } from './header'
import { defaultId, isDark, makeCtx, pal, para, rect, text, type Ctx, type IdGen } from './primitives'
import { blankHints, contentBody, titleOnlyBody, twoContentBody } from './placeholders'
import { lookupMorphTemplate } from '../morph-templates/lookup'
import { composeTemplateScene } from '../morph-templates/compose'
import { MORPH_TRANSITION, morphSlide, named } from './morph'
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
  /** where a Morph template's own pictures are served from (the web app's address) */
  assetBase?: string | undefined
  /**
   * `photo` is a picture the slide ALREADY shows (a re-composition after a design change or a layout change), not a catalogue suggestion: it is kept even when the
   * new design has no photo style, in the neutral "split" composition. A design change never takes a person's picture away.
   */
  keepPhoto?: boolean | undefined
}

/** The background of a plain content slide in the design's body style (a quote sits on the surface colour). Sets `c.bodyBg`, which cards and text pick their contrast from. */
function bodyBackground(c: Ctx, layout: string): Slide['background'] {
  const k = pal(c)
  if (layout === 'quote') c.bodyBg = k.surface
  else if (c.style.bodyBackground === 'tint') c.bodyBg = mix(k.background, k.primary, 0.035)
  const background: Slide['background'] = c.style.bodyBackground === 'gradient' && layout !== 'quote'
    ? { type: 'gradient', value: k.background, gradient: { from: k.background, to: mix(k.background, k.primary, 0.1), angle: 160 } }
    : { type: 'color', value: c.bodyBg }
  if (c.style.bodyBackground === 'gradient') c.bodyBg = mix(k.background, k.primary, 0.05) // mid-point, for card contrast decisions
  return background
}

export function composeSlide(content: SlideContent, theme: Theme, aspect: AspectRatio, idGen: IdGen = defaultId, opts: ComposeOptions = {}): Composed {
  const c = makeCtx(theme, aspect, idGen)
  if (opts.variant !== undefined) c.variant = opts.variant
  const k = pal(c)
  if (content.layout === 'morph-template') {
    // a scene of a Morph template: its geometry, words and pictures come from the template (morph-templates), not from the design
    return composeTemplateScene(lookupMorphTemplate(content.template), content, opts.assetBase ? { assetBase: opts.assetBase } : {})
  }
  if (content.layout === 'morph') {
    // a Morph scene: its own backgrounds, ids and transition (see morph.ts)
    const bg = morphSlide(c, content)
    named(c, 'm-logo', () => brandLogo(c, isDark(bg.value)))
    return {
      layoutId: 'morph', background: bg.gradient ? { type: 'gradient', value: bg.value, gradient: bg.gradient } : { type: 'color', value: bg.value },
      elements: c.els, speakerNotes: content.speakerNotes, sources: content.sources, content, transition: MORPH_TRANSITION,
    }
  }
  if (opts.backgroundImage && (IMAGE_BG_LAYOUTS as readonly string[]).includes(content.layout)) {
    photoSlide(c, content)
    brandLogo(c, true)
    const tr = c.motion.transition
    return {
      layoutId: content.layout, background: { type: 'image', value: opts.backgroundImage }, elements: c.els, speakerNotes: content.speakerNotes, sources: content.sources, content,
      ...(tr !== 'none' && theme.motion ? { transition: { type: tr, duration: 500 } } : {}),
    }
  }
  if (opts.photo && opts.keepPhoto && c.style.photo === 'none' && (PHOTO_LAYOUTS as readonly string[]).includes(content.layout)) c.style = { ...c.style, photo: 'split' } // (this slide only: c is made for this one call)
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
    background = bodyBackground(c, content.layout)
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


/** The layouts a person picks for a NEW slide, in PowerPoint's order. Content slides are plain (flat background, no ornaments); the title slide and section header keep the design's cover look. */
export const PLACEHOLDER_KINDS = ['content', 'title', 'section', 'two-content', 'comparison', 'title-only'] as const
export type PlaceholderKind = (typeof PLACEHOLDER_KINDS)[number]
export const PLACEHOLDER_LABEL: Record<PlaceholderKind, string> = { content: 'Title and content', title: 'Title slide', section: 'Section header', 'two-content': 'Two content', comparison: 'Comparison', 'title-only': 'Title only' }

/**
 * A new slide made of empty, prompted boxes ("Click to add title"). With `sample: true` the boxes hold sample words instead: that is the preview in the layout gallery. The slide has
 * no semantic `content` (nobody's words are stored for a redesign to bring back), so the caller marks it hand-made.
 */
export function composePlaceholderSlide(kind: PlaceholderKind, theme: Theme, aspect: AspectRatio, idGen: IdGen = defaultId, o: { sample?: boolean } = {}): Composed {
  let out: Composed
  if (kind === 'title') out = composeSlide({ layout: 'title', title: 'Presentation title', subtitle: 'Subtitle', speakerNotes: '', sources: [] }, theme, aspect, idGen)
  else if (kind === 'section') out = composeSlide({ layout: 'section-divider', title: 'Section title', speakerNotes: '', sources: [] }, theme, aspect, idGen)
  else if (kind === 'comparison') out = composeSlide({ layout: 'comparison', title: 'Slide title', left: { heading: 'Heading', bullets: ['First point'] }, right: { heading: 'Heading', bullets: ['First point'] }, speakerNotes: '', sources: [] }, theme, aspect, idGen)
  else {
    const c = makeCtx(theme, aspect, idGen)
    const background: Slide['background'] = { type: 'color', value: c.bodyBg } // plain: the design's own background colour, no tint, gradient or ornaments behind a slide you are about to fill in
    ;(kind === 'content' ? contentBody : kind === 'two-content' ? twoContentBody : titleOnlyBody)(c)
    brandLogo(c, isDark(c.bodyBg))
    const tr = c.motion.transition
    out = { layoutId: 'title-body', background, elements: c.els, speakerNotes: '', sources: [], ...(tr !== 'none' && theme.motion ? { transition: { type: tr, duration: 500 } } : {}) }
  }
  const { content: _content, ...composed } = out
  // the designed covers (title, section) keep their look; every other new slide is plain, so the comparison loses its background ornaments and tint too
  const rest = kind === 'comparison' ? { ...composed, background: { type: 'color' as const, value: theme.colors.background }, elements: composed.elements.filter((e) => !(e.decorative && e.type === 'shape')) } : composed
  return o.sample ? rest : { ...rest, elements: blankHints(rest.elements) }
}

export { MORPH_TRANSITION } from './morph'
export { PHOTO_LAYOUTS, type Photo } from './photoKit'
export { brandLogoElements } from './brand'
export { CANVAS, header, rect, text, para, IMAGE_BG_LAYOUTS }
