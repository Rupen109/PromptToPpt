/**
 * Opening a protected PDF for saving. pdf-lib cannot read encrypted files (it has no decryption), but pdf.js can, so the editor shows the pages from pdf.js
 * while this module produces a PLAIN copy of the file for pdf-lib to edit: every string and stream is decrypted with the PDF "standard security handler"
 * (RC4 40 / 128 bit, AES-128, AES-256 revisions 5 and 6), and the /Encrypt entry is removed. The saved file therefore has NO password and no restrictions.
 * Nothing here is sent anywhere. Pure functions plus WebCrypto (AES, SHA-2); MD5 and RC4 are written out here because WebCrypto has neither.
 */
import type { PDFContext, PDFDict, PDFObject, PDFRawStream } from 'pdf-lib'

export class PasswordError extends Error { name = 'PasswordError' }
export class UnsupportedEncryption extends Error { name = 'UnsupportedEncryption' }

// ---------- primitives ----------
const PAD = Uint8Array.from([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a])
const cat = (...a: Uint8Array[]): Uint8Array => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length } return o }
const eq = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])

const K = Uint32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32))
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
export function md5(data: Uint8Array): Uint8Array {
  const n = data.length, total = ((n + 8) >> 6) * 64 + 64
  const m = new Uint8Array(total); m.set(data); m[n] = 0x80
  const dv = new DataView(m.buffer); dv.setUint32(total - 8, (n * 8) >>> 0, true); dv.setUint32(total - 4, Math.floor((n * 8) / 2 ** 32), true)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let off = 0; off < total; off += 64) {
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) { F = (B & C) | (~B & D); g = i } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15 } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15 } else { F = C ^ (B | ~D); g = (7 * i) & 15 }
      F = (F + A + K[i]! + dv.getUint32(off + g * 4, true)) >>> 0
      A = D; D = C; C = B
      const s = S[(i >> 4) * 4 + (i & 3)]!
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  const out = new Uint8Array(16), o = new DataView(out.buffer)
  o.setUint32(0, a0, true); o.setUint32(4, b0, true); o.setUint32(8, c0, true); o.setUint32(12, d0, true)
  return out
}
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const s = new Uint8Array(256); for (let i = 0; i < 256; i++) s[i] = i
  for (let i = 0, j = 0; i < 256; i++) { j = (j + s[i]! + key[i % key.length]!) & 255; [s[i], s[j]] = [s[j]!, s[i]!] }
  const out = new Uint8Array(data.length)
  for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + s[i]!) & 255; [s[i], s[j]] = [s[j]!, s[i]!]; out[k] = data[k]! ^ s[(s[i]! + s[j]!) & 255]! }
  return out
}
const subtle = (): SubtleCrypto => globalThis.crypto.subtle
const sha = async (bits: 256 | 384 | 512, d: Uint8Array): Promise<Uint8Array> => new Uint8Array(await subtle().digest(`SHA-${bits}`, d as BufferSource))
async function aesKey(raw: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> { return subtle().importKey('raw', raw as BufferSource, 'AES-CBC', false, [usage]) }
/** AES-CBC decrypt with PKCS#5 padding removed (the way strings and streams are stored): the first 16 bytes are the IV */
async function aesDecrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 32 || data.length % 16 !== 0) return new Uint8Array(0)
  return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: data.subarray(0, 16) as BufferSource }, await aesKey(key, 'decrypt'), data.subarray(16) as BufferSource))
}
/** AES-CBC decrypt WITHOUT padding (used for the file key of revision 5/6): a padding block is appended that decrypts to valid padding, then dropped by the library */
async function aesDecryptRaw(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await aesKey(key, 'decrypt'), e = await aesKey(key, 'encrypt')
  const extra = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: data.subarray(data.length - 16) as BufferSource }, e, new Uint8Array(0)))
  return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, k, cat(data, extra.subarray(0, 16)) as BufferSource))
}
async function aesEncryptRaw(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: iv as BufferSource }, await aesKey(key, 'encrypt'), data as BufferSource)).subarray(0, data.length)
}

/** ISO 32000-2 algorithm 2.B (revision 6) */
async function hash6(pw: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  let k = await sha(256, cat(pw, salt, udata))
  for (let i = 0; ; i++) {
    const k1 = cat(...Array.from({ length: 64 }, () => cat(pw, k, udata)))
    const e = await aesEncryptRaw(k.subarray(0, 16), k.subarray(16, 32), k1)
    let mod = 0; for (let j = 0; j < 16; j++) mod += e[j]!
    k = await sha(([256, 384, 512] as const)[mod % 3]!, e)
    if (i >= 63 && e[e.length - 1]! <= i - 31) break
  }
  return k.subarray(0, 32)
}

