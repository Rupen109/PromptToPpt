import { presentationSchema, type Presentation, type Slide, type SlideElement, type TextElement, type Theme, type ValidationIssue } from '@prompttoppt/validation'
import { blend, contrastRatio } from './color'
import { SUPPORTED_FONTS } from './themes'
import { estimateTextHeight, metricOptsFor } from './text-metrics'

export { contrastRatio }

export function resolveColor(token: string, theme: Theme, slide?: Slide): string {
  if (token.startsWith('#')) return token
  const colors = { ...theme.colors, ...slide?.themeOverrides } as Record<string, string>
  const map: Record<string, string | undefined> = { text: colors['textPrimary'], background: colors['background'], none: undefined }
  return (map[token] ?? colors[token]) as string
}

// a picture's colour is unknown, so judge text over it against the WORST case for light text (a white photo) — the scrim must carry the contrast
const slideBg = (slide: Slide, theme: Theme) => (slide.background?.type === 'image' ? '#FFFFFF' : slide.background?.type === 'color' ? slide.background.value : slide.background?.type === 'gradient' ? (slide.background.gradient ? blend(slide.background.gradient.to, slide.background.gradient.from, 0.5) : slide.background.value) : theme.colors.background)

/**
 * The colour actually behind a text element: the topmost filled shape under its centre (cards, panels, bands…), blended
 * through the shape's opacity, over the slide background. Without this, text on a card would be judged against the wrong colour.
 */
export function effectiveBackground(slide: Slide, theme: Theme, el: SlideElement): string {
  let bg = slideBg(slide, theme)
  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  const under = slide.elements
    .filter((s): s is Extract<SlideElement, { type: 'shape' }> => s.type === 'shape' && s.fill !== 'none' && (s.shape === 'rect' || s.shape === 'ellipse' || s.shape === 'chevron' || s.shape === 'triangle') && s.zIndex < el.zIndex)
    .filter((s) => !(s.decorative && (Math.min(s.width, s.height) < 8 || s.width * s.height < 90_000))) // small ornaments (lines, ticks, dots, confetti) do not change the colour text is read against; big decorative panels still do (title slides paint their ground with them)
    .filter((s) => cx >= s.x && cx <= s.x + s.width && cy >= s.y && cy <= s.y + s.height)
    .sort((a, b) => a.zIndex - b.zIndex)
  for (const s of under) {
    const fill = s.gradient ? blend(s.gradient.to, s.gradient.from, 0.5) : resolveColor(s.fill, theme, slide)
    if (fill) bg = blend(fill, bg, s.opacity)
  }
  return bg
}

/** reading text smaller than this is flagged (22 px = 11 pt) */
export const SMALL_TEXT_PX = 22
const isContent = (e: SlideElement) => !e.decorative

/** Structural + visual validation (spec §7 "Validation"). Pure: same input → same issues. */
export function validateSlide(slide: Slide, theme: Theme): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const texts = slide.elements.filter((e): e is TextElement => e.type === 'text')

  const hasContent = slide.elements.some((e) => isContent(e) && (e.type === 'text' || e.type === 'chart' || e.type === 'table' || e.type === 'diagram' || e.type === 'image'))
  if (slide.elements.length === 0 ? slide.layoutId !== 'blank' : !hasContent && slide.layoutId !== 'blank') issues.push({ code: 'missing_content', severity: 'error', message: 'Slide has no content' })

  for (const t of texts) {
    const need = estimateTextHeight(t.paragraphs, t.fontSize, t.width, metricOptsFor(t, theme))
    // rotated text (axis labels) is measured along its own axis
    if (need > t.height * 1.02) issues.push({ code: 'overflow', severity: 'error', message: `Text needs ~${Math.round(need)}px but box is ${Math.round(t.height)}px`, elementId: t.id })
    // readable size (1920 px canvas, 1 pt = 2 px): reading text under 11 pt is flagged so the generator can shorten the words; numbers/badges (metric) are display type
    if (t.role !== 'metric' && t.fontSize < SMALL_TEXT_PX) issues.push({ code: 'small_text', severity: 'warning', message: `Text is small (${t.fontSize}px)`, elementId: t.id })

    const fg = resolveColor(t.color, theme, slide)
    const ratio = contrastRatio(fg, effectiveBackground(slide, theme, t))
    const need4 = t.fontSize >= 32 || (t.weight ?? 400) >= 700 && t.fontSize >= 24 ? 3 : 4.5
    if (ratio < need4) issues.push({ code: 'contrast', severity: 'warning', message: `Contrast ${ratio.toFixed(2)}:1 is below ${need4}:1`, elementId: t.id })
  }
  for (const e of slide.elements) {
    if (e.type === 'image' && !e.src) issues.push({ code: 'unresolved_asset', severity: 'warning', message: 'Image not generated yet', elementId: e.id })
    if (e.type === 'image' && (e.width / e.height > 4 || e.height / e.width > 4)) issues.push({ code: 'image_ratio', severity: 'warning', message: 'Extreme image aspect ratio', elementId: e.id })
  }
  return issues
}

export interface DeckReport {
  slides: { slideId: string; issues: ValidationIssue[] }[]
  /** 0–100 */
  completeness: number
  errors: number
  warnings: number
}

export function validateDeck(doc: Presentation): DeckReport {
  const deckIssues: ValidationIssue[] = []
  for (const f of [doc.theme.fonts.heading, doc.theme.fonts.body]) {
    if (!SUPPORTED_FONTS.includes(f)) deckIssues.push({ code: 'font_fallback', severity: 'warning', message: `Font "${f}" is not supported; a fallback will be used` })
  }
  const slides = doc.slides.map((s, i) => {
    const issues = validateSlide(s, doc.theme)
    const a = doc.slides[i - 1]?.layoutId
    const b = doc.slides[i - 2]?.layoutId
    if (a && b && a === s.layoutId && b === s.layoutId && s.layoutId !== 'blank') issues.push({ code: 'duplicate_layout', severity: 'warning', message: `Layout "${s.layoutId}" used 3 times in a row` })
    return { slideId: s.id, issues: i === 0 ? [...deckIssues, ...issues] : issues }
  })
  const all = slides.flatMap((s) => s.issues)
  const errors = all.filter((i) => i.severity === 'error').length
  const warnings = all.length - errors
  const completeness = Math.max(0, Math.round(100 - ((errors * 25 + warnings * 3) / Math.max(1, doc.slides.length)) * 4))
  return { slides, completeness, errors, warnings }
}

/** Writes per-slide validation results back onto the document (returns a new object). */
export function applyValidation(doc: Presentation): { doc: Presentation; report: DeckReport } {
  const report = validateDeck(doc)
  const bySlide = new Map(report.slides.map((s) => [s.slideId, s.issues]))
  const slides = doc.slides.map((s) => {
    const issues = bySlide.get(s.id) ?? []
    const status = issues.some((i) => i.severity === 'error') ? 'failed' : issues.length ? 'warning' : 'passed'
    return { ...s, validation: { status, issues } } as Slide
  })
  return { doc: { ...doc, slides }, report }
}

/** Schema gate used before persisting anything. */
export const parseDocument = (value: unknown) => presentationSchema.safeParse(value)
