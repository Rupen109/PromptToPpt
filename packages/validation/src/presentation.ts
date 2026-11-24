import { z } from 'zod'
import { SHAPE_PATH_IDS } from './shapes'

/**
 * Presentation document — the canonical, persisted representation (spec §11 / App. B).
 * Everything (editor, present mode, PPTX/PDF export, AI patches) reads and writes THIS, never HTML.
 * Coordinates are absolute, in fixed "canvas units" per aspect ratio (see CANVAS).
 */

export const SCHEMA_VERSION = 1

/** 16:9 screens, 4:3 classic, 1:1 social posts, 9:16 vertical stories and reels (phones) */
export const ASPECT_RATIOS = ['16:9', '4:3', '1:1', '9:16'] as const
export const aspectRatioSchema = z.enum(ASPECT_RATIOS)
export type AspectRatio = z.infer<typeof aspectRatioSchema>

export const CANVAS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
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
  'morph',
  'morph-template',
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


export const motionSchema = z.object({
  transition: z.enum(TRANSITION_TYPES).default('fade'),
  entrance: z.enum(['none', 'fade', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'zoom', 'pop', 'wipe', 'blur']).default('fade-up'),
  /** ms between successive elements on a slide */
  stagger: z.number().min(0).max(600).default(120),
  duration: z.number().min(100).max(2000).default(600),
})
export type Motion = z.infer<typeof motionSchema>

// ─── Object effects (a slide's own animation timeline; Gold and Premium) ─────
// One list per slide, in play order. An element can have any number of effects, each with its own id; deleting an element removes its effects (see commands).
// The theme's automatic entrance (`element.animation`) stays as it is: an element that has effects of its own is played by them instead.

/** The effects, by category. Every name listed here is played by the engine (packages/ui/src/motion): nothing is added to this list before it works. */
export const EFFECTS = {
  entrance: ['appear', 'fade-in', 'fly-in', 'zoom-in', 'float-in', 'wipe-in', 'split-in', 'rise-up', 'bounce-in', 'pop-in', 'spin-in', 'grow-turn'],
  emphasis: ['pulse', 'grow-shrink', 'spin', 'shake', 'bounce', 'color-change', 'transparency', 'teeter', 'blink'],
  exit: ['disappear', 'fade-out', 'fly-out', 'zoom-out', 'float-out', 'wipe-out', 'shrink', 'spin-out'],
  /** motion paths: the element travels along `path` (a line, an arc, a turn, a circle or one drawn by hand) */
  path: ['path-line', 'path-arc', 'path-turn', 'path-circle', 'path-custom'],
} as const
export const EFFECT_CATEGORIES = ['entrance', 'emphasis', 'exit', 'path'] as const
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number]
export const EFFECT_TYPES = [...EFFECTS.entrance, ...EFFECTS.emphasis, ...EFFECTS.exit, ...EFFECTS.path] as const
export const EFFECT_START = ['click', 'with', 'after'] as const // On Click, With Previous, After Previous
export const EFFECT_EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'power2-out', 'power2-in-out', 'back-out'] as const
export const EFFECT_DIRECTIONS = ['left', 'right', 'up', 'down'] as const
/** an effect's direction also has the four corners (From Bottom-Left, ...); a transition keeps the four sides */
export const EFFECT_DIRECTIONS_8 = [...EFFECT_DIRECTIONS, 'up-left', 'up-right', 'down-left', 'down-right'] as const
/** how a text box is played: all at once, one paragraph, one word or one letter after the other */
export const EFFECT_TEXT_BY = ['object', 'paragraph', 'word', 'letter'] as const

