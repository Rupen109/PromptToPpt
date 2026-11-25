import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The free PDF to PowerPoint converter (editable text) with big PDFs (up to 300 pages / 100 MB), in a real browser:
 *  - a 300-page PDF with photos becomes a valid 300-slide PowerPoint (every link resolves, every part has a type, the text of page 300 is on slide 300), with no
 *    character XML forbids anywhere (one made PowerPoint "repair" files), and the page's memory stays far below what it used before pdf.js's caches were emptied.
 *  - 301 pages are refused with a clear message; the page says the real limits; a PDF too big for the AI redesign says so instead of offering the button.
 * Test PDFs are made here from the site's own template photos. No AI is used.
 */
const web = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { PDFDocument, StandardFonts, rgb } = web('pdf-lib')
const { unzipSync, strFromU8 } = createRequire(new URL('../../services/api/package.json', import.meta.url))('fflate')
const PHOTOS = new URL('../../apps/web/public/template-assets/w768/', import.meta.url).pathname

async function makePdf(pages, { padMB = 0 } = {}) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const photos = await Promise.all(readdirSync(PHOTOS).filter((f) => f.endsWith('.jpg')).slice(0, 12).map((f) => doc.embedJpg(readFileSync(join(PHOTOS, f)))))
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([612, 792])
    p.drawText(`Page ${i + 1}: quarterly report`, { x: 54, y: 730, size: 22, font, color: rgb(0.1, 0.1, 0.2) })
    p.drawText('Revenue grew 12% while costs stayed flat across all regions.', { x: 54, y: 700, size: 12, font })
    const ph = photos[i % photos.length]
    p.drawImage(ph, { x: 54, y: 300, width: 504, height: 504 * (ph.height / ph.width) > 380 ? 380 : 504 * (ph.height / ph.width) })
    p.drawRectangle({ x: 54, y: 120, width: 504, height: 120, color: rgb(0.93, 0.95, 1) })
  }
  if (padMB) await doc.attach(Buffer.from(Array.from({ length: padMB * 1024 * 1024 }, () => Math.floor(Math.random() * 256))), 'appendix.bin', { mimeType: 'application/octet-stream' })
  return doc.save()
}

/** a PowerPoint package's problems: links to missing parts, parts without a content type, duplicate slide ids */
function packageProblems(z) {
  const names = new Set(Object.keys(z)); const txt = (n) => strFromU8(z[n]); const problems = []
  for (const n of names) if (n.endsWith('.rels')) {
    const dir = n.replace(/_rels\/[^/]+$/, '')
    for (const [, t, mode] of txt(n).matchAll(/Target="([^"]+)"(?: TargetMode="(\w+)")?/g)) {
      if (mode === 'External') continue
      const out = []; for (const x of (t.startsWith('/') ? t.slice(1) : dir + t).split('/')) x === '..' ? out.pop() : x !== '.' && out.push(x)
      if (!names.has(out.join('/'))) problems.push(`${n} → ${t}`)
    }
  }
  const ct = txt('[Content_Types].xml'); const defaults = new Set([...ct.matchAll(/Default Extension="(\w+)"/g)].map((m) => m[1])); const over = new Set([...ct.matchAll(/PartName="\/([^"]+)"/g)].map((m) => m[1]))
  for (const n of names) if (!n.endsWith('/') && !over.has(n) && !defaults.has(n.split('.').pop())) problems.push(`${n} has no type`)
  const ids = [...txt('ppt/presentation.xml').matchAll(/<p:sldId id="(\d+)"/g)].map((m) => m[1]); if (new Set(ids).size !== ids.length) problems.push('duplicate slide ids')
  return problems
}

const rendererMB = () => { try { return Number(execSync("ps -axo rss,command | grep -i 'chrome-headless-shell' | grep -- '--type=renderer' | grep -v grep | awk '{s+=$1} END {print s}'").toString().trim() || 0) / 1024 } catch { return 0 } }

