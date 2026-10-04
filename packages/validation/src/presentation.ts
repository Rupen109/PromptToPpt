import { z } from 'zod'

/**
 * Presentation document — the canonical, persisted representation (spec §11 / App. B).
 * Everything (editor, present mode, PPTX/PDF export, AI patches) reads and writes THIS, never HTML.
 * Coordinates are absolute, in fixed "canvas units" per aspect ratio (see CANVAS).
 */

export const SCHEMA_VERSION = 1

export const ASPECT_RATIOS = ['16:9', '4:3', '1:1'] as const
export const aspectRatioSchema = z.enum(ASPECT_RATIOS)
export type AspectRatio = z.infer<typeof aspectRatioSchema>

export const CANVAS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
}

/** A web link. `z.url()` alone accepts `javascript:` and `data:` URLs (stored XSS the moment a viewer clicks), so every URL in a document goes through this. */
export const httpUrl = z.url().max(2048).refine((u) => /^https?:\/\//i.test(u), { message: 'must be an http(s) URL' })

export const idSchema = z.string().min(1).max(64)
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB')

// ─── Layouts ─────────────────────────────────────────────────────────────────

export const LAYOUT_IDS = [
  'title',
  'title-body',
  'split-image-text',
  'quote',
  'timeline',
  'process',
  'comparison',
  'metrics',
  'chart',
  'table',
  'roadmap',
  'architecture',
  'case-study',
  'section-divider',
  'thank-you',
  'agenda',
  'team',
  'matrix',
  'big-number',
  'blank',
] as const
export const layoutIdSchema = z.enum(LAYOUT_IDS)
export type LayoutId = z.infer<typeof layoutIdSchema>

// ─── Motion ──────────────────────────────────────────────────────────────────
// Stored in the document so every consumer (editor preview, present mode, share viewer, future PPTX export with graceful
// fallback) reads the same intent. Animation is metadata; the renderer decides how to play it (and honours reduced-motion).

export const ENTRANCE_TYPES = ['fade', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom', 'pop', 'wipe', 'blur', 'count-up', 'kenburns', 'float', 'drift'] as const
export const TRANSITION_TYPES = ['none', 'fade', 'slide', 'zoom', 'push', 'wipe'] as const

export const animationSchema = z.object({
  type: z.enum(ENTRANCE_TYPES),
  /** ms after the slide appears */
  delay: z.number().min(0).max(8000).default(0),
  duration: z.number().min(100).max(60000).default(600), // ambient loops (Ken Burns) run for tens of seconds
  /** animate each paragraph (bullet) in sequence instead of the whole box at once */
  byParagraph: z.boolean().optional(),
  /** ms between paragraphs when byParagraph */
  stagger: z.number().min(0).max(1000).optional(),
})
export type Animation = z.infer<typeof animationSchema>

export const transitionSchema = z.object({ type: z.enum(TRANSITION_TYPES), duration: z.number().min(100).max(2000).default(500) })
export type Transition = z.infer<typeof transitionSchema>

export const motionSchema = z.object({
  transition: z.enum(TRANSITION_TYPES).default('fade'),
  entrance: z.enum(['none', 'fade', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom', 'pop', 'wipe', 'blur']).default('fade-up'),
  /** ms between successive elements on a slide */
  stagger: z.number().min(0).max(600).default(120),
  duration: z.number().min(100).max(2000).default(600),
})
export type Motion = z.infer<typeof motionSchema>

// ─── Style kit (what makes one template look different from another beyond its colours) ───

export const TITLE_STYLES = ['bar', 'split', 'center', 'band', 'frame', 'diagonal', 'minimal', 'badge', 'stack'] as const
export const HEADER_STYLES = ['bar', 'underline', 'rule', 'side', 'dot', 'none', 'italic', 'accent'] as const
export const CARD_STYLES = ['flat', 'outline', 'shadow', 'tint', 'accent-top', 'accent-left', 'paper', 'sticker'] as const
// wash = full-bleed photo under a two-colour gradient; banner = rounded photo band across the top; hex = hexagon crop
export const PHOTO_STYLES = ['none', 'full', 'split', 'circle', 'arch', 'diagonal', 'frame', 'polaroid', 'wash', 'banner', 'hex'] as const
export const DECOR_STYLES = [
  'none', 'circles', 'dots', 'diagonal', 'grid', 'blobs', 'corner', 'stripes', 'rings',
  // category signatures: notebook paper, chalkboard, engineering blueprint, circuit board, party confetti, print halftone, chart axes, corner brackets, chevron run, hand-drawn organic shapes, app-window chrome
  'ruled-paper', 'chalk', 'blueprint', 'circuit', 'confetti', 'halftone', 'axis', 'brackets', 'chevrons', 'organic', 'window',
  // line-art contours (cover ornament), hexagon lattice, flat geometric shapes (playful covers)
  'contours', 'hexgrid', 'shapes',
] as const
export const BULLET_GLYPHS = ['•', '–', '▪', '✓', '→', '●'] as const

export const themeStyleSchema = z.object({
  title: z.enum(TITLE_STYLES).default('bar'),
  header: z.enum(HEADER_STYLES).default('bar'),
  card: z.enum(CARD_STYLES).default('flat'),
  decor: z.enum(DECOR_STYLES).default('none'),
  /** how pictures are framed on title/quote/number/split slides (`none` = flat colour compositions only) */
  photo: z.enum(PHOTO_STYLES).default('none'),
  /** how diagrams and lists are drawn: `editorial` = split lists with dividers, chevron process rows, wash stat cards, hub diagrams */
  diagram: z.enum(['classic', 'editorial']).default('classic'),
  bullet: z.enum(BULLET_GLYPHS).default('•'),
  footer: z.enum(['none', 'number', 'brand']).default('none'),
  bodyBackground: z.enum(['solid', 'tint', 'gradient']).default('solid'),
  titleBackground: z.enum(['primary', 'gradient', 'dark', 'surface', 'accent']).default('primary'),
  headingWeight: z.number().int().min(300).max(900).default(800),
  uppercaseHeadings: z.boolean().default(false),
  /** heading letter-spacing in px at canvas scale */
  headingTracking: z.number().min(-4).max(30).default(0),
})
export type ThemeStyle = z.infer<typeof themeStyleSchema>

// ─── Theme (design tokens snapshot stored with the deck; per-slide overrides allowed) ───

export const themeSchema = z.object({
  id: z.string(),
  name: z.string(),
  colors: z.object({
    background: hex,
    surface: hex,
    textPrimary: hex,
    textSecondary: hex,
    primary: hex,
    secondary: hex,
    accent: hex,
    onPrimary: hex,
  }),
  fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }),
  radius: z.number().min(0).max(80),
  /** absent on decks made before design-system v2 → engine falls back to the classic kit */
  style: themeStyleSchema.optional(),
  motion: motionSchema.optional(),
  /** template this design came from, if any */
  templateId: z.string().max(80).optional(),
})
export type Theme = z.infer<typeof themeSchema>

// ─── Elements ────────────────────────────────────────────────────────────────

const box = {
  id: idSchema,
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
  locked: z.boolean().default(false),
  zIndex: z.number().int().default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** background ornament added by the layout engine: not meant to be edited/selected, skipped by validators */
  decorative: z.boolean().optional(),
  animation: animationSchema.optional(),
}

const textRunSchema = z.object({
  text: z.string().max(5000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  /** emphasis colour for a word or phrase (theme token or hex) — e.g. the key figure in a heading */
  color: z.union([z.enum(['textPrimary', 'textSecondary', 'primary', 'secondary', 'accent', 'onPrimary']), hex]).optional(),
  link: httpUrl.optional(),
})
const paragraphSchema = z.object({
  runs: z.array(textRunSchema).min(1),
  list: z.enum(['bullet', 'number']).optional(),
})

export const TEXT_ROLES = ['title', 'subtitle', 'heading', 'body', 'caption', 'metric', 'quote'] as const

export const textElementSchema = z.object({
  type: z.literal('text'),
  ...box,
  role: z.enum(TEXT_ROLES),
  paragraphs: z.array(paragraphSchema).min(1),
  fontSize: z.number().min(10).max(300),
  align: z.enum(['left', 'center', 'right']).default('left'),
  /** theme token name or explicit hex; resolved at render/export time */
  color: z.union([z.enum(['textPrimary', 'textSecondary', 'primary', 'secondary', 'accent', 'onPrimary']), hex]).default('textPrimary'),
  valign: z.enum(['top', 'middle', 'bottom']).default('top'),
  bullet: z.enum(BULLET_GLYPHS).default('•'),
  weight: z.number().int().min(300).max(900).optional(),
  letterSpacing: z.number().min(-4).max(30).optional(),
  uppercase: z.boolean().optional(),
  lineHeight: z.number().min(0.9).max(2.2).optional(),
  /** space between paragraphs, in multiples of the font size (default 0.5) */
  paraGap: z.number().min(0).max(2).optional(),
})

/** #RRGGBB or #RRGGBBAA — lets an overlay fade to transparent */
const hexa = z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)

export const imageElementSchema = z.object({
  type: z.literal('image'),
  ...box,
  /** resolved URL once an asset exists; absent while the slide is still processing */
  src: httpUrl.optional(),
  alt: z.string().max(300),
  fit: z.enum(['cover', 'contain']).default('cover'),
  /** crop shape: circle, arch (rounded top), or angled sides — the editorial photo crops premium templates use */
  clip: z.enum(['none', 'circle', 'arch', 'diagonal', 'diagonal-flip', 'hex']).default('none'),
  /** colour wash over the picture (keeps text on top readable / ties a photo to the palette) */
  overlay: z.object({ from: hexa, to: hexa, angle: z.number().default(180), opacity: z.number().min(0).max(1).default(0.6) }).optional(),
  /** corner radius override (px); defaults to the theme radius */
  radius: z.number().min(0).max(400).optional(),
  /** what to generate/search for; kept for regeneration and as an accessibility fallback */
  prompt: z.string().max(500).optional(),
  attribution: z.object({ source: z.string(), license: z.string(), url: httpUrl.optional() }).optional(),
})

export const shapeElementSchema = z.object({
  type: z.literal('shape'),
  ...box,
  shape: z.enum(['rect', 'ellipse', 'line', 'ring', 'triangle', 'chevron']),
  fill: z.union([z.enum(['surface', 'primary', 'secondary', 'accent', 'background', 'text', 'onPrimary', 'none']), hex]).default('surface'),
  radius: z.number().min(0).default(0),
  gradient: z.object({ from: hex, to: hex, angle: z.number().min(0).max(360).default(135) }).optional(),
  stroke: z.union([z.enum(['primary', 'secondary', 'accent', 'text', 'onPrimary']), hex]).optional(),
  strokeWidth: z.number().min(0).max(80).optional(),
})

export const iconElementSchema = z.object({ type: z.literal('icon'), ...box, name: z.string().max(60), color: z.string().default('primary') })

export const chartElementSchema = z.object({
  type: z.literal('chart'),
  ...box,
  chartType: z.enum(['bar', 'line', 'pie', 'doughnut']),
  labels: z.array(z.string()).min(1).max(24),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1).max(6),
  unit: z.string().max(16).optional(),
})

export const tableElementSchema = z.object({
  type: z.literal('table'),
  ...box,
  header: z.array(z.string()).min(1).max(8),
  rows: z.array(z.array(z.string())).max(20),
})

export const diagramElementSchema = z.object({
  type: z.literal('diagram'),
  ...box,
  kind: z.enum(['flow', 'layers', 'cycle', 'hub']),
  nodes: z.array(z.object({ id: idSchema, label: z.string().max(80), detail: z.string().max(160).optional() })).min(1).max(12),
  edges: z.array(z.object({ from: idSchema, to: idSchema })).default([]),
})

export const elementSchema = z.discriminatedUnion('type', [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
  iconElementSchema,
  chartElementSchema,
  tableElementSchema,
  diagramElementSchema,
])
export type SlideElement = z.infer<typeof elementSchema>
export type TextElement = z.infer<typeof textElementSchema>

// ─── Slide ───────────────────────────────────────────────────────────────────

export const sourceRefSchema = z.object({
  sourceId: idSchema,
  /** page / slide / timestamp / section — whatever lets a human find the claim again */
  locator: z.string().max(120).optional(),
  quote: z.string().max(400).optional(),
})
export type SourceRef = z.infer<typeof sourceRefSchema>

export const validationIssueSchema = z.object({
  code: z.enum(['schema', 'missing_content', 'overflow', 'image_ratio', 'duplicate_layout', 'contrast', 'font_fallback', 'unresolved_asset']),
  severity: z.enum(['error', 'warning']),
  message: z.string(),
  elementId: idSchema.optional(),
})
export type ValidationIssue = z.infer<typeof validationIssueSchema>

export const slideSchema = z.object({
  id: idSchema,
  layoutId: layoutIdSchema,
  /** the semantic content the layout was composed from — enables re-layout / swap design without losing content */
  content: z.lazy(() => slideContentSchema).optional(),
  locked: z.boolean().default(false),
  /** true once the user hand-edited geometry/text: theme/layout swaps then preserve their elements instead of recomposing */
  manual: z.boolean().optional(),
  background: z.object({ type: z.enum(['color', 'gradient', 'image']), value: z.string().max(2048), gradient: z.object({ from: hex, to: hex, angle: z.number().min(0).max(360).default(135) }).optional() }).refine((b) => b.type !== 'image' || /^https?:\/\//i.test(b.value), { message: 'an image background must be an http(s) URL' }).optional(),
  transition: transitionSchema.optional(),
  themeOverrides: themeSchema.shape.colors.partial().optional(),
  elements: z.array(elementSchema).max(400),
  /** stored separately from visible content (spec §9) */
  speakerNotes: z.string().max(5000).default(''),
  sources: z.array(sourceRefSchema).default([]),
  validation: z.object({ status: z.enum(['pending', 'passed', 'warning', 'failed']), issues: z.array(validationIssueSchema) }).default({
    status: 'pending',
    issues: [],
  }),
})
export type Slide = z.infer<typeof slideSchema>

// ─── Sources ─────────────────────────────────────────────────────────────────

export const SOURCE_TYPES = ['pdf', 'pptx', 'url', 'youtube', 'audio', 'text'] as const
export const sourceSchema = z.object({
  id: idSchema,
  type: z.enum(SOURCE_TYPES),
  title: z.string().max(300),
  url: httpUrl.optional(),
  retrievedAt: z.string().optional(),
})
export type Source = z.infer<typeof sourceSchema>

// ─── Presentation ────────────────────────────────────────────────────────────

export const presentationSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: idSchema,
  title: z.string().min(1).max(200),
  aspectRatio: aspectRatioSchema,
  language: z.string().min(2).max(12),
  theme: themeSchema,
  slides: z.array(slideSchema).min(1).max(60),
  sources: z.array(sourceSchema).default([]),
})
export type Presentation = z.infer<typeof presentationSchema>

