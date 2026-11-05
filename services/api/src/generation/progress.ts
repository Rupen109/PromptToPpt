import { and, eq } from 'drizzle-orm'
import { mergeDocs, presentationSchema, type Presentation, type Slide, type Theme } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { generationJob, presentation, presentationVersion } from '../db/schema.ts'
import { publishRevision } from '../live/bus.ts'

/**
 * Progressive generation: the deck exists from the first second and is WRITTEN INTO while the person watches it (and, once a slide is there, edits it).
 *
 * Generation is one more writer of the deck, like a collaborator. Every write goes through `writeDeck`, which keeps everything the person changed since
 * generation's previous write (the same id-addressed three-way merge the editor uses for collaborators), so a title they retyped or a slide they deleted
 * while later slides were still being written is never undone. The deck as generation last wrote it is kept on the job (`shown`) as the common ancestor.
 */

export class DeckWriteCancelled extends Error {}

/** A slide generation has not written yet: titled, empty, shown as "being written" and not editable until the writer replaces it. */
export function placeholderSlide(id: string, title: string, theme: Theme): Slide {
  return {
    id, layoutId: 'blank', locked: false, manual: false,
    background: { type: 'color', value: theme.colors.background },
    elements: [], speakerNotes: '', sources: [], validation: { status: 'pending', issues: [] },
    writing: { title: title.slice(0, 200) },
  }
}

/**
 * Element ids are made from the slide id, the kind of element and its number among that kind ("<slide>:text1"), so writing the same slide again (a picture arrives,
 * a repaired text) keeps the ids of everything that did not change. Random ids would look like "every element was replaced" to the merge and would drop
 * edits the person made to that slide in the meantime.
 */
export function stableElementIds(slide: Slide): Slide {
  const seen: Record<string, number> = {}
  return { ...slide, elements: slide.elements.map((e) => { const n = (seen[e.type] = (seen[e.type] ?? 0) + 1); return { ...e, id: `${slide.id}:${e.type}${n}` } }) }
}

/**
 * Writes `next` (what generation wants the deck to look like now) into the live deck and tells open editors. Returns the new revision.
 * Throws DeckWriteCancelled if the job was cancelled, so nothing is written after the person stopped it.
 */
export async function writeDeck(jobId: string, deckId: string, userId: string, next: Presentation): Promise<number> {
  const revision = await db.transaction(async (tx) => {
    const [job] = await tx.select({ status: generationJob.status, shown: generationJob.shown }).from(generationJob).where(eq(generationJob.id, jobId)).for('update')
    if (!job || job.status === 'cancelled') throw new DeckWriteCancelled()
    const [p] = await tx.select().from(presentation).where(and(eq(presentation.id, deckId), eq(presentation.userId, userId))).for('update')
    if (!p) throw new DeckWriteCancelled() // the person deleted the deck while it was being written
    const [latest] = await tx.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, deckId), eq(presentationVersion.version, p.latestVersion)))
    // both documents were validated when they were written (by the save route, or by this writer): merging works on them as they are, without parsing the whole deck again
    const stored = latest!.document as Presentation
    const base = (job.shown as Presentation | null) ?? stored
    const merged = mergeDocs(base, stored, { ...next, id: deckId })
    // the working copy of a deck being written is its latest version, whoever last saved into it (generation's own first version, or the person's autosave of it)
    await tx.update(presentationVersion).set({ document: merged }).where(eq(presentationVersion.id, latest!.id))
    const rev = p.revision + 1
    await tx.update(presentation).set({ title: merged.title, revision: rev, updatedAt: new Date() }).where(eq(presentation.id, deckId))
    await tx.update(generationJob).set({ shown: { ...next, id: deckId } as Record<string, unknown> }).where(eq(generationJob.id, jobId))
    return rev
  })
  publishRevision(deckId, revision, userId)
  return revision
}

/**
 * The job ended without writing every slide (failed or cancelled): placeholders that never got their text are removed, so the deck holds only what was
 * really written. A deck with nothing written at all is deleted (cancelled) so the person is not left with an empty shell.
 */
export async function closeDeck(jobId: string, deckId: string, userId: string): Promise<'kept' | 'removed'> {
  let result: 'kept' | 'removed' = 'kept'
  const revision = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(presentation).where(and(eq(presentation.id, deckId), eq(presentation.userId, userId))).for('update')
    if (!p) return null
    const [latest] = await tx.select().from(presentationVersion).where(and(eq(presentationVersion.presentationId, deckId), eq(presentationVersion.version, p.latestVersion)))
    const parsed = presentationSchema.safeParse(latest!.document)
    if (!parsed.success) return null // not a deck this code wrote: leave it exactly as it is
    const doc = parsed.data
    const written = doc.slides.filter((s) => !s.writing)
    if (written.length === 0) {
      await tx.delete(presentation).where(eq(presentation.id, deckId)) // never had content: removed for good (a soft-deleted deck would still count toward the allowance)
      result = 'removed'
      return null
    }
    if (written.length === doc.slides.length) return null
    await tx.update(presentationVersion).set({ document: { ...doc, slides: written } }).where(eq(presentationVersion.id, latest!.id))
    const rev = p.revision + 1
    await tx.update(presentation).set({ revision: rev, updatedAt: new Date() }).where(eq(presentation.id, deckId))
    return rev
  })
  if (revision) publishRevision(deckId, revision, userId)
  return result
}
