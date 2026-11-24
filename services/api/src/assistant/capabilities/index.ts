import type { Family } from '../understand.ts'
import { element } from './elements.ts'
import { background, brand, fonts, motion, palette, picture, readability, refreshPictures, template } from './look.ts'
import { duplicateSlide, enrich, lockSlide, moveSlide, removeSlide, rewriteDeck, undo } from './slides.ts'
import type { Capability } from './types.ts'
import { addSlide, combine, layout, text } from './writing.ts'
import { transition } from './transitions.ts'
import { restructure } from './restructure.ts'
import { repair } from './repair.ts'
import { footer } from './footer.ts'
import { workflow } from './workflow.ts'
import { brandKit } from './brand-kit.ts'
import { commentCap, historyCap } from './comments.ts'

/** The registry: every task family the assistant can do, and the one capability that does it. */
export const CAPABILITIES: Record<Family, Capability<any>> = {
  text, layout, add_slide: addSlide,
  remove_slide: removeSlide, move_slide: moveSlide, duplicate_slide: duplicateSlide, lock_slide: lockSlide,
  background, readability, picture, refresh_pictures: refreshPictures,
  palette, template, fonts, motion, transition, restructure, combine, repair, footer,
  undo, rewrite_deck: rewriteDeck, enrich,
  element, brand, workflow, brand_kit: brandKit, comment: commentCap, history: historyCap,
}