export const effectSchema = z.object({
  id: idSchema,
  /** the element it plays on; an effect whose element is gone is ignored (and removed by the next edit) */
  elementId: idSchema,
  category: z.enum(EFFECT_CATEGORIES),
  type: z.enum(EFFECT_TYPES),
  start: z.enum(EFFECT_START).default('click'),
  /** ms */
  duration: z.number().min(50).max(20000).default(600),
  /** ms after its start moment */
  delay: z.number().min(0).max(20000).default(0),
  easing: z.enum(EFFECT_EASINGS).default('ease-out'),
  direction: z.enum(EFFECT_DIRECTIONS_8).optional(),
  /** canvas units a fly / float / rise travels */
  distance: z.number().min(0).max(2000).optional(),
  /** end size for zoom / grow / shrink (1 = same size) */
  scale: z.number().min(0).max(5).optional(),
  /** degrees for spin / teeter */
  rotation: z.number().min(-1080).max(1080).optional(),
  /** 0-1: the level a transparency effect fades to */
  opacity: z.number().min(0).max(1).optional(),
  /** the colour a colour-change effect goes to */
  color: hex.optional(),
  repeat: z.number().int().min(1).max(20).default(1),
  /** repeat until the end of the slide (PowerPoint's "Until End of Slide"); `repeat` is ignored */
  loop: z.boolean().optional(),
  /** play back to the start once finished */
  reverse: z.boolean().default(false),
  /** a text box played by paragraph, word or letter: the parts follow each other, `stagger` ms apart */
  textBy: z.enum(EFFECT_TEXT_BY).optional(),
  stagger: z.number().min(0).max(2000).optional(),
  /** plays when this element is clicked (PowerPoint's Trigger), not in the slide's click sequence; `start` then only says how it follows the effects in its own trigger group */
  trigger: idSchema.optional(),
  /** motion path: points as offsets from the element's own place, in canvas units, first point [0,0] by convention; 2 to 100 points (a curve is stored as many short segments) */
  path: z.array(z.tuple([z.number().min(-4000).max(4000), z.number().min(-4000).max(4000)])).min(2).max(100).optional(),
}).refine((e) => (EFFECTS[e.category] as readonly string[]).includes(e.type), { message: 'this effect does not belong to that category', path: ['type'] })
export type Effect = z.infer<typeof effectSchema>

// ─── Slide transition (how the slide arrives) ────────────────────────────────

/** The basic transitions are on every plan; `morph` (matching elements move and change from the previous slide to this one) is Gold and Premium. */
export const SLIDE_TRANSITION_TYPES = [...TRANSITION_TYPES, 'morph'] as const
export const MORPH_DEFAULTS = { duration: 900, easing: 'power2-in-out' } as const
/** Morph: matching text moves as one object (default), word by word, or character by character (pieces travel to their partners; see motion/morph.ts) */
export const MORPH_BY = ['object', 'word', 'character'] as const
export const transitionSchema = z.object({
  type: z.enum(SLIDE_TRANSITION_TYPES),
  duration: z.number().min(100).max(4000).default(500),
  easing: z.enum(EFFECT_EASINGS).optional(),
  /** where a push / wipe comes from */
  direction: z.enum(EFFECT_DIRECTIONS).optional(),
  /** move on by itself this many ms after the slide (and its effects) finished; absent = wait for a click */
  advanceAfter: z.number().int().min(0).max(3_600_000).optional(),
  /** a click still moves on while `advanceAfter` is set (default true); false = only the timer moves on */
  advanceOnClick: z.boolean().optional(),
  /**
   * How two objects that are the same object but not the same picture or words give way to each other. `through` (the default): the old one fades out, then the new one fades in.
   * `cross`: PowerPoint's Morph: both are visible at once, one fading out as the other fades in, while they travel; an object on one slide only fades in or out in place.
   */
  blend: z.enum(['through', 'cross']).optional(),
  /** Morph only: how matched text travels. Absent = as one object. Falls back to one object when the two texts share too little or are too long. */
  by: z.enum(MORPH_BY).optional(),
  /** chosen by a person (or by generation for Morph): re-laying out the slide, a theme swap or an AI rewrite keep it, where a transition taken from the theme is replaced */
  own: z.boolean().optional(),
})
export type Transition = z.infer<typeof transitionSchema>

// ─── Style kit (what makes one template look different from another beyond its colours) ───

