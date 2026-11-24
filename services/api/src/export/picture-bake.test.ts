import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import type { SlideElement } from '@prompttoppt/validation'
import { bakePicture, needsBake } from './picture-bake.ts'

type Img = Extract<SlideElement, { type: 'image' }>
const el = (o: Partial<Img> = {}): Img => ({ id: 'p', type: 'image', x: 0, y: 0, width: 400, height: 200, rotation: 0, locked: false, zIndex: 1, opacity: 1, alt: 'a', fit: 'cover', clip: 'none', ...o }) as Img
/** 400 x 200: the left half pure red, the right half pure blue */
const source = async () => sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } } }).composite([{ input: await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer(), left: 200, top: 0 }]).png().toBuffer()
const read = async (png: Buffer) => { const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { w: info.width, h: info.height, px: (x: number, y: number) => { const i = (Math.min(info.height - 1, y) * info.width + Math.min(info.width - 1, x)) * 4; return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! } } } }
const bake = async (o: Partial<Img>) => { const b = await bakePicture(await source(), el(o)); return { ...b, img: await read(b.png) } }

describe('needsBake: only pictures with something a PowerPoint picture cannot do are processed', () => {
  it('a plain picture, and a plain circle, are placed as they are', () => {
    expect(needsBake(el())).toBe(false); expect(needsBake(el({ clip: 'circle' }))).toBe(false)
  })
  it('zoom, a focus away from the middle, light adjustments, a shadow and other cut shapes are baked; rounded corners alone are NOT (PowerPoint rounds the picture itself)', () => {
    expect(needsBake(el({ radius: 20 }))).toBe(false)
    for (const o of [{ zoom: 2 }, { focus: { x: 0, y: 0.5 } }, { filter: { brightness: 1, contrast: 1, grayscale: 0.5 } }, { shadow: 'soft' }, { clip: 'hex' }, { clip: 'arch' }] as Partial<Img>[]) expect(needsBake(el(o)), JSON.stringify(o)).toBe(true)
  })
})

describe('bakePicture: the exported picture is what the screen shows', () => {
  it('not zoomed: the picture as it is, left red and right blue, at the frame\'s size', async () => {
    const { img } = await bake({ filter: { brightness: 1, contrast: 1, grayscale: 0 } })
    expect(img.w).toBe(600); expect(img.h).toBe(300) // 1.5 pixels per canvas unit
    expect(img.px(10, 150)).toMatchObject({ r: 255, b: 0 }); expect(img.px(590, 150)).toMatchObject({ r: 0, b: 255 })
  })
  it('zoom 2 with the focus on the left shows only the red half; on the right only the blue half; in the middle both halves, each a quarter', async () => {
    const left = (await bake({ zoom: 2, focus: { x: 0, y: 0.5 } })).img, right = (await bake({ zoom: 2, focus: { x: 1, y: 0.5 } })).img, mid = (await bake({ zoom: 2 })).img
    expect(left.px(590, 150)).toMatchObject({ r: 255, b: 0 }); expect(right.px(10, 150)).toMatchObject({ r: 0, b: 255 })
    expect(mid.px(10, 150)).toMatchObject({ r: 255 }); expect(mid.px(590, 150)).toMatchObject({ b: 255 })
  })
  it('brightness halves the colour; contrast 0 makes it flat grey; black and white removes the colour', async () => {
    expect((await bake({ filter: { brightness: 0.5, contrast: 1, grayscale: 0 } })).img.px(10, 150).r).toBeGreaterThan(120)
    expect((await bake({ filter: { brightness: 0.5, contrast: 1, grayscale: 0 } })).img.px(10, 150).r).toBeLessThan(136)
    const flat = (await bake({ filter: { brightness: 1, contrast: 0.2, grayscale: 0 } })).img.px(10, 150)
    expect(flat.r).toBeLessThan(255); expect(flat.r).toBeGreaterThan(100)
    const bw = (await bake({ filter: { brightness: 1, contrast: 1, grayscale: 1 } })).img.px(10, 150)
    expect(Math.abs(bw.r - bw.g)).toBeLessThan(6); expect(Math.abs(bw.g - bw.b)).toBeLessThan(6)
  })
  it('cut shapes make the corners empty and keep the middle: hexagon, arch, rounded corners', async () => {
    for (const o of [{ clip: 'hex' }, { clip: 'arch' }, { radius: 120 }] as Partial<Img>[]) {
      const { img } = await bake(o)
      expect(img.px(0, 0).a, JSON.stringify(o)).toBe(0); expect(img.px(300, 150).a, JSON.stringify(o)).toBe(255)
    }
  })
  it('a shadow adds room around the frame, with a soft dark area below the picture and the picture itself on top', async () => {
    const { img, pad } = await bake({ shadow: 'strong' })
    expect(pad).toBeGreaterThan(20); expect(img.w).toBeGreaterThan(600); expect(img.h).toBeGreaterThan(300)
    const edge = Math.round(pad * 1.5) + 300 // the picture's bottom edge, in pixels
    const below = img.px(Math.round(img.w / 2), edge + 8)
    expect(below.a).toBeGreaterThan(0); expect(below.r + below.g + below.b).toBeLessThan(30)
    expect(img.px(Math.round(pad * 1.5) + 10, Math.round(pad * 1.5) + 150)).toMatchObject({ r: 255, a: 255 })
  })
  it('a "contain" picture keeps its empty bands and still zooms', async () => {
    const { img } = await bake({ fit: 'contain', width: 400, height: 400 })
    expect(img.px(300, 5).a).toBe(0) // above the picture: nothing (the picture is 2:1 in a square frame)
    expect(img.px(300, 300)).toMatchObject({ a: 255 })
  })
})

