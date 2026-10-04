import { nanoid } from 'nanoid'
import { db } from '../db/index.ts'
import { sourceChunk, sourceDocument } from '../db/schema.ts'
import { chunkText, type Extracted } from './extract.ts'

export type SourceType = 'text' | 'url' | 'pdf' | 'pptx'

/** Persists extracted text as a private source (+ chunks with citation locators). Shared by the sources API and draft hand-off. */
export async function saveSource(userId: string, type: SourceType, ex: Extracted, url?: string) {
  const chunks = chunkText(ex.parts)
  if (chunks.length === 0) throw new Error('No readable text found')
  const id = nanoid()
  await db.transaction(async (tx) => {
    await tx.insert(sourceDocument).values({ id, userId, type, title: ex.title, url: url ?? null })
    await tx.insert(sourceChunk).values(chunks.map((ch, i) => ({ id: nanoid(), sourceId: id, ordinal: i, locator: ch.locator, text: ch.text })))
  })
  return { id, type, title: ex.title, chunks: chunks.length }
}
