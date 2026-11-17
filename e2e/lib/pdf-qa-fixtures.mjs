/**
 * Generated PDFs for the production QA suite (67-pdf-editor-qa.mjs): signed-looking, damaged, incremental, turned text, scripts, huge, large. Built at test time with
 * pdf-lib (and @napi-rs/canvas for pictures), never committed as binaries. Everything returns a Buffer.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanvas, rng } from './detect-fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const web = createRequire(join(here, '../../apps/web/package.json'))
const lib = () => web('pdf-lib')
const NOSTREAM = { useObjectStreams: false, updateFieldAppearances: false }

/** two pages of text; a signature field whose value has a /ByteRange like a real signed file (no real cryptography: only the shape matters). `filled: false` = an empty signature field. */
export async function makeSignedPdf({ filled = true } = {}) {
  const { PDFDocument, PDFName, PDFHexString, PDFString, StandardFonts } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([612, 792]); p1.drawText('Signed contract page one', { x: 72, y: 700, size: 22, font })
  doc.addPage([612, 792]).drawText('Page two of the signed contract', { x: 72, y: 700, size: 18, font })
  const ctx = doc.context
  const field = { FT: 'Sig', T: PDFString.of('Signature1'), Subtype: 'Widget', Type: 'Annot', Rect: [72, 100, 272, 160], F: 132, P: p1.ref }
  if (filled) field.V = ctx.register(ctx.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite', SubFilter: 'adbe.pkcs7.detached', ByteRange: [0, 840, 1900, 620], Contents: PDFHexString.of('30'.repeat(96)), M: PDFString.of('D:20260101120000Z'), Name: PDFString.of('Test Signer') }))
  const ref = ctx.register(ctx.obj(field))
  p1.node.addAnnot(ref)
  doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [ref], SigFlags: 3 }))
  return Buffer.from(await doc.save(NOSTREAM))
}

/** a fresh two-page document (the base of the damaged variants) */
export async function makePlainPdf(pages = 2) {
  const { PDFDocument, StandardFonts } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false }), font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) doc.addPage([612, 792]).drawText(`Plain page ${i} of ${pages}`, { x: 72, y: 700, size: 22, font })
  return Buffer.from(await doc.save(NOSTREAM))
}
/** startxref points into nothing and the xref table is zeroed: only a reader that rebuilds the table from the objects can open it */
export function corruptXref(buf) {
  let s = buf.toString('latin1')
  s = s.replace(/startxref\s+\d+/, 'startxref\n99999')
  s = s.replace(/xref\n0 (\d+)\n([\s\S]*?)trailer/, (m, n, body) => `xref\n0 ${n}\n${body.replace(/\d{10} \d{5}/g, '0000000000 00000')}trailer`)
  return Buffer.from(s, 'latin1')
}
/** the end of the file (xref table, trailer, %%EOF) is gone: the objects are intact, the trailer that names the catalog is not */
export const truncated = (buf) => { const s = buf.toString('latin1'); return Buffer.from(s.slice(0, s.lastIndexOf('xref\n')), 'latin1') }

