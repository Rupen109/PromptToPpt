import { commonSlideBackground, isDark, slideTitle, validateSlide } from '@prompttoppt/theme'
import type { Presentation } from '@prompttoppt/validation'
import type { RecentChange } from '../ai/ai-assist.ts'

/**
 * STAGE 1 of the assistant (no model, no cost): the facts every later stage works from. "It", "that page", "the new slide" are
 * answered from `focus`, which is built from what the assistant really did, never guessed from the wording of the chat.
 */
export interface SlideRow {
  n: number
  id: string
  layout: string
  title: string
  /** what is behind the slide: a hex colour, "picture", "gradient" or "theme" (the deck's own background) */
  background: string
  locked: boolean
  /** edited by hand in the editor: the assistant does not rewrite its words */
  handEdited: boolean
  pictures: number
  /** some text on it does not read on what is behind it */
  lowContrast: boolean
}

export interface DeckState {
  doc: Presentation
  slides: SlideRow[]
  focus: {
    /** the slide on screen (or the one the panel is limited to) */
    current: string | null
    /** slides the assistant's last answer changed or added (newest answer first in `recent`) */
    lastChanged: string[]
    lastChangeKind: 'theme' | 'slides' | null
    lastSummary: string[]
  }
  look: DeckLook
  /** the panel is limited to one slide ("This slide" mode) */
  onlySlideId: string | null
  hasSources: boolean
  /** what the assistant changed earlier in this session, newest first (needed by undo) */
  recent: RecentChange[]
}

export interface DeckLook {
  theme: string
  mode: 'light' | 'dark'
  colors: { primary: string; accent: string; background: string }
  fonts: { heading: string; body: string }
  style: { card?: string | undefined; decor?: string | undefined; photo?: string | undefined }
  commonBackground: string
  layoutsInUse: Record<string, number>
}

/** The background most slides share (ignoring one): the most common solid colour, else the deck's own background colour. */
export const commonBackground = (doc: Presentation, exceptSlideId = ''): string => commonSlideBackground(doc.slides, exceptSlideId) ?? doc.theme.colors.background.toUpperCase()

export function deckLook(doc: Presentation): DeckLook {
  const c = doc.theme.colors
  const layoutsInUse: Record<string, number> = {}
  for (const s of doc.slides) layoutsInUse[s.layoutId] = (layoutsInUse[s.layoutId] ?? 0) + 1
  return {
    theme: doc.theme.name, mode: isDark(c.background) ? 'dark' : 'light',
    colors: { primary: c.primary, accent: c.accent, background: c.background },
    fonts: doc.theme.fonts,
    style: { card: doc.theme.style?.card, decor: doc.theme.style?.decor, photo: doc.theme.style?.photo },
    commonBackground: commonBackground(doc), layoutsInUse,
  }
}

export function buildState(doc: Presentation, o: { activeSlideId?: string | undefined; onlySlideId?: string | undefined; recent?: RecentChange[] | undefined; hasSources?: boolean | undefined }): DeckState {
  const slides = doc.slides.map((s, i): SlideRow => ({
    n: i + 1, id: s.id, layout: s.layoutId, title: slideTitle(s.content),
    background: s.background?.type === 'color' ? s.background.value.toUpperCase() : s.background?.type === 'image' ? 'picture' : s.background?.type === 'gradient' ? 'gradient' : 'theme',
    locked: s.locked, handEdited: !!s.manual,
    pictures: Array.isArray(s.elements) ? s.elements.filter((e) => e.type === 'image' && !e.decorative).length : 0,
    lowContrast: Array.isArray(s.elements) && s.elements.length > 0 && validateSlide(s, doc.theme).some((x) => x.code === 'contrast'),
  }))
  const exists = (id: string | undefined) => !!id && doc.slides.some((s) => s.id === id)
  const recent = o.recent ?? []
  const last = recent[0]
  const current = exists(o.onlySlideId) ? o.onlySlideId! : exists(o.activeSlideId) ? o.activeSlideId! : null
  return {
    doc, slides,
    focus: {
      current,
      lastChanged: (last?.slideIds ?? []).filter((id) => exists(id)),
      lastChangeKind: !last ? null : last.theme && last.slideIds.length === 0 ? 'theme' : 'slides',
      lastSummary: last?.summary ?? [],
    },
    look: deckLook(doc),
    onlySlideId: exists(o.onlySlideId) ? o.onlySlideId! : null,
    hasSources: !!o.hasSources || doc.sources.length > 0,
    recent,
  }
}

/** One line per slide for a prompt: "7 | split-image-text | Architect of Pokhran-II | bg #7C2D12 | locked". */
export const slideIndexText = (s: DeckState) =>
  s.slides.map((r) => [r.n, r.layout, r.title || '(no title)', `bg ${r.background}`, ...(r.pictures ? [`${r.pictures} picture${r.pictures > 1 ? 's' : ''}`] : []), ...(r.lowContrast ? ['text hard to read'] : []), ...(r.locked ? ['locked'] : []), ...(r.handEdited ? ['hand-edited'] : [])].join(' | ')).join('\n')

export const numberOf = (s: DeckState, id: string) => (s.slides.find((r) => r.id === id)?.n ?? 0)
