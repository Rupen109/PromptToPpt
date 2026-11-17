/**
 * Generated PDFs with the parts of a document that the editor must not lose when it saves: an outline (bookmarks), named destinations, page labels,
 * metadata + XMP, a form (text field, checkbox, dropdown, radio group, a second text field on another page), links, tagged structure, optional content.
 * Built with pdf-lib's low-level API, nothing is committed as a binary.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const web = createRequire(join(here, '../../apps/web/package.json'))
const lib = () => web('pdf-lib')

/** page n (1-based) shows the text `Page n` */
export async function makeStructuredPdf({ pages = 6 } = {}) {
  const { PDFDocument, PDFName, PDFString, PDFHexString, PDFNumber, PDFBool, StandardFonts, rgb } = lib()
  const doc = await PDFDocument.create({ updateMetadata: false })
  const ctx = doc.context
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pgs = []
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([612, 792])
    p.drawText(`Page ${i}`, { x: 72, y: 700, size: 28, font, color: rgb(0, 0, 0) })
    p.drawText(`Body text on page ${i}`, { x: 72, y: 650, size: 14, font })
    pgs.push(p)
  }
  doc.setTitle('Structured Fixture'); doc.setAuthor('SlidesDone tests'); doc.setSubject('Fidelity'); doc.setKeywords(['alpha', 'beta'])
  const dest = (i) => ctx.obj([pgs[i - 1].ref, PDFName.of('Fit')])

  // ---- form on page 1 (and a field on page 4) ----
  const form = doc.getForm()
  const name = form.createTextField('full_name'); name.setText('Ada'); name.addToPage(pgs[0], { x: 72, y: 560, width: 220, height: 24, font })
  const agree = form.createCheckBox('agree'); agree.addToPage(pgs[0], { x: 72, y: 520, width: 18, height: 18 })
  const color = form.createDropdown('color'); color.addOptions(['Red', 'Green', 'Blue']); color.select('Green'); color.addToPage(pgs[0], { x: 72, y: 470, width: 160, height: 24, font })
  const radio = form.createRadioGroup('size'); radio.addOptionToPage('small', pgs[0], { x: 72, y: 430, width: 16, height: 16 }); radio.addOptionToPage('large', pgs[0], { x: 160, y: 430, width: 16, height: 16 })
  if (pages >= 4) { const f = form.createTextField('second_page_field'); f.setText('on page four'); f.addToPage(pgs[3], { x: 72, y: 560, width: 220, height: 24, font }) }
  form.updateFieldAppearances(font)

  // ---- links ----
  if (pages >= 5) {
    pgs[0].node.addAnnot(ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 600, 220, 620], Border: [0, 0, 0], Dest: dest(5) })))
    pgs[1].node.addAnnot(ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 600, 220, 620], Border: [0, 0, 0], Dest: PDFString.of('app') })))
    pgs[2].node.addAnnot(ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [72, 600, 220, 620], Border: [0, 0, 0], A: ctx.obj({ S: 'GoTo', D: dest(2) }) })))
  }

  // ---- outline ----
  const item = (title, d, parent) => { const o = ctx.obj({ Title: PDFHexString.fromText(title), Parent: parent, Dest: d }); return ctx.register(o) }
  const outlineRef = ctx.nextRef(); const outlineDict = ctx.obj({ Type: 'Outlines' }); ctx.assign(outlineRef, outlineDict)
  const link = (refs) => refs.forEach((r, i) => { const o = ctx.lookup(r); if (i > 0) o.set(PDFName.of('Prev'), refs[i - 1]); if (i < refs.length - 1) o.set(PDFName.of('Next'), refs[i + 1]) })
  const ch1 = item('Chapter 1', dest(1), outlineRef), ch2 = item('Chapter 2', dest(3), outlineRef), ch3 = item(pages >= 5 ? 'Chapter 3' : 'Chapter 3', dest(Math.min(5, pages)), outlineRef)
  const app = item('Appendix', PDFString.of('app'), outlineRef)
  const s11 = item('Section 1.1', dest(2), ch1), s21 = item('Section 2.1', dest(Math.min(4, pages)), ch2)
  link([ch1, ch2, ch3, app]); const c1 = ctx.lookup(ch1); c1.set(PDFName.of('First'), s11); c1.set(PDFName.of('Last'), s11); c1.set(PDFName.of('Count'), PDFNumber.of(1))
  const c2 = ctx.lookup(ch2); c2.set(PDFName.of('First'), s21); c2.set(PDFName.of('Last'), s21); c2.set(PDFName.of('Count'), PDFNumber.of(-1))
  outlineDict.set(PDFName.of('First'), ch1); outlineDict.set(PDFName.of('Last'), app); outlineDict.set(PDFName.of('Count'), PDFNumber.of(5))
  doc.catalog.set(PDFName.of('Outlines'), outlineRef)
  doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))

  // ---- named destinations (name tree) ----
  const lastPage = pages >= 6 ? 6 : pages
  doc.catalog.set(PDFName.of('Names'), ctx.obj({ Dests: ctx.obj({ Names: [PDFString.of('app'), dest(lastPage), PDFString.of('intro'), dest(1)] }) }))

  // ---- page labels: i, ii, then 1.. ----
  doc.catalog.set(PDFName.of('PageLabels'), ctx.obj({ Nums: [0, ctx.obj({ S: 'r' }), 2, ctx.obj({ S: 'D', St: 1 })] }))

  // ---- XMP ----
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Structured Fixture</dc:title></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  doc.catalog.set(PDFName.of('Metadata'), ctx.register(ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML' })))

  // ---- optional content ----
  const ocg = ctx.register(ctx.obj({ Type: 'OCG', Name: PDFHexString.fromText('Notes layer') }))
  doc.catalog.set(PDFName.of('OCProperties'), ctx.obj({ OCGs: [ocg], D: ctx.obj({ Order: [ocg], ON: [ocg] }) }))

  // ---- tagged structure: Document > one P per page (Pg = that page) ----
  const rootRef = ctx.nextRef(); const docElRef = ctx.nextRef()
  const ps = pgs.map((p, i) => ctx.register(ctx.obj({ Type: 'StructElem', S: 'P', P: docElRef, Pg: p.ref, K: 0 })))
  ctx.assign(docElRef, ctx.obj({ Type: 'StructElem', S: 'Document', P: rootRef, K: ps }))
  ctx.assign(rootRef, ctx.obj({ Type: 'StructTreeRoot', K: docElRef, ParentTree: ctx.obj({ Nums: pgs.flatMap((_, i) => [i, ctx.obj([ps[i]])]) }) }))
  pgs.forEach((p, i) => p.node.set(PDFName.of('StructParents'), PDFNumber.of(i)))
  doc.catalog.set(PDFName.of('StructTreeRoot'), rootRef)
  doc.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: PDFBool.True }))
  doc.catalog.set(PDFName.of('Lang'), PDFString.of('en-US'))
  return Buffer.from(await doc.save({ useObjectStreams: false, updateFieldAppearances: false }))
}