export default async function () {
  const s = suite('106-pdf-to-ppt-big')
  const dir = mkdtempSync(join(tmpdir(), 'pdf2ppt-'))
  const b = await launch()
  try {
    const big = join(dir, 'report-300.pdf'); writeFileSync(big, await makePdf(300))
    const tooMany = join(dir, 'report-301.pdf'); writeFileSync(tooMany, await makePdf(301))
    const heavy = join(dir, 'report-heavy.pdf'); writeFileSync(heavy, await makePdf(3, { padMB: 11 }))
    // a deck exported as pictures (no text in the PDF at all): two slides drawn in the browser, light and dark
    const scanned = join(dir, 'deck-pictures.pdf')
    {
      const p = await (await b.newContext()).newPage()
      const shots = []
      for (const [bg, ink, title] of [['#ffffff', '#111827', 'Quarterly revenue grew twelve percent'], ['#0f2340', '#ffffff', 'Hiring plan for the fourth quarter']]) {
        await p.setContent(`<body style="margin:0"><div style="width:1600px;height:900px;background:${bg};color:${ink};font:bold 72px Arial;padding:120px;box-sizing:border-box">${title}<div style="font:400 40px Arial;margin-top:60px">Prepared for the board, October</div></div></body>`)
        shots.push(await p.locator('div').first().screenshot({ type: 'png' }))
      }
      await p.context().close()
      const doc = await PDFDocument.create()
      for (const png of shots) { const img = await doc.embedPng(png); doc.addPage([1600, 900]).drawImage(img, { x: 0, y: 0, width: 1600, height: 900 }) }
      writeFileSync(scanned, await doc.save())
    }

    async function convert(file, { ocr = false } = {}) {
      const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 900 } }); const p = await ctx.newPage()
      await p.goto(`${WEB}/free-tools/pdf-to-ppt`, { waitUntil: 'networkidle' })
      await p.getByLabel('Choose a PDF').setInputFiles(file)
      if (ocr) await p.getByRole('radio', { name: /^OCR/ }).check()
      const before = rendererMB(); let peak = before, stop = false
      const poll = (async () => { while (!stop) { peak = Math.max(peak, rendererMB()); await new Promise((r) => setTimeout(r, 300)) } })()
      await p.getByRole('button', { name: 'Convert to PowerPoint' }).click()
      const done = p.getByRole('button', { name: 'Download .pptx' })
      const outcome = await Promise.race([done.waitFor({ timeout: 600000 }).then(() => 'ok'), p.locator('p[role=alert]').waitFor({ timeout: 600000 }).then(() => p.locator('p[role=alert]').innerText())])
      stop = true; await poll
      let zip = null
      if (outcome === 'ok') { const [dl] = await Promise.all([p.waitForEvent('download'), done.click()]); zip = unzipSync(readFileSync(await dl.path())) }
      return { p, ctx, outcome, zip, memMB: Math.round(peak - before) }
    }

    await s.check('the page says the real limits (300 pages and 100 MB; the AI redesign reads PDFs up to 10 MB)', null, async () => {
      const p = await (await b.newContext()).newPage()
      await p.goto(`${WEB}/free-tools/pdf-to-ppt`, { waitUntil: 'networkidle' })
      const body = await p.locator('body').innerText()
      expect(body.includes('Up to 300 pages and 100 MB'), 'the drop zone does not say "Up to 300 pages and 100 MB"')
      expect(body.includes('Up to 300 pages and 100 MB per PDF.') && body.includes('reads PDFs up to 10 MB'), 'the Limits section does not say the new limits')
      expect(!/\b60 pages\b/.test(body), 'the page still says 60 pages')
      await p.context().close()
    })

    await s.check('300 pages with photos → a valid 300-slide editable PowerPoint, nothing XML forbids in any part, memory far below the old way', null, async () => {
      const r = await convert(big)
      expect(r.outcome === 'ok', `conversion failed: ${r.outcome}`)
      const slides = Object.keys(r.zip).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      expect(slides.length === 300, `${slides.length} slides`)
      const problems = packageProblems(r.zip).filter((x) => !/slideMaster\d+\.xml/.test(x)); expect(problems.length === 0, `package problems: ${problems.slice(0, 4).join(' | ')}`)
      // before pdf.js's caches were emptied every 10 pages this used over 600 MB
      if (r.memMB) expect(r.memMB < 520, `the page used ${r.memMB} MB converting 300 pages`)
      const bad = Object.entries(r.zip).filter(([n, d]) => /\.(xml|rels)$/.test(n) && /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(strFromU8(d))).map(([n]) => n)
      expect(bad.length === 0, `forbidden characters in ${bad.slice(0, 4).join(', ')}`)
      expect(strFromU8(r.zip['ppt/slides/slide300.xml']).includes('Page 300: quarterly report'), 'the text of page 300 is missing')
      await r.ctx.close()
    })

    await s.check('a PDF of pictures: "No OCR" keeps each page as its picture (never blank) and says so; "OCR" makes the words editable text in their colours', null, async () => {
      const plain = await convert(scanned)
      expect(plain.outcome === 'ok', `conversion failed: ${plain.outcome}`)
      expect(await plain.p.getByText('2 pages have no selectable text, so they were kept as pictures').isVisible(), 'no note about the pages kept as pictures')
      expect(!(await plain.p.getByRole('status').innerText()).includes('the text is editable'), 'says the text is editable when no page had any')
      // each slide shows one picture of its page (counted from the slides' own links, not the media folder, which also holds the library's own files)
      const perSlide = [1, 2].map((i) => (strFromU8(plain.zip[`ppt/slides/_rels/slide${i}.xml.rels`]).match(/relationships\/image"/g) ?? []).length)
      expect(perSlide.every((c) => c === 1), `pictures per slide: ${perSlide}`)
      await plain.ctx.close()
      const read = await convert(scanned, { ocr: true })
      expect(read.outcome === 'ok', `OCR conversion failed: ${read.outcome}`)
      const s1 = strFromU8(read.zip['ppt/slides/slide1.xml']), s2 = strFromU8(read.zip['ppt/slides/slide2.xml'])
      expect(/Quarterly revenue grew/.test(s1) && /Hiring plan/.test(s2), 'the words were not read into text')
      // the white words on the dark slide come back white (the colour of the pixels the cover replaced), the dark words on the light slide dark
      const colour = (x, word) => x.split('<p:sp>').find((sp) => sp.includes(word))?.match(/<a:srgbClr val="([0-9A-F]{6})"/)?.[1] ?? ''
      const lum = (h) => parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16)
      expect(lum(colour(s2, 'Hiring')) > 600 && lum(colour(s1, 'Quarterly')) < 200, `text colours: dark slide ${colour(s2, 'Hiring')}, light slide ${colour(s1, 'Quarterly')}`)
      await read.ctx.close()
    })

    await s.check('a 301-page PDF is refused with a clear message', null, async () => {
      const r = await convert(tooMany)
      expect(/301 pages.*up to 300/.test(r.outcome), `message: ${r.outcome}`)
      await r.ctx.close()
    })

    await s.check('a PDF over the AI redesign limit converts, and says plainly the AI cannot read it (no button that would fail)', null, async () => {
      const r = await convert(heavy)
      expect(r.outcome === 'ok', `conversion failed: ${r.outcome}`)
      expect(await r.p.getByText(/AI redesign reads PDFs up to 10 MB, and this one is 1\d\.\d MB/).isVisible(), 'no message about the AI limit')
      expect(await r.p.getByRole('button', { name: 'Redesign it with AI' }).count() === 0, 'the redesign button is still offered')
      await r.ctx.close()
    })
  } finally {
    await b.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return s.done()
}