describe('a cropped picture is baked as its cut-out, stretched to the frame', () => {
  it('only the chosen rectangle is in the file: left half red, right half blue, cropped to the right half, is all blue', async () => {
    const e = el({ width: 400, height: 400, crop: { x: 0.5, y: 0, w: 0.5, h: 1 } })
    expect(needsBake(e)).toBe(true)
    const { img } = await bake({ width: 400, height: 400, crop: { x: 0.5, y: 0, w: 0.5, h: 1 } })
    expect(img.px(5, 5)).toMatchObject({ r: 0, g: 0, b: 255 }); expect(img.px(img.w - 5, img.h - 5)).toMatchObject({ r: 0, g: 0, b: 255 })
  })
})

describe('the colour of a picture in the file is the colour on the screen (one matrix: black and white, saturation, warmth)', () => {
  it('black and white: red becomes the grey the screen shows (0.213 of red), every channel equal', async () => {
    const p = (await bake({ filter: { brightness: 1, contrast: 1, grayscale: 1 } })).img.px(10, 150)
    expect(p.r).toBe(p.g); expect(p.g).toBe(p.b)
    expect(Math.abs(p.r - Math.round(255 * 0.213))).toBeLessThanOrEqual(2)
  })
  it('warmer: red stays strong, blue gets weaker; cooler: blue stays strong, red gets weaker', async () => {
    const warm = (await bake({ filter: { brightness: 1, contrast: 1, grayscale: 0, warmth: 1 } })).img
    expect(warm.px(590, 150).b).toBeLessThan(230) // the blue half: 255 × 0.86
    const cool = (await bake({ filter: { brightness: 1, contrast: 1, grayscale: 0, warmth: -1 } })).img
    expect(cool.px(10, 150).r).toBeLessThan(230) // the red half: 255 × 0.86
  })
  it('no colour (saturation 0) is grey like black and white; normal values change nothing', async () => {
    const p = (await bake({ filter: { brightness: 1, contrast: 1, grayscale: 0, saturation: 0 } })).img.px(10, 150)
    expect(p.r).toBe(p.g)
    expect(needsBake(el({ filter: { brightness: 1, contrast: 1, grayscale: 0, saturation: 1, warmth: 0 } }))).toBe(true) // (a filter is baked, but leaves the colours as they are)
    const same = (await bake({ filter: { brightness: 1, contrast: 1, grayscale: 0, saturation: 1, warmth: 0 } })).img.px(10, 150)
    expect(same).toMatchObject({ r: 255, g: 0, b: 0 })
  })
})

