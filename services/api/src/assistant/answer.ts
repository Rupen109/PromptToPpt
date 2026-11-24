import { expectationsFromChanges } from '@prompttoppt/theme'
import type { AnswerChanges, Expectation, Presentation } from '@prompttoppt/validation'
import type { CompiledAssist } from '../ai/ai-assist.ts'
import type { SlideOps } from './capabilities/types.ts'

/**
 * The changes of one assistant answer, assembled in ONE place (the route and the scenario tests both use it), and what the answer PROMISES about the deck as checkable facts.
 * `pictures` are the free photos the route found, `pictureSwaps` the cut-outs that really came out transparent.
 */
export interface AnswerParts {
  compiled: CompiledAssist
  slideOps: SlideOps
  pictures: { slideId: string; placement: 'background' | 'beside' | 'floating'; url: string; alt: string }[]
  pictureSwaps: { slideId: string; elementId: string; url: string; alt: string; transparentShare?: number | undefined }[]
  newId: () => string
}

export function buildAnswer(before: Presentation, p: AnswerParts): { changes: AnswerChanges; expect: Expectation[] } {
  const g = p.compiled
  // a new slide always has an id, so later changes (and the checks) can name it
  const additions = g.additions.map((a) => (a.id ? a : { ...a, id: p.newId() }))
  const changes: AnswerChanges = {
    theme: g.theme ?? p.slideOps.brandThemes[0] ?? null, edits: g.edits, additions, backgrounds: g.backgrounds, gradients: p.slideOps.gradients, blurs: p.slideOps.blurs, patterns: p.slideOps.patterns, backgroundCopies: p.slideOps.backgroundCopies, slideBrands: p.slideOps.slideBrands, clearPictures: p.slideOps.clearPictures, pictureSwaps: [...p.slideOps.swaps.map((x) => ({ ...x, replaced: true as const })), ...p.pictureSwaps], elementChanges: p.slideOps.elementChanges,
    readability: g.readability, pictures: p.pictures, duplicates: p.slideOps.duplicates, moves: p.slideOps.moves, locks: p.slideOps.locks, transitions: p.slideOps.transitions, removals: p.slideOps.removals, reverts: g.reverts, images: g.images, rewrite: g.rewrite,
  }
  return { changes, expect: expectationsFromChanges(before, changes) }
}

/** An answer only needs judging when it changes the deck (not when it only proposes pictures, starts a rebuild or puts something back). */
export const changesTheDeck = (expect: Expectation[]) => expect.some((e) => !['revert', 'proposal', 'rewrite'].includes(e.kind))
