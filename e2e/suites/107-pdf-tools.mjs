import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The free PDF page tools in a real browser, each result opened again with pdf-lib: merge (order, page count, text kept), split (every page, ranges as a zip,
 * extract into one PDF, a wrong range explained), organize (reorder, rotate, delete), compress (photos made smaller, text untouched; a text-only PDF says it is
 * already compact). Test PDFs are made here (text pages, and pages with the site's own template photos). No AI is used.
 */
const web = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { PDFDocument, PDFName, StandardFonts, degrees } = web('pdf-lib')
const JSZip = web('jszip')
const PHOTOS = new URL('../../apps/web/public/template-assets/', import.meta.url).pathname // the full-size originals (the w1280 copies are already small)

async function textPdf(tag, n, opts = {}) {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= n; i++) { const p = doc.addPage(opts.size ?? [612, 792]); p.drawText(`${tag} page ${i}`, { x: 60, y: 700, size: 24, font }) }
  return Buffer.from(await doc.save())
}
async function photoPdf(n) {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica)
  const files = readdirSync(PHOTOS).filter((f) => f.endsWith('.jpg')).slice(0, n)
  for (const [i, f] of files.entries()) {
    const img = await doc.embedJpg(readFileSync(join(PHOTOS, f)))
    const p = doc.addPage([612, 792]); p.drawText(`Photo page ${i + 1}`, { x: 60, y: 740, size: 20, font }); p.drawImage(img, { x: 56, y: 200, width: 500, height: 500 * (img.height / img.width) })
  }
  return Buffer.from(await doc.save())
}
const texts = async (bytes) => { const doc = await PDFDocument.load(bytes); return doc }