/** a hand-written document plus an INCREMENTAL UPDATE that replaces the page's content stream (the update's xref has /Prev) */
export function makeIncrementalPdf() {
  const objs = []; let out = '%PDF-1.4\n'; const off = {}
  const add = (n, body) => { off[n] = out.length; out += `${n} 0 obj\n${body}\nendobj\n` }
  const stream = (txt) => `<< /Length ${txt.length} >>\nstream\n${txt}\nendstream`
  add(1, '<< /Type /Catalog /Pages 2 0 R >>'); add(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  add(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>')
  add(4, stream('BT /F1 24 Tf 72 700 Td (Original first version) Tj ET')); add(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const x1 = out.length
  out += `xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(off[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x1}\n%%EOF\n`
  const o4 = out.length
  out += `4 0 obj\n${stream('BT /F1 24 Tf 72 700 Td (Updated by an incremental save) Tj ET')}\nendobj\n`
  const x2 = out.length
  out += `xref\n4 1\n${String(o4).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R /Prev ${x1} >>\nstartxref\n${x2}\n%%EOF\n`
  void objs
  return Buffer.from(out, 'latin1')
}

/**
 * Turned text: page 1 has a horizontal line and text turned 90 and 270 degrees (a sidebar label) and 15 degrees; page 2 is /Rotate 90 and carries a turned line
 * as well. pdf-lib's `rotate` is counter-clockwise, so on screen these are -90, +90 and -15 degrees.
 */
export async function makeTurnedTextPdf() {
  const { PDFDocument, StandardFonts, degrees } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false }), font = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([612, 792])
  p1.drawText('Horizontal heading', { x: 72, y: 720, size: 22, font })
  p1.drawText('Sideways label up', { x: 40, y: 200, size: 18, font, rotate: degrees(90) })      // reads bottom to top: -90 on screen
  p1.drawText('Sideways label down', { x: 570, y: 600, size: 18, font, rotate: degrees(-90) })  // reads top to bottom: +90 on screen
  p1.drawText('Tilted stamp text', { x: 150, y: 400, size: 20, font, rotate: degrees(15) })      // -15 on screen
  const p2 = doc.addPage([612, 792]); p2.setRotation(degrees(90))
  p2.drawText('Turned page upright', { x: 100, y: 72, size: 20, font, rotate: degrees(90) })
  p2.drawText('Turned page tilted', { x: 300, y: 100, size: 20, font, rotate: degrees(90 + 20) })
  return Buffer.from(await doc.save(NOSTREAM))
}

/** the structured fixture plus a comment (Text annotation with a pop-up and a reply) and a highlight on page 1 */
export async function addComments(buf) {
  const { PDFDocument, PDFName, PDFString } = lib()
  const doc = await PDFDocument.load(buf, { updateMetadata: false }), ctx = doc.context
  const p1 = doc.getPages()[0]
  const note = ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 650, 320, 670], Contents: PDFString.of('Check this figure'), T: PDFString.of('Reviewer'), Name: 'Comment', F: 28 })
  const noteRef = ctx.register(note)
  const popup = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Popup', Rect: [330, 600, 480, 670], Parent: noteRef, Open: false }))
  note.set(PDFName.of('Popup'), popup)
  const reply = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [300, 650, 320, 670], Contents: PDFString.of('Agreed, fixed in v2'), T: PDFString.of('Author'), IRT: noteRef, RT: 'R', F: 28 }))
  p1.node.addAnnot(noteRef); p1.node.addAnnot(popup); p1.node.addAnnot(reply)
  return Buffer.from(await doc.save(NOSTREAM))
}

/** an open action and a link that both run JavaScript (app.alert), a named script, and an attached file: none of it may run or open */
export async function makeActivePdf() {
  const { PDFDocument, PDFName, PDFString, StandardFonts } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false }), font = await doc.embedFont(StandardFonts.Helvetica), ctx = doc.context
  const p = doc.addPage([612, 792]); p.drawText('Active content test page', { x: 72, y: 700, size: 22, font })
  const js = (code) => ctx.obj({ S: 'JavaScript', JS: PDFString.of(code) })
  doc.catalog.set(PDFName.of('OpenAction'), js('app.alert("OPEN ACTION RAN"); this.getField && 0;'))
  doc.catalog.set(PDFName.of('AA'), ctx.obj({ WC: js('app.alert("WILL CLOSE RAN")') }))
  p.node.addAnnot(ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 600, 220, 620], Border: [0, 0, 0], A: js('app.alert("LINK RAN")') })))
  const fileStream = ctx.register(ctx.flateStream(Buffer.from('attached secret text'), { Type: 'EmbeddedFile' }))
  const spec = ctx.register(ctx.obj({ Type: 'Filespec', F: PDFString.of('attachment.txt'), UF: PDFString.of('attachment.txt'), EF: ctx.obj({ F: fileStream }) }))
  doc.catalog.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: ctx.obj({ Names: [PDFString.of('attachment.txt'), spec] }), JavaScript: ctx.obj({ Names: [PDFString.of('boot'), js('app.alert("NAMED SCRIPT RAN")')] }) }))
  return Buffer.from(await doc.save(NOSTREAM))
}

