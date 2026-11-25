import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'
import { WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The free PDF editor on REAL-WORLD PDFs (not generated ones), end to end in a real browser: an official fillable form, a research paper with figures,
 * a web article with photos printed by Chrome, a brochure with slide pictures. For each: it opens (time, a thumbnail per page, the page drawn), a real text
 * line is edited, text / whiteout / highlight / a picture are added, a form field is filled when there is one, a page is turned and the last one deleted,
 * and the DOWNLOADED file is judged with pdf.js: page count, the new and edited words are real text, an untouched page is drawn exactly as before (same
 * drawing operations, pictures included), the file is not bloated. Throughout: no page errors and nothing sent anywhere (the file never leaves the device).
 * Third-party files are not committed: put PDFs in a folder and set E2E_REAL_PDF_DIR (skipped when unset).
 */
const here = dirname(fileURLToPath(import.meta.url))
const web = createRequire(join(here, '../../apps/web/package.json'))
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const DIR = process.env.E2E_REAL_PDF_DIR
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
/** a solid green 100 x 50 PNG (as suite 62 makes them) */
const png = (w = 100, h = 50) => {
  const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, 'latin1'); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [0, 200, 0, 255]).flat())])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))])
}

async function doc(buf) {
  const pdfjs = await import(pathToFileURL(web.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useWorkerFetch: false, standardFontDataUrl: pathToFileURL(join(dirname(web.resolve('pdfjs-dist/package.json')), 'standard_fonts/')).href }).promise
  return { d, OPS: pdfjs.OPS }
}
const pageText = async (d, n) => (await (await d.getPage(n)).getTextContent()).items.map((x) => x.str).join(' ')
const drawing = async (d, OPS, n) => { const ops = await (await d.getPage(n)).getOperatorList(); return { ops: ops.fnArray.length, images: ops.fnArray.filter((f) => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject).length } }

