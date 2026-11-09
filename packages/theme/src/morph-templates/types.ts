/**
 * Morph templates. A template is the choreography of a whole deck: for every slide ("scene"), where every object is, how big, how rotated, in what order, and which objects on
 * one slide are the same object on the next (so a Morph carries them). It is read from a PowerPoint Morph deck by scripts/morph-import.mjs: only geometry and text styling,
 * never a picture. The pictures are our own (a template's `pictures`), the words are the deck's (`fields`).
 */
export interface TemplateRun { t: string; /** the weight, 100-900 (an authored template says it exactly; an imported one is read from the font's name) */ w?: number; sz?: number | null; b?: boolean; i?: boolean; u?: boolean; cap?: string | null; spc?: number | null; font?: string | null; color?: string | null }
export interface TemplatePara { algn: string; lnSpc: number | null; runs: TemplateRun[] }

export interface TemplateObject {
  /** the same id on consecutive slides = the same object (a Morph moves it) */
  id: string
  kind: 'image' | 'text' | 'shape'
  /** canvas pixels on a 1920 x 1080 slide; may lie outside the slide (an object parked off its edge) */
  x: number; y: number; w: number; h: number
  rot: number
  flipH?: boolean; flipV?: boolean
  z: number
  /** picture or shape transparency (0 = invisible: a parked staging copy) */
  alpha?: number
  geom?: string
  /** the picture's content hash and its name inside the source deck (the key into a template's `pictures`) */
  hash?: string
  file?: string | null
  crop?: { l: number; t: number; r: number; b: number } | null
  paras?: (TemplatePara | null)[]
  anchor?: string
  fill?: string | null
  line?: string | null
  /** a custom shape's outline: corners as fractions of its box */
  poly?: number[][] | null
  // ── only for authored templates (author.ts): an exact look, not the importer's reading of a source deck ──
  /** typography is used exactly as written: no lifting of small copy, no widening, no heading weight rules */
  exact?: boolean
  fit?: 'cover' | 'contain'
  /** corner radius of a picture or a shape, canvas px */
  radius?: number
  clip?: 'circle' | 'arch' | 'diagonal' | 'diagonal-flip' | 'hex'
  /** a shape other than a rectangle or ellipse */
  shape?: 'ring' | 'triangle' | 'chevron' | 'line'
  gradient?: { from: string; to: string; angle: number }
  stroke?: string | null
  strokeW?: number
}

export interface TemplateSlide {
  n: number
  background: string | null
  /** a gradient instead of the flat colour */
  bgGradient?: { from: string; to: string; angle: number }
  transition: { speed: string | null; durationMs: number | null; morph: string | null }
  objects: TemplateObject[]
}

export interface TemplateData { source: string; canvas: { w: number; h: number }; slides: TemplateSlide[]; media: Record<string, string> }

/** The picture a template shows for one of the source deck's pictures. */
export interface TemplatePicture {
  /** a file under the web app's public/morph-templates folder, or a full http(s) URL */
  src: string
  alt: string
  /** a round picture (a portrait in a circle) */
  clip?: 'circle'
  /** the picture is not used (the source deck's own branding) */
  drop?: boolean
  /**
   * The source deck shows this object as a picture of an object tilted to one side (a can lying at an angle): ours is the upright artwork, turned. `tilt` is which way (1 clockwise,
   * -1 anticlockwise); the angle is worked out from the shape of the box the tilted picture fills, and `aspect` (width over height) is the artwork's.
   */
  tilt?: 1 | -1
  aspect?: number
  attribution?: { source: string; license: string; url?: string }
}

export interface TemplateScene {
  /** `s<number>`: the scene's key in a slide's content */
  id: string
  title: string
  /** what this scene is for, in a plain sentence (also what the AI is told) */
  purpose: string
}

/** What a scene says in a demo: sample words for the scene's text slots, top to bottom. */
export interface DemoScene { scene: string; copy: string[] }
export type MorphCategory = 'business' | 'pitch' | 'marketing' | 'launch' | 'technology' | 'education'

export interface MorphTemplate {
  id: string
  /** the family it is shown with on the website and chosen from by topic */
  category?: MorphCategory
  /** one sentence on who it is for (the website's FAQ answer for "what topics suit it") */
  audience?: string
  /** sample words per scene for the website's live preview (an authored template carries its own) */
  demo?: DemoScene[]
  name: string
  tagline: string
  description: string
  /** the kinds of topic it suits (what the AI matches a request against) */
  topics: string[]
  fonts: { heading: string; body: string }
  /** the weight of every headline, when the template's look depends on it (a thin, wide face); otherwise headlines get a confident semibold */
  headingWeight?: number
  /** the source deck's cropped pictures (a window onto a bigger photo) are drawn to fill their window; off, our whole picture is shown inside it */
  coverCrops?: boolean
  /** words are drawn above every picture in every scene (rather than in the source's own stacking) */
  textOnTop?: boolean
  /** the theme colours a deck in this template gets (its objects carry their own colours; these are for everything else) */
  colors: { background: string; surface: string; textPrimary: string; textSecondary: string; primary: string; secondary: string; accent: string; onPrimary: string }
  /** how long each Morph runs, ms */
  durationMs: number
  background: string
  data: TemplateData
  /** the source deck's picture (by its hash) -> ours */
  pictures: Record<string, TemplatePicture>
  /** the source deck's wording that is replaced everywhere (its branding), by normalised text */
  replace: Record<string, string>
  scenes: TemplateScene[]
}
