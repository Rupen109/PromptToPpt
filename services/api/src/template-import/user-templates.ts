import { and, count, desc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { Slide, Theme } from '@prompttoppt/validation'
import { GateError } from '../billing/errors.ts'
import { db } from '../db/index.ts'
import { userTemplate } from '../db/schema.ts'
import { classifySlides } from '../generation/uploaded-template.ts'
import type { UploadedFont, UploadedTemplate } from './types.ts'

/** Uploaded designs one person keeps (each also keeps its pictures as the person's own assets, capped separately by MAX_TEMPLATE_ASSETS_PER_USER). */
export const MAX_USER_TEMPLATES = 20

export interface TemplateSummary {
  id: string
  name: string
  filename: string
  aspect: string
  slideCount: number
  /** one entry per template slide: what the editor's "From your template" menu and the create screen list */
  layouts: { index: number; name: string; layoutName: string; kind: 'cover' | 'content' | 'closing' }[]
  /** fonts the app had to replace ("Segoe UI -> Inter") */
  fontsReplaced: { original: string; mapped: string }[]
  warnings: string[]
  createdAt: string
}

export const summaryOf = (id: string, createdAt: Date, t: UploadedTemplate): TemplateSummary => {
  const { kinds } = classifySlides(t)
  return {
    id, name: t.name, filename: t.source.filename, aspect: t.aspect, slideCount: t.slides.length,
    layouts: t.slides.map((s, index) => ({ index, name: s.name, layoutName: s.layoutName, kind: kinds[index]! })),
    fontsReplaced: t.fonts.filter((f: UploadedFont) => f.replaced).map((f) => ({ original: f.original, mapped: f.mapped })),
    warnings: t.warnings.slice(0, 30), createdAt: createdAt.toISOString(),
  }
}

/** Refuses BEFORE the file is read when the person is at the cap (the work would be wasted). */
export async function assertTemplateRoom(userId: string) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(userTemplate).where(eq(userTemplate.userId, userId))
  if (n >= MAX_USER_TEMPLATES) throw new GateError('LIMIT_REACHED', `You can keep up to ${MAX_USER_TEMPLATES} uploaded designs. Delete one to add another.`, 429, { feature: 'templateFromFile', limit: MAX_USER_TEMPLATES })
}

export async function saveUserTemplate(userId: string, t: UploadedTemplate): Promise<TemplateSummary> {
  await assertTemplateRoom(userId)
  const id = nanoid(16)
  const [row] = await db.insert(userTemplate).values({ id, userId, name: t.name.slice(0, 200) || 'Uploaded design', sourceFilename: t.source.filename.slice(0, 300), aspect: t.aspect, slideCount: t.slides.length, data: t as unknown as Record<string, unknown> }).returning()
  return summaryOf(id, row!.createdAt, t)
}

/** The whole template, only for its owner. */
export async function getUserTemplate(userId: string, id: string): Promise<{ template: UploadedTemplate; createdAt: Date } | null> {
  const [row] = await db.select({ data: userTemplate.data, createdAt: userTemplate.createdAt }).from(userTemplate).where(and(eq(userTemplate.id, id), eq(userTemplate.userId, userId)))
  return row ? { template: row.data as unknown as UploadedTemplate, createdAt: row.createdAt } : null
}

/** Newest first. Each entry carries its first slide and theme so the picker can draw a thumbnail, without loading every slide of every template. */
export async function listUserTemplates(userId: string) {
  const rows = await db.select({
    id: userTemplate.id, name: userTemplate.name, filename: userTemplate.sourceFilename, aspect: userTemplate.aspect, slideCount: userTemplate.slideCount, createdAt: userTemplate.createdAt,
    cover: sql<Slide | null>`${userTemplate.data}->'slides'->0->'slide'`, theme: sql<Theme>`${userTemplate.data}->'theme'`,
    fontsReplaced: sql<{ original: string; mapped: string }[]>`coalesce((select jsonb_agg(jsonb_build_object('original', f->>'original', 'mapped', f->>'mapped')) from jsonb_array_elements(${userTemplate.data}->'fonts') f where f->>'replaced' = 'true'), '[]'::jsonb)`,
  }).from(userTemplate).where(eq(userTemplate.userId, userId)).orderBy(desc(userTemplate.createdAt), desc(userTemplate.id)).limit(MAX_USER_TEMPLATES)
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

/** Deleting a design does not touch decks made from it (they hold their own copies of its slides), nor its pictures, which those decks may still show. */
export async function deleteUserTemplate(userId: string, id: string): Promise<boolean> {
  const res = await db.delete(userTemplate).where(and(eq(userTemplate.id, id), eq(userTemplate.userId, userId))).returning({ id: userTemplate.id })
  return res.length > 0
}
