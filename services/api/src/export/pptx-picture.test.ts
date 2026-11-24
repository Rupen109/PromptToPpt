import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { elementSchema, type Presentation } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

const picture = (o: object) => elementSchema.parse({ type: 'image', id: 'p', x: 200, y: 200, width: 800, height: 400, alt: 'a', fit: 'cover', src: 'https://example.test/a.png', ...o })
const png = async () => `image/png;base64,${(await sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer()).toString('base64')}`
const mediaOf = async (el: object) => {
  const u = await signUp('pic'); const { doc } = await makeDeck(u.id, 1)
  const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: [picture(el)] }] }
  const data = await png()
  const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => ({ data, w: 800, h: 400 }))))
  const media = Object.entries(files).filter(([n, b]) => n.startsWith('ppt/media/') && b.length > 0).map(([, b]) => b)
  return Promise.all(media.map((b) => sharp(Buffer.from(b)).metadata()))
}

describe('PowerPoint export puts the picture as the editor shows it', () => {
  it('a plain picture is placed as it is (800 x 400, unchanged)', async () => {
    const m = await mediaOf({})
    expect(m).toHaveLength(1); expect(m[0]).toMatchObject({ width: 800, height: 400 })
  })
  it('a hexagon-cut, zoomed picture with a shadow is baked: a new PNG at the frame\'s size plus room for the shadow', async () => {
    const m = await mediaOf({ clip: 'hex', zoom: 1.5, shadow: 'soft', filter: { brightness: 1.1 } })
    expect(m).toHaveLength(1)
    expect(m[0]!.format).toBe('png'); expect(m[0]!.width!).toBeGreaterThan(1200); expect(m[0]!.height!).toBeGreaterThan(600) // 800x400 at 1.5 px per unit, plus the shadow's padding
    expect(m[0]!.hasAlpha).toBe(true)
  })
  it('a picture that cannot be read is left as the file had it (never a hole in the file)', async () => {
    const u = await signUp('pic2'); const { doc } = await makeDeck(u.id, 1)
    const deck: Presentation = { ...doc, slides: [{ ...doc.slides[0]!, elements: [picture({ clip: 'hex' })] }] }
    const files = unzipSync(new Uint8Array(await buildPptx(deck, async () => ({ data: 'image/png;base64,bm90IGFuIGltYWdl', w: 10, h: 10 }))))
    expect(Object.keys(files).some((n) => n.startsWith('ppt/media/'))).toBe(true)
  })
})
