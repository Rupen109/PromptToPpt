import { describe, expect, it } from 'vitest'
import { freePhotoBytes } from './deck-picture.ts'
import { cleanBox } from '../assistant/vision.ts'

/** W2: the only outside pictures the assistant reads are free photos from Unsplash's own picture host, over https; every other address is never fetched */
describe('which pictures a crop may read', () => {
  it('any address but https://images.unsplash.com is refused before any fetch', async () => {
    for (const u of ['http://images.unsplash.com/photo-1', 'https://evil.example.com/a.jpg', 'https://images.unsplash.com.evil.com/a.jpg', 'https://user:pw@images.unsplash.com/a.jpg', 'https://images.unsplash.com:8443/a.jpg', 'file:///etc/passwd', 'not a url'])
      expect(await freePhotoBytes(u)).toBeNull()
  })
})
describe('the vision answer, made safe', () => {
  it('not found, or a box that is not usable, is "not found"; a box is kept inside the picture', () => {
    expect(cleanBox({ found: false })).toBeNull()
    expect(cleanBox({ found: true })).toBeNull()
    expect(cleanBox({ found: true, box_2d: [100, 200, 500, 500] })).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.4 }) // ([ymin, xmin, ymax, xmax] on 0-1000, the form vision models are trained on)
    expect(cleanBox({ found: true, box_2d: [500, 500, 500, 600] })).toBeNull() // (no height: not usable)
    const r = cleanBox({ found: true, box_2d: [600, 700, 100, 200] })!; for (const [k, v] of Object.entries({ x: 0.2, y: 0.1, w: 0.5, h: 0.5 })) expect(r[k as 'x']).toBeCloseTo(v, 6) // (corners given the wrong way round)
  })
})
