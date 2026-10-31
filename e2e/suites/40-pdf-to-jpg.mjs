import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WEB, expect, launch, suite } from '../lib.mjs'

/** Free PDF → JPG in the visitor's browser (no server, no AI). Flow ids: docs/FREE_TOOLS_PLAN.md (PDF to JPG). */
/** Smallest valid text PDF (one string per page) — the same shape the API tests use. */
function tinyPdf(pages) {
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', `<</Type/Pages/Kids[${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}]/Count ${pages.length}>>`]
  pages.forEach((t, i) => {
    const content = `BT /F1 14 Tf 72 700 Td (${t}) Tj ET`
    objs.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${4 + i * 2} 0 R/Resources<</Font<</F1 ${3 + pages.length * 2} 0 R>>>>>>`, `<</Length ${content.length}>>\nstream\n${content}\nendstream`)
  })
  objs.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>')
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(out)
}


const jpegSize = (path) => { const b = readFileSync(path); let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2) } return null }

export default async function () {
  const s = suite('40-pdf-to-jpg')
  const b = await launch()
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
  const dir = mkdtempSync(join(tmpdir(), 'pdf2jpg-'))
  const pdf = tinyPdf(['First page text', 'Second page text', 'Third page text', 'Fourth page text'])
  const open = async () => { await p.goto(WEB + '/free-tools/pdf-to-jpg', { waitUntil: 'networkidle' }); await p.setInputFiles('input[type=file]', { name: 'Board pack.pdf', mimeType: 'application/pdf', buffer: pdf }) }
  const uploads = []; p.on('request', (r) => { if (r.method() !== 'GET' && !r.url().startsWith(WEB)) uploads.push(r.url()) })
  try {
    await s.check('A1 listed on /free-tools and in the sitemap; the page has its heading and FAQ', p, async () => {
      await p.goto(WEB + '/free-tools', { waitUntil: 'load' })
      expect(await p.getByRole('link', { name: /PDF to JPG Converter/ }).count() >= 1, 'not listed on /free-tools')
      expect((await (await p.request.get(WEB + '/sitemap.xml')).text()).includes('/free-tools/pdf-to-jpg'), 'not in sitemap')
      await p.goto(WEB + '/free-tools/pdf-to-jpg', { waitUntil: 'load' })
      expect(await p.getByRole('heading', { level: 1, name: /PDF to JPG/ }).count() === 1, 'h1')
      expect((await p.content()).includes('FAQPage'), 'no FAQ JSON-LD')
    })
    await s.check('A2 all pages (High): 4 previews, zip holds 4 real JPEGs named by page, nothing sent to a server', p, async () => {
      await open()
      await p.getByRole('button', { name: 'Convert to JPG' }).click()
      await p.getByText('4 pictures are ready').waitFor({ timeout: 60000 })
      expect(await p.locator('img[alt^="Page "]').count() === 4, 'previews')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: /Download all/ }).click()])
      expect(dl.suggestedFilename() === 'Board pack-jpg.zip', dl.suggestedFilename())
      const z = join(dir, 'all.zip'); await dl.saveAs(z)
      const names = execFileSync('unzip', ['-Z1', z]).toString().trim().split('\n')
      expect(names.join() === 'Board pack-page-1.jpg,Board pack-page-2.jpg,Board pack-page-3.jpg,Board pack-page-4.jpg', names.join())
      execFileSync('unzip', ['-o', '-q', z, '-d', dir])
      const sz = jpegSize(join(dir, 'Board pack-page-1.jpg')); expect(sz && sz.h === 1754, `size ${JSON.stringify(sz)}`)
      expect(uploads.length === 0, `requests to other servers: ${uploads}`)
    })
    await s.check('A3 page choice "2-3": two pictures; Standard is smaller than Maximum; single page downloads one .jpg', p, async () => {
      const size = async (q) => { await open(); await p.getByText(q, { exact: true }).click(); await p.getByLabel('Pages to convert').fill('2'); await p.getByRole('button', { name: 'Convert to JPG' }).click(); await p.getByText('Your picture is ready').waitFor({ timeout: 60000 }); const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download JPG' }).click()]); const f = join(dir, `${q}.jpg`); await dl.saveAs(f); expect(dl.suggestedFilename() === 'Board pack-page-2.jpg', dl.suggestedFilename()); return jpegSize(f).h }
      const small = await size('Standard'), big = await size('Maximum')
      expect(small < big, `standard ${small} !< maximum ${big}`)
      await open(); await p.getByLabel('Pages to convert').fill('2-3'); await p.getByRole('button', { name: 'Convert to JPG' }).click()
      await p.getByText('2 pictures are ready').waitFor({ timeout: 60000 })
      expect(await p.locator('img[alt^="Page "]').count() === 2, 'two previews')
    })
    await s.check('B1 plain refusals: page out of range, nonsense pages, not a PDF, a fake PDF — one sentence each', p, async () => {
      await open()
      const go = async (txt, re) => { await p.getByLabel('Pages to convert').fill(txt); await p.getByRole('button', { name: 'Convert to JPG' }).click(); await p.getByRole('alert').filter({ hasText: re }).waitFor({ timeout: 20000 }) }
      await go('9', /has 4 pages/); await go('abc', /not a page number/)
      await p.setInputFiles('input[type=file]', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
      await p.getByRole('alert').filter({ hasText: /choose a PDF/ }).waitFor()
      await p.setInputFiles('input[type=file]', { name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ not a pdf at all') })
      await p.getByLabel('Pages to convert').fill(''); await p.getByRole('button', { name: 'Convert to JPG' }).click()
      await p.getByRole('alert').filter({ hasText: /not a PDF/ }).waitFor({ timeout: 20000 })
    })
    await s.check('C1 phone width: no sideways scroll', p, async () => {
      await p.setViewportSize({ width: 390, height: 800 }); await open()
      await p.getByRole('button', { name: 'Convert to JPG' }).click(); await p.getByText('4 pictures are ready').waitFor({ timeout: 60000 })
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page scrolls sideways')
    })
  } finally { await b.close() }
  return s.done()
}