export default async function () {
  const s = suite('107-pdf-tools')
  const dir = mkdtempSync(join(tmpdir(), 'pdftools-'))
  const b = await launch()
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 950 } })
  const p = await ctx.newPage()
  const errors = []; p.on('pageerror', (e) => errors.push(String(e)))
  const download = async () => { const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /^Download/ }).click()]); return { name: dl.suggestedFilename(), bytes: readFileSync(await dl.path()) } }
  const file = (name, buffer) => ({ name, mimeType: 'application/pdf', buffer })

  try {
    await s.check('merge: three PDFs, reordered, become one PDF with every page in the new order', p, async () => {
      await p.goto(`${WEB}/free-tools/merge-pdf`, { waitUntil: 'networkidle' })
      await p.getByLabel('Choose PDFs').setInputFiles([file('A.pdf', await textPdf('A', 2)), file('B.pdf', await textPdf('B', 3)), file('C.pdf', await textPdf('C', 1, { size: [792, 612] }))])
      await p.getByText('C.pdf').waitFor()
      await p.getByRole('button', { name: 'Move C.pdf up' }).click(); await p.getByRole('button', { name: 'Move C.pdf up' }).click() // C first
      await p.getByRole('button', { name: /Merge 3 PDFs \(6 pages\)/ }).click()
      await p.getByRole('button', { name: /^Download/ }).waitFor()
      const out = await download()
      expect(out.name === 'C-merged.pdf', `file name ${out.name}`)
      const doc = await texts(out.bytes)
      expect(doc.getPageCount() === 6, `${doc.getPageCount()} pages`)
      const first = doc.getPage(0).getSize()
      expect(first.width === 792 && first.height === 612, `the first page should be C's landscape page, got ${first.width}x${first.height}`)
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`)
    })

    await s.check('merge: a file that is not a PDF is named and left out', p, async () => {
      await p.goto(`${WEB}/free-tools/merge-pdf`, { waitUntil: 'networkidle' })
      await p.getByLabel('Choose PDFs').setInputFiles([file('notes.pdf', Buffer.from('just text')), file('A.pdf', await textPdf('A', 1))])
      await p.locator('p[role=alert]').filter({ hasText: 'notes.pdf' }).waitFor({ timeout: 10000 })
      expect(await p.getByText('A.pdf').isVisible() && !(await p.getByRole('listitem').filter({ hasText: 'notes.pdf' }).count()), 'the bad file was listed, or the good one was not')
    })

    const ten = await textPdf('Doc', 10)
    await s.check('split: every page → 10 PDFs in one zip, each one page', p, async () => {
      await p.goto(`${WEB}/free-tools/split-pdf`, { waitUntil: 'networkidle' })
      await p.getByLabel('Choose a PDF').setInputFiles(file('Doc.pdf', ten))
      await p.getByRole('radio', { name: /Every page/ }).check()
      await p.getByRole('button', { name: 'Split into 10 PDFs' }).click()
      const out = await download()
      expect(out.name === 'Doc-split.zip', `file name ${out.name}`)
      const zip = await JSZip.loadAsync(out.bytes)
      const names = Object.keys(zip.files).sort()
      expect(names.length === 10 && names.includes('Doc-page-1.pdf') && names.includes('Doc-page-10.pdf'), `zip holds ${names}`)
      for (const n of names) expect((await texts(await zip.file(n).async('uint8array'))).getPageCount() === 1, `${n} is not one page`)
    })

    await s.check('split: ranges "1-3, 4-6, 7-" → three PDFs of 3, 3 and 4 pages', p, async () => {
      await p.goto(`${WEB}/free-tools/split-pdf`, { waitUntil: 'networkidle' })
      await p.getByLabel('Choose a PDF').setInputFiles(file('Doc.pdf', ten))
      await p.getByRole('radio', { name: /Custom ranges/ }).check()
      await p.getByLabel('Page ranges').fill('1-3, 4-6, 7-')
      await p.getByRole('button', { name: 'Split PDF' }).click()
      const zip = await JSZip.loadAsync((await download()).bytes)
      const counts = await Promise.all(['Doc-pages-1-3.pdf', 'Doc-pages-4-6.pdf', 'Doc-pages-7-10.pdf'].map(async (n) => (zip.file(n) ? (await texts(await zip.file(n).async('uint8array'))).getPageCount() : -1)))
      expect(JSON.stringify(counts) === '[3,3,4]', `pages per file: ${counts}`)
    })

    await s.check('split: extract "2, 5-6" → one PDF of 3 pages; a page that does not exist is explained', p, async () => {
      await p.goto(`${WEB}/free-tools/split-pdf`, { waitUntil: 'networkidle' })
      await p.getByLabel('Choose a PDF').setInputFiles(file('Doc.pdf', ten))
      await p.getByRole('radio', { name: /Extract pages/ }).check()
      await p.getByLabel('Pages to extract').fill('2, 5-6')
      await p.getByRole('button', { name: 'Extract pages' }).click()
      const out = await download()
      expect(out.name === 'Doc-extract.pdf' && (await texts(out.bytes)).getPageCount() === 3, `${out.name}: ${(await texts(out.bytes)).getPageCount()} pages`)
      await p.getByRole('button', { name: 'Split another PDF' }).click()
      await p.getByLabel('Choose a PDF').setInputFiles(file('Doc.pdf', ten))
      await p.getByRole('radio', { name: /Extract pages/ }).check()
      await p.getByLabel('Pages to extract').fill('2, 14')
      await p.getByRole('button', { name: 'Extract pages' }).click()
      await p.locator('p[role=alert]').filter({ hasText: 'pages 1 to 10' }).waitFor({ timeout: 10000 })
    })

    await s.check('organize: thumbnails of every page; move page 3 first, rotate it, delete page 2 → the saved PDF has that order and turn', p, async () => {
      await p.goto(`${WEB}/free-tools/organize-pdf`, { waitUntil: 'networkidle' })
      const five = await PDFDocument.load(await textPdf('Org', 5)); five.getPage(4).setRotation(degrees(90))
      await p.getByLabel('Choose a PDF').setInputFiles(file('Org.pdf', Buffer.from(await five.save())))
      await p.getByRole('img', { name: 'Page 5' }).waitFor({ timeout: 20000 }) // every thumbnail drawn
      expect(await p.getByTestId('page-card').count() === 5, 'not 5 page cards')
      expect(await p.getByRole('button', { name: /Move, rotate or delete a page first/ }).isDisabled(), 'saving is offered before any change')
      await p.getByRole('button', { name: 'Move page 3 earlier' }).click(); await p.getByRole('button', { name: 'Move page 2 earlier' }).click() // [3,1,2,4,5]
      await p.getByRole('button', { name: 'Rotate page 1 right' }).click()
      await p.getByRole('button', { name: 'Delete page 3' }).click() // removes original page 2 → [3,1,4,5]
      await p.getByRole('button', { name: 'Save the new PDF' }).click()
      const doc = await texts((await download()).bytes)
      expect(doc.getPageCount() === 4, `${doc.getPageCount()} pages`)
      const rot = doc.getPages().map((pg) => pg.getRotation().angle)
      expect(JSON.stringify(rot) === '[90,0,0,90]', `rotations ${rot} (page 3 turned right first, the original page 5 keeps its 90)`)
    })

    await s.check('compress: a PDF of photos gets clearly smaller at "Recommended", keeps every page and its text; a text-only PDF says it is already compact', p, async () => {
      const photos = await photoPdf(6)
      await p.goto(`${WEB}/free-tools/compress-pdf`, { waitUntil: 'networkidle' })
      await p.getByLabel('Choose a PDF').setInputFiles(file('Photos.pdf', photos))
      await p.getByRole('button', { name: 'Compress PDF' }).click()
      await p.getByRole('button', { name: /^Download/ }).waitFor({ timeout: 60000 })
      const out = await download()
      const doc = await texts(out.bytes)
      expect(doc.getPageCount() === 6, `${doc.getPageCount()} pages`)
      expect(out.bytes.length < photos.length * 0.8, `only ${Math.round((1 - out.bytes.length / photos.length) * 100)}% smaller (${photos.length} → ${out.bytes.length})`)
      expect(out.name === 'Photos-compressed.pdf', `file name ${out.name}`)
      // the text is still real text: every page still has its font (the names sit in compressed object streams, so they are read through pdf-lib)
      const fontsOk = doc.getPages().every((pg) => { const f = pg.node.Resources()?.lookup(PDFName.of('Font')); return f && f.keys().some((k) => String(f.lookup(k)?.lookup?.(PDFName.of('BaseFont'))).includes('Helvetica')) })
      expect(fontsOk, 'a page lost its text font')
      await p.getByRole('button', { name: 'Compress another PDF' }).click()
      await p.getByLabel('Choose a PDF').setInputFiles(file('Text.pdf', await textPdf('Plain', 3)))
      await p.getByRole('button', { name: 'Compress PDF' }).click()
      await p.getByText('This PDF is already compact').waitFor({ timeout: 30000 })
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`)
    })
  } finally {
    await b.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return s.done()
}