// ---------- the security handler ----------
interface Handler { decryptString: (num: number, gen: number, d: Uint8Array) => Promise<Uint8Array>; decryptStream: (num: number, gen: number, d: Uint8Array) => Promise<Uint8Array>; encryptMetadata: boolean }
type Lib = typeof import('pdf-lib')

const bytesOf = (lib: Lib, o: PDFObject | undefined): Uint8Array | undefined => (o instanceof lib.PDFString || o instanceof lib.PDFHexString ? o.asBytes() : undefined)
const latin1 = (s: string): Uint8Array => Uint8Array.from(s.slice(0, 127), (c) => c.charCodeAt(0) & 255)

async function buildHandler(lib: Lib, ctx: PDFContext, password: string): Promise<Handler | null> {
  const encRef = ctx.trailerInfo.Encrypt
  const enc = encRef ? ctx.lookup(encRef) : undefined
  if (!(enc instanceof lib.PDFDict)) return null
  const num = (k: string, d: number): number => { const v = enc.lookup(lib.PDFName.of(k)); return v instanceof lib.PDFNumber ? v.asNumber() : d }
  const filter = enc.lookup(lib.PDFName.of('Filter'))
  if (!(filter instanceof lib.PDFName) || filter.decodeText() !== 'Standard') throw new UnsupportedEncryption('This PDF uses a custom protection that cannot be removed here.')
  const V = num('V', 0), R = num('R', 2), P = num('P', 0) | 0
  const O = bytesOf(lib, enc.lookup(lib.PDFName.of('O'))) ?? new Uint8Array(0), U = bytesOf(lib, enc.lookup(lib.PDFName.of('U'))) ?? new Uint8Array(0)
  const emv = enc.lookup(lib.PDFName.of('EncryptMetadata')), encryptMetadata = !(emv instanceof lib.PDFBool && !emv.asBoolean())
  const idArr = ctx.lookup(ctx.trailerInfo.ID)
  const id0 = idArr instanceof lib.PDFArray ? bytesOf(lib, idArr.lookup(0)) ?? new Uint8Array(0) : new Uint8Array(0)
  // which cipher the strings and the streams use
  let strM: 'RC4' | 'AESV2' | 'AESV3' | 'None' = 'RC4', stmM: 'RC4' | 'AESV2' | 'AESV3' | 'None' = 'RC4'
  let keyLen = Math.max(5, Math.min(16, num('Length', 40) / 8))
  if (V >= 4) {
    const cf = enc.lookup(lib.PDFName.of('CF')) as PDFDict | undefined
    const method = (which: string): typeof strM => {
      const nm = enc.lookup(lib.PDFName.of(which))
      if (!(nm instanceof lib.PDFName) || nm.decodeText() === 'Identity') return 'None'
      const f = cf?.lookup(nm)
      const m = f instanceof lib.PDFDict ? f.lookup(lib.PDFName.of('CFM')) : undefined
      const t = m instanceof lib.PDFName ? m.decodeText() : 'None'
      if (f instanceof lib.PDFDict) { const l = f.lookup(lib.PDFName.of('Length')); if (l instanceof lib.PDFNumber && V === 4) keyLen = Math.max(5, Math.min(16, l.asNumber() > 40 ? l.asNumber() / 8 : l.asNumber())) }
      return t === 'V2' ? 'RC4' : t === 'AESV2' || t === 'AESV3' ? t : 'None'
    }
    strM = method('StrF'); stmM = method('StmF')
    if (V === 4) keyLen = 16
  }
  if (V < 1 || V > 5 || R < 2 || R > 6) throw new UnsupportedEncryption('This PDF uses a protection version that cannot be removed here.')

  let fileKey: Uint8Array | null = null
  if (R >= 5) {
    const enc2 = (s: string) => new TextEncoder().encode(s.normalize('NFKC')).slice(0, 127)
    const pw = enc2(password)
    const h = async (p: Uint8Array, salt: Uint8Array, u: Uint8Array) => (R === 5 ? sha(256, cat(p, salt, u)) : hash6(p, salt, u))
    const OE = bytesOf(lib, enc.lookup(lib.PDFName.of('OE'))), UE = bytesOf(lib, enc.lookup(lib.PDFName.of('UE')))
    if (!OE || !UE || U.length < 48 || O.length < 48) throw new UnsupportedEncryption('This PDF has an unreadable protection record.')
    const zero = new Uint8Array(16)
    if (eq(await h(pw, U.subarray(32, 40), new Uint8Array(0)), U.subarray(0, 32))) fileKey = await aesDecryptRaw(await h(pw, U.subarray(40, 48), new Uint8Array(0)), zero, UE.subarray(0, 32))
    else if (eq(await h(pw, O.subarray(32, 40), U.subarray(0, 48)), O.subarray(0, 32))) fileKey = await aesDecryptRaw(await h(pw, O.subarray(40, 48), U.subarray(0, 48)), zero, OE.subarray(0, 32))
  } else {
    const padded = (p: Uint8Array) => cat(p.subarray(0, 32), PAD).subarray(0, 32)
    const n = R === 2 ? 5 : keyLen
    const pb = new Uint8Array([P & 255, (P >> 8) & 255, (P >> 16) & 255, (P >> 24) & 255])
    const keyFor = (userPadded: Uint8Array): Uint8Array => {
      let h = md5(cat(userPadded, O.subarray(0, 32), pb, id0, R >= 4 && !encryptMetadata ? Uint8Array.of(255, 255, 255, 255) : new Uint8Array(0)))
      if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n))
      return h.subarray(0, n)
    }
    const userOk = (key: Uint8Array): boolean => {
      if (R === 2) return eq(rc4(key, PAD), U.subarray(0, 32))
      let x = rc4(key, md5(cat(PAD, id0)))
      for (let i = 1; i < 20; i++) x = rc4(key.map((b) => b ^ i), x)
      return eq(x, U.subarray(0, 16))
    }
    const pw = latin1(password)
    let key = keyFor(padded(pw))
    if (userOk(key)) fileKey = key
    else {
      // maybe the OWNER password: it decrypts /O into the padded user password
      let h = md5(padded(pw)); if (R >= 3) for (let i = 0; i < 50; i++) h = md5(h)
      const ok = h.subarray(0, n)
      let up = O.subarray(0, 32)
      if (R === 2) up = rc4(ok, up); else for (let i = 19; i >= 0; i--) up = rc4(ok.map((b) => b ^ i), up)
      key = keyFor(up)
      if (userOk(key)) fileKey = key
    }
  }
  if (!fileKey) throw new PasswordError('That password does not open this PDF.')
  const fk = fileKey
  const objKey = (num: number, gen: number, aes: boolean): Uint8Array => md5(cat(fk, Uint8Array.of(num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255), aes ? Uint8Array.of(0x73, 0x41, 0x6c, 0x54) : new Uint8Array(0))).subarray(0, Math.min(fk.length + 5, 16))
  const make = (m: typeof strM) => async (num: number, gen: number, d: Uint8Array): Promise<Uint8Array> => {
    if (m === 'None') return d
    if (m === 'RC4') return rc4(objKey(num, gen, false), d)
    if (m === 'AESV2') return aesDecrypt(objKey(num, gen, true), d)
    return aesDecrypt(fk, d)
  }
  return { decryptString: make(strM), decryptStream: make(stmM), encryptMetadata }
}

