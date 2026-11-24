import type { Slide, SlideContent, TextElement, Theme } from './presentation'

/** a brand on ONE slide (packages/theme slide-theme.ts) */
export type SlideBrand = NonNullable<Slide['brand']>

/**
 * What an assistant answer PROMISES, as small checkable facts (docs/AI_EDIT_HONESTY_AND_SCENARIOS.md). Built by the server from the answer and the saved deck, carried with the answer, stored with the
 * request, and checked by `evaluate` (packages/theme/src/assist) against a DOCUMENT: by the editor on its live deck right after applying, and by the server on the saved deck when credits are
 * settled. Nothing here depends on which command did the work: only on what the deck must look like afterwards. (The types live here so the API client can name them.)
 */
export type ThemePart = 'colours' | 'fonts' | 'style' | 'motion' | 'design' | 'mode' | 'logo'

/**
 * One change to ONE element, planned into absolute values (so the editor applies it with its own commands and the check compares the deck with exactly these numbers). Built by planElementChange
 * (packages/theme/src/assist/element-ops.ts) from what the person asked ("make it bigger", "move it to the right", "text size 32").
 */
/** How a slide arrives, as the assistant plans it: the type and only the options the person asked for (the rest stay as the slide has them). */
export interface TransitionSpec { type: 'none' | 'fade' | 'slide' | 'zoom' | 'push' | 'wipe' | 'morph'; duration?: number; direction?: 'left' | 'right' | 'up' | 'down'; advanceAfter?: number }
/** An animation of ONE object, as planned: the effect and only the options asked for (the rest come from the effect's own defaults), or taking all its animations off. */
/** one animation as it is played (the Animation Painter copies these) */
export type PaintedEffect = { type: string; start?: 'click' | 'with' | 'after' | undefined; duration?: number | undefined; delay?: number | undefined; repeat?: number | undefined; loop?: boolean | undefined; distance?: number | undefined; direction?: string | undefined; textBy?: string | undefined; easing?: string | undefined; reverse?: boolean | undefined }
/** an animation change of one object: take animations off (all of them, one kind, or ONE animation by its id), move it in the play order, make all of its animations start the same way, put the slide's animations in this order of objects, copy another object's animations (Animation Painter), or add one */
export type EffectPlan = { clear: true; kind?: 'entrance' | 'emphasis' | 'exit'; effectId?: string } | { moveTo: number } | { setStart: 'click' | 'with' | 'after' } | { sequence: string[] } | { paint: PaintedEffect[] } | { type: string; /** rewinds when it has played (PowerPoint's Rewind) */ reverse?: boolean; /** plays when THIS object is clicked (PowerPoint's Trigger) instead of in the slide's click sequence */ trigger?: string; easing?: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'power2-out' | 'power2-in-out' | 'back-out'; start?: 'click' | 'with' | 'after'; duration?: number; delay?: number; repeat?: number; loop?: boolean; distance?: number; direction?: 'left' | 'right' | 'up' | 'down'; textBy?: 'paragraph' | 'word' | 'letter' }
/** A deck-level change the person has CONFIRMED (delete these slides, put the slides in this order, replace every picture, rebuild the whole deck). It travels with the confirming request and is checked against the deck again before anything happens. */
export type Restructure = { kind: 'remove'; slideIds: string[] } | { kind: 'reorder'; order: string[] } | { kind: 'refresh_pictures' } | { kind: 'clear_pictures' } | { kind: 'clear_animations' } | { kind: 'text_bulk'; request: string; addPoints?: number | undefined; totalPoints?: number | undefined; length?: 'longer' | 'shorter' | undefined; notesOnly?: boolean | undefined; notesSeconds?: number | undefined; slideIds: string[] } | { kind: 'add_bulk'; about?: string | undefined; count: number; where: 'end' | 'start' | 'spread'; layout?: string | undefined } | { kind: 'rewrite'; brief: string } | { kind: 'sections'; items: { title: string; beforeSlideId: string }[] } | { kind: 'proceed'; tasks: { family: string; targets: unknown[]; values: Record<string, unknown>; phrase?: string | undefined }[]; /** the parts of a long message left for the next step */ later?: string[] | undefined }
/** a shape the assistant may draw: the basic kinds and every shape of the editor's library (SHAPE_PATH_IDS); the schema checks the name, never a model */
export type ShapeKind = string
export interface ElementChange {
  slideId: string
  elementId: string
  /** geometry and text properties to set (absolute) */
  patch?: { x?: number; y?: number; width?: number; height?: number; fontSize?: number; align?: 'left' | 'center' | 'right' | 'justify'; color?: string; uppercase?: boolean; /** shapes: the kind (one of the editor's shapes); any object: turned by so many degrees */ shape?: string; rotation?: number; /** pictures and shapes: mirrored left-right / upside down */ flipH?: boolean; flipV?: boolean; /** any object: locked, switched off (hidden), its name in the Selection pane */ locked?: boolean; hidden?: boolean; label?: string; /** text: place in its box, spacing (line height and paragraph gap in multiples of the size, letter spacing in px), weight */ valign?: 'top' | 'middle' | 'bottom'; lineHeight?: number; letterSpacing?: number; /** text: the box's shadow and outline (null = off) */ textShadow?: 'soft' | 'strong' | null; textOutline?: { color: string; width: number } | null; paraGap?: number; weight?: number; /** text: the same words with their letters' case changed, or as a list (worked out by code from the text as it is; never written by a model) */ paragraphs?: TextElement['paragraphs']; /** pictures: the colour wash over it (null = none) */ overlay?: { from: string; to: string; angle: number; opacity: number } | null; /** shapes (opacity: any object) */ fill?: string; /** a two-colour gradient (hex), replacing the fill */ gradient?: { from: string; to: string; angle: number; kind?: 'linear' | 'radial' | undefined }; stroke?: string; strokeWidth?: number; /** shapes: the border (or a line) dashed / dotted; null = solid again */ strokeDash?: 'dash' | 'dot' | null; radius?: number; opacity?: number; /** pictures: the crop shape and how the picture fills its frame */ clip?: 'none' | 'circle' | 'arch' | 'diagonal' | 'diagonal-flip' | 'hex'; fit?: 'cover' | 'contain'; /** pictures: zoom (1 = none), which part shows, light, shadow */ zoom?: number; focus?: { x: number; y: number }; filter?: { brightness: number; contrast: number; grayscale: number; saturation?: number | undefined; warmth?: number | undefined; blur?: number | undefined }; /** pictures: a line round the inside of the frame (null = none) */ border?: { color: string; width: number } | null; shadow?: 'none' | 'soft' | 'strong'; /** charts: the new type, and the labels and series after a re-order (the figures are the chart's own, only moved) */ chartType?: 'bar' | 'line' | 'area' | 'scatter' | 'pie' | 'doughnut'; labels?: string[]; series?: { name: string; values: number[] }[]; /** charts: where the legend goes (null = automatic), a trend line, the figures on the marks, one colour per series or slice */ legend?: 'none' | 'bottom' | 'right' | null; trendline?: boolean; dataLabels?: boolean; colors?: string[]; /** bar charts: the series stacked, or as shares of 100% (null = side by side) */ stack?: 'stacked' | 'percent' | null; /** tables: the new header and rows (new cells are empty, existing text is only moved or removed) and the colours */ header?: string[]; rows?: string[][]; highlights?: { row: number; column: number; fill: string }[]; /** tables: the merged cells (table-merge.ts; null = none) */ merges?: { row: number; column: number; rows: number; columns: number }[] | null; /** tables: cells' own alignment (null = none) */ aligns?: { row: number; column: number; h?: 'left' | 'center' | 'right' | undefined; v?: 'top' | 'middle' | 'bottom' | undefined }[] | null; headerFill?: string; headerColor?: string; rowFill?: string; altRowFill?: string; textColor?: string; borderColor?: string }
  /** bring the object all the way to the front or send it all the way to the back of its slide; or put it right in front of (above) / right behind another object of the slide (`layerOf`) */
  layer?: 'front' | 'back' | 'above' | 'behind'
  layerOf?: string
  /** make these objects one group, or take them out of their group: `ids` are all the objects of the slide it is about; `groupId` is the id the new group gets */
  group?: { to: 'group' | 'ungroup'; ids: string[]; groupId: string }
  /** an animation to put on the object (or all of its animations to take off) */
  effect?: EffectPlan
  /** a NEW chart built from a table's own numbers (its `elementId` is the id it gets); the data is the table's, moved, never written by a model */
  addChart?: { chartType: 'bar' | 'line' | 'area' | 'scatter' | 'pie' | 'doughnut'; labels: string[]; series: { name: string; values: number[] }[]; unit?: string; x: number; y: number; width: number; height: number; /** the table it was made from; absent = from figures the person typed */ fromTableId?: string }
  /** a copy of an object of another slide (its `elementId` is the id the copy gets) */
  copy?: { fromSlideId: string; fromElementId: string }
  /** a NEW shape to put on the slide (its `elementId` is the id it gets); every value is already worked out, none comes from a model */
  add?: { shape: ShapeKind; x: number; y: number; width: number; height: number; fill: string; stroke?: string; strokeWidth?: number; radius?: number; opacity?: number; zIndex?: number }
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** a picture's cut-out, as fractions of the WHOLE picture (null = no crop), and the picture's own shape (width ÷ height, measured by the server): the editor's Crop command applies it and sizes the frame */
  crop?: { rect: { x: number; y: number; w: number; h: number } | null; sourceAspect: number }
  /** delete the element */
  remove?: true
  /** how it is worded: "Made {} bigger" + "the picture" ({} is where the object and its slide go) */
  verb: string
  /** further wording when several operations on the same object were merged into this one change */
  alsoVerbs?: string[]
  desc: string
}