export default async function () {
  const s = suite('104-pdf-editor-real')
  if (!DIR) { console.log('  - SKIP: set E2E_REAL_PDF_DIR to a folder of real-world PDFs'); return s.done() }
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()
  const b = await launch()
  try {
    for (const name of files) {
      const buf = readFileSync(join(DIR, name))
      const { d: orig, OPS } = await doc(buf)
      const pages = orig.numPages
      const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage()
      const errors = [], sent = []
      p.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
      // the site header's own sign-in check (a plain GET with no body, on every page of the site) is the one request allowed: it carries nothing of the file
      const HEADER_CHECK = (r, u) => r.method() === 'GET' && u.pathname === '/api/auth/get-session'
      p.on('request', (r) => { const u = new URL(r.url()); if (HEADER_CHECK(r, u)) return; if (u.origin !== new URL(WEB).origin && !/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) sent.push(`${r.method()} ${u.host}${u.pathname}`); else if (!['GET', 'HEAD'].includes(r.method())) sent.push(`${r.method()} ${u.pathname}`) })
      const ready = () => p.waitForFunction(() => document.querySelector('canvas[aria-label="Page picture"]')?.dataset.ready === '1', null, { timeout: 60000 })
      const tool = (t) => p.getByRole('button', { name: t, exact: true }).first().click()
      /** a point on the page as fractions of its width / height (the page is scrolled into view first) */
      const at = async (fx, fy) => p.evaluate(({ fx, fy }) => {
        // the DRAWN page (its canvas), not the stage around it: the stage's layout box is larger than the page that shows
        const c = document.querySelector('canvas[aria-label="Page picture"]'); c.scrollIntoView({ block: 'center', behavior: 'instant' })
        const r = c.getBoundingClientRect(); return { x: r.left + r.width * fx, y: r.top + r.height * fy }
      }, { fx, fy })
      const drag = async (a, c) => { const A = await at(...a); const C = await at(...c); await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(C.x, C.y, { steps: 8 }); await p.mouse.up() }
      let edited = null, filled = null

      await s.check(`${name} (${pages} pages): opens quickly, a thumbnail for every page, the first page drawn`, p, async () => {
        const t0 = Date.now()
        await p.goto(`${WEB}/free-tools/pdf-editor`, { waitUntil: 'networkidle' })
        await p.setInputFiles('input[aria-label="Choose a PDF"]', { name, mimeType: 'application/pdf', buffer: buf })
        await p.getByRole('toolbar').waitFor({ timeout: 60000 }); await ready()
        const ms = Date.now() - t0
        const thumbs = await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count()
        expect(thumbs === pages, `${thumbs} thumbnails for ${pages} pages`)
        expect(ms < 20000, `opening took ${ms} ms`)
        console.log(`      opened in ${(ms / 1000).toFixed(1)} s`)
      })

      await s.check(`${name}: page 1 — a real text line edited, new text, whiteout, highlight and a picture added`, p, async () => {
        // Edit text is the tool in use from the start (clicking it again would switch it off)
        const et = p.getByRole('button', { name: 'Edit text', exact: true }).first()
        if ((await et.getAttribute('aria-pressed')) !== 'true') await et.click()
        // a line's words are in its data-run attribute (the button itself is a see-through box over the page)
        await p.locator('button[data-run]').first().waitFor({ timeout: 30000 })
        const i = await p.locator('button[data-run]').evaluateAll((els) => els.findIndex((e) => /[A-Za-z]{4,}/.test(e.dataset.run ?? '') && e.getBoundingClientRect().width > 30))
        expect(i >= 0, 'no clickable text line with words on page 1')
        const run = p.locator('button[data-run]').nth(i)
        const was = (await run.getAttribute('data-run')) ?? ''
        await run.click()
        await p.getByRole('textbox', { name: 'Text' }).waitFor({ timeout: 10000 }).catch(() => { throw new Error(`clicking the line "${was.slice(0, 40)}" opened no text box`) })
        await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('QA Edited Line'); await p.keyboard.press('Escape')
        edited = was
        await tool('Add text'); const A = await at(0.5, 0.55); await p.mouse.click(A.x, A.y)
        await p.getByRole('textbox', { name: 'Text' }).waitFor({ timeout: 10000 }).catch(() => { throw new Error(`Add text: a click at ${Math.round(A.x)},${Math.round(A.y)} opened no text box`) }); await p.keyboard.type('Added By QA'); await p.keyboard.press('Escape')
        await tool('Whiteout'); await drag([0.1, 0.62], [0.3, 0.66])
        await tool('Highlight'); await drag([0.55, 0.62], [0.85, 0.64])
        await p.setInputFiles('input[aria-label="Choose a picture to add"]', { name: 'qa.png', mimeType: 'image/png', buffer: png() })
        await p.locator('[data-anno=image] img').first().waitFor({ timeout: 10000 })
        const kinds = await p.locator('[data-anno]').evaluateAll((els) => els.map((e) => e.dataset.anno))
        expect(['whiteout', 'highlight', 'image', 'text'].every((k) => kinds.includes(k)), `items on page 1: ${kinds}`)
      })

      await s.check(`${name}: form fields (if the file has them) can be filled`, p, async () => {
        const field = p.locator('input[data-form-field]:not([type=checkbox]):not([type=radio])').first()
        if (!(await field.count())) { console.log('      (no fillable text field on page 1)'); return }
        filled = await field.getAttribute('data-form-field')
        await field.fill('Grace Hopper QA')
        expect((await field.inputValue()) === 'Grace Hopper QA', 'the field did not take the value')
      })

      await s.check(`${name}: page operations — page 2 turned, the last page deleted`, p, async () => {
        if (pages < 3) { console.log('      (fewer than 3 pages: skipped)'); return }
        await p.getByRole('button', { name: /^Page 2 of/ }).click(); await ready()
        await p.getByRole('button', { name: 'Rotate right' }).click(); await p.waitForTimeout(300)
        await p.getByRole('button', { name: new RegExp(`^Page ${pages} of`) }).click(); await ready()
        await p.getByRole('button', { name: 'Delete page' }).click(); await p.waitForTimeout(400)
        expect(await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count() === pages - 1, 'the page was not deleted')
      })

      await s.check(`${name}: the downloaded PDF — pages, real text, an untouched page exactly as before, not bloated; nothing sent anywhere, no page errors`, p, async () => {
        // a digitally signed file (the IRS form is): the editor warns that editing breaks the signature and asks the visitor to tick that they understand
        const signed = await p.getByTestId('ack-signed').count()
        if (signed) { console.log('      (digitally signed: the warning was shown and is ticked)'); await p.getByTestId('ack-signed').check() }
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.getByRole('button', { name: 'Download edited PDF' }).click()])
        const out = readFileSync(await dl.path())
        if (process.env.E2E_KEEP_DIR) { const { writeFileSync } = await import('node:fs'); writeFileSync(join(process.env.E2E_KEEP_DIR, `saved-${name}`), out) }
        const { d: saved } = await doc(out)
        const want = pages >= 3 ? pages - 1 : pages
        expect(saved.numPages === want, `${saved.numPages} pages, expected ${want}`)
        const t1 = await pageText(saved, 1)
        expect(/Added By QA/.test(t1), 'the added text is not real text in the file')
        expect(/QA Edited Line/.test(t1), `the edited line is not in the file (was "${edited?.slice(0, 40)}")`)
        if (filled) { // read from the field's own widget on page 1 (pdf.js's field list misses fields of hybrid XFA forms such as the IRS ones)
          const widgets = (await (await saved.getPage(1)).getAnnotations()).filter((a) => a.fieldName === filled)
          expect(widgets.some((a) => a.fieldValue === 'Grace Hopper QA'), `the form value was not saved (${filled}: ${JSON.stringify(widgets.map((a) => a.fieldValue))})`)
        }
        if (pages >= 4) { // page 3 was not touched: the same drawing operations and pictures as the original's page 3
          const a = await drawing(orig, OPS, 3), c = await drawing(saved, OPS, 3)
          expect(a.ops === c.ops && a.images === c.images, `page 3 changed: ${JSON.stringify(a)} → ${JSON.stringify(c)}`)
          expect((await pageText(orig, 3)) === (await pageText(saved, 3)), 'the text of untouched page 3 changed')
        }
        const ratio = out.length / buf.length
        expect(ratio < 2.5, `the saved file is ${ratio.toFixed(2)}x the original (${(out.length / 1024) | 0} KB)`)
        console.log(`      saved ${(out.length / 1024) | 0} KB (${ratio.toFixed(2)}x the original)`)
        expect(sent.length === 0, `requests that left the device: ${[...new Set(sent)].slice(0, 5)}`)
        expect(errors.length === 0, `page errors: ${errors.slice(0, 3)}`)
      })
      await ctx.close()
    }
  } finally {
    await b.close()
  }
  return s.done()
}
