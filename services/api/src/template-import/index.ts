import { createHash } from 'node:crypto'
import { and, count, eq, isNull } from 'drizzle-orm'
import { presentationSchema, type Slide } from '@prompttoppt/validation'
import { assetIdFromUrl, assetUrl, deleteAsset, storeAsset } from '../brand/assets.ts'
import { db } from '../db/index.ts'
import { generatedAsset } from '../db/schema.ts'
import { SourceError } from '../sources/errors.ts'
import { parseTemplateUpload } from '../sources/parse-pool.ts'
import { isOle, isZip } from '../sources/zip.ts'
import { pendingRef, type ParsedTemplate, type UploadedTemplate } from './types.ts'

export type * from './types.ts'
export { IMPORT_LIMITS, SLOT_ROLES, pendingRef, pendingSrc } from './types.ts'

/** Most template pictures one person keeps (every imported deck stores its pictures as the person's own assets). */
export const MAX_TEMPLATE_ASSETS_PER_USER = 1500

const mine = (userId: string) => and(eq(generatedAsset.userId, userId), eq(generatedAsset.kind, 'template'), eq(generatedAsset.status, 'ready'), isNull(generatedAsset.deletedAt))

/**
 * The entry point the route calls: reads the uploaded file (in the parse worker, under its memory and time limits) and returns the template with its pictures
 * already stored as the user's assets. .pptx and PDF (parse-pdf.ts) produce the same `UploadedTemplate`; the worker picks the reader by the file's first bytes.
 */
export async function importTemplateBytes(buffer: Uint8Array | Buffer, o: { userId: string; filename: string }): Promise<UploadedTemplate> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const parsed = await parseTemplateFile(bytes, o.filename)
  return storeTemplatePictures(parsed, o.userId)
}

/** Runs the reader the file's content calls for (PowerPoint or PDF) in the worker pool. */
export async function parseTemplateFile(bytes: Uint8Array, filename: string): Promise<ParsedTemplate> {
  const pdf = bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
  if (!pdf && !isZip(bytes) && !isOle(bytes) && !/\.pptx?$/i.test(filename)) throw new SourceError('Upload a PowerPoint (.pptx) or PDF file to use as a template.')
  return parseTemplateUpload(bytes, filename)
}

/** Stores the extracted pictures as the user's assets and puts their addresses where the pending ones were. Reuses a picture the user already stored from the same bytes. */
export async function storeTemplatePictures(parsed: ParsedTemplate, userId: string): Promise<UploadedTemplate> {
  const { template, pictures } = parsed
  const urlOf = new Map<string, string>()
  const created: string[] = []
  if (pictures.length) {
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(generatedAsset).where(mine(userId))
    if (n + pictures.length > MAX_TEMPLATE_ASSETS_PER_USER) throw new SourceError('You have stored a lot of template pictures already. Delete an older uploaded template, then try again.')
    try {
      for (const p of pictures) {
        const sha = createHash('sha256').update(p.bytes).digest('hex').slice(0, 40)
        const label = `template-picture:${sha}`
        const [same] = await db.select({ id: generatedAsset.id }).from(generatedAsset).where(and(mine(userId), eq(generatedAsset.prompt, label), eq(generatedAsset.mime, p.mime), eq(generatedAsset.bytes, p.bytes.length))).limit(1)
        const id = same?.id ?? await storeAsset(userId, 'template', Buffer.from(p.bytes), p.mime, label)
        if (!same) created.push(id)
        urlOf.set(p.ref, assetUrl(id))
      }
    } catch (e) {
      for (const id of created) await deleteAsset(userId, id).catch(() => false)
      throw e
    }
  }
  const swap = (src: string | undefined): string | undefined => { const r = pendingRef(src); return r ? urlOf.get(r) ?? src : src }
  for (const t of template.slides) {
    const s = t.slide
    for (const el of s.elements) if (el.type === 'image' && el.src) el.src = swap(el.src)!
    if (s.background?.type === 'image') s.background = { ...s.background, value: swap(s.background.value)! }
    for (const pl of t.pictures) { const el = s.elements.find((e) => e.id === pl.elementId); const id = el?.type === 'image' && el.src ? assetIdFromUrl(el.src) : null; if (id) pl.assetId = id }
    const r = presentationSchema.safeParse({ schemaVersion: 1, id: 'template-check', title: template.name, aspectRatio: template.aspect, language: 'en', theme: template.theme, slides: [s], sources: [] })
    if (!r.success) throw new SourceError('That presentation could not be converted into a valid template')
    t.slide = r.data.slides[0] as Slide
  }
  template.stats.storedAssets = urlOf.size
  return template
}

/** the .pptx entry point under its first name; PDFs go through the same function */
export const importPptxTemplate = importTemplateBytes
export const importPdfTemplate = importTemplateBytes