// ---------- walking the file ----------
const code = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0))

/** parse the file without decrypting; object streams (encrypted, so unreadable yet) are set aside */
async function parseRaw(lib: Lib, bytes: Uint8Array): Promise<{ ctx: PDFContext; objStreams: { ref: import('pdf-lib').PDFRef; stream: PDFRawStream }[] }> {
  type P = { parseIndirectObjectHeader(): import('pdf-lib').PDFRef; skipWhitespaceAndComments(): void; parseObject(): PDFObject; matchKeyword(k: number[]): boolean; context: PDFContext; parseDocument(): Promise<PDFContext>; parseIndirectObject: () => Promise<import('pdf-lib').PDFRef> }
  const parser = (lib.PDFParser as unknown as { forBytesWithOptions(b: Uint8Array, per?: number, throwInvalid?: boolean, cap?: boolean): P }).forBytesWithOptions(bytes, 100, false, false)
  const objStreams: { ref: import('pdf-lib').PDFRef; stream: PDFRawStream }[] = []
  const end = code('endobj')
  parser.parseIndirectObject = async function (this: P) {
    const ref = this.parseIndirectObjectHeader()
    this.skipWhitespaceAndComments()
    const object = this.parseObject()
    this.skipWhitespaceAndComments()
    this.matchKeyword(end)
    if (object instanceof lib.PDFRawStream) {
      const type = object.dict.lookup(lib.PDFName.of('Type'))
      if (type === lib.PDFName.of('ObjStm')) { objStreams.push({ ref, stream: object }); this.context.assign(ref, object); return ref }
      if (type === lib.PDFName.of('XRef')) {
        const d = object.dict
        this.context.trailerInfo = { Root: d.get(lib.PDFName.of('Root')) as never, Encrypt: d.get(lib.PDFName.of('Encrypt')) as never, Info: d.get(lib.PDFName.of('Info')) as never, ID: d.get(lib.PDFName.of('ID')) as never }
        return ref
      }
    }
    this.context.assign(ref, object)
    return ref
  }
  const ctx = await parser.parseDocument()
  return { ctx, objStreams }
}

