/**
 * What the opened file contains that saving can change or that the visitor should know before editing: digital signatures (saving invalidates them),
 * attachments, scripts. A raw scan of the file's bytes (pdf.js hides most of it): pure functions, no DOM, so Node tests can run it too.
 * Objects inside compressed object streams are invisible to a raw scan, but a signature dictionary can never be inside one (its /ByteRange covers file
 * bytes), so signed files are always found. Nothing here executes anything from the file.
 */
export interface DocInfo {
  /** signatures whose /ByteRange covers the file: saving a changed copy makes every one of them invalid */
  signed: number
  /** signature FIELDS that are still empty (nothing to invalidate; they are left as they are) */
  signatureFields: number
  /** files attached to the document or to a page (kept as they are, never opened) */
  attachments: number
  /** the file has JavaScript actions (never run here; kept in the saved file) */
  scripts: boolean
  /** the file was saved by appending changes (several %%EOF): the saved copy is one clean file */
  incremental: boolean
}

const asciiBytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0))
/** positions of every occurrence of `needle` in `hay` (plain byte search) */
export function findAll(hay: Uint8Array, needle: string, limit = 2000): number[] {
  const n = asciiBytes(needle), out: number[] = []
  const first = n[0]!
  for (let i = 0; i <= hay.length - n.length && out.length < limit; i++) {
    if (hay[i] !== first) continue
    let k = 1; while (k < n.length && hay[i + k] === n[k]) k++
    if (k === n.length) out.push(i)
  }
  return out
}
const text = (b: Uint8Array, from: number, len: number): string => { let s = ''; for (let i = from; i < Math.min(b.length, from + len); i++) s += String.fromCharCode(b[i]!); return s }

export function inspectFile(bytes: Uint8Array): DocInfo {
  // a real signature: `/ByteRange [ n n n n ]` with four numbers (the same words inside prose or a stream never have that shape)
  let signed = 0
  const seenRanges = new Set<string>()
  for (const at of findAll(bytes, '/ByteRange')) {
    const m = /^\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(text(bytes, at, 80))
    if (!m) continue
    if (Number(m[1]) !== 0) continue // a signature's first range starts at the first byte of the file
    const key = `${m[2]}:${m[3]}`; if (seenRanges.has(key)) continue
    seenRanges.add(key); signed++
  }
  // a signature FIELD: /FT /Sig (written with or without spaces); the filled ones are already counted above
  let fields = 0
  for (const at of findAll(bytes, '/FT')) if (/^\/FT\s*\/Sig(?![A-Za-z])/.test(text(bytes, at, 24))) fields++
  const emptyFields = Math.max(0, fields - signed)
  const attachments = findAll(bytes, '/EmbeddedFile').filter((at) => /^\/EmbeddedFile(?![A-Za-z])/.test(text(bytes, at, 20))).length
  let scripts = false
  for (const at of findAll(bytes, '/JavaScript', 50)) if (/^\/JavaScript(?![A-Za-z])/.test(text(bytes, at, 16))) { scripts = true; break }
  if (!scripts) for (const at of findAll(bytes, '/JS', 200)) if (/^\/JS\s*[(<[\d]/.test(text(bytes, at, 12))) { scripts = true; break }
  const incremental = findAll(bytes, '%%EOF', 50).length > 1
  return { signed, signatureFields: emptyFields, attachments, scripts, incremental }
}