export type Expectation = { key: string } & (
  | { kind: 'theme'; to: Theme; parts: ThemePart[]; mode?: 'light' | 'dark' }
  | { kind: 'edit'; slideId: string; content: SlideContent; /** picture_off: a picture layout switched to one without a picture ("remove the image"): said as that, not as a layout change */ change: 'text' | 'layout' | 'notes' | 'picture_off' }
  | { kind: 'addition'; id: string; layout: string }
  | { kind: 'background'; slideId: string; color: string; was: string | null }
  | { kind: 'gradient'; slideId: string; from: string; to: string; /** from the middle out (absent = linear) */ radial?: boolean | undefined }
  | { kind: 'background_blur'; slideId: string; blur: number }
  | { kind: 'background_pattern'; slideId: string; pattern: 'dots' | 'grid' | 'lines' | 'diagonal' | null }
  /** a brand on THIS slide only (null = the slide is back in the deck's own look) */
  | { kind: 'slide_brand'; slideId: string; brand: SlideBrand | null }
  /** the slide has the background of `fromSlideId`, as it is */
  | { kind: 'background_copy'; slideId: string; fromSlideId: string }
  | { kind: 'clear_pictures'; slideId: string; hadPicture: boolean }
  | { kind: 'picture_swap'; slideId: string; elementId: string; from: string; to: string; /** share of the new picture that is see-through, measured when it was made */ transparentShare?: number; /** the person's own uploaded picture put in place (not a cut-out) */ replaced?: boolean; /** where the replacing picture came from: a free stock photo (absent = the person's own upload) */ source?: 'photo' | undefined }
  | { kind: 'readability'; slideId: string; hadIssues: boolean }
  | { kind: 'photo'; slideId: string; url: string; placement: 'background' | 'beside' | 'floating' }
  | { kind: 'duplicate'; slideId: string; newId: string; /** the slide's number when the person asked (the reply names THAT slide, then where the copy is) */ from?: number | undefined }
  | { kind: 'move'; slideId: string; afterSlideId: string | null; inPlace: boolean; /** the slide's number when the person asked */ from?: number | undefined }
  | { kind: 'lock'; slideId: string; locked: boolean; wasLocked: boolean }
  | { kind: 'transition'; slideId: string; to: TransitionSpec; /** the slide already arrives like that */ already: boolean }
  | { kind: 'removal'; slideId: string; slideNo: number }
  | { kind: 'element'; change: ElementChange; /** true when the element already is as asked */ already: boolean }
  | { kind: 'revert'; theme: boolean; slideIds: string[] }
  | { kind: 'proposal'; count: number }
  | { kind: 'rewrite'; picturesOnly: boolean }
)
export type ExpectationKind = Expectation['kind']