export const TITLE_STYLES = ['bar', 'split', 'center', 'band', 'frame', 'diagonal', 'minimal', 'badge', 'stack'] as const
export const HEADER_STYLES = ['bar', 'underline', 'rule', 'side', 'dot', 'none', 'italic', 'accent', 'duo'] as const
export const CARD_STYLES = ['flat', 'outline', 'shadow', 'tint', 'accent-top', 'accent-left', 'paper', 'sticker'] as const
// wash = full-bleed photo under a two-colour gradient; banner = rounded photo band across the top; hex = hexagon crop
export const PHOTO_STYLES = ['none', 'full', 'split', 'circle', 'arch', 'diagonal', 'frame', 'polaroid', 'wash', 'banner', 'hex'] as const
export const DECOR_STYLES = [
  'none', 'circles', 'dots', 'diagonal', 'grid', 'blobs', 'corner', 'stripes', 'rings',
  // category signatures: notebook paper, chalkboard, engineering blueprint, circuit board, party confetti, print halftone, chart axes, corner brackets, chevron run, hand-drawn organic shapes, app-window chrome
  'ruled-paper', 'chalk', 'blueprint', 'circuit', 'confetti', 'halftone', 'axis', 'brackets', 'chevrons', 'organic', 'window',
  // line-art contours (cover ornament), hexagon lattice, flat geometric shapes (playful covers)
  'contours', 'hexgrid', 'shapes',
  // editorial hairlines top and bottom of every slide; hazard-tape bands (safety / training)
  'rules', 'hazard',
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
  /** the words at the bottom left of every slide when the footer shows the deck title (the person's own text instead of the deck's title) */
  footerText: z.string().max(80).optional(),
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
  /** the company's brand (from "use my brand"): its logo is drawn on every slide by the layout engine, and it survives template and palette changes */
  brand: z.object({
    name: z.string().max(80).optional(),
    logo: z.object({ src: httpUrl, /** width ÷ height */ aspect: z.number().min(0.2).max(6), /** where along the bottom margin it sits (left by default) */ align: z.enum(['left', 'center', 'right']).optional() }).optional(),
  }).optional(),
})
export type Theme = z.infer<typeof themeSchema>

// ─── Elements ────────────────────────────────────────────────────────────────

const box = {
  id: idSchema,
  /** switched off in the Selection pane (the eye): not drawn in the editor, Present mode, the share link or an export, and left out of animations and Morph; still in the deck */
  hidden: z.boolean().optional(),
  /** the name a person gave this object in the Selection pane (the Animation pane and the Morph check show it); never used to match objects for Morph, only ids are */
  label: z.string().max(80).optional(),
  /** objects of one slide with the same group id are a GROUP: they are selected, moved, resized, copied and deleted together (the file for PowerPoint lists them as separate objects) */
  groupId: z.string().max(40).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
  /** mirrored left-right / upside down inside its own box (pictures and shapes only: see rotation.ts `canFlip`) */
  flipH: z.boolean().optional(),
  flipV: z.boolean().optional(),
  locked: z.boolean().default(false),
  zIndex: z.number().int().default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** background ornament added by the layout engine: not meant to be edited/selected, skipped by validators */
  decorative: z.boolean().optional(),
  /** drawn by the company-logo feature (the logo and its plate): replaced when the brand changes, removed with it — even on hand-edited slides */
  brand: z.boolean().optional(),
  animation: animationSchema.optional(),
}

