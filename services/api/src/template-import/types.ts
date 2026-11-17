import type { AspectRatio, Slide, Theme } from '@prompttoppt/validation'

/**
 * The output contract of the file-to-template importer ("same format, different data"). A person uploads a .pptx (a PDF importer will produce the SAME shapes later);
 * the importer reads its design, layouts and text boxes and returns an `UploadedTemplate`. Nothing here is specific to .pptx.
 *
 * Part 2 (create flow, prompt box, AI fill, editor entry) consumes only these types. See docs/TEMPLATE_FROM_FILE.md.
 */

/** What a text box is for. `chrome`-like text (footers, dates, repeated branding) is never a slot. */
export const SLOT_ROLES = ['title', 'subtitle', 'body', 'bullets', 'caption', 'number', 'label', 'name', 'other'] as const
export type SlotRole = (typeof SLOT_ROLES)[number]

/**
 * A text box whose words are the deck's own content. The shape deliberately includes the fields of generation/template-deck.ts `TemplateSlot` (`id`, `sample`, `maxChars`,
 * `detail`, `numeric`, `ticker`), so `fitText` / `sanitizeFill` / `tooLong` work on an uploaded template's slots unchanged: `id` is the element id.
 */
export interface TemplateSlot {
  /** same as `elementId` (the name template-deck.ts uses) */
  id: string
  /** the id of the text element in `slide.elements` */
  elementId: string
  role: SlotRole
  /** the file's own words in this box: a guide to its role and length, never to be copied into the new deck */
  sample: string
  /** the letters that really fit in the box at its font size (heavy and capital type is wider), counted over ALL lines, like the Morph templates' `room` */
  maxChars: number
  /** how many lines the box has room for */
  maxLines: number
  /** how many paragraphs / bullets the sample has */
  lines: number
  /** an address, phone number, e-mail, link or credit: only the user can supply it (left empty when not given) */
  detail: boolean
  /** the box holds only a figure ("40%", "2026", "$1.2M") */
  numeric: boolean
  /** always false for an uploaded file (kept for the shared fit/sanitise code) */
  ticker: false
}

/** Text repeated on most slides (a wordmark, a section label, the date or footer): kept as it is, or replaced once for the whole deck. */
export interface TemplateChrome {
  id: string
  sample: string
  maxChars: number
  /** where it is, one entry per slide it appears on */
  refs: { slide: number; elementId: string }[]
}

export interface PicturePlacement {
  elementId: string
  /** a big photo the new deck may swap for another; false = a logo, icon, texture or small picture that belongs to the design */
  replaceable: boolean
  kind: 'photo' | 'logo' | 'icon' | 'texture' | 'background' | 'masked'
  /** the stored asset (an asset of the uploading user, see `slide.elements[].src`); absent when the picture could not be kept */
  assetId?: string
  /** on-slide size in canvas px, and what share of the slide it covers (0-1) */
  width: number
  height: number
  coverage: number
  /** it comes from the file's slide master or layout (repeated on every slide that uses it) */
  inherited: boolean
}

export interface UploadedFont {
  /** the typeface name written in the file */
  original: string
  /** the font of this app that stands in for it (same as `original` when it is already supported) */
  mapped: string
  /** false when the app has no such font and `mapped` is the nearest match: tell the user "X was replaced by Y" */
  replaced: boolean
  /** where the theme uses it */
  role: 'heading' | 'body' | 'other'
  /** how many text boxes use it */
  uses: number
}

export interface TemplateSlide {
  /** 1-based position in the SOURCE file (hidden slides are skipped but keep their number gap) */
  n: number
  /** the slide's title text when it has one, else "Slide n" */
  name: string
  /** the source slide layout's name ("Title Slide", "Two Content") */
  layoutName: string
  /** an editor-ready slide: background, every visible element in z-order (inherited master and layout graphics first, then the slide's own) */
  slide: Slide
  slots: TemplateSlot[]
  /** element ids that are decoration: shapes, lines, pictures that are not slots, repeated text, anything from the master or layout */
  decor: string[]
  pictures: PicturePlacement[]
  warnings: string[]
}

export interface UploadedTemplate {
  /** the file's name without its extension */
  name: string
  source: { kind: 'pptx' | 'pdf'; filename: string; bytes: number }
  theme: Theme
  aspect: AspectRatio
  /** the file's slide size in canvas terms, and whether it had to be fitted (a 16:10 file on the 16:9 canvas) */
  canvas: { width: number; height: number; fitted: boolean }
  slides: TemplateSlide[]
  chrome: TemplateChrome[]
  fonts: UploadedFont[]
  /** deck-level notes: embedded fonts, SmartArt, charts, WordArt, 3D, video/audio, animations, hidden / skipped slides, number of masters */
  warnings: string[]
  stats: { sourceSlides: number; importedSlides: number; skippedSlides: number; hiddenSlides: number; masters: number; elements: number; pictures: number; storedAssets: number }
}

/** What a reader (the .pptx importer now, a PDF importer later) produces BEFORE pictures are stored: picture bytes travel beside the template, referenced by `ref` in the element's `src`. */
export interface ExtractedPicture { ref: string; bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; width: number; height: number }
export interface ParsedTemplate { template: UploadedTemplate; pictures: ExtractedPicture[] }

/** The address a not-yet-stored picture carries in the element's `src` (a valid https URL so the document validates; replaced by the stored asset's URL). */
export const PENDING_ASSET_HOST = 'https://pending-asset.invalid/'
export const pendingSrc = (ref: string) => `${PENDING_ASSET_HOST}${ref}`
export const pendingRef = (src: string | undefined): string | null => (src && src.startsWith(PENDING_ASSET_HOST) ? src.slice(PENDING_ASSET_HOST.length) : null)

export const IMPORT_LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxSlides: 80,
  maxElementsPerSlide: 400,
  maxImages: 100,
  maxImageBytes: 40 * 1024 * 1024,
  /** longest side of a stored picture, canvas px */
  maxImageSide: 2400,
  maxSourcePixels: 60_000_000,
} as const

export type { AspectRatio }
