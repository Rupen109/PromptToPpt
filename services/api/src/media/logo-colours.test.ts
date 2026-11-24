import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { dominantColours, readLogo } from './logo-colours.ts'

const raw = async (png: Buffer) => { const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height } }
const block = (w: number, h: number, c: { r: number; g: number; b: number; alpha: number }) => ({ create: { width: w, height: h, channels: 4 as const, background: c } })
const logo = (parts: { r: number; g: number; b: number; alpha?: number; w: number; left: number }[], bg = { r: 255, g: 255, b: 255, alpha: 1 }) =>
  sharp({ create: { width: 200, height: 100, channels: 4, background: bg } }).composite(parts.map((p) => ({ input: block(p.w, 100, { r: p.r, g: p.g, b: p.b, alpha: p.alpha ?? 1 }), left: p.left, top: 0 }))).png().toBuffer()
const hex = (c: string | null) => (c ? c.toLowerCase() : c)

describe('the brand colours of a logo picture, read from its pixels', () => {
  it('the colour used most is the main one; a clearly different second colour is the accent; the white background is ignored', async () => {
    const { data, w, h } = await raw(await logo([{ r: 10, g: 125, b: 90, w: 110, left: 20 }, { r: 245, g: 158, b: 11, w: 50, left: 130 }]))
    const c = dominantColours(data, w, h)
    expect(hex(c.primary)).toBe('#0a7d5a'); expect(hex(c.accent)).toBe('#f59e0b')
  })
  it('one colour only gives no accent', async () => {
    const { data, w, h } = await raw(await logo([{ r: 200, g: 30, b: 30, w: 120, left: 40 }]))
    const c = dominantColours(data, w, h)
    expect(hex(c.primary)).toBe('#c81e1e'); expect(c.accent).toBeNull()
  })
  it('a black, white or grey logo has no brand colour', async () => {
    const { data, w, h } = await raw(await logo([{ r: 20, g: 20, b: 20, w: 120, left: 40 }, { r: 140, g: 140, b: 140, w: 30, left: 165 }]))
    expect(dominantColours(data, w, h)).toEqual({ primary: null, accent: null })
  })
  it('transparent pixels are not counted', async () => {
    const { data, w, h } = await raw(await logo([{ r: 10, g: 125, b: 90, w: 90, left: 10 }, { r: 245, g: 158, b: 11, w: 100, left: 100, alpha: 0 }], { r: 0, g: 0, b: 0, alpha: 0 }))
    const c = dominantColours(data, w, h)
    expect(hex(c.primary)).toBe('#0a7d5a'); expect(c.accent).toBeNull()
  })
  it('readLogo gives the picture\'s shape and colours, and says so plainly for something that is not a picture', async () => {
    const r = await readLogo(await logo([{ r: 10, g: 125, b: 90, w: 120, left: 20 }]))
    expect(r).toMatchObject({ ok: true, aspect: 2 }); expect(r.ok && hex(r.primary)).toBe('#0a7d5a')
    expect(await readLogo(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false })
  })
})