const textRunSchema = z.object({
  text: z.string().max(5000),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  /** emphasis colour for a word or phrase (theme token or hex) — e.g. the key figure in a heading */
  color: z.union([z.enum(['textPrimary', 'textSecondary', 'primary', 'secondary', 'accent', 'onPrimary']), hex]).optional(),
  link: httpUrl.optional(),
  /** a marker colour behind these words (hex), as a highlighter (text-effects.ts) */
  highlight: hex.optional(),
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
  fontSize: z.number().min(4).max(600), // a Morph template's giant headline can be up to 600 px
  align: z.enum(['left', 'center', 'right', 'justify']).default('left'), // justify: both edges straight, the last line of a paragraph at its start (as PowerPoint)
  /** theme token name or explicit hex; resolved at render/export time */
  color: z.union([z.enum(['textPrimary', 'textSecondary', 'primary', 'secondary', 'accent', 'onPrimary']), hex]).default('textPrimary'),
  valign: z.enum(['top', 'middle', 'bottom']).default('top'),
  bullet: z.enum(BULLET_GLYPHS).default('•'),
  weight: z.number().int().min(300).max(900).optional(),
  letterSpacing: z.number().min(-12).max(30).optional(),
  uppercase: z.boolean().optional(),
  lineHeight: z.number().min(0.7).max(2.2).optional(),
  /** space between paragraphs, in multiples of the font size (default 0.5) */
  paraGap: z.number().min(0).max(2).optional(),
  /** a shadow under the letters of the whole box (text-effects.ts) */
  textShadow: z.enum(['soft', 'strong']).optional(),
  /** an outline round the letters of the whole box: a theme colour or hex, and its width in slide pixels */
  textOutline: z.object({ color: z.union([z.enum(['textPrimary', 'textSecondary', 'primary', 'secondary', 'accent', 'onPrimary']), hex]), width: z.number().min(0.5).max(12) }).optional(),
  /** the grey prompt the EDITOR shows while this box is empty ("Click to add title"): a box of a new slide that nobody has typed in yet. Never drawn in thumbnails, Present, the shared view or any export. */
  hint: z.string().max(80).optional(),
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
  /** a cut-out rectangle of the picture, as fractions of the whole picture (0-1): only that part is shown, stretched to the frame (the editor sizes the frame to the cut-out so nothing is distorted). Zoom and position are not used on a cropped picture. */
  crop: z.object({ x: z.number().min(0).max(0.98), y: z.number().min(0).max(0.98), w: z.number().min(0.02).max(1), h: z.number().min(0.02).max(1) }).refine((c) => c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001, { message: 'the crop must stay inside the picture' }).optional(),
  /** zoom into the picture (1 = not zoomed) around `focus` (0-1 each way; the middle by default): what shows is part of the picture, the frame keeps its size */
  zoom: z.number().min(1).max(5).optional(),
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  /** light adjustments (1 = unchanged; grayscale 0 = colour, 1 = black and white) */
  filter: z.object({ brightness: z.number().min(0.2).max(2).default(1), contrast: z.number().min(0.2).max(2).default(1), grayscale: z.number().min(0).max(1).default(0), /** colour: 0 none … 1 as it is … 2 vivid */ saturation: z.number().min(0).max(2).optional(), /** -1 cool … 1 warm */ warmth: z.number().min(-1).max(1).optional(), /** a soft-focus blur, canvas units (0 = sharp) */ blur: z.number().min(0).max(30).optional() }).optional(),
  /** a line round the inside of the picture's frame, following its cut shape: a theme colour or hex, and its width */
  border: z.object({ color: z.union([z.enum(['textPrimary', 'textSecondary', 'primary', 'secondary', 'accent', 'onPrimary', 'surface', 'background']), hex]), width: z.number().min(1).max(40) }).optional(),
  /** a soft shadow behind the picture (follows its cut shape) */
  shadow: z.enum(['none', 'soft', 'strong']).optional(),
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
  shape: z.enum(['rect', 'ellipse', 'line', 'ring', 'triangle', 'chevron', 'polygon', ...SHAPE_PATH_IDS]),
  /** the outline of a `polygon`: corners as fractions of the shape's box (0-1; a little outside is allowed), clockwise */
  points: z.array(z.tuple([z.number().min(-1).max(2), z.number().min(-1).max(2)])).min(3).max(64).optional(),
  fill: z.union([z.enum(['surface', 'primary', 'secondary', 'accent', 'background', 'text', 'onPrimary', 'none']), hex]).default('surface'),
  radius: z.number().min(0).default(0),
  gradient: z.object({ from: hex, to: hex, angle: z.number().min(0).max(360).default(135), /** linear (along the angle) or radial (from the middle out to the corners); absent = linear */ kind: z.enum(['linear', 'radial']).optional() }).optional(),
  stroke: z.union([z.enum(['primary', 'secondary', 'accent', 'text', 'onPrimary']), hex]).optional(),
  strokeWidth: z.number().min(0).max(80).optional(),
  /** the outline (or, for a line, the line itself) dashed or dotted; absent = solid (stroke.ts) */
  strokeDash: z.enum(['dash', 'dot']).optional(),
  /** a shadow under the shape (the pictures' presets: picture.ts PICTURE_SHADOWS), following its outline */
  shadow: z.enum(['none', 'soft', 'strong']).optional(),
})

