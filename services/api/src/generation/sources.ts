import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { sourceChunk, sourceDocument } from '../db/schema.ts'

const PER_SOURCE_CHARS = 40_000
const TOTAL_CHARS = 90_000

export interface LoadedSource {
  id: string
  title: string
  type: string
  url: string | null
  text: string
}

/** Loads the user's own sources (ownership enforced here, not trusted from the client) as locator-tagged text. */
/** The person's own picture attached to the request (a product photo), when there is one: the first attached picture that was kept. */
export async function productPicture(userId: string, ids: string[]): Promise<{ url: string; alt: string } | null> {
  if (ids.length === 0) return null
  const docs = await db.select().from(sourceDocument).where(and(eq(sourceDocument.userId, userId), eq(sourceDocument.status, 'ready'), eq(sourceDocument.type, 'image'), inArray(sourceDocument.id, ids)))
  const d = ids.map((id) => docs.find((x) => x.id === id)).find((x) => x?.url)
  return d?.url ? { url: d.url, alt: d.title.slice(0, 200) } : null
}

/** All the person's own pictures attached to the request, in the order they attached them (only those that were kept). */
export async function productPictures(userId: string, ids: string[]): Promise<{ url: string; alt: string }[]> {
  if (ids.length === 0) return []
  const docs = await db.select().from(sourceDocument).where(and(eq(sourceDocument.userId, userId), eq(sourceDocument.status, 'ready'), eq(sourceDocument.type, 'image'), inArray(sourceDocument.id, ids)))
  return ids.map((id) => docs.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x?.url).map((x) => ({ url: x.url!, alt: x.title.slice(0, 200) }))
}

export async function loadSources(userId: string, ids: string[]): Promise<LoadedSource[]> {
  if (ids.length === 0) return []
  const docs = await db.select().from(sourceDocument).where(and(eq(sourceDocument.userId, userId), eq(sourceDocument.status, 'ready'), inArray(sourceDocument.id, ids)))
  if (docs.length === 0) return []
  const chunks = await db.select().from(sourceChunk).where(inArray(sourceChunk.sourceId, docs.map((d) => d.id))).orderBy(asc(sourceChunk.sourceId), asc(sourceChunk.ordinal))
  let budget = TOTAL_CHARS
  return docs.map((d) => {
    let text = chunks.filter((c) => c.sourceId === d.id).map((c) => `[${c.locator ?? `part ${c.ordinal + 1}`}] ${c.text}`).join('\n')
    text = text.slice(0, Math.min(PER_SOURCE_CHARS, budget))
    budget -= text.length
    return { id: d.id, title: d.title, type: d.type, url: d.url, text }
  })
}
