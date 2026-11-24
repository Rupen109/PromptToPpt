import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { APPROVED_FOR_PRODUCTION, PROVIDERS, activeBackgroundProvider } from './bg-providers.ts'
import { photoroomRemoveBackground } from './photoroom.ts'
import { CutoutError } from './cutout.ts'

const picture = () => sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer()
const cutout = () => sharp({ create: { width: 200, height: 150, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: { create: { width: 100, height: 100, channels: 4, background: { r: 10, g: 200, b: 10, alpha: 1 } } }, left: 50, top: 25 }]).png().toBuffer()

describe('the production background removal provider', () => {
  it('is approved with evidence that exists, and a development-only provider never is', () => {
    for (const [id, a] of Object.entries(APPROVED_FOR_PRODUCTION)) {
      expect(PROVIDERS[id]!.devOnly).toBe(false)
      expect(existsSync(join(__dirname, '../../../..', a.evidence)), `${id}: evidence file missing`).toBe(true)
    }
    expect(Object.keys(APPROVED_FOR_PRODUCTION)).toContain('photoroom')
  })
  it('is offered only when its key is set; production defaults to it; a development model is never used in production', () => {
    expect(activeBackgroundProvider('production', undefined, {})).toBeNull() // no key: nothing is promised that cannot run
    expect(activeBackgroundProvider('production', undefined, { PHOTOROOM_API_KEY: 'k' })).toBe('photoroom')
    expect(activeBackgroundProvider('production', 'server-dev', { PHOTOROOM_API_KEY: 'k' })).toBeNull()
    expect(activeBackgroundProvider('development', undefined, {})).toBe('server-dev')
    expect(activeBackgroundProvider('development', 'photoroom', {})).toBeNull()
  })
})

describe('Photoroom adapter', () => {
  it('sends the picture with the key, asks for a PNG cropped to the subject, and returns a real transparent PNG', async () => {
    let seen: { url: string; key: string | null; fields: string[] } | null = null
    const fetchFn = (async (url: string, init: RequestInit) => {
      const form = init.body as FormData
      seen = { url, key: (init.headers as Record<string, string>)['x-api-key']!, fields: [...form.keys()] }
      return new Response(new Uint8Array(await cutout()), { status: 200 })
    }) as unknown as typeof fetch
    const r = await photoroomRemoveBackground(await picture(), 'sandbox_k', { fetchFn })
    expect(seen).toMatchObject({ url: 'https://sdk.photoroom.com/v1/segment', key: 'sandbox_k' })
    expect(seen!.fields).toEqual(expect.arrayContaining(['image_file', 'format', 'crop']))
    expect(r).toMatchObject({ width: 200, height: 150 })
    expect((await sharp(r.png).metadata()).hasAlpha).toBe(true)
  })
  it('turns every failure into a sentence a person can act on, and never leaks the provider text', async () => {
    const bad = (status: number) => (async () => new Response('secret provider detail', { status })) as unknown as typeof fetch
    for (const [status, re] of [[401, /not available right now/], [429, /busy/], [500, /could not process/]] as const) {
      const e = await photoroomRemoveBackground(await picture(), 'k', { fetchFn: bad(status) }).catch((x) => x)
      expect(e).toBeInstanceOf(CutoutError); expect(e.message).toMatch(re); expect(e.message).not.toMatch(/secret/)
    }
    const notPng = (async () => new Response('hello', { status: 200 })) as unknown as typeof fetch
    expect(await photoroomRemoveBackground(await picture(), 'k', { fetchFn: notPng }).catch((x) => x)).toBeInstanceOf(CutoutError)
  })
})
