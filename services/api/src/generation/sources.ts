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
