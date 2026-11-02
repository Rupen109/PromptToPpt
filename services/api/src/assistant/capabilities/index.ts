import type { Family } from '../understand.ts'
import { background, fonts, motion, palette, picture, readability, refreshPictures, template } from './look.ts'
import { duplicateSlide, enrich, lockSlide, moveSlide, removeSlide, rewriteDeck, undo } from './slides.ts'
import type { Capability } from './types.ts'
import { addSlide, layout, text } from './writing.ts'

/** The registry: every task family the assistant can do, and the one capability that does it. */
export const CAPABILITIES: Record<Family, Capability<any>> = {
  text, layout, add_slide: addSlide,
  remove_slide: removeSlide, move_slide: moveSlide, duplicate_slide: duplicateSlide, lock_slide: lockSlide,
  background, readability, picture, refresh_pictures: refreshPictures,
  palette, template, fonts, motion,
  undo, rewrite_deck: rewriteDeck, enrich,
}