export const iconElementSchema = z.object({ type: z.literal('icon'), ...box, name: z.string().max(60), color: z.string().default('primary') })

export const chartElementSchema = z.object({
  type: z.literal('chart'),
  ...box,
  chartType: z.enum(['bar', 'line', 'area', 'scatter', 'pie', 'doughnut']),
  labels: z.array(z.string()).min(1).max(24),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1).max(6),
  unit: z.string().max(16).optional(),
  /** the figures are stand-ins (a chart kept from a design the person uploaded): the editor shows "Sample data - edit this chart" until the person saves their own data. Never drawn in exports or Present. */
  placeholder: z.boolean().optional(),
  /** colours chosen in the editor: one per series (bar, line) or per slice (pie, doughnut); unset = the deck's own colours */
  colors: z.array(hex).max(24).optional(),
  /** where the legend goes; unset = automatic (shown for several series and for pie and doughnut, at the bottom or the right) */
  legend: z.enum(['none', 'bottom', 'right']).optional(),
  /** a straight trend line for every series of a bar or line chart */
  trendline: z.boolean().optional(),
  /** the figure on each bar, point or slice; unset = automatic */
  dataLabels: z.boolean().optional(),
  /** bars of several series on top of each other (`stacked`), or as shares of each category's total (`percent`); unset = side by side. Bar charts only (chart-style.ts) */
  stack: z.enum(['stacked', 'percent']).optional(),
})

