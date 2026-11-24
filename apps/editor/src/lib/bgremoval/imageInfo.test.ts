import { describe, expect, it } from 'vitest'
import { readPictureInfo } from './imageInfo'

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const png = (w: number, h: number) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0])
const riff = (kind: string, body: number[]) => Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...[...kind].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...body])

describe('readPictureInfo', () => {
  it('reads a PNG size from its header', () => {
    expect(readPictureInfo(png(5000, 4000))).toEqual({ type: 'png', width: 5000, height: 4000 })
    expect(readPictureInfo(png(0, 10))).toBeNull()
  })

  it('reads a JPEG size, skipping other segments (and ignoring the huffman-table marker)', () => {
    const app0 = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]
    const dht = [0xff, 0xc4, 0, 4, 0, 0]
    const sof = [0xff, 0xc2, 0, 17, 8, 0x0f, 0xa0, 0x13, 0x88, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1] // progressive: 5000 x 4000
    expect(readPictureInfo(Uint8Array.from([0xff, 0xd8, ...app0, ...dht, ...sof]))).toEqual({ type: 'jpeg', width: 5000, height: 4000 })
    expect(readPictureInfo(Uint8Array.from([0xff, 0xd8, ...app0]))).toBeNull() // no frame header
  })

  it('reads the three WebP flavours', () => {
    const w = 3000 - 1, h = 2000 - 1
    expect(readPictureInfo(riff('VP8X', [0, 0, 0, 0, w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255]))).toEqual({ type: 'webp', width: 3000, height: 2000 })
    const bits = ((h & 0x3fff) << 14) | (w & 0x3fff)
    expect(readPictureInfo(riff('VP8L', [0x2f, bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >>> 24) & 255]))).toEqual({ type: 'webp', width: 3000, height: 2000 })
    expect(readPictureInfo(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 3000 & 255, (3000 >> 8) & 255, 2000 & 255, (2000 >> 8) & 255]))).toEqual({ type: 'webp', width: 3000, height: 2000 })
  })

  it('refuses everything else: other formats, damaged headers, too little data', () => {
    expect(readPictureInfo(new TextEncoder().encode('GIF89a\x01\x00\x01\x00'.padEnd(40)))).toBeNull()
    expect(readPictureInfo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).toBeNull()
    expect(readPictureInfo(new Uint8Array(0))).toBeNull()
    expect(readPictureInfo(png(1, 1).subarray(0, 12))).toBeNull()
  })
})
