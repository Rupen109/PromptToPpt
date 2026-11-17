import { beforeEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { presentationSchema } from '@prompttoppt/validation'
import { assetIdFromUrl } from '../brand/assets.ts'
import { db } from '../db/index.ts'
import { generatedAsset } from '../db/schema.ts'
import { closePool } from '../sources/parse-pool.ts'
import { setStorage, type AssetStorage } from '../storage/index.ts'
import { importPptxTemplate, parseTemplateFile } from './index.ts'
import { miniPptx, picture, sp, para, testPng } from './test-fixtures.ts'
import { pendingRef } from './types.ts'

const E = 12700
const b = (x: number, y: number, w: number, h: number) => ({ x: x * E, y: y * E, w: w * E, h: h * E })
const mem = (): AssetStorage & { keys: string[] } => { const m = new Map<string, Uint8Array>(); return { keys: [], async put(k, bytes) { m.set(k, bytes); this.keys.push(k) }, async get(k) { return m.get(k) ?? null } } }
const deck = () => miniPptx({ size: { cx: 960 * E, cy: 540 * E }, slides: [sp(3, 't', b(20, 20, 300, 50), { txBox: true, text: para('Hello', { sz: 24 }) }) + picture(2, 'Hero', b(300, 100, 400, 250), 'rId5') + picture(4, 'Hero2', b(10, 300, 200, 100), 'rId5')], slideRels: { 0: [{ id: 'rId5', type: 'image', target: '../media/p.png' }] }, media: { 'p.png': testPng(300, 200) } })

describe('importPptxTemplate (parse in the worker, pictures stored as the user\'s own assets)', () => {
  let storage: ReturnType<typeof mem>
  beforeEach(() => { storage = mem(); setStorage(storage) })

  it('stores each picture once under the user, swaps the pending addresses for asset URLs, and keeps the document valid', async () => {
    const userId = `tpl-user-${Date.now()}`
    const t = await importPptxTemplate(deck(), { userId, filename: 'brand deck.pptx' })
    const images = t.slides[0]!.slide.elements.filter((e) => e.type === 'image')
    expect(images).toHaveLength(2)
    for (const im of images) {
      expect(pendingRef(im.src)).toBeNull()
      const id = assetIdFromUrl(im.src!)
      expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/)
      const [row] = await db.select().from(generatedAsset).where(and(eq(generatedAsset.id, id!), eq(generatedAsset.userId, userId)))
      expect(row).toMatchObject({ kind: 'template', status: 'ready', mime: expect.stringMatching(/^image\/(png|jpeg)$/) })
      expect(row!.bytes).toBeLessThan(8 * 1024 * 1024)
      expect(await storage.get(row!.storageKey)).not.toBeNull()
    }
    expect(t.stats.storedAssets).toBe(2)
    expect(t.slides[0]!.pictures.every((p) => !!p.assetId)).toBe(true)
    const r = presentationSchema.safeParse({ schemaVersion: 1, id: 'x', title: t.name, aspectRatio: t.aspect, language: 'en', theme: t.theme, slides: t.slides.map((s) => s.slide) })
    expect(r.success).toBe(true)
    expect(t.name).toBe('brand deck')
  })
  it('importing the same file again reuses the pictures it already stored (no pile-up)', async () => {
    const userId = `tpl-user-again-${Date.now()}`
    const a = await importPptxTemplate(deck(), { userId, filename: 'a.pptx' })
    const before = storage.keys.length
    const c = await importPptxTemplate(deck(), { userId, filename: 'a.pptx' })
    expect(storage.keys.length).toBe(before)
    const srcs = (t: typeof a) => t.slides[0]!.slide.elements.flatMap((e) => (e.type === 'image' ? [e.src] : []))
    expect(srcs(c)).toEqual(srcs(a))
  })
  it('another person importing the same file gets their own copies', async () => {
    const x = await importPptxTemplate(deck(), { userId: `tpl-a-${Date.now()}`, filename: 'a.pptx' })
    const y = await importPptxTemplate(deck(), { userId: `tpl-b-${Date.now()}`, filename: 'a.pptx' })
    const id = (t: typeof x) => assetIdFromUrl((t.slides[0]!.slide.elements.find((e) => e.type === 'image') as { src: string }).src)
    expect(id(x)).not.toBe(id(y))
  })
  it('refuses a damaged PDF and anything that is not a presentation, with a sentence for the person', async () => {
    await expect(parseTemplateFile(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), 'a.pdf')).rejects.toThrow(/PDF could not be opened/)
    await expect(parseTemplateFile(new Uint8Array(Buffer.from('hello world')), 'a.txt')).rejects.toThrow(/Upload a PowerPoint/)
    await expect(importPptxTemplate(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), { userId: 'u', filename: 'old.ppt' })).rejects.toThrow(/Old \.ppt/)
  })
  it('runs in a worker thread and stops there when the file is hostile, leaving the API alive', async () => {
    const bad = new Uint8Array(50 * 1024).fill(0x50)
    await expect(importPptxTemplate(bad, { userId: 'u', filename: 'bad.pptx' })).rejects.toThrow(/not a PowerPoint|could not be opened|damaged/)
    await closePool()
  })
})