/** what a saved file still holds, read with pdf-lib (structure) */
export async function inspect(buf) {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFNumber } = lib()
  const doc = await PDFDocument.load(buf, { updateMetadata: false })
  const ctx = doc.context, cat = doc.catalog
  const pages = doc.getPages()
  const idx = new Map(pages.map((p, i) => [p.ref.toString(), i]))
  const text = (o) => (o && o.decodeText ? o.decodeText() : undefined)
  const resolveNamed = new Map()
  const names = cat.lookupMaybe(PDFName.of('Names'), PDFDict)?.lookupMaybe(PDFName.of('Dests'), PDFDict)?.lookupMaybe(PDFName.of('Names'), PDFArray)
  if (names) for (let i = 0; i + 1 < names.size(); i += 2) resolveNamed.set(text(names.lookup(i)), names.lookup(i + 1))
  const pageOfDest = (d) => {
    let o = d && ctx.lookup(d)
    if (o instanceof PDFDict) o = o.lookup(PDFName.of('D'))
    if (!(o instanceof PDFArray)) { const k = text(o); o = k !== undefined && resolveNamed.get(k) }
    const f = o instanceof PDFArray ? o.get(0) : undefined
    return f instanceof PDFRef ? (idx.has(f.toString()) ? idx.get(f.toString()) : 'dangling') : undefined
  }
  const outline = []
  const walk = (node, depth) => {
    let cur = node.lookupMaybe(PDFName.of('First'), PDFDict)
    for (let n = 0; cur && n < 500; n++) {
      outline.push({ depth, title: text(cur.lookup(PDFName.of('Title'))), page: pageOfDest(cur.get(PDFName.of('Dest'))) })
      walk(cur, depth + 1); cur = cur.lookupMaybe(PDFName.of('Next'), PDFDict)
    }
  }
  const ol = cat.lookupMaybe(PDFName.of('Outlines'), PDFDict); if (ol) walk(ol, 0)
  const links = pages.map((p) => { const a = p.node.Annots(); const out = []; if (a) for (let i = 0; i < a.size(); i++) { const d = a.lookupMaybe(i, PDFDict); if (d?.lookup(PDFName.of('Subtype'))?.decodeText() === 'Link') { const act = d.lookupMaybe(PDFName.of('A'), PDFDict); out.push(pageOfDest(d.get(PDFName.of('Dest')) ?? act?.get(PDFName.of('D')))) } } return out })
  const labels = []
  const pl = cat.lookupMaybe(PDFName.of('PageLabels'), PDFDict)?.lookupMaybe(PDFName.of('Nums'), PDFArray)
  if (pl) for (let i = 0; i + 1 < pl.size(); i += 2) { const d = pl.lookup(i + 1); labels.push({ at: pl.lookup(i).asNumber(), s: d.lookup(PDFName.of('S'))?.decodeText(), st: d.lookup(PDFName.of('St'))?.asNumber() }) }
  const fields = doc.getForm().getFields().map((f) => f.getName())
  const info = { title: doc.getTitle(), author: doc.getAuthor(), subject: doc.getSubject(), keywords: doc.getKeywords(), producer: doc.getProducer(), creator: doc.getCreator() }
  const has = (k) => cat.get(PDFName.of(k)) !== undefined
  const objects = ctx.enumerateIndirectObjects().length
  return { pageCount: pages.length, outline, links, labels, fields, info, objects, named: [...resolveNamed.keys()], xmp: has('Metadata'), ocg: has('OCProperties'), tagged: has('StructTreeRoot'), markInfo: has('MarkInfo'), lang: has('Lang'), pageMode: cat.lookup(PDFName.of('PageMode'))?.decodeText() }
}