describe('blur and border in the exported picture are the screen\'s', () => {
  it('blur: the hard edge between the red and blue halves softens (a pixel at the edge is a mix), the corners stay solid', async () => {
    const sharpImg = (await bake({ filter: { brightness: 1, contrast: 1, grayscale: 0 } })).img
    const soft = (await bake({ filter: { brightness: 1, contrast: 1, grayscale: 0, blur: 8 } })).img
    expect(sharpImg.px(298, 150).r).toBeGreaterThan(240)
    const mid = soft.px(298, 150); expect(mid.r).toBeLessThan(200); expect(mid.b).toBeGreaterThan(50)
    expect(soft.px(2, 2).a).toBe(255) // edges extended, never faded to see-through
  })
  it('border: inside the frame, in its colour, as wide as asked (×1.5 pixels per unit); the middle untouched', async () => {
    const { img } = await bake({ border: { color: '#00FF00', width: 10 } })
    expect(img.px(5, 150)).toMatchObject({ r: 0, g: 255, b: 0 })
    expect(img.px(20, 150)).toMatchObject({ r: 255, g: 0 }) // past 15 px: the picture
    expect(needsBake(el({ border: { color: '#00FF00', width: 2 } }))).toBe(true)
  })
  it('a circle picture\'s border follows the circle (the corner stays see-through)', async () => {
    const { img } = await bake({ clip: 'circle', border: { color: '#00FF00', width: 10 } })
    expect(img.px(2, 2).a).toBe(0)
    expect(img.px(300, 4)).toMatchObject({ g: 255 })
  })
})

describe('a slide\'s background picture in the .pptx is the screen\'s', () => {
  it('cover-fitted to the slide (never stretched), softened with the same blur, a JPEG', async () => {
    const { backgroundPicture } = await import('./picture-bake.ts')
    const wide = await source() // 400 × 200, red | blue
    const data = await backgroundPicture(wide, 300, 300, 0)
    expect(data.startsWith('image/jpeg;base64,')).toBe(true)
    const img = await read(Buffer.from(data.split('base64,')[1]!, 'base64'))
    expect(img.w).toBe(300); expect(img.h).toBe(300)
    // cover: the middle 200 px of the 400 px width fill the square: the left quarter of the source (red) is cut off, the left edge is red still, the right edge blue
    expect(img.px(5, 150).r).toBeGreaterThan(200); expect(img.px(295, 150).b).toBeGreaterThan(200)
    const soft = await read(Buffer.from((await backgroundPicture(wide, 300, 300, 10)).split('base64,')[1]!, 'base64'))
    expect(soft.px(150, 150).r).toBeLessThan(200); expect(soft.px(150, 150).b).toBeGreaterThan(50)
  })
})

describe('a background pattern in the .pptx is the screen\'s drawing', () => {
  it('the shared SVG rendered: the base colour between the dots, a lighter dot at a dot\'s centre; a quiet default colour for dark and light backgrounds', async () => {
    const { patternSvg, defaultPattern } = await import('@prompttoppt/validation')
    expect(defaultPattern('grid', '#101828')).toMatchObject({ color: '#FFFFFF' })
    expect(defaultPattern('grid', '#FAFAFA')).toMatchObject({ color: '#000000' })
    const p = { kind: 'dots' as const, color: '#FFFFFF', opacity: 0.5, size: 40 }
    const png = await sharp(Buffer.from(patternSvg(p, '#000000', 200, 200))).png().toBuffer()
    const img = await read(png)
    expect(img.px(20, 20).r).toBeGreaterThan(100) // a dot's centre (half-white on black)
    expect(img.px(1, 1).r).toBeLessThan(10)       // between the dots: the base colour
  })
})