export async function makeZeroPagePdf() {
  const s = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Size 3 /Root 1 0 R >>\n%%EOF\n'
  return Buffer.from(s, 'latin1')
}
export async function makeHugePagePdf(side = 14400) {
  const { PDFDocument, StandardFonts } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false }), font = await doc.embedFont(StandardFonts.Helvetica)
  doc.addPage([side, side]).drawText('A page the size of a building', { x: 400, y: side - 800, size: 400, font })
  return Buffer.from(await doc.save(NOSTREAM))
}

/** noise JPEG bytes of w x h (incompressible: sets the file size) */
async function noiseJpeg(w, h, seed, quality = 90) {
  const c = createCanvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), r = rng(seed)
  for (let i = 0; i < w * h; i++) { const v = (r() * 255) | 0; im.data[i * 4] = v; im.data[i * 4 + 1] = (v * 3 + (r() * 90)) % 255; im.data[i * 4 + 2] = (v + (r() * 160)) % 255; im.data[i * 4 + 3] = 255 }
  g.putImageData(im, 0, 0)
  return c.encode('jpeg', quality)
}
/** `pages` pages: heading, paragraph and one picture each (unique noise pictures), about `mb` megabytes */
export async function makeLargeMixedPdf({ pages = 60, mb = 28 } = {}) {
  const { PDFDocument, StandardFonts } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false }), font = await doc.embedFont(StandardFonts.Helvetica)
  const each = (mb * 1024 * 1024) / pages, side = Math.round(Math.sqrt(each / 0.9 / 1.1))
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([612, 792]), img = await doc.embedJpg(await noiseJpeg(side, side, i, 90))
    p.drawText(`Section ${i}: mixed text and pictures`, { x: 50, y: 740, size: 20, font })
    p.drawText('Revenue grew twelve percent while customer retention improved across all regions.', { x: 50, y: 710, size: 11, font })
    const w = 500, h = Math.min(560, w * (img.height / img.width)); p.drawImage(img, { x: 50, y: 700 - h - 10, width: w, height: h })
  }
  return Buffer.from(await doc.save(NOSTREAM))
}
/** a scan-like deck: `pages` full-page JPEGs (text drawn into the picture, no real text in the file), about `mb` megabytes */
export async function makeScanDeckPdf({ pages = 60, mb = 20 } = {}) {
  const { PDFDocument } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false })
  const each = (mb * 1024 * 1024) / pages
  for (let i = 1; i <= pages; i++) {
    const W = 1240, H = 1754, c = createCanvas(W, H), g = c.getContext('2d')
    g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, W, H); g.fillStyle = '#1b1b1b'; g.font = 'bold 60px Helvetica'; g.fillText(`Scanned page ${i}`, 100, 200); g.font = '34px Helvetica'
    for (let k = 0; k < 14; k++) g.fillText(`Line ${k + 1} of the scanned document, revenue and retention`, 100, 320 + k * 70)
    const r = rng(i * 17), im = g.getImageData(0, 0, W, H); for (let j = 0; j < W * H; j++) { const n = (r() - 0.5) * 70; im.data[j * 4] += n; im.data[j * 4 + 1] += n; im.data[j * 4 + 2] += n }
    g.putImageData(im, 0, 0)
    // pick the JPEG quality that lands near the wanted size (noise makes it predictable enough)
    let q = 80, bytes = await c.encode('jpeg', q); if (bytes.length > each * 1.3) bytes = await c.encode('jpeg', 55)
    const img = await doc.embedJpg(bytes); doc.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 })
  }
  return Buffer.from(await doc.save(NOSTREAM))
}
/** a one-page deck-like PDF from a canvas (a slide picture, 1920 x 1080 pt) for the picture / text finders in the browser */
export async function pdfFromCanvas(canvas, quality = 85) {
  const { PDFDocument } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false }), img = await doc.embedJpg(await canvas.encode('jpeg', quality))
  doc.addPage([canvas.width, canvas.height]).drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height })
  return Buffer.from(await doc.save(NOSTREAM))
}
