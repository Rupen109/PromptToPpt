import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

/**
 * Test helper: builds small PDFs in code with exact, known colours, fonts and pictures (no binary fixtures), so the PDF brand reader can be checked against
 * what was drawn. Coordinates are PDF points, origin bottom-left, page 960 x 540 (16:9).
 */
export interface PdfRect { x: number; y: number; w: number; h: number; fill: [number, number, number] }
export interface PdfText { x: number; y: number; size: number; text: string; font?: 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Courier'; color?: [number, number, number] }
export interface PdfImage { x: number; y: number; w: number; h: number; /** pixel size of the stored picture */ px: number; rgb: [number, number, number]; /** a real JPEG (px x px) stored as it is (DCTDecode), the way cameras and PowerPoint store photos and logos */ jpeg?: Uint8Array }
export interface PdfPageSpec { bg?: [number, number, number]; rects?: PdfRect[]; texts?: PdfText[]; images?: PdfImage[]; gray?: { x: number; y: number; w: number; h: number; level: number }[] }
export interface PdfSpec { title?: string; pages: PdfPageSpec[]; w?: number; h?: number; /** a user password: the file then needs it to open (standard security handler, RC4 40-bit; the content is left readable, which is enough for a reader that must ask for the password first) */ password?: string }

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex')
const md5 = (...b: Buffer[]) => createHash('md5').update(Buffer.concat(b)).digest()
const rc4 = (key: Buffer, data: Buffer) => { const s = Array.from({ length: 256 }, (_, i) => i); let j = 0; for (let i = 0; i < 256; i++) { j = (j + s[i]! + key[i % key.length]!) & 255; [s[i], s[j]] = [s[j]!, s[i]!] } const out = Buffer.alloc(data.length); let a = 0, b = 0; for (let k = 0; k < data.length; k++) { a = (a + 1) & 255; b = (b + s[a]!) & 255; [s[a], s[b]] = [s[b]!, s[a]!]; out[k] = data[k]! ^ s[(s[a]! + s[b]!) & 255]! } return out }
const pad = (pw: string) => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32)
const hex = (b: Buffer) => `<${b.toString('hex')}>`

const n = (v: number) => (Math.round(v * 1000) / 1000).toString()
const rg = (c: [number, number, number]) => `${n(c[0] / 255)} ${n(c[1] / 255)} ${n(c[2] / 255)}`

export function brandPdf(spec: PdfSpec): Uint8Array {
  const W = spec.w ?? 960, H = spec.h ?? 540
  const objs: (string | Buffer)[] = []
  const add = (o: string | Buffer) => { objs.push(o); return objs.length } // 1-based id
  const catalog = add('') // 1
  const pages = add('') // 2
  const fonts: Record<string, number> = {}
  for (const f of ['Helvetica', 'Helvetica-Bold', 'Times-Roman', 'Courier']) fonts[f] = add(`<</Type/Font/Subtype/Type1/BaseFont/${f}>>`)
  const kids: number[] = []
  for (const pg of spec.pages) {
    let c = ''
    if (pg.bg) c += `${rg(pg.bg)} rg 0 0 ${W} ${H} re f\n`
    for (const r of pg.rects ?? []) c += `${rg(r.fill)} rg ${n(r.x)} ${n(r.y)} ${n(r.w)} ${n(r.h)} re f\n`
    for (const g of pg.gray ?? []) c += `${n(g.level)} g ${n(g.x)} ${n(g.y)} ${n(g.w)} ${n(g.h)} re f\n`
    const xobjs: string[] = []
    ;(pg.images ?? []).forEach((im, i) => {
      const raw = Buffer.alloc(im.jpeg ? 0 : im.px * im.px * 3)
      for (let p = 0; p < im.px * im.px; p++) { raw[p * 3] = im.rgb[0]; raw[p * 3 + 1] = im.rgb[1]; raw[p * 3 + 2] = im.rgb[2] }
      const z = im.jpeg ? Buffer.from(im.jpeg) : deflateSync(raw)
      const id = add(Buffer.concat([Buffer.from(`<</Type/XObject/Subtype/Image/Width ${im.px}/Height ${im.px}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/${im.jpeg ? 'DCTDecode' : 'FlateDecode'}/Length ${z.length}>>\nstream\n`, 'latin1'), z, Buffer.from('\nendstream', 'latin1')]))
      xobjs.push(`/Im${i} ${id} 0 R`)
      c += `q ${n(im.w)} 0 0 ${n(im.h)} ${n(im.x)} ${n(im.y)} cm /Im${i} Do Q\n`
    })
    for (const t of pg.texts ?? []) c += `BT /${t.font ?? 'Helvetica'} ${n(t.size)} Tf ${rg(t.color ?? [0, 0, 0])} rg ${n(t.x)} ${n(t.y)} Td (${t.text.replace(/[()\\]/g, '\\$&')}) Tj ET\n`
    const content = add(`<</Length ${c.length}>>\nstream\n${c}\nendstream`)
    kids.push(add(`<</Type/Page/Parent ${pages} 0 R/MediaBox[0 0 ${W} ${H}]/Contents ${content} 0 R/Resources<</Font<<${Object.entries(fonts).map(([k, v]) => `/${k} ${v} 0 R`).join('')}>>${xobjs.length ? `/XObject<<${xobjs.join('')}>>` : ''}>>>>`))
  }
  let enc = 0, idStr = ''
  if (spec.password) {
    const id = md5(Buffer.from('brand-test-id'))
    const O = rc4(md5(pad('owner-secret')).subarray(0, 5), pad(spec.password))
    const P = Buffer.alloc(4); P.writeInt32LE(-4)
    const key = md5(pad(spec.password), O, P, id).subarray(0, 5)
    const U = rc4(key, PAD)
    enc = add(`<</Filter/Standard/V 1/R 2/O ${hex(O)}/U ${hex(U)}/P -4>>`)
    idStr = `/ID[${hex(id)}${hex(id)}]`
  }
  const info = spec.title ? add(`<</Title(${spec.title.replace(/[()\\]/g, '\\$&')})>>`) : 0
  objs[catalog - 1] = `<</Type/Catalog/Pages ${pages} 0 R>>`
  objs[pages - 1] = `<</Type/Pages/Kids[${kids.map((k) => `${k} 0 R`).join(' ')}]/Count ${kids.length}>>`
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')]
  const offsets: number[] = []
  let len = parts[0]!.length
  objs.forEach((o, i) => {
    offsets.push(len)
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), typeof o === 'string' ? Buffer.from(o, 'latin1') : o, Buffer.from('\nendobj\n', 'latin1')])
    parts.push(b); len += b.length
  })
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size ${objs.length + 1}/Root ${catalog} 0 R${info ? `/Info ${info} 0 R` : ''}${enc ? `/Encrypt ${enc} 0 R${idStr}` : ''}>>\nstartxref\n${len}\n%%EOF`
  parts.push(Buffer.from(xref, 'latin1'))
  return new Uint8Array(Buffer.concat(parts))
}