/** The parts of an assistant answer that change the deck, as the editor applies them (a structural subset of the editor's `AssistChanges`, plus the answer's own extras). */
export interface AnswerChanges {
  theme: Theme | null
  edits: { slideId: string; content: SlideContent }[]
  additions?: { afterSlideId: string | null; content: SlideContent; id?: string | undefined; atStart?: boolean | undefined }[] | undefined
  backgrounds?: { slideId: string; color: string }[] | undefined
  gradients?: { slideId: string; from: string; to: string; kind?: 'radial' | undefined }[] | undefined
  /** background pictures softened (0 = sharp again) */
  blurs?: { slideId: string; blur: number }[] | undefined
  /** a pattern over a slide's background colour (null = none) */
  patterns?: { slideId: string; kind: 'dots' | 'grid' | 'lines' | 'diagonal' | null }[] | undefined
  /** one slide's background, exactly as it is, put on other slides (the editor's copyBackground) */
  backgroundCopies?: { fromSlideId: string; slideIds: string[] }[] | undefined
  /** a brand put on some slides only, or taken off them (brand null): the editor's applyBrandToSlides / removeSlideBrand */
  slideBrands?: { slideIds: string[]; brand: SlideBrand | null }[] | undefined
  clearPictures?: string[] | undefined
  pictureSwaps?: { slideId: string; elementId: string; url: string; alt: string; transparentShare?: number | undefined; replaced?: boolean | undefined; /** where the replacing picture came from: a free stock photo (absent = the person's own upload) */ source?: 'photo' | undefined }[] | undefined
  readability?: string[] | undefined
  pictures?: { slideId: string; url: string; alt?: string | undefined; placement?: 'background' | 'beside' | 'floating' | undefined }[] | undefined
  duplicates?: { slideId: string; newId: string }[] | undefined
  moves?: { slideId: string; afterSlideId: string | null }[] | undefined
  locks?: { slideId: string; locked: boolean }[] | undefined
  transitions?: { slideId: string; to: TransitionSpec }[] | undefined
  removals?: string[] | undefined
  elementChanges?: ElementChange[] | undefined
  reverts?: { slideId?: string | undefined; part?: string | undefined }[] | undefined
  images?: unknown[] | undefined
  rewrite?: { picturesOnly?: boolean | undefined } | null | undefined
}