/** page 1: a line that mixes bold, regular and italic; three real bullets (marker apart, marker apart, marker inside the text); a line in an embedded Roboto. page 2: plain. */
export async function makeFeaturePdf() {
  const { PDFDocument, StandardFonts, rgb } = lib()
  const fontkit = web('@pdf-lib/fontkit')
  const { readFileSync } = await import('node:fs')
  const doc = await PDFDocument.create(); doc.registerFontkit(fontkit)
  const reg = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold), obl = await doc.embedFont(StandardFonts.HelveticaOblique)
  const roboto = await doc.embedFont(readFileSync(join(here, '../../apps/web/public/pdf-fonts/roboto-regular.ttf')), { subset: true })
  const p = doc.addPage([612, 792])
  let x = 72
  for (const [t, f] of [['Lead-in bold: ', bold], ['regular words follow here', reg], [' and an italic end', obl]]) { p.drawText(t, { x, y: 700, size: 16, font: f, color: rgb(0, 0, 0) }); x += f.widthOfTextAtSize(t, 16) }
  p.drawText('•', { x: 72, y: 640, size: 14, font: reg }); p.drawText('First bullet item', { x: 90, y: 640, size: 14, font: reg })
  p.drawText('•', { x: 72, y: 610, size: 14, font: reg }); p.drawText('Second bullet item', { x: 90, y: 610, size: 14, font: reg })
  p.drawText('• Third bullet combined', { x: 72, y: 580, size: 14, font: reg })
  p.drawText('Roboto sample line', { x: 72, y: 540, size: 14, font: roboto })
  p.drawText('Plain closing line', { x: 72, y: 500, size: 14, font: reg })
  doc.addPage([612, 792]).drawText('Second page', { x: 72, y: 700, size: 14, font: reg })
  return Buffer.from(await doc.save())
}

/** every decoded content stream of the file as text (to prove a deleted page's words are not anywhere in it) */
export async function allStreamText(buf) {
  const { PDFDocument, PDFRawStream, decodePDFRawStream } = lib()
  const doc = await PDFDocument.load(buf, { updateMetadata: false })
  let out = ''
  for (const [, o] of doc.context.enumerateIndirectObjects()) if (o instanceof PDFRawStream) { try { out += Buffer.from(decodePDFRawStream(o).decode()).toString('latin1') + '\n' } catch { /* not text */ } }
  return out
}

/** the tagged structure of a saved file: how many <P> elements (one per page in the fixture), how many parent-tree entries, and whether anything points at a page that is not in the file */
export async function tagInfo(buf) {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef } = lib()
  const doc = await PDFDocument.load(buf, { updateMetadata: false }), ctx = doc.context
  const pages = new Set(doc.getPages().map((p) => p.ref.toString()))
  const root = doc.catalog.lookupMaybe(PDFName.of('StructTreeRoot'), PDFDict)
  if (!root) return { elements: 0, parentTreeKeys: 0, dangling: false, none: true }
  let elements = 0, dangling = false
  const walk = (o, depth) => {
    if (depth > 20) return
    const v = o instanceof PDFRef ? ctx.lookup(o) : o
    if (v instanceof PDFArray) { for (const k of v.asArray()) walk(k, depth + 1); return }
    if (!(v instanceof PDFDict)) return
    const pg = v.get(PDFName.of('Pg')); if (pg instanceof PDFRef && !pages.has(pg.toString())) dangling = true
    if (v.lookup(PDFName.of('S'))?.decodeText?.() === 'P') elements++
    const k = v.get(PDFName.of('K')); if (k) walk(k, depth + 1)
  }
  walk(root.get(PDFName.of('K')), 0)
  const nums = root.lookupMaybe(PDFName.of('ParentTree'), PDFDict)?.lookupMaybe(PDFName.of('Nums'), PDFArray)
  return { elements, parentTreeKeys: nums ? nums.size() / 2 : 0, dangling }
}