/** true when the file has a standard security handler record (a password to open it, or restrictions on changing it) */
export async function isProtected(bytes: Uint8Array): Promise<boolean> {
  const needle = code('/Encrypt'); let hit = false
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) { for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer; hit = true; break }
  if (!hit) return false
  const lib = await import('pdf-lib')
  try { const { ctx } = await parseRaw(lib, bytes); return !!ctx.trailerInfo.Encrypt } catch { return true }
}

/** the file without its protection (needs the password that opened it; '' for a file that only restricts changes) */
export async function decryptPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new UnsupportedEncryption('This browser cannot unlock a protected PDF here (it needs a secure https page and a current browser).') // Web Crypto is missing on plain-http pages and very old browsers
  const lib = await import('pdf-lib')
  const { ctx, objStreams } = await parseRaw(lib, bytes)
  const h = await buildHandler(lib, ctx, password)
  if (!h) { const d = await lib.PDFDocument.load(bytes, { updateMetadata: false }); return d.save({ useObjectStreams: false }) }
  const encRef = ctx.trailerInfo.Encrypt
  const encNum = encRef instanceof lib.PDFRef ? encRef.objectNumber : -1
  const isStreamPlain = (s: PDFRawStream): boolean => {
    const t = s.dict.lookup(lib.PDFName.of('Type'))
    if (t === lib.PDFName.of('XRef')) return true
    if (t === lib.PDFName.of('Metadata') && !h.encryptMetadata) return true
    const f = s.dict.lookup(lib.PDFName.of('Filter'))
    const first = f instanceof lib.PDFArray ? f.lookup(0) : f
    if (first === lib.PDFName.of('Crypt')) return true // an explicit crypt filter (Identity in practice) leaves the stream as it is
    return false
  }
  /** decrypt every string inside an object (dictionaries and arrays are walked) */
  const strings = async (o: PDFObject | undefined, num: number, gen: number): Promise<void> => {
    if (o instanceof lib.PDFDict) {
      for (const [k, v] of o.entries()) {
        if (v instanceof lib.PDFString || v instanceof lib.PDFHexString) o.set(k, lib.PDFHexString.of(hex(await h.decryptString(num, gen, v.asBytes()))))
        else await strings(v, num, gen)
      }
    } else if (o instanceof lib.PDFArray) {
      for (let i = 0; i < o.size(); i++) {
        const v = o.get(i)
        if (v instanceof lib.PDFString || v instanceof lib.PDFHexString) o.set(i, lib.PDFHexString.of(hex(await h.decryptString(num, gen, v.asBytes()))))
        else await strings(v, num, gen)
      }
    }
  }
  const one = async (ref: import('pdf-lib').PDFRef, obj: PDFObject): Promise<void> => {
    if (ref.objectNumber === encNum) return
    if (obj instanceof lib.PDFRawStream) {
      await strings(obj.dict, ref.objectNumber, ref.generationNumber)
      if (!isStreamPlain(obj)) (obj as { contents: Uint8Array }).contents = await h.decryptStream(ref.objectNumber, ref.generationNumber, obj.contents)
    } else await strings(obj, ref.objectNumber, ref.generationNumber)
  }
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) await one(ref, obj)
  // the object streams are readable now: their contents become ordinary objects (strings inside an object stream are not encrypted separately)
  for (const { ref, stream } of objStreams) {
    if (!(ref instanceof lib.PDFRef)) continue
    const holder = (lib.PDFObjectStreamParser as unknown as { forStream(s: PDFRawStream, w: () => boolean): { parseIntoContext(): Promise<void> } }).forStream(stream, () => false)
    await holder.parseIntoContext()
    ctx.delete(ref)
  }
  if (encRef instanceof lib.PDFRef) ctx.delete(encRef)
  ctx.trailerInfo = { ...ctx.trailerInfo, Encrypt: undefined }
  const doc = new (lib.PDFDocument as unknown as new (c: PDFContext, ignore: boolean, update: boolean) => import('pdf-lib').PDFDocument)(ctx, true, false)
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false })
}

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
