import { createHash } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { MorphDecision, PromptAnalysis } from '@prompttoppt/validation'
import { db } from '../db/index.ts'
import { morphMatchLog } from '../db/schema.ts'

/**
 * The record of Morph match decisions: what was recommended for which topic and what the person finally used, so the owner can see which topics have no designed template and how often the
 * recommendation is followed (admin: Morph matches). Best effort: a failure to write is logged and never holds up a person.
 */
const hashOf = (prompt: string) => createHash('sha1').update(prompt.trim()).digest('hex').slice(0, 16)

export async function logDecision(userId: string, prompt: string, analysis: PromptAnalysis, d: MorphDecision): Promise<void> {
  try {
    await db.insert(morphMatchLog).values({
      id: nanoid(), userId, promptHash: hashOf(prompt), topic: analysis.topic.slice(0, 200), category: analysis.category ?? null, language: analysis.language, mode: d.mode, templateId: d.templateId ?? null,
      confidence: d.confidence.toFixed(2), reason: d.reason.slice(0, 300), candidates: d.candidates.map(({ id, name, slides, score }) => ({ id, name, slides, score })), excluded: d.excluded,
    })
  } catch (e) { console.error('[morph-match log]', (e as Error).message) }
}

/** The deck was started: note what it used on this person's latest decision for the same request (a template id, or null for the AI-planned deck). */
export async function markUsed(userId: string, prompt: string, usedTemplate: string | null): Promise<void> {
  try {
    const [row] = await db.select({ id: morphMatchLog.id }).from(morphMatchLog).where(and(eq(morphMatchLog.userId, userId), eq(morphMatchLog.promptHash, hashOf(prompt)), isNull(morphMatchLog.usedAt))).orderBy(desc(morphMatchLog.createdAt)).limit(1)
    if (row) await db.update(morphMatchLog).set({ usedTemplate, usedAt: new Date() }).where(eq(morphMatchLog.id, row.id))
  } catch (e) { console.error('[morph-match log]', (e as Error).message) }
}