// ─── Semantic slide content (what the model writes; the layout engine places it) ─────────

const short = (n: number) => z.string().trim().min(1).max(n)
const bullets = (max: number) => z.array(short(180)).min(1).max(max)
const refs = z.array(sourceRefSchema).max(4).default([])
const common = { speakerNotes: z.string().max(1500).default(''), sources: refs }

export const slideContentSchema = z.discriminatedUnion('layout', [
  z.object({ layout: z.literal('title'), title: short(90), subtitle: short(160).optional(), ...common }),
  z.object({ layout: z.literal('section-divider'), title: short(80), subtitle: short(140).optional(), ...common }),
  z.object({ layout: z.literal('title-body'), title: short(90), bullets: bullets(6), ...common }),
  z.object({ layout: z.literal('split-image-text'), title: short(90), bullets: bullets(5), imagePrompt: short(300), imageAlt: short(200), imageUrl: httpUrl.optional(), imageAttribution: z.object({ source: z.string().max(200), license: z.string().max(80), url: httpUrl.optional() }).optional(), ...common }),
  z.object({ layout: z.literal('quote'), quote: short(280), attribution: short(100).optional(), ...common }),
  z.object({
    layout: z.literal('metrics'),
    title: short(90),
    metrics: z.array(z.object({ value: short(16), label: short(80), detail: short(120).optional() })).min(2).max(4),
    ...common,
  }),
  z.object({
    layout: z.literal('process'),
    title: short(90),
    steps: z.array(z.object({ label: short(40), detail: short(140) })).min(3).max(5),
    ...common,
  }),
  z.object({
    layout: z.literal('timeline'),
    title: short(90),
    steps: z.array(z.object({ label: short(40), detail: short(140) })).min(3).max(6),
    ...common,
  }),
  z.object({
    layout: z.literal('comparison'),
    title: short(90),
    left: z.object({ heading: short(50), bullets: bullets(4) }),
    right: z.object({ heading: short(50), bullets: bullets(4) }),
    ...common,
  }),
  z.object({
    layout: z.literal('chart'),
    title: short(90),
    chartType: z.enum(['bar', 'line', 'pie', 'doughnut']),
    labels: z.array(short(30)).min(2).max(12),
    series: z.array(z.object({ name: short(40), values: z.array(z.number()) })).min(1).max(4),
    unit: short(16).optional(),
    takeaway: short(200),
    ...common,
  }),
  z.object({
    layout: z.literal('table'),
    title: short(90),
    header: z.array(short(40)).min(2).max(5),
    rows: z.array(z.array(short(80))).min(1).max(8),
    ...common,
  }),
  z.object({ layout: z.literal('thank-you'), title: short(80), subtitle: short(160).optional(), ...common }),
  z.object({
    layout: z.literal('roadmap'),
    title: short(90),
    phases: z.array(z.object({ label: short(24), heading: short(50), bullets: z.array(short(80)).min(1).max(3) })).min(3).max(5),
    ...common,
  }),
  z.object({
    layout: z.literal('architecture'),
    title: short(90),
    layers: z.array(z.object({ name: short(36), items: z.array(short(36)).min(2).max(5) })).min(2).max(4),
    note: short(160).optional(),
    ...common,
  }),
  z.object({
    layout: z.literal('case-study'),
    title: short(90),
    client: short(60).optional(),
    challenge: short(220),
    approach: bullets(4),
    results: bullets(4),
    headline: z.object({ value: short(16), label: short(60) }),
    ...common,
  }),
  z.object({
    layout: z.literal('agenda'),
    title: short(60),
    items: z.array(z.object({ label: short(60), detail: short(90).optional() })).min(3).max(8),
    ...common,
  }),
  z.object({
    layout: z.literal('team'),
    title: short(60),
    people: z.array(z.object({ name: short(40), role: short(50), bio: short(110).optional() })).min(2).max(6),
    ...common,
  }),
  z.object({
    layout: z.literal('matrix'),
    title: short(80),
    xLabel: short(30).optional(),
    yLabel: short(30).optional(),
    quadrants: z.array(z.object({ heading: short(36), bullets: z.array(short(70)).min(1).max(3) })).length(4),
    ...common,
  }),
  z.object({
    layout: z.literal('big-number'),
    title: short(90).optional(),
    value: short(16),
    label: short(80),
    context: z.array(short(120)).max(3).default([]),
    ...common,
  }),
])
export type SlideContent = z.infer<typeof slideContentSchema>
/** Layouts the generator + layout engine implement today; others fall back to title-body until Phase 3. */
export const GENERATABLE_LAYOUTS = slideContentSchema.options.map((o) => o.shape.layout.value)

