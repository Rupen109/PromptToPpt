/**
 * The size of a PNG, JPEG or WebP picture, read from its first bytes WITHOUT decoding it. Decoding a huge picture is exactly what can kill a browser tab, so the size limit is checked
 * on these numbers first. Pure (no DOM); returns null for anything that is not one of the three formats or whose header is damaged.
 */
export type PictureType = 'png' | 'jpeg' | 'webp'
export interface PictureInfo { type: PictureType; width: number; height: number }

export function readPictureInfo(b: Uint8Array): PictureInfo | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    // PNG: the IHDR chunk follows the 8 byte signature: length(4) 'IHDR'(4) width(4) height(4)
    if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null
    return positive('png', u32(b, 16), u32(b, 20))
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) return jpeg(b)
  if (b.length >= 21 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return webp(b)
  return null
}

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0
const positive = (type: PictureType, width: number, height: number): PictureInfo | null => (width > 0 && height > 0 ? { type, width, height } : null)

function jpeg(b: Uint8Array): PictureInfo | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const m = b[i + 1]!
    if (m === 0xff) { i++; continue } // fill byte
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue } // markers without a length
    const len = (b[i + 2]! << 8) | b[i + 3]!
    if (len < 2) return null
    // start-of-frame markers carry the size: C0..CF except C4 (huffman tables), C8 (reserved), CC (arithmetic conditioning)
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return positive('jpeg', (b[i + 7]! << 8) | b[i + 8]!, (b[i + 5]! << 8) | b[i + 6]!)
    i += 2 + len
  }
  return null
}

function webp(b: Uint8Array): PictureInfo | null {
  const kind = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!)
  if (kind === 'VP8X') return b.length < 30 ? null : positive('webp', 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)))
  if (kind === 'VP8L') {
    if (b.length < 25 || b[20] !== 0x2f) return null
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0
    return positive('webp', 1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff))
  }
  if (kind === 'VP8 ') {
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return positive('webp', (b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff)
  }
  return null
}
