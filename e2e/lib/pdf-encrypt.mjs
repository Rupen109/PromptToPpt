/**
 * Makes protected test PDFs offline: the PDF standard security handler written from ISO 32000-1 (RC4 128 bit, revision 3, and AES-128, revision 4),
 * with node:crypto for MD5 and AES and a small RC4. Independent of the editor's own decrypt module (and checked against pdf.js, which opens the files with the
 * password). `owner` only (user password empty) makes a file that opens freely but is flagged as restricted.
 */
import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const web = createRequire(join(here, '../../apps/web/package.json'))

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex')
const md5 = (...b) => { const h = createHash('md5'); for (const x of b) h.update(x); return h.digest() }
function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 0, j = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]] }
  const out = Buffer.alloc(data.length)
  for (let k = 0, i = 0, j = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + s[i]) & 255; [s[i], s[j]] = [s[j], s[i]]; out[k] = data[k] ^ s[(s[i] + s[j]) & 255] }
  return out
}
const pad = (pw) => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32)

/** @param {Buffer|Uint8Array} plain @param {{ user?: string, owner?: string, mode?: 'rc4-128' | 'aes-128' }} o */
export async function encryptPdf(plain, { user = '', owner = 'owner-secret', mode = 'aes-128' } = {}) {
  const { PDFDocument, PDFDict, PDFArray, PDFRawStream, PDFString, PDFHexString, PDFName, PDFRef } = web('pdf-lib')
  const aes = mode === 'aes-128'
  const R = aes ? 4 : 3, V = aes ? 4 : 2, P = -3904 | 0
  const id = randomBytes(16)
  // O (algorithm 3), key (2), U (5)
  let h = md5(pad(owner)); for (let i = 0; i < 50; i++) h = md5(h)
  const ok = h.subarray(0, 16)
  let O = rc4(ok, pad(user)); for (let i = 1; i <= 19; i++) O = rc4(Buffer.from(ok.map((b) => b ^ i)), O)
  const pb = Buffer.alloc(4); pb.writeInt32LE(P)
  let k = md5(pad(user), O, pb, id); for (let i = 0; i < 50; i++) k = md5(k.subarray(0, 16))
  const key = k.subarray(0, 16)
  let U = rc4(key, md5(PAD, id)); for (let i = 1; i <= 19; i++) U = rc4(Buffer.from(key.map((b) => b ^ i)), U)
  U = Buffer.concat([U, Buffer.alloc(16)])

  const doc = await PDFDocument.load(await (await PDFDocument.load(plain, { updateMetadata: false })).save({ useObjectStreams: false, updateFieldAppearances: false }), { updateMetadata: false })
  const ctx = doc.context
  const objKey = (ref) => { const n = Buffer.from([ref.objectNumber & 255, (ref.objectNumber >> 8) & 255, (ref.objectNumber >> 16) & 255, ref.generationNumber & 255, (ref.generationNumber >> 8) & 255]); return md5(key, n, aes ? Buffer.from('sAlT') : Buffer.alloc(0)).subarray(0, 16) }
  const enc = (ref, data) => {
    const kk = objKey(ref)
    if (!aes) return rc4(kk, Buffer.from(data))
    const iv = randomBytes(16), c = createCipheriv('aes-128-cbc', kk, iv)
    return Buffer.concat([iv, c.update(Buffer.from(data)), c.final()])
  }
  const hex = (b) => PDFHexString.of(Buffer.from(b).toString('hex'))
  const walk = (o, ref) => {
    if (o instanceof PDFDict) { for (const [kk, v] of o.entries()) { if (v instanceof PDFString || v instanceof PDFHexString) o.set(kk, hex(enc(ref, v.asBytes()))); else walk(v, ref) } }
    else if (o instanceof PDFArray) { for (let i = 0; i < o.size(); i++) { const v = o.get(i); if (v instanceof PDFString || v instanceof PDFHexString) o.set(i, hex(enc(ref, v.asBytes()))); else walk(v, ref) } }
  }
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) { walk(obj.dict, ref); obj.contents = enc(ref, obj.contents) } else walk(obj, ref)
  }
  const e = { Filter: 'Standard', V, R, Length: 128, P, O: hex(O), U: hex(U) }
  if (aes) e.CF = ctx.obj({ StdCF: ctx.obj({ CFM: 'AESV2', AuthEvent: 'DocOpen', Length: 16 }) }), e.StmF = 'StdCF', e.StrF = 'StdCF'
  const encRef = ctx.register(ctx.obj(e))
  ctx.trailerInfo = { ...ctx.trailerInfo, Encrypt: encRef, ID: ctx.obj([hex(id), hex(id)]) }
  void PDFName; void PDFRef
  return Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false, updateMetadata: false }))
}