// ─── Prompt analysis / outline ───────────────────────────────────────────────

export const promptAnalysisSchema = z.object({
  topic: short(200),
  objective: z.string().max(300).optional(),
  audience: z.string().max(200).optional(),
  tone: z.string().max(80).optional(),
  language: z.string().min(2).max(12).default('en'),
  slideCount: z.number().int().min(3).max(30).optional(),
  durationMinutes: z.number().int().min(1).max(240).optional(),
  requiredSections: z.array(short(120)).max(15).default([]),
  visualStyle: z.string().max(120).optional(),
  /** model's own judgement; the policy layer below makes the final decision */
  /** which kind of deck this is (picks the template family + photography); optional so older clients/analyses still parse */
  category: z.enum(['pitch', 'sales', 'marketing', 'strategy', 'product', 'tech', 'reports', 'education', 'case-studies', 'team']).optional(),
  /** every concrete fact the user stated (experience, tools, results, names…): the ONLY material slides may state as fact */
  facts: z.array(short(300)).max(20).default([]),
  /** the user asked to keep the current design / theme / colours / fonts */
  keepDesign: z.boolean().optional(),
  /** two colours that fit the TOPIC's mood and culture (environment → forest greens, a national figure → their national colours…); tolerant: a bad value is dropped, never fails the analysis */
  palette: z.object({ primary: hex, accent: hex }).optional().catch(undefined),
  /** true ONLY when the user explicitly asked for a light / white / bright deck (decks are dark by default) */
  lightMode: z.boolean().optional().catch(undefined),
  specificity: z.enum(['broad_topic', 'detailed']),
  missing: z.array(z.enum(['audience', 'objective', 'slideCount', 'duration', 'tone', 'sections'])).default([]),
})
export type PromptAnalysis = z.infer<typeof promptAnalysisSchema>

export const directionSchema = z.object({
  id: short(40),
  title: short(60),
  description: short(200),
  suggestedSlideCount: z.number().int().min(3).max(30),
})
export const directionsSchema = z.object({ directions: z.array(directionSchema).min(3).max(4) })
export type Direction = z.infer<typeof directionSchema>

export const outlineSchema = z.object({
  title: short(120),
  slides: z
    .array(
      z.object({
        title: short(100),
        purpose: short(200),
        layout: z.enum(GENERATABLE_LAYOUTS as [string, ...string[]]),
        keyPoints: z.array(short(200)).max(8).default([]),
        needsVisual: z.boolean().default(false),
        /** what the picture on this slide should SHOW, in plain words (drives picture search + the match check); empty = no picture */
        imageIntent: z.string().max(200).optional(),
      }),
    )
    .min(3)
    .max(30),
})
export type Outline = z.infer<typeof outlineSchema>

export const slideWriteSchema = z.object({ slide: slideContentSchema })
