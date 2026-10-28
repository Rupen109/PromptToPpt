import { unzipSync } from 'fflate'
import { SourceError } from './errors.ts'

/** Office files (.docx / .xlsx / .pptx) are zip archives of XML. These helpers read them without ever trusting their size claims. */

export const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
export const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b
export const isOle = (b: Uint8Array) => Buffer.from(b.subarray(0, 4)).equals(OLE_MAGIC.subarray(0, 4))
/** Password-protected Office files are not zips: they are an OLE container holding an "EncryptedPackage" stream. */
export const isEncryptedOffice = (b: Uint8Array) => isOle(b) && Buffer.from(b).includes(Buffer.from('EncryptedPackage', 'utf16le'))

/** The names inside a zip, WITHOUT inflating anything. */
export function zipNames(bytes: Uint8Array): string[] {
  const names: string[] = []
  try { unzipSync(new Uint8Array(bytes), { filter: (f) => { names.push(f.name); return false } }) } catch { throw new SourceError('That file could not be opened — it may be damaged') }
  return names
}

export interface ZipLimits { maxEntryBytes: number; maxTotalBytes: number; maxEntries: number }

/**
 * Inflates only the entries `want` accepts, and only if the sizes they DECLARE are within the limits (a zip bomb is a tiny file that declares —
 * or lies about — gigabytes). Entries are chosen by name before any decompression.
 */
export function readZip(bytes: Uint8Array, want: (name: string) => boolean, lim: ZipLimits, tooBigMessage: string): Record<string, Uint8Array> {
  let total = 0, count = 0, refused = false
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(bytes), {
      filter: (f) => {
        if (!want(f.name)) return false
        total += f.originalSize; count++
        if (f.originalSize > lim.maxEntryBytes || total > lim.maxTotalBytes || count > lim.maxEntries) { refused = true; return false }
        return true
      },
    })
  } catch { throw new SourceError('That file could not be opened — it may be damaged') }
  if (refused) throw new SourceError(tooBigMessage)
  // the declared size can be a lie: check what really came out
  let real = 0
  for (const v of Object.values(entries)) { real += v.length; if (v.length > lim.maxEntryBytes || real > lim.maxTotalBytes) throw new SourceError(tooBigMessage) }
  return entries
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
/** XML text → plain text. Only the five standard entities and numeric references are decoded, never anything defined by the document itself. */
export const decodeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
  if (e[0] !== '#') return ENT[e.toLowerCase()] ?? ''
  const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
  return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : ''
})
export const utf8 = (u: Uint8Array) => new TextDecoder('utf-8', { fatal: false }).decode(u)
