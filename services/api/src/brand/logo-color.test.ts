import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { logoDominantColor, svgDominantColor } from './logo-color.ts'

function png(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): Buffer {
  const rows: number[] = []
  for (let y = 0; y < h; y++) { rows.push(0); for (let x = 0; x < w; x++) rows.push(...px(x, y)) }
  const chunk = (k: string, d: Buffer) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(k, 4, 'ascii'); d.copy(b, 8); return b }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(rows))), chunk('IEND', Buffer.alloc(0))])
}

describe('logoDominantColor', () => {
  it('finds the brand colour and ignores white / transparent / black', () => {
    const img = png(64, 64, (x, y) => (x < 8 ? [255, 255, 255, 255] : y < 8 ? [0, 0, 0, 0] : x > 56 ? [0, 0, 0, 255] : [29, 185, 84, 255]))
    expect(logoDominantColor(img)).toBe('#1DB954')
  })
  it('returns null for a grey logo, junk, and truncated data', () => {
    expect(logoDominantColor(png(32, 32, () => [120, 120, 120, 255]))).toBeNull()
    expect(logoDominantColor(Buffer.from('not a png at all, definitely not'))).toBeNull()
    expect(logoDominantColor(png(32, 32, () => [200, 20, 20, 255]).subarray(0, 60))).toBeNull()
  })
})

describe('svgDominantColor', () => {
  it('reads the brand fill, ignoring white, black and grey', () => {
    expect(svgDominantColor('<svg><path fill="#FF7A59" d=""/><path fill="#fff"/><path fill="#33475b"/><circle fill="#ff7a59"/></svg>')).toBe('#FF7A59')
    expect(svgDominantColor('<svg><style>.a{fill:#0061FE}</style><path style="fill:rgb(0,0,0)"/></svg>')).toBe('#0061FE')
  })
  it('returns null when the logo has no brand colour', () => {
    expect(svgDominantColor('<svg><path fill="#000"/><path fill="currentColor"/></svg>')).toBeNull()
  })
})
