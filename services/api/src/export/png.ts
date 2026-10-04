import { deflateSync } from 'node:zlib'

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (buf: Buffer) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

export interface Rgba { r: number; g: number; b: number; a: number }
export function parseColor(hex: string): Rgba {
  const h = hex.replace('#', '')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
}

/** A small RGBA linear-gradient picture (CSS angle convention: 180° = top→bottom). PowerPoint stretches it, which is smooth for a linear ramp. `opacity` multiplies the alpha. */
export function gradientPng(from: string, to: string, angle: number, opacity = 1, size = 96): string {
  const a = parseColor(from), b = parseColor(to)
  const rad = ((angle - 90) * Math.PI) / 180 // CSS angle → direction vector
  const dx = Math.cos(rad), dy = Math.sin(rad)
  const half = (Math.abs(dx) + Math.abs(dy)) / 2
  const px = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + 0.5) / size - 0.5, ny = (y + 0.5) / size - 0.5
    const t = Math.min(1, Math.max(0, (nx * dx + ny * dy) / (2 * half) + 0.5))
    const i = (y * size + x) * 4
    px[i] = Math.round(a.r + (b.r - a.r) * t); px[i + 1] = Math.round(a.g + (b.g - a.g) * t); px[i + 2] = Math.round(a.b + (b.b - a.b) * t)
    px[i + 3] = Math.round((a.a + (b.a - a.a) * t) * opacity * 255)
  }
  return `image/png;base64,${encodePng(size, size, px).toString('base64')}`
}

/** Pixel size of a PNG / JPEG / GIF, read from its header (needed to emulate object-fit: cover). */
export function imageSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  if (buf.toString('ascii', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const m = buf[i + 1]!
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  return null
}