export const tableElementSchema = z.object({
  type: z.literal('table'),
  ...box,
  header: z.array(z.string()).min(1).max(8),
  rows: z.array(z.array(z.string())).max(20),
  /** text size in canvas units; unset = 30 (a tall slide has the room for larger text) */
  fontSize: z.number().min(14).max(80).optional(),
  /** colours chosen in the editor; unset = the deck's theme colours */
  headerFill: hex.or(z.literal('none')).optional(),
  headerColor: hex.optional(),
  rowFill: hex.or(z.literal('none')).optional(),
  altRowFill: hex.or(z.literal('none')).optional(),
  textColor: hex.optional(),
  /** cells given their own colour (the biggest figure of a column, for example): row and column count from 0, rows excluding the header */
  highlights: z.array(z.object({ row: z.number().int().min(0).max(19), column: z.number().int().min(0).max(7), fill: hex })).max(40).optional(),
  /** merged cells (table-merge.ts): the top-left cell of each area and its size; row -1 = the header row (merges only across), 0 = the first row below it */
  merges: z.array(z.object({ row: z.number().int().min(-1).max(19), column: z.number().int().min(0).max(7), rows: z.number().int().min(1).max(20), columns: z.number().int().min(1).max(8) })).max(40).optional(),
  /** a cell's own alignment (table-merge.ts alignOf): row -1 = the header; h across, v up and down */
  aligns: z.array(z.object({ row: z.number().int().min(-1).max(19), column: z.number().int().min(0).max(7), h: z.enum(['left', 'center', 'right']).optional(), v: z.enum(['top', 'middle', 'bottom']).optional() })).max(200).optional(),
  borderColor: hex.optional(),
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
  code: z.enum(['schema', 'missing_content', 'overflow', 'image_ratio', 'duplicate_layout', 'contrast', 'font_fallback', 'unresolved_asset', 'small_text']),
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
  /** true when this slide is a copy of a slide of the person's OWN uploaded file (their template): its design belongs to that file, so the assistant changes its words, not its design */
  fromFile: z.boolean().optional(),
  /**
   * true once a person (or the assistant) chose this slide's OWN look: its background (colour, gradient or picture) and the text colours that go with it.
   * This is NOT hand-editing: the slide stays a designed slide (its words and layout can still be changed, by the assistant too), and whenever the layout is
   * composed again (new words, new layout, new theme) the chosen look is put back on top of the fresh layout.
   */
  ownLook: z.boolean().optional(),
  /** set while generation has not written this slide yet: the slide is a titled placeholder (no elements) that the editor shows as "being written" and does not let anyone edit; the writer replaces the whole slide when its text lands */
  writing: z.object({ title: z.string().max(200) }).optional(),
  background: z.object({ type: z.enum(['color', 'gradient', 'image']), value: z.string().max(2048), gradient: z.object({ from: hex, to: hex, angle: z.number().min(0).max(360).default(135), /** linear (along the angle) or radial (from the middle out to the corners); absent = linear */ kind: z.enum(['linear', 'radial']).optional() }).optional(), /** a background picture softened (canvas units; 0 = sharp), e.g. so the slide's text reads over it */ blur: z.number().min(0).max(30).optional(), /** a pattern over a colour background (background-pattern.ts) */ pattern: z.object({ kind: z.enum(['dots', 'grid', 'lines', 'diagonal']), color: hex, opacity: z.number().min(0.02).max(1), size: z.number().min(16).max(200) }).optional() }).refine((b) => b.type !== 'image' || /^https?:\/\//i.test(b.value), { message: 'an image background must be an http(s) URL' }).optional(),
  transition: transitionSchema.optional(),
  /** this slide's object effects, in play order (Gold and Premium; absent on most slides) */
  effects: z.array(effectSchema).max(200).optional(),
  themeOverrides: themeSchema.shape.colors.partial().optional(),
  /**
   * A brand applied to THIS slide only ("apply my brand to slides 1 to 5"): the brand's own inputs, not a frozen palette, so its colours are worked out against the
   * deck's design in force (packages/theme slide-theme.ts). Colours need primary + accent, fonts need both families; the logo is drawn on this slide.
   * themeOverrides (the slide's own look) still sit on top of it.
   */
  brand: z.object({
    name: z.string().max(80).nullable().optional(),
    primary: hex.optional(),
    accent: hex.optional(),
    headingFont: z.string().min(1).max(80).optional(),
    bodyFont: z.string().min(1).max(80).optional(),
    logo: z.object({ url: z.string().max(2048), aspect: z.number().positive().max(20) }).optional(),
  }).optional(),
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

/** Every kind of source a deck can cite. Must include every kind the API can store (services/api/src/sources/store.ts SOURCE_KINDS): a kind missing here makes the deck fail to SAVE. */
export const SOURCE_TYPES = ['pdf', 'pptx', 'url', 'youtube', 'audio', 'text', 'docx', 'xlsx', 'csv', 'email', 'image', 'transcript'] as const
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
  /** the uploaded design (a person's own PowerPoint, "Use a file's design") this deck was made in, so the editor can offer its layouts. A reference only: the deck holds its own copies of the slides, so it works the same if the design is deleted. */
  templateId: z.string().min(1).max(40).optional(),
})
export type Presentation = z.infer<typeof presentationSchema>

// ─── Semantic slide content (what the model writes; the layout engine places it) ─────────

const short = (n: number) => z.string().trim().min(1).max(n)
const bullets = (max: number) => z.array(short(180)).min(1).max(max)
const refs = z.array(sourceRefSchema).max(4).default([])
const common = { speakerNotes: z.string().max(1500).default(''), sources: refs }

/**
 * The scenes of a Morph deck. Every scene draws the same cast of elements (title, kicker, subtitle, hero picture, up to four cards, a stat, accents) with the same element ids, in a different
 * arrangement, so a Morph between two scenes moves the same things. See packages/theme/src/layout/morph.ts and docs/OBJECT_ANIMATIONS.md.
 */
export const MORPH_SCENES = ['cover', 'hero-left', 'cards-row', 'cards-column', 'cards-grid', 'spotlight', 'timeline', 'big-stat', 'compare', 'focus-hero', 'quote', 'closing'] as const
export type MorphScene = (typeof MORPH_SCENES)[number]

export const slideContentSchema = z.discriminatedUnion('layout', [
  z.object({
    layout: z.literal('morph-template'),
    /** which Morph template (packages/theme/src/morph-templates) and which of its scenes this slide is */
    template: short(40),
    scene: short(40),
    /** the words of the scene, by the id of the text object they replace (a scene's own placeholder words are used for any that are missing) */
    fields: z.record(short(80), z.string().max(900)).default({}),
    /** the deck shows the person's own product in place of the template's (see MorphTemplate.swap): what only fits the original product is left out */
    swapped: z.boolean().optional(),
    /** pictures chosen for the scene, by the id of the picture object they replace (a template's own pictures are used for any that are missing) */
    images: z.record(short(80), z.object({ url: httpUrl, alt: z.string().max(200).default(''), attribution: z.object({ source: z.string().max(200), license: z.string().max(80), url: httpUrl.optional() }).optional() })).default({}),
    ...common,
  }),
  z.object({
    layout: z.literal('morph'),
    scene: z.enum(MORPH_SCENES),
    /** in the quote scene this is the quote itself */
    title: short(220),
    kicker: short(40).optional(),
    subtitle: short(200).optional(),
    /** the concepts of the deck (cards), in the SAME order on every slide of the deck so a card is the same card from slide to slide */
    items: z.array(z.object({ heading: short(40), text: short(160) })).max(4).default([]),
    /** spotlight: which item is enlarged (0-3) */
    focus: z.number().int().min(0).max(3).optional(),
    /** the deck's "hand": the picture and the text column of the five scenes that pair them swap sides (the same on every slide of a deck, so the Morph stays one piece; the order of the cards never flips) */
    flip: z.boolean().optional(),
    stat: z.object({ value: short(16), label: short(80) }).optional(),
    imagePrompt: short(300).optional(),
    imageAlt: short(200).optional(),
    imageUrl: httpUrl.optional(),
    imageAttribution: z.object({ source: z.string().max(200), license: z.string().max(80), url: httpUrl.optional() }).optional(),
    ...common,
  }),
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
    // generation writes 3-4 per side; people can ask the assistant for more, so the document allows 6
    left: z.object({ heading: short(50), bullets: bullets(6) }),
    right: z.object({ heading: short(50), bullets: bullets(6) }),
    ...common,
  }),
  z.object({
    layout: z.literal('chart'),
    title: short(90),
    chartType: z.enum(['bar', 'line', 'area', 'scatter', 'pie', 'doughnut']),
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

/**
 * What the model writes for a Morph deck (one call): the few concepts the whole deck is about, then the scenes in order with what each one says. The concepts are the cards: the same
 * words on every slide, so a card is the same card from slide to slide. The CODE chooses coordinates, ids and transitions, and checks the order of the scenes (generation/morph-plan.ts).
 */
export const morphPlanSchema = z.object({
  title: short(120),
  concepts: z.array(z.object({ heading: short(40), text: short(160) })).min(2).max(4),
  scenes: z.array(z.object({
    scene: z.enum(MORPH_SCENES),
    /** what this slide says, as a point (in the quote scene: the quote itself) */
    title: short(220),
    kicker: short(40).optional(),
    subtitle: short(200).optional(),
    /** spotlight: which concept (0-3) takes the stage */
    focus: z.number().int().min(0).max(3).optional(),
    /** big-stat: the figure and what it measures (only when the user supplied one) */
    stat: z.object({ value: short(16), label: short(80) }).optional(),
    /** what to say aloud */
    notes: z.string().max(1200).default(''),
  })).min(1).max(60),
  /** what the deck's one picture should show, in plain words, and what to type into a stock-photo search box */
  imageIntent: short(160).optional(),
  imageQuery: short(60).optional(),
})
export type MorphPlan = z.infer<typeof morphPlanSchema>
/** Layouts the generator + layout engine implement today; others fall back to title-body until Phase 3. */
/** The layouts the model chooses from for an ordinary deck. `morph` is left out: Morph decks plan their scenes separately (services/api generation). */
export const GENERATABLE_LAYOUTS = slideContentSchema.options.map((o) => o.shape.layout.value).filter((l) => l !== 'morph' && l !== 'morph-template')

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
  /** true ONLY when the user explicitly asked for a light / white / bright deck */
  lightMode: z.boolean().optional().catch(undefined),
  /** true ONLY when the user explicitly asked for a dark / black / night deck (otherwise the template's own light or dark look is kept) */
  darkMode: z.boolean().optional().catch(undefined),
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
        /** what to type into a stock-photo search box to find that picture: 2–4 plain, commonly tagged words (no jargon or brand names) */
        imageQuery: z.string().max(80).optional(),
      }),
    )
    .min(3)
    .max(30),
})
export type Outline = z.infer<typeof outlineSchema>

export const slideWriteSchema = z.object({ slide: slideContentSchema })
