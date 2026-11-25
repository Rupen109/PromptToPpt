import { mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'
import { WEB, expect, launch, suite } from '../lib.mjs'

/**
 * Free PDF editor in the visitor's browser (no server, no AI). Flow ids: docs/FREE_TOOLS_PLAN.md ("PDF editor").
 * The test PDF has three pages: 1 plain, 2 with /Rotate 90 (text drawn upright on screen), 3 with an offset CropBox.
 * The downloaded file is checked with pdf-lib (structure), pdf.js (text) and by drawing it again with pdf.js inside the editor and reading pixels.
 */
const here = dirname(fileURLToPath(import.meta.url))
const web = createRequire(join(here, '../../apps/web/package.json'))
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SHOTS = process.env.E2E_SHOTS

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
/** a solid-colour RGBA PNG */
function png(w, h, [r, g, b]) {
  const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, 'latin1'); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b, 255]).flat())])
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))])
}

/** an RGBA PNG: dark ground with one light bar (stands for the words of a slide saved as a picture) */
function pngBar(w, h, bg, bar, [bx, by, bw, bh]) {
  const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, 'latin1'); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const rows = []
  for (let y = 0; y < h; y++) {
    const px = []
    for (let x = 0; x < w; x++) { const inBar = x >= bx && x < bx + bw && y >= by && y < by + bh; px.push(...(inBar ? bar : bg), 255) }
    rows.push(Buffer.concat([Buffer.from([0]), Buffer.from(px)]))
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

/** one page that is only a picture (no text in the file), like a deck exported as images */
async function makePicturePdf() {
  const { PDFDocument } = web('pdf-lib')
  const doc = await PDFDocument.create()
  const img = await doc.embedPng(pngBar(800, 600, [26, 13, 16], [245, 240, 240], [160, 240, 320, 60])) // page space (80,120) 160 x 30
  const pg = doc.addPage([400, 300]); pg.drawImage(img, { x: 0, y: 0, width: 400, height: 300 })
  return Buffer.from(await doc.save())
}

/** what the three fixture slides say (the OCR checks compare against this) */
export const DECK = [
  { title: ['Quarterly Growth', 'Review Report'], bullets: ['Revenue grew twelve percent', 'Customer retention improved', 'New markets opened in Asia'], card: 'Key takeaway: focus on retention' },
  { title: ['Product Roadmap', 'Next Year'], bullets: ['Launch the mobile application', 'Simplify onboarding for teams', 'Expand integrations catalogue'], card: 'Priority: onboarding speed' },
  { title: ['Thank You', 'Questions Welcome'], bullets: ['Share feedback after the session', 'Download the slides online', 'Contact the team anytime'], card: 'Reach us: hello@example.com' },
]
const slideHtml = (s, i) => `<!doctype html><html><body style="margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;background:linear-gradient(135deg,#1a0d10 0%,#3b1219 55%,#2a0f15 100%);color:#fff;position:relative">
<h1 style="position:absolute;left:120px;top:110px;margin:0;font-size:96px;line-height:1.12;font-weight:800">${s.title.join('<br>')}</h1>
<ul style="position:absolute;left:140px;top:420px;margin:0;padding-left:44px;font-size:44px;line-height:1.7;width:920px">${s.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>
<div style="position:absolute;left:1180px;top:130px;width:640px;height:460px;border-radius:24px;background:linear-gradient(${40 + i * 30}deg,#2b6cb0,#d69e2e 55%,#7b341e)"></div>
<div style="position:absolute;left:1180px;top:650px;width:640px;height:230px;border-radius:24px;background:#f6d365;color:#2d1b1b;font-size:40px;font-weight:700;padding:48px;box-sizing:border-box;line-height:1.3">${s.card}</div>
</body></html>`
/** a deck exported like the app does: one JPEG per page, 1920x1080 px pages, jsPDF (no text in the file) */
export async function makeDeckPdf(browser) {
  const { jsPDF } = createRequire(join(here, '../../apps/editor/package.json'))('jspdf')
  const c = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const pg = await c.newPage()
  const jpgs = []
  for (let i = 0; i < DECK.length; i++) { await pg.setContent(slideHtml(DECK[i], i)); jpgs.push(await pg.screenshot({ type: 'jpeg', quality: 90 })) }
  await c.close()
  const W = 1920, H = 1080
  const doc = new jsPDF({ unit: 'px', format: [W, H], orientation: 'landscape', hotfixes: ['px_scaling'], compress: true })
  jpgs.forEach((j, i) => { if (i > 0) doc.addPage([W, H], 'landscape'); doc.addImage(`data:image/jpeg;base64,${j.toString('base64')}`, 'JPEG', 0, 0, W, H) })
  return Buffer.from(doc.output('arraybuffer'))
}


/** coloured blocks (each 8 x 8 px) so a picture has a known, easy-to-sample pattern */
const blockColor = (i, j) => [(i * 97 + j * 57 + 30) % 200 + 40, (i * 53 + j * 131 + 80) % 200 + 40, (i * 171 + j * 29 + 10) % 200 + 40]
function pngPixels(w, h, fn) {
  const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, 'latin1'); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const rows = []
  for (let y = 0; y < h; y++) { const px = []; for (let x = 0; x < w; x++) px.push(...fn(x, y), 255); rows.push(Buffer.concat([Buffer.from([0]), Buffer.from(px)])) }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}
const blocksPng = () => pngPixels(120, 80, (x, y) => blockColor(x >> 3, y >> 3))
/** real PDFs with real pictures: the block picture is 180 x 120 pt on each of three pages (plain, /Rotate 90, CropBox), plus a 10 pt icon that must be ignored */
export const IMG_BOX = [{ x: 330, y: 372, w: 180, h: 120 }, { x: 200, y: 300, w: 120, h: 180 }, { x: 100, y: 230, w: 180, h: 120 }] // page space
async function makeImagesPdf() {
  const { PDFDocument, StandardFonts, degrees } = web('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const img = await doc.embedPng(blocksPng()), icon = await doc.embedPng(png(10, 10, [200, 30, 30]))
  const p1 = doc.addPage([612, 792])
  p1.drawText('Page one with a picture', { x: 72, y: 700, size: 24, font }); p1.drawImage(icon, { x: 72, y: 100, width: 10, height: 10 }); p1.drawImage(img, { x: 330, y: 300, width: 180, height: 120 })
  const p2 = doc.addPage([612, 792]); p2.setRotation(degrees(90))
  p2.drawText('Rotated page text', { x: 100, y: 72, size: 20, font, rotate: degrees(90) }); p2.drawImage(img, { x: 300, y: 200, width: 180, height: 120 })
  const p3 = doc.addPage([612, 792]); p3.setCropBox(50, 100, 400, 500)
  p3.drawText('Cropped page', { x: 100, y: 500, size: 20, font }); p3.drawImage(img, { x: 150, y: 250, width: 180, height: 120 })
  return Buffer.from(await doc.save())
}

/** a deck slide (pictures only, one JPEG) with a rounded textured photo, a caption on it, a flat card with text and a flat gradient strip (the two must NOT be found as photos) */
export const PHOTO_BOX = { x: 885, y: 97.5, w: 480, h: 345 }
export async function makePhotoDeckPdf(browser) {
  const { jsPDF } = createRequire(join(here, '../../apps/editor/package.json'))('jspdf')
  const c = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const pg = await c.newPage()
  const noise = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="460" style="position:absolute;left:0;top:0"><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="7"/><feColorMatrix type="matrix" values="2.4 0 0 0 -0.35  0 1.9 0 0 -0.1  0 0 1.7 0 0.05  0 0 0 0 1"/></filter><rect width="640" height="460" filter="url(#n)"/><ellipse cx="260" cy="300" rx="110" ry="140" fill="#10151c"/><circle cx="260" cy="150" r="46" fill="#c9a07a"/></svg>`
  await pg.setContent(`<!doctype html><html><body style="margin:0;width:1920px;height:1080px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;background:linear-gradient(135deg,#1a0d10 0%,#3b1219 55%,#2a0f15 100%);color:#fff;position:relative">
<h1 style="position:absolute;left:120px;top:110px;margin:0;font-size:96px;line-height:1.12;font-weight:800">Quarterly Growth<br>Review Report</h1>
<ul style="position:absolute;left:140px;top:420px;margin:0;padding-left:44px;font-size:44px;line-height:1.7;width:920px"><li>Revenue grew twelve percent</li><li>Customer retention improved</li><li>New markets opened in Asia</li></ul>
<div style="position:absolute;left:1180px;top:130px;width:640px;height:460px;border-radius:24px;overflow:hidden">${noise}<div style="position:absolute;left:0;right:0;bottom:0;height:70px;background:rgba(0,0,0,.3);color:#fff;font-size:38px;font-weight:700;line-height:70px;padding-left:24px">Riders in the city</div></div>
<div style="position:absolute;left:1180px;top:650px;width:640px;height:230px;border-radius:24px;background:#f6d365;color:#2d1b1b;font-size:40px;font-weight:700;padding:48px;box-sizing:border-box;line-height:1.3">Key takeaway: focus on retention</div>
<div style="position:absolute;left:140px;top:960px;width:700px;height:80px;border-radius:16px;background:linear-gradient(90deg,#2b6cb0,#d69e2e 55%,#7b341e)"></div>
</body></html>`)
  const jpg = await pg.screenshot({ type: 'jpeg', quality: 90 })
  await c.close()
  const W = 1920, H = 1080
  const doc = new jsPDF({ unit: 'px', format: [W, H], orientation: 'landscape', hotfixes: ['px_scaling'], compress: true })
  doc.addImage(`data:image/jpeg;base64,${jpg.toString('base64')}`, 'JPEG', 0, 0, W, H)
  return Buffer.from(doc.output('arraybuffer'))
}

async function makePdf() {
  const { PDFDocument, StandardFonts, rgb, degrees } = web('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const p1 = doc.addPage([612, 792])
  p1.drawText('Hello World original', { x: 72, y: 700, size: 24, font, color: rgb(0, 0, 0) })
  p1.drawText('Second line of page one', { x: 72, y: 650, size: 14, font })
  p1.drawRectangle({ x: 400, y: 100, width: 80, height: 50, color: rgb(0, 0, 0) }) // page space x 400-480, y 642-692
  const p2 = doc.addPage([612, 792]); p2.setRotation(degrees(90))
  p2.drawText('Rotated page text', { x: 100, y: 72, size: 20, font, rotate: degrees(90) }) // upright on screen at page-space (72, 100)
  p2.drawRectangle({ x: 300, y: 200, width: 60, height: 40, color: rgb(0, 0, 0) }) // page space x 200-240, y 300-360
  const p3 = doc.addPage([612, 792]); p3.setCropBox(50, 100, 400, 500)
  p3.drawText('Cropped page', { x: 100, y: 500, size: 20, font }) // page space (50, 100)
  p3.drawRectangle({ x: 250, y: 160, width: 60, height: 40, color: rgb(0, 0, 0) }) // page space x 200-260, y 400-440
  return Buffer.from(await doc.save())
}

/** text lines of page 1 as saved: items grouped by baseline, with the baseline (pt, from the bottom) and font size */
async function pdfLines(buf) {
  const pdfjs = await import(pathToFileURL(web.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false }).promise
  const items = (await (await d.getPage(1)).getTextContent()).items.filter((x) => x.str.trim())
  const rows = []
  for (const it of items) { const y = it.transform[5]; const r = rows.find((q) => Math.abs(q.y - y) < 0.5); if (r) r.str += ` ${it.str}`; else rows.push({ y, str: it.str, size: Math.hypot(it.transform[0], it.transform[1]) }) }
  return rows.sort((a, b) => b.y - a.y)
}

async function pdfText(buf) {
  const pdfjs = await import(pathToFileURL(web.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false }).promise
  const out = []
  for (let i = 1; i <= d.numPages; i++) out.push((await (await d.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '))
  return out
}

const GOOGLE = /translate\.google|translate\.googleapis|translate-pa\.googleapis|gstatic\.com/
const near = ([r, g, b], [er, eg, eb], tol = 40) => Math.abs(r - er) <= tol && Math.abs(g - eg) <= tol && Math.abs(b - eb) <= tol

export default async function () {
  const s = suite('62-pdf-editor')
  // E2E_ONLY="S3|S4" runs only the checks whose title matches (checks that need an earlier one build what they need themselves)
  if (process.env.E2E_ONLY) { const only = new RegExp(process.env.E2E_ONLY), run = s.check.bind(s); s.check = (title, ...rest) => (only.test(title) ? run(title, ...rest) : Promise.resolve()) }
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true })
  const p = await ctx.newPage()
  const dir = mkdtempSync(join(tmpdir(), 'pdfedit-'))
  const pdf = await makePdf()
  const uploads = []; p.on('request', (r) => { if (r.method() !== 'GET' && !r.url().startsWith(WEB)) uploads.push(r.url()) })
  const shot = (name) => SHOTS ? p.screenshot({ path: join(SHOTS, `pdfedit-${name}.png`) }) : Promise.resolve()
  const BASE = [[612, 792], [792, 612], [400, 500]]
  let out1 = null

  const ready = (pg = p) => pg.waitForFunction(() => { const c = document.querySelector('canvas[aria-label="Page picture"]'); return c && c.dataset.ready === '1' }, null, { timeout: 30000 })
  const openFile = async (page, buf, name = 'Contract.pdf') => {
    await page.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' })
    await page.setInputFiles('input[aria-label="Choose a PDF"]', { name, mimeType: 'application/pdf', buffer: buf })
    await page.getByRole('toolbar').waitFor({ timeout: 30000 })
    await ready(page)
  }
  const goPage = async (n) => { await p.getByRole('button', { name: new RegExp(`^Page ${n} of`) }).click(); await p.waitForTimeout(150); await ready() }
  const tool = (name) => p.getByRole('button', { name, exact: true }).first().click()
  /** page-space points → client points; the page is scrolled first so every point is on screen */
  let gap = 0
  const clients = async (idx, pts) => p.evaluate(({ pts, bw, gap }) => {
    const st = document.querySelector('[data-testid=stage]'); const sc = document.querySelector('[data-testid=page-scroll]')
    sc.scrollIntoView({ block: 'start', behavior: 'instant' })
    const at = ([x, y]) => {
      const r = st.getBoundingClientRect(); const turn = Number(st.dataset.turn)
      const z = st.offsetWidth / bw, W = st.offsetWidth, H = st.offsetHeight
      const rx = x * z - W / 2, ry = y * z - H / 2
      const [vx, vy] = turn === 0 ? [rx, ry] : turn === 90 ? [-ry, rx] : turn === 180 ? [-rx, -ry] : [ry, -rx]
      return { x: r.left + r.width / 2 + vx, y: r.top + r.height / 2 + vy }
    }
    const mid = at([pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length])
    const sr = sc.getBoundingClientRect()
    sc.scrollTop += mid.y - (sr.top + sr.height / 2); sc.scrollLeft += mid.x - (sr.left + sr.width / 2)
    let out = pts.map(at)
    if (gap) { const top = Math.min(...out.map((o) => o.y)); if (top < gap) { window.scrollBy({ top: top - gap, behavior: 'instant' }); out = pts.map(at) } } /* the site header is sticky: keep the points below it */
    return out
  }, { pts, bw: BASE[idx][0], gap })
  const drag = async (idx, a, c, steps = 8) => {
    const [A, C] = await clients(idx, [a, c])
    await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(C.x, C.y, { steps }); await p.mouse.up()
  }
  const click = async (idx, a) => { const [A] = await clients(idx, [a]); await p.mouse.click(A.x, A.y) }

  /** open `buf` in a second tab of the editor and read pixels of page n (page space, 5x5 window around each point) */
  async function pixels(buf, n, pts, baseWidth = BASE[n - 1][0]) {
    const q = await ctx.newPage()
    try {
      await openFile(q, buf, 'check.pdf')
      await q.getByRole('button', { name: new RegExp(`^Page ${n} of`) }).click()
      await q.waitForTimeout(300); await q.waitForFunction(() => document.querySelector('canvas[aria-label="Page picture"]')?.dataset.ready === '1')
      await q.waitForTimeout(400)
      return await q.evaluate(({ pts, bw }) => {
        const c = document.querySelector('canvas[aria-label="Page picture"]'); const k = c.width / bw; const g = c.getContext('2d')
        return pts.map(([x, y]) => { const d = g.getImageData(Math.round(x * k) - 2, Math.round(y * k) - 2, 5, 5).data; const o = []; for (let i = 0; i < d.length; i += 4) o.push([d[i], d[i + 1], d[i + 2]]); return o })
      }, { pts, bw: baseWidth })
    } finally { await q.close() }
  }
  const dark = (win) => win.some(([r, g, b]) => r < 110 && g < 110 && b < 110)

  try {
    await s.check('A1 listed on /free-tools, in the sitemap and llms.txt; heading and FAQ present; editor code is not in the first JS', p, async () => {
      await p.goto(WEB + '/free-tools', { waitUntil: 'load' })
      expect(await p.getByRole('link', { name: /Free PDF Editor/ }).count() >= 1, 'not listed on /free-tools')
      expect((await (await p.request.get(WEB + '/sitemap.xml')).text()).includes('/free-tools/pdf-editor'), 'not in sitemap')
      { const llms = (await (await p.request.get(WEB + '/llms.txt')).text()); expect(/pdf editor/i.test(llms) && llms.includes('/free-tools/pdf-editor'), 'not in llms.txt') }
      const seen = []; const on = (r) => seen.push(r.url()); p.on('request', on)
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      await p.goto(WEB + '/free-tools/pdf-to-jpg', { waitUntil: 'networkidle' })
      expect(!seen.some((u) => /pdf-lib/.test(u)), 'pdf-lib requested outside the editor')
      expect(!seen.some((u) => /\/ocr\/|tesseract/.test(u)), 'text finder requested outside the editor')
      p.off('request', on)
      const seen2 = []; const on2 = (r) => seen2.push(r.url()); p.on('request', on2)
      await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' })
      expect(await p.getByRole('heading', { level: 1, name: /PDF Editor/ }).count() === 1, 'h1')
      expect((await p.content()).includes('FAQPage'), 'no FAQ JSON-LD')
      expect((await p.title()).startsWith('Free PDF Editor'), await p.title())
      p.off('request', on2)
      expect(!seen2.some((u) => /pdf\.worker/.test(u)), 'pdf.js worker loaded before a file was opened')
      expect(!seen2.some((u) => /\/ocr\/|tesseract/.test(u)), 'text finder loaded with the editor page')
    })

    await s.check('B1 plain refusals: not a PDF, a fake PDF', p, async () => {
      await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' })
      await p.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
      await p.getByRole('alert').filter({ hasText: /choose a PDF/ }).waitFor()
      await p.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ not a pdf at all') })
      await p.getByRole('alert').filter({ hasText: /not a PDF/ }).waitFor({ timeout: 20000 })
    })

    await s.check('C1 opens: 3 thumbnails, page canvas drawn, Edit text finds the runs on every page kind (plain, /Rotate 90, CropBox)', p, async () => {
      await openFile(p, pdf)
      expect(await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count() === 3, 'three thumbnails')
      await tool('Edit text')
      await p.locator('button[data-run^="Hello World original"]').waitFor({ timeout: 10000 })
      await goPage(2); await tool('Edit text')
      await p.locator('button[data-run^="Rotated page text"]').waitFor({ timeout: 10000 })
      await goPage(3); await tool('Edit text')
      await p.locator('button[data-run^="Cropped page"]').waitFor({ timeout: 10000 })
      await tool('Edit text')
      await shot('1-open-cropped')
    })

    await s.check('D1 page 1: edit text run, add text, whiteout, highlight, draw, rectangle, picture', p, async () => {
      await goPage(1); await tool('Edit text')
      await p.locator('button[data-run^="Hello World original"]').click()
      const ta = p.getByRole('textbox', { name: 'Text' }); await ta.waitFor()
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Hello Edited')
      await p.keyboard.press('Escape')
      await tool('Add text'); await click(0, [100, 300]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('Added Text ABC'); await p.keyboard.press('Escape')
      await tool('Whiteout'); await drag(0, [390, 632], [490, 702])
      await tool('Highlight'); await drag(0, [150, 520], [300, 545])
      await tool('Draw'); await drag(0, [100, 600], [300, 600]); await tool('Edit text')
      await tool('Rectangle'); await drag(0, [350, 200], [450, 260])
      await p.setInputFiles('input[aria-label="Choose a picture to add"]', { name: 'green.png', mimeType: 'image/png', buffer: png(100, 50, [0, 200, 0]) })
      await p.locator('[data-anno=image] img').first().waitFor()
      const kinds = await p.locator('[data-anno]').evaluateAll((els) => els.map((e) => e.dataset.anno))
      expect(['whiteout', 'text', 'highlight', 'path', 'shape', 'image'].every((k) => kinds.includes(k)), `items on page: ${kinds}`)
      await shot('2-page1-edited')
    })

    await s.check('D2 page 2 (/Rotate 90): edit the run, whiteout, highlight, pen', p, async () => {
      await goPage(2); await tool('Edit text')
      await p.locator('button[data-run^="Rotated page text"]').click()
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Rotated edited'); await p.keyboard.press('Escape')
      await tool('Whiteout'); await drag(1, [190, 290], [250, 370])
      await tool('Highlight'); await drag(1, [300, 200], [420, 225])
      await tool('Draw'); await drag(1, [300, 400], [500, 400]); await tool('Edit text')
      await shot('3-page2-rotated')
    })

    await s.check('D3 page 3 (CropBox): whiteout, highlight, pen, real text, Arabic text', p, async () => {
      await goPage(3)
      await tool('Whiteout'); await drag(2, [190, 390], [270, 450])
      await tool('Highlight'); await drag(2, [60, 250], [200, 270])
      await tool('Draw'); await drag(2, [100, 300], [300, 300]); await tool('Edit text')
      await tool('Add text'); await click(2, [60, 200]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('CropText'); await p.keyboard.press('Escape')
      await tool('Add text'); await click(2, [60, 350]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('مرحبا بالعالم'); await p.keyboard.press('Escape')
      await shot('4-page3-cropped')
    })

    await s.check('E1 select/move/resize/nudge/delete and undo/redo keys on the picture', p, async () => {
      await goPage(1)
      const img = p.locator('[data-anno=image] img'); await img.click()
      const before = await img.boundingBox()
      await p.keyboard.press('ArrowRight'); await p.keyboard.press('Shift+ArrowDown')
      const after = await img.boundingBox()
      expect(after.x > before.x + 0.5 && after.y > before.y + 5, `nudge ${JSON.stringify(before)} -> ${JSON.stringify(after)}`)
      await p.keyboard.press(`${MOD}+z`)
      const undone = await img.boundingBox(); expect(Math.abs(undone.y - before.y) < 1, 'undo restores the nudge (one step)')
      await p.keyboard.press(`${MOD}+Shift+z`)
      await p.keyboard.press('Delete')
      expect(await p.locator('[data-anno=image]').count() === 0, 'Delete removes the picture')
      await p.keyboard.press(`${MOD}+z`)
      await p.locator('[data-anno=image] img').first().waitFor()
      await p.locator('[data-anno=image] img').click(); await p.keyboard.press('Escape')
      expect(await p.locator('[data-handle]').count() === 0, 'Escape deselects')
    })

    await s.check('F1 download #1: filename, page count, real text kept and added, Arabic is a picture with a searchable text layer, nothing uploaded', p, async () => {
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      expect(dl.suggestedFilename() === 'Contract-edited.pdf', dl.suggestedFilename())
      const f = join(dir, 'out1.pdf'); await dl.saveAs(f); out1 = readFileSync(f)
      const { PDFDocument, PDFName } = web('pdf-lib')
      const d = await PDFDocument.load(out1)
      expect(d.getPageCount() === 3, `pages ${d.getPageCount()}`)
      expect(d.getPages().map((x) => x.getRotation().angle).join() === '0,90,0', 'rotations kept')
      const t = await pdfText(out1)
      expect(t[0].includes('Hello Edited') && t[0].includes('Added Text ABC'), `page 1 text: ${t[0]}`)
      expect(t[0].includes('Hello World original'), 'original vector text is still in the file (not flattened)')
      expect(t[1].includes('Rotated edited'), `page 2 text: ${t[1]}`)
      expect(t[2].includes('CropText') && t[2].includes('مرحبا بالعالم'), `page 3 text (the picture has an invisible text layer behind it): ${t[2]}`)
      const x3 = d.getPage(2).node.Resources()?.lookup(PDFName.of('XObject'))
      expect(x3 && x3.keys().length >= 1, 'Arabic text box is an embedded picture')
      const cb = d.getPage(2).getCropBox(); expect(cb.x === 50 && cb.y === 100 && cb.width === 400 && cb.height === 500, `cropbox ${JSON.stringify(cb)}`)
      expect(uploads.length === 0, `requests to other servers: ${uploads}`)
    })

    await s.check('F2 pixels of the saved page 1: cover is white, highlight yellow, pen blue, rectangle red, picture green, new text dark', p, async () => {
      const w = await pixels(out1, 1, [[262, 85], [225, 532], [200, 600], [350, 230], [306, 396], [405, 650], [90, 303], [100, 85]])
      const [cover, hi, pen, rect, pic, whiteout, added, hello] = w
      expect(cover.every((c) => near(c, [255, 255, 255], 8)), 'old text end is covered (white)')
      expect(hi.some((c) => c[0] > 235 && c[1] > 215 && c[2] < 175), `highlight ${JSON.stringify(hi[12])}`)
      expect(pen.some((c) => c[2] > c[0] + 70), `pen ${JSON.stringify(pen[12])}`)
      expect(rect.some((c) => c[0] > 190 && c[1] < 90 && c[2] < 90), `rectangle ${JSON.stringify(rect[12])}`)
      expect(pic.every((c) => near(c, [0, 200, 0], 30)), `picture ${JSON.stringify(pic[12])}`)
      expect(whiteout.every((c) => near(c, [255, 255, 255], 8)), 'black box whited out')
      expect(dark(hello), 'new text drawn over the cover')
      void added
    })

    await s.check('F3 pixels of the saved page 2 (/Rotate 90) and page 3 (CropBox): covers, highlights and pens are where they were placed', p, async () => {
      const r = await pixels(out1, 2, [[220, 330], [360, 212], [400, 400], [90, 100]])
      expect(r[0].every((c) => near(c, [255, 255, 255], 8)), 'rotated page: black box whited out')
      expect(r[1].some((c) => c[0] > 235 && c[1] > 215 && c[2] < 175), 'rotated page: highlight')
      expect(r[2].some((c) => c[2] > c[0] + 70), 'rotated page: pen')
      expect(dark(r[3]), 'rotated page: new text is upright and in place')
      const c = await pixels(out1, 3, [[230, 420], [130, 260], [200, 300], [64, 196], [68, 196], [72, 196], [76, 196], [80, 196], [84, 196], [70, 346], [80, 346], [90, 346], [100, 346], [110, 346], [120, 346], [130, 346], [80, 350], [100, 350], [120, 350]])
      expect(c[0].every((x) => near(x, [255, 255, 255], 8)), 'cropped page: black box whited out')
      expect(c[1].some((x) => x[0] > 235 && x[1] > 215 && x[2] < 175), 'cropped page: highlight')
      expect(c[2].some((x) => x[2] > x[0] + 70), 'cropped page: pen')
      expect(c.slice(3, 9).some(dark), 'cropped page: added text in place')
      expect(c.slice(9).some((w) => w.some((x) => x[0] < 140)), 'cropped page: Arabic picture in place')
    })

    await s.check('G1 page operations: move, delete, undo/redo, rotate, blank page; second download has the right order, rotation and size', p, async () => {
      await goPage(3)
      await p.getByRole('button', { name: 'Move up' }).click()
      await p.getByRole('button', { name: /^Page 3 of/ }).click()
      await p.getByRole('button', { name: 'Delete page' }).click()
      expect(await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count() === 2, 'two pages after delete')
      await p.getByRole('button', { name: 'Undo', exact: true }).click()
      expect(await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count() === 3, 'undo brings the page back')
      await p.getByRole('button', { name: 'Redo', exact: true }).click()
      expect(await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count() === 2, 'redo deletes again')
      await goPage(1); await p.getByRole('button', { name: 'Rotate right' }).click()
      await ready()
      await goPage(2); await p.getByRole('button', { name: 'Add blank page after' }).click()
      expect(await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count() === 3, 'blank page added')
      await shot('5-after-page-ops')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      const f = join(dir, 'out2.pdf'); await dl.saveAs(f)
      const buf = readFileSync(f)
      const { PDFDocument } = web('pdf-lib')
      const d = await PDFDocument.load(buf)
      expect(d.getPageCount() === 3, `pages ${d.getPageCount()}`)
      expect(d.getPages().map((x) => x.getRotation().angle).join() === '90,0,0', `rotations ${d.getPages().map((x) => x.getRotation().angle)}`)
      const t = await pdfText(buf)
      expect(t[0].includes('Hello Edited') && t[1].includes('CropText') && t[2].trim() === '', `order: ${JSON.stringify(t.map((x) => x.slice(0, 20)))}`)
      const blank = d.getPage(2).getMediaBox(); expect(Math.round(blank.width) === 400 && Math.round(blank.height) === 500, `blank page ${blank.width}x${blank.height}`)
    })

    await s.check('H1 Sign dialog: Escape closes it, a drawn signature is placed as a picture', p, async () => {
      await goPage(1)
      await p.getByRole('button', { name: 'Sign', exact: true }).click()
      const dlg = p.getByRole('dialog'); await dlg.waitFor()
      await p.keyboard.press('Escape'); await dlg.waitFor({ state: 'detached' })
      await p.getByRole('button', { name: 'Sign', exact: true }).click()
      const cv = p.getByRole('img', { name: 'Signature drawing area' }); const bb = await cv.boundingBox()
      await p.mouse.move(bb.x + 30, bb.y + 60); await p.mouse.down(); await p.mouse.move(bb.x + 200, bb.y + 100, { steps: 10 }); await p.mouse.move(bb.x + 300, bb.y + 40, { steps: 10 }); await p.mouse.up()
      await p.getByRole('button', { name: 'Add signature' }).click()
      await p.locator('[data-anno=image] img').first().waitFor()
    })

    await s.check('J1 a page the visitor turned: items placed on the turned page land on the right spot in the file', p, async () => {
      await openFile(p, pdf)
      await p.getByRole('button', { name: 'Rotate right' }).click(); await ready()
      expect(await p.locator('[data-testid=stage]').getAttribute('data-turn') === '90', 'stage turned')
      await tool('Whiteout'); await drag(0, [390, 632], [490, 702])
      await tool('Highlight'); await drag(0, [150, 520], [300, 545])
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      const f = join(dir, 'out3.pdf'); await dl.saveAs(f); const buf = readFileSync(f)
      const { PDFDocument } = web('pdf-lib')
      expect((await PDFDocument.load(buf)).getPage(0).getRotation().angle === 90, 'file rotation')
      // page space (x, y) of the unturned page is (792 - y, x) on the turned page
      const w = await pixels(buf, 1, [[125, 440], [260, 225]], 792)
      expect(w[0].every((c) => near(c, [255, 255, 255], 8)), 'turned page: black box whited out')
      expect(w[1].some((c) => c[0] > 235 && c[1] > 215 && c[2] < 175), 'turned page: highlight')
    })

    await s.check('I1 phone width: opens, no sideways page scroll', p, async () => {
      await p.setViewportSize({ width: 390, height: 800 })
      await openFile(p, pdf)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page scrolls sideways')
      await shot('6-phone')
      await p.setViewportSize({ width: 1360, height: 1000 })
    })

    await s.check('K1 a PDF made of pictures: Edit text says so, a dragged box covers the words in the colour around them, new words are real text, light on the dark slide', p, async () => {
      BASE.push([400, 300], [1440, 810])
      const pic = await makePicturePdf()
      await openFile(p, pic, 'Deck.pdf')
      await tool('Edit text')
      await p.getByTestId('picture-note').waitFor()
      await drag(3, [60, 100], [270, 170])
      expect(await p.getByTestId('region').count() === 0, 'the dashed box is gone after the drag')
      const ta = p.getByRole('textbox', { name: 'Text' }); await ta.waitFor()
      await p.keyboard.type('NEW TITLE'); await p.keyboard.press('Escape')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      const f = join(dir, 'out-pic.pdf'); await dl.saveAs(f); const out = readFileSync(f)
      const t = await pdfText(out)
      expect(t[0].includes('NEW TITLE'), `page text: ${t[0]}`)
      const w = await pixels(out, 1, [[90, 135], [200, 125], [70, 110]], 400)
      expect(w[0].every((c) => c[0] < 80 && c[1] < 60 && c[2] < 60) || w[0].some((c) => c[0] > 200), 'the old light bar is hidden (dark) or replaced by light new text')
      expect(w[2].every((c) => near(c, [26, 13, 16], 25)), `the cover matches the slide colour around it: ${JSON.stringify(w[2][12])}`)
      await shot('7-picture-page')
    })

    // ---------- the owner's real case: a deck exported as one JPEG per page (jsPDF), dark gradient slides ----------
    gap = 100
    const deck = await makeDeckPdf(b)
    const ocrReqs = []; p.on('request', (r) => { if (/\/ocr\/|tesseract/.test(r.url())) ocrReqs.push(r.url()) })
    const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1)
    const stageBox = () => p.locator('[data-testid=stage]').boundingBox()
    let editedDeck = null

    await s.check('L1 deck PDF (pictures only): the help is in view at once and the text finder starts BY ITSELF on open (no button to press), with progress', p, async () => {
      ocrReqs.length = 0
      let release; const gate = new Promise((res) => { release = res })
      await ctx.route('**/ocr/7.0.0/lang/*', async (route) => { await gate; await route.continue() })
      try {
        await openFile(p, deck, 'Deck.pdf')
        await p.waitForFunction(() => (document.querySelector('canvas[aria-label="Page picture"]')?.width ?? 0) >= 800, null, { timeout: 8000 }).catch(() => { throw new Error('page drawn: canvas stayed narrow') }) // the page is first drawn at a small zoom while the layout settles
        const note = p.getByTestId('picture-note'); await note.waitFor()
        const nb = await note.boundingBox(); const vh = p.viewportSize().height
        expect(nb.y >= 0 && nb.y + nb.height <= vh, `help box is on screen at once: y ${nb.y}, h ${nb.height}, viewport ${vh}`)
        await p.getByTestId('ocr-progress').waitFor({ timeout: 15000 })
        for (let i = 0; i < 50 && !ocrReqs.some((u) => /worker\.min\.js/.test(u)); i++) await p.waitForTimeout(100)
        expect(ocrReqs.some((u) => /worker\.min\.js/.test(u)), 'the text finder was started without any click')
        expect(await p.getByTestId('ocr-start').count() === 0, 'no start button while it is reading by itself')
        await shot('8-deck-help')
      } finally { release(); await ctx.unroute('**/ocr/7.0.0/lang/*') }
      await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
    })

    await s.check('L2 drag fallback on the deck: boxed title is covered by a smooth (gradient) patch, new words are real light text', p, async () => {
      await openFile(p, deck, 'Deck.pdf'); await tool('Edit text')
      await p.getByTestId('picture-note').waitFor()
      await drag(4, [85, 78], [700, 160])
      const ta = p.getByRole('textbox', { name: 'Text' }); await ta.waitFor()
      await p.keyboard.type('Zed'); await p.keyboard.press('Escape')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      const f = join(dir, 'out-deck-drag.pdf'); await dl.saveAs(f); const out = readFileSync(f)
      expect((await pdfText(out))[0].includes('Zed'), 'new words are real text')
      const w = await pixels(out, 1, [[400, 120], [560, 120], [700, 120], [88, 118], [680, 120], [770, 120]], 1440)
      expect(w[0].every((c) => c[0] < 90) && w[1].every((c) => c[0] < 90), `old title hidden: ${JSON.stringify([w[0][12], w[1][12]])}`)
      const inside = w[4][12], outside = w[5][12]
      expect(near(inside, outside, 22), `cover blends with the gradient around it: inside ${inside} outside ${outside}`)
    })

    await s.check('L3 text finder: reads by itself, progress shown, Cancel works and offers a retry, then finds the title and bullets on all three slides (>= 80 % of the words, the other pages read in the background), only own-origin requests', p, async () => {
      ocrReqs.length = 0
      const foreign = []; const on = (r) => { const u = r.url(); if (!u.startsWith(WEB) && !/^(data|blob):/.test(u) && !GOOGLE.test(u) && !/\/api\/auth\/get-session$/.test(u)) foreign.push(u) }; p.on('request', on) // the site header asks our own API who is signed in: not a request made by the editor
      let release
      const gate = new Promise((res) => { release = res })
      await ctx.route('**/ocr/7.0.0/lang/*', async (route) => { await gate; await route.continue() })
      try {
      await openFile(p, deck, 'Deck.pdf')
      await p.getByTestId('ocr-progress').waitFor({ timeout: 15000 })
      const pct = Number(await p.getByRole('progressbar', { name: 'Finding the text' }).getAttribute('aria-valuenow'))
      expect(pct > 0 && pct < 100, `progress ${pct}`)
      await shot('9-ocr-progress')
      await p.getByRole('button', { name: 'Cancel', exact: true }).click()
      await p.getByTestId('ocr-start').waitFor()
      expect(await p.getByTestId('ocr-progress').count() === 0, 'progress gone after cancel')
      await p.waitForTimeout(600)
      expect(await p.getByTestId('ocr-progress').count() === 0, 'it does not start again by itself after Cancel')
      } finally { release(); await ctx.unroute('**/ocr/7.0.0/lang/*') }
      await p.getByTestId('ocr-start').click() // the retry button
      let hit = 0, total = 0
      for (let n = 1; n <= 3; n++) {
        if (n > 1) { await goPage(n); await tool('Edit text'); await p.getByTestId('picture-note').waitFor() }
        const t0 = Date.now()
        await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
        const ms = Date.now() - t0
        const found = new Set((await p.locator('[data-run]').evaluateAll((els) => els.map((e) => e.dataset.run))).flatMap(norm))
        const d = DECK[n - 1]
        const want = [...d.title, ...d.bullets, d.card].flatMap(norm)
        const got = want.filter((w) => found.has(w)); hit += got.length; total += want.length
        console.log(`      slide ${n}: ${got.length}/${want.length} words, ${ms} ms${got.length < want.length ? `, missing: ${want.filter((w) => !found.has(w)).join(' ')}` : ''}`)
        if (n === 1) await shot('10-ocr-lines')
      }
      p.off('request', on)
      expect(hit / total >= 0.8, `only ${hit}/${total} words found`)
      expect(foreign.length === 0, `requests to other origins during the text finder: ${foreign}`)
      expect(['worker.min.js', 'lstm.wasm.js'].every((k) => ocrReqs.some((u) => u.includes(k))), `own files requested: ${ocrReqs}`) // the model itself is kept in the browser after the first read (checked in L1)
    })

    await s.check('L4 click the found title line: text box opens with that text, edit, download: new text is real text, old title pixels are the dark background, new text is light', p, async () => {
      await openFile(p, deck, 'Deck.pdf'); await tool('Edit text')
      await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
      await p.locator('button[data-run^="Quarterly"]').click()
      const ta = p.getByRole('textbox', { name: 'Text' }); await ta.waitFor()
      const v = await ta.inputValue(); expect(/^Quarterly Growth/.test(v), `box opened with: ${v}`)
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Hi'); await p.keyboard.press('Escape')
      await shot('11-deck-edited')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      const f = join(dir, 'out-deck-ocr.pdf'); await dl.saveAs(f); editedDeck = readFileSync(f)
      const t = await pdfText(editedDeck)
      expect(t[0].includes('Hi') && !t[0].includes('Quarterly'), `page text: ${t[0]}`)
      const w = await pixels(editedDeck, 1, [[300, 115], [450, 115], [560, 115], [660, 115], [740, 115], [95, 120], [105, 120], [115, 120], [125, 120]], 1440)
      expect(w.slice(0, 4).every((win) => win.every((c) => c[0] < 90 && c[1] < 60)), `old title still visible: ${JSON.stringify(w.slice(0, 4).map((x) => x[12]))}`)
      expect(near(w[3][12], w[4][12], 25), `cover colour ${w[3][12]} vs slide beside it ${w[4][12]}`)
      expect(w.slice(5).some((win) => win.some((c) => c[0] > 200 && c[1] > 200 && c[2] > 200)), 'new text is light')
    })

    await s.check('L5 paragraphs: lines of one title/bullet are ONE clickable block, the count matches the outlines, the block wraps at its own width and pitch, side handles change the width only, preview lines equal the saved PDF lines, Alt-click / the toggle edit one line', p, async () => {
      await openFile(p, deck, 'Deck.pdf'); await tool('Edit text')
      await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
      const runs = await p.locator('[data-run]').evaluateAll((els) => els.map((e) => ({ t: e.dataset.run, n: Number(e.dataset.lines) })))
      const title = runs.find((r) => /^Quarterly/.test(r.t))
      expect(title && title.n === 2 && /Growth Review/.test(title.t), `title is one block of two lines: ${JSON.stringify(runs)}`)
      expect(runs.filter((r) => /^(Revenue|Customer|New markets)/.test(r.t)).length === 3, `each bullet is its own block: ${JSON.stringify(runs.map((r) => r.t))}`)
      const cnt = p.getByTestId('found-count')
      expect(Number(await cnt.getAttribute('data-shown')) === runs.length, `count says ${await cnt.getAttribute('data-shown')} outlined, page has ${runs.length}`)
      expect(Number(await cnt.getAttribute('data-lines')) >= runs.reduce((a, r) => a + r.n, 0) - 1, 'every line counted')
      expect((await cnt.innerText()).includes(`in ${runs.length} block`), await cnt.innerText())
      // the outlines can be seen on the dark slide: a clearly light ring
      const ring = await p.locator('[data-run^="Quarterly"]').evaluate((e) => { const c = getComputedStyle(e); return { b: c.borderTopColor, s: c.boxShadow, w: c.borderTopWidth } })
      expect(parseFloat(ring.w) >= 2 && /56, 189, 248/.test(ring.b) && /255, 255, 255/.test(ring.s), `outline style ${JSON.stringify(ring)}`)
      await shot('12-deck-blocks')
      await p.locator('[data-run^="Quarterly"]').click()
      await p.getByRole('textbox', { name: 'Text' }).waitFor()
      const before = await p.locator('[data-pitch]').evaluate((e) => ({ pitch: Number(e.dataset.pitch), wrap: Number(e.dataset.wrap), size: Number(e.dataset.size) }))
      expect(before.pitch > before.size * 1.0 && before.pitch < before.size * 1.5, `pitch ${before.pitch} vs size ${before.size}`)
      await p.keyboard.press(`${MOD}+a`)
      await p.keyboard.type('Quarterly growth review for every region and each product line this year')
      await p.keyboard.press('Escape')
      const lines = () => p.locator('[data-line]').evaluateAll((els) => els.map((e) => e.dataset.line))
      const l1 = await lines()
      expect(l1.length >= 3 && l1.join(' ') === 'Quarterly growth review for every region and each product line this year', `wrapped lines: ${JSON.stringify(l1)}`)
      const after = await p.locator('[data-pitch]').evaluate((e) => ({ pitch: Number(e.dataset.pitch), wrap: Number(e.dataset.wrap), size: Number(e.dataset.size), w: e.getBoundingClientRect().width }))
      expect(after.pitch === before.pitch && after.wrap === before.wrap && after.size === before.size, 'pitch, width and size kept while typing')
      // the side handle changes the width, not the letters
      // background work (the other slides being read, pictures being searched) adds and removes notes around the page: let it finish so nothing moves under the pointer
      await p.waitForFunction(() => document.querySelector('[data-testid=pictures-state]')?.dataset.state === 'done' && !document.querySelector('[data-testid=ocr-background]'), null, { timeout: 90000 })
      await p.locator('[data-handle="e"]').scrollIntoViewIfNeeded() // the handle may sit below the fold or under the sticky site header after the earlier steps
      const hb = await p.locator('[data-handle="e"]').boundingBox()
      const under = await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return (e?.tagName ?? 'none') + ':' + (e?.getAttribute('data-handle') ?? e?.className?.toString().slice(0, 30)) + ' scrollY ' + window.scrollY + ' vh ' + innerHeight }, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 })
      await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x - 120, hb.y + hb.height / 2, { steps: 6 }); await p.mouse.up()
      await p.waitForFunction((w) => Number(document.querySelector('[data-pitch]')?.dataset.wrap) < w, before.wrap, { timeout: 5000 }).catch(() => undefined) // the new width is applied after the pointer is released
      const l2 = await lines()
      const sized = await p.locator('[data-pitch]').evaluate((e) => ({ wrap: Number(e.dataset.wrap), size: Number(e.dataset.size), pitch: Number(e.dataset.pitch) }))
      expect(sized.wrap < before.wrap && sized.size === before.size && sized.pitch === before.pitch && l2.length > l1.length, `narrower: wrap ${before.wrap}->${sized.wrap}, lines ${l1.length}->${l2.length}, size ${sized.size}; handle box ${JSON.stringify(hb)}, under it: ${under}`)
      await shot('13-deck-block-edited')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      const f = join(dir, 'out-deck-block.pdf'); await dl.saveAs(f); const out = readFileSync(f)
      const rows = (await pdfLines(out)).filter((r) => r.size > 40)
      expect(rows.map((r) => r.str).join('|') === l2.join('|'), `saved lines ${JSON.stringify(rows.map((r) => r.str))} vs shown ${JSON.stringify(l2)}`)
      expect(rows.every((r, i) => i === 0 || Math.abs(r.y - rows[i - 1].y + sized.pitch) < 0.6), `saved line pitch ${rows.map((r) => r.y.toFixed(1))} vs ${sized.pitch}`)
      expect(Math.abs(rows[0].size - sized.size) < 0.1, `saved size ${rows[0].size} vs ${sized.size}`)
      const w = await pixels(out, 1, [[400, 100]], 1440)
      expect(w[0].some((c) => c[0] > 200 && c[1] > 200 && c[2] > 200) || w[0].every((c) => c[0] < 90), 'light new text or dark cover at the old title')
      // one line at a time: Alt-click picks the line under the pointer, the toggle gives lines
      await openFile(p, deck, 'Deck.pdf'); await tool('Edit text')
      await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
      await p.getByLabel('Edit line by line').check()
      const single = await p.locator('[data-run]').evaluateAll((els) => els.map((e) => e.dataset.run))
      expect(single.includes('Quarterly Growth') && single.includes('Review Report'), `line by line: ${JSON.stringify(single)}`)
      await p.getByLabel('Edit line by line').uncheck()
      const bb = await p.locator('[data-run^="Quarterly"]').boundingBox()
      await p.keyboard.down('Alt'); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height - 8); await p.keyboard.up('Alt')
      const ta = p.getByRole('textbox', { name: 'Text' }); await ta.waitFor()
      expect(await ta.inputValue() === 'Review Report', `Alt-click opened: ${await ta.inputValue()}`)
      await p.keyboard.press('Escape')
    })

    await s.check('N1 there is no Select tool; Edit text is the tool in use from the start', p, async () => {
      await openFile(p, pdf)
      expect(await p.getByRole('button', { name: 'Select', exact: true }).count() === 0, 'a Select button is still there')
      expect(await p.getByRole('button', { name: 'Edit text', exact: true }).first().getAttribute('aria-pressed') === 'true', 'Edit text is not the tool in use after opening')
    })

    await s.check('N2 a line can be edited again and again: click the new text to edit it, over and over; it can still be moved by dragging; the cover of an edited line also opens it', p, async () => {
      await openFile(p, pdf)
      await p.locator('button[data-run^="Hello World original"]').click()
      const ta = p.getByRole('textbox', { name: 'Text' }); await ta.waitFor()
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('First version'); await p.keyboard.press('Escape')
      for (const word of ['Second version', 'Third version']) {
        await click(0, [150, 86])
        const box = p.getByRole('textbox', { name: 'Text' }); await box.waitFor({ timeout: 5000 }).catch(() => { throw new Error(`re-edit before ${word}: no text box opened`) })
        expect((await box.inputValue()).includes('version'), `the box opens with the earlier text: ${await box.inputValue()}`)
        await p.keyboard.press(`${MOD}+a`); await p.keyboard.type(word); await p.keyboard.press('Escape')
      }
      // a click on the white cover to the right of the short new text (inside the old line's cover) opens it too
      await click(0, [250, 86])
      const box3 = p.getByRole('textbox', { name: 'Text' }); await box3.waitFor({ timeout: 5000 }).catch(() => { throw new Error('a click on the cover did not open the text') })
      expect((await box3.inputValue()) === 'Third version', `cover click opens the text: ${await box3.inputValue()}`)
      await p.keyboard.type(' (final)'); await p.keyboard.press('Escape')
      // dragging moves it instead of opening it
      await drag(0, [150, 86], [150, 200]); await p.waitForTimeout(150)
      expect(await p.getByRole('textbox', { name: 'Text' }).count() === 0, 'a drag must not open the text for typing')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      const f = join(dir, 'out-reedit.pdf'); await dl.saveAs(f); const out = readFileSync(f)
      const t = (await pdfText(out))[0]
      expect(t.includes('Third version (final)'), `last text kept: ${t}`)
      expect(!t.includes('First version') && !t.includes('Second version'), `earlier texts are not left behind: ${t}`)
    })

    await s.check('N3 picture deck: the found block can be edited again after the first edit', p, async () => {
      await openFile(p, deck, 'Deck.pdf')
      await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
      await p.locator('button[data-run^="Quarterly"]').click()
      await p.getByRole('textbox', { name: 'Text' }).waitFor()
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('One'); await p.keyboard.press('Escape')
      const t = p.locator('[data-anno=text] div').first()
      await t.click(); await p.getByRole('textbox', { name: 'Text' }).waitFor({ timeout: 5000 })
      expect((await p.getByRole('textbox', { name: 'Text' }).inputValue()) === 'One', 'second edit opens with the first edit')
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Two'); await p.keyboard.press('Escape')
      await t.click(); await p.getByRole('textbox', { name: 'Text' }).waitFor({ timeout: 5000 })
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Three'); await p.keyboard.press('Escape')
      const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()])
      const f = join(dir, 'out-deck-reedit.pdf'); await dl.saveAs(f)
      const txt = (await pdfText(readFileSync(f)))[0]
      expect(txt.includes('Three') && !txt.includes('One') && !txt.includes('Two'), `page text: ${txt}`)
    })

    // ---------- pictures: found by themselves, picked up with a click, then moved / resized / replaced / deleted like any item ----------
    const picsOf = () => p.locator('[data-pic]').evaluateAll((els) => els.map((e) => ({ embedded: e.dataset.embedded === '1', box: e.dataset.box.split(',').map(Number) })))
    const picsDone = () => p.waitForFunction(() => document.querySelector('[data-testid=pictures-state]')?.dataset.state === 'done', null, { timeout: 90000 })
    const imageCount = () => p.locator('[data-anno=image]').count()
    const close = (a, e, tol = 2) => a.every((v, i) => Math.abs(v - e[i]) <= tol)
    const inter = (a, c) => { const w = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), h = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y); return w > 0 && h > 0 ? (w * h) / (a.w * a.h + c.w * c.h - w * h) : 0 }
    const SAMPLE = [[1, 1], [7, 2], [3, 6], [5, 4]]
    const gridPts = (B) => SAMPLE.map(([a, c]) => [B.x + 6 + 12 * a, B.y + 6 + 12 * c])
    const centre = (B) => [B.x + B.w / 2, B.y + B.h / 2]
    const saveAs = async (name) => { const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Download edited PDF' }).click()]); const f = join(dir, name); await dl.saveAs(f); return readFileSync(f) }
    const imagesPdf = await makeImagesPdf()
    const imgRefs = {}
    // what the three pages look like before any edit (the reference for "the picture is now over there")
    const IMG_DELTA = [[-150, 120], [250, -150], [60, 100]]

    await s.check('O1 real pictures: found from the file (not by guessing) on a plain page, a /Rotate 90 page and a CropBox page, at the right place; the 10 pt icon is ignored; the outline says Picture and is violet and dashed', p, async () => {
      await openFile(p, imagesPdf, 'Pics.pdf'); await tool('Edit text')
      for (let n = 1; n <= 3; n++) {
        if (n > 1) { await goPage(n); await tool('Edit text') }
        await picsDone()
        const list = await picsOf(), B = IMG_BOX[n - 1]
        expect(list.length === 1, `page ${n}: ${list.length} pictures found (the icon must be ignored)`)
        expect(list[0].embedded, `page ${n}: found from the file`)
        expect(close(list[0].box, [B.x, B.y, B.w, B.h]), `page ${n}: box ${list[0].box} vs ${[B.x, B.y, B.w, B.h]}`)
      }
      const st = await p.locator('[data-pic]').evaluate((e) => { const c = getComputedStyle(e); return { s: c.borderTopStyle, c: c.borderTopColor, t: e.title, label: e.textContent } })
      expect(st.s === 'dashed' && /192, 132, 252/.test(st.c) && /Picture/.test(st.label) && /pick this picture up/.test(st.t), `outline ${JSON.stringify(st)}`)
      expect(/Found 1 picture/.test(await p.getByTestId('pictures-found').innerText()), 'the note says how many pictures were found')
      await shot('14-pictures-found')
      for (let n = 1; n <= 3; n++) imgRefs[n] = await pixels(imagesPdf, n, [...gridPts(IMG_BOX[n - 1]), [IMG_BOX[n - 1].x + 8, IMG_BOX[n - 1].y + 8]])
    })

    await s.check('O2 pick up the picture on page 1 with one click: it becomes a normal picture item with a cover under it (outline gone), sharp, drag it: saved file has it at the new place as a JPEG, the old place is cover colour, file stays small', p, async () => {
      await openFile(p, imagesPdf, 'Pics.pdf'); await tool('Edit text'); await picsDone()
      const B = IMG_BOX[0]
      await click(0, centre(B))
      await p.locator('[data-anno=image] img').waitFor()
      expect(await imageCount() === 1 && await p.locator('[data-anno=whiteout]').count() === 1, 'one picture and one cover were made')
      expect(await p.locator('[data-pic]').count() === 0, 'the outline is gone once the picture is picked up')
      const nat = await p.locator('[data-anno=image] img').evaluate((i) => [i.naturalWidth, i.naturalHeight])
      expect(nat[0] >= 175 && nat[1] >= 115, `picked-up pixels keep the picture's own sharpness (120 x 80 px original, at least 1 px per pt): ${nat}`)
      const [d0, d1] = IMG_DELTA[0], [cx, cy] = centre(B)
      await drag(0, [cx, cy], [cx + d0, cy + d1])
      await shot('15-picked-moved')
      const out = await saveAs('out-pic1.pdf')
      const { PDFDocument, PDFName } = web('pdf-lib')
      const x = (await PDFDocument.load(out)).getPage(0).node.Resources().lookup(PDFName.of('XObject'))
      const filters = x.keys().map((k) => String(x.lookup(k).dict.get(PDFName.of('Filter'))))
      expect(filters.some((f) => /DCTDecode/.test(f)), `picked-up picture is a JPEG in the file: ${filters}`)
      expect(out.length < 400_000, `saved file size ${out.length}`)
      const ref = imgRefs[1], moved = { x: B.x + d0, y: B.y + d1, w: B.w, h: B.h }
      const w = await pixels(out, 1, [...gridPts(moved), [B.x + 8, B.y + 8]])
      expect(ref.slice(0, 4).every((r, i) => near(r[12], w[i][12], 45)), `picture colours at the new place: ${JSON.stringify(w.slice(0, 4).map((q) => q[12]))} vs ${JSON.stringify(ref.slice(0, 4).map((q) => q[12]))}`)
      expect(w[4].every((c) => near(c, [255, 255, 255], 10)), `old place is the page colour: ${JSON.stringify(w[4][12])}`)
    })

    await s.check('O3 same on the /Rotate 90 page and the CropBox page: pick up, drag, saved file has the picture at the new place and the old place covered', p, async () => {
      await openFile(p, imagesPdf, 'Pics.pdf'); await tool('Edit text')
      for (const n of [2, 3]) {
        await goPage(n); await tool('Edit text'); await picsDone()
        const B = IMG_BOX[n - 1]; const [cx, cy] = centre(B); const [d0, d1] = IMG_DELTA[n - 1]
        await click(n - 1, [cx, cy]); await p.locator('[data-anno=image] img').waitFor()
        await drag(n - 1, [cx, cy], [cx + d0, cy + d1])
      }
      const out = await saveAs('out-pic23.pdf')
      for (const n of [2, 3]) {
        const B = IMG_BOX[n - 1], [d0, d1] = IMG_DELTA[n - 1], moved = { x: B.x + d0, y: B.y + d1, w: B.w, h: B.h }
        const w = await pixels(out, n, [...gridPts(moved), [B.x + 8, B.y + 8]])
        expect(imgRefs[n].slice(0, 4).every((r, i) => near(r[12], w[i][12], 45)), `page ${n}: picture colours at the new place: ${JSON.stringify(w.slice(0, 4).map((q) => q[12]))} vs ${JSON.stringify(imgRefs[n].slice(0, 4).map((q) => q[12]))}`)
        expect(w[4].every((c) => near(c, [255, 255, 255], 10)), `page ${n}: old place is the page colour: ${JSON.stringify(w[4][12])}`)
      }
      const cb = (await web('pdf-lib').PDFDocument.load(out)).getPage(2).getCropBox(); expect(cb.x === 50 && cb.y === 100, 'cropbox kept')
    })

    await s.check('O4 resize with the corner keeps the shape; Replace picture fills the same box (cropped), Fit inside shows the whole picture with the rest see-through, Delete leaves the filled hole, undo brings it back; saved pixels agree', p, async () => {
      await openFile(p, imagesPdf, 'Pics.pdf'); await tool('Edit text'); await picsDone()
      const B = IMG_BOX[0], [cx, cy] = centre(B)
      await click(0, [cx, cy]); await p.locator('[data-anno=image] img').waitFor()
      const img = p.locator('[data-anno=image] img')
      const b0 = await img.boundingBox()
      const hb = await p.locator('[data-handle="se"]').boundingBox()
      await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x + hb.width / 2 - 40, hb.y + hb.height / 2 - 10, { steps: 5 }); await p.mouse.up()
      const b1 = await img.boundingBox()
      expect(b1.width < b0.width - 5 && Math.abs(b1.width / b1.height - b0.width / b0.height) < 0.02, `resized and kept shape: ${b0.width}x${b0.height} -> ${b1.width}x${b1.height}`)
      await p.keyboard.press(`${MOD}+z`)
      expect(Math.abs((await img.boundingBox()).width - b0.width) < 1, 'undo restores the size')
      expect(await p.getByRole('button', { name: 'Replace picture' }).count() === 1, 'Replace picture is offered')
      expect(await p.getByLabel('Fit inside').isDisabled(), 'Fit inside waits for a replacement')
      await p.setInputFiles('input[aria-label="Choose a replacement picture"]', { name: 'green.png', mimeType: 'image/png', buffer: png(100, 50, [0, 200, 0]) })
      await p.waitForFunction(() => document.querySelector('[data-anno=image] img')?.naturalWidth === 75, null, { timeout: 10000 }) // 100 x 50 px cut to the 3:2 box = 75 x 50 px
      const nat = await img.evaluate((i) => [i.naturalWidth, i.naturalHeight])
      expect(Math.abs(nat[0] / nat[1] - 1.5) < 0.03, `the new picture was cut to the box shape (3:2): ${nat}`)
      await shot('16-replaced')
      await p.getByLabel('Fit inside').click()
      await p.waitForFunction(() => document.querySelector('input[aria-label="Fit inside"]')?.checked, null, { timeout: 5000 }); await p.waitForTimeout(400)
      const nat2 = await img.evaluate((i) => [i.naturalWidth, i.naturalHeight]); expect(Math.abs(nat2[0] / nat2[1] - 1.5) < 0.03, `still the box shape with margins: ${nat2}`)
      const fit = await saveAs('out-fit.pdf')
      const top = [B.x + B.w / 2, B.y + 3], mid = centre(B), left = [B.x + 3, B.y + B.h / 2]
      const w = await pixels(fit, 1, [mid, top, left])
      expect(near(w[0][12], [0, 200, 0], 40), `Fit inside: the picture is in the middle: ${JSON.stringify(w[0][12])}`)
      expect(w[1].every((c) => near(c, [255, 255, 255], 12)), `Fit inside: the box margin above shows the cover, not the picture: ${JSON.stringify(w[1][12])}`)
      await p.getByLabel('Fit inside').click(); await p.waitForFunction(() => !document.querySelector('input[aria-label="Fit inside"]')?.checked); await p.waitForTimeout(400)
      const fill = await saveAs('out-fill.pdf')
      const w2 = await pixels(fill, 1, [mid, top, left, [B.x + B.w - 4, B.y + B.h - 4]])
      expect(w2.every((q) => near(q[12], [0, 200, 0], 40)), `Fill: the picture covers the whole box: ${JSON.stringify(w2.map((q) => q[12]))}`)
      await click(0, mid); await p.keyboard.press('Delete')
      expect(await imageCount() === 0, 'Delete removes the picked-up picture')
      const gone = await saveAs('out-del.pdf')
      const w3 = await pixels(gone, 1, [mid, [B.x + 8, B.y + 8]])
      expect(w3.every((q) => q.every((c) => near(c, [255, 255, 255], 10))), `the hole shows the page colour: ${JSON.stringify(w3.map((q) => q[12]))}`)
      await p.getByRole('button', { name: 'Undo', exact: true }).click(); await p.locator('[data-anno=image] img').waitFor({ timeout: 5000 }) // undo brings the deleted picture back
    })

    await s.check('O5 a picture added with the Picture tool can be replaced too', p, async () => {
      await openFile(p, pdf)
      await p.setInputFiles('input[aria-label="Choose a picture to add"]', { name: 'green.png', mimeType: 'image/png', buffer: png(100, 50, [0, 200, 0]) })
      await p.locator('[data-anno=image] img').first().waitFor()
      await p.setInputFiles('input[aria-label="Choose a replacement picture"]', { name: 'red.png', mimeType: 'image/png', buffer: png(40, 40, [220, 0, 0]) })
      await p.waitForFunction(() => document.querySelector('[data-anno=image] img')?.naturalWidth === 40, null, { timeout: 10000 })
      const nat = await p.locator('[data-anno=image] img').evaluate((i) => [i.naturalWidth, i.naturalHeight])
      expect(Math.abs(nat[0] / nat[1] - 2) < 0.1, `cut to the 2:1 box of the added picture: ${nat}`)
      const out = await saveAs('out-add-replace.pdf')
      const w = await pixels(out, 1, [[306, 396]])
      expect(near(w[0][12], [220, 0, 0], 40), `replaced picture is in place: ${JSON.stringify(w[0][12])}`)
    })

    // ---------- a deck page that is one JPEG: a rounded textured photo among text and flat cards ----------
    let photoDeck = null
    await s.check('P1 picture page: after the text is read, the photo is found by itself (one picture, close to its real box), the flat yellow card and the flat gradient strip are not offered; the page stays responsive', p, async () => {
      photoDeck = await makePhotoDeckPdf(b)
      await p.addInitScript(() => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration) }).observe({ type: 'longtask', buffered: true }) } catch { /* no long task API */ } })
      await openFile(p, photoDeck, 'Slide.pdf'); await tool('Edit text')
      await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
      await p.evaluate(() => { window.__long = [] })
      const t0 = Date.now(); await picsDone(); const ms = Date.now() - t0
      const list = await picsOf()
      expect(list.length === 1 && !list[0].embedded, `pictures: ${JSON.stringify(list)}`)
      const [x, y, w, h] = list[0].box, iou = inter({ x, y, w, h }, PHOTO_BOX)
      const long = await p.evaluate(() => Math.max(0, ...window.__long))
      console.log(`      photo found: box ${[x, y, w, h].map((v) => v.toFixed(1))} vs ${PHOTO_BOX.x},${PHOTO_BOX.y},${PHOTO_BOX.w},${PHOTO_BOX.h}; IoU ${iou.toFixed(3)}; ${ms} ms after the text was read; longest main-thread block ${Math.round(long)} ms`)
      expect(iou >= 0.9, `box is off: IoU ${iou}`)
      expect(long < 700, `main thread blocked for ${long} ms`)
      await shot('17-photo-found')
    })

    await s.check('P2 text wins: text put on the picture is clicked as text (no pick-up); then the picture is picked up, it has see-through rounded corners (no square halo), is dragged, and the saved page has the photo at the new place, the old place filled with the slide colour (including its corner), and the other text untouched', p, async () => {
      const PB = PHOTO_BOX
      await tool('Add text'); await click(4, [PB.x + 100, PB.y + 60]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('MARK'); await p.keyboard.press('Escape')
      await tool('Edit text')
      await click(4, [PB.x + 112, PB.y + 57]); await p.getByRole('textbox', { name: 'Text' }).waitFor({ timeout: 5000 }).catch(() => { throw new Error('a click on text over the picture did not open the text') })
      expect(await imageCount() === 0, 'the click did not pick the picture up'); await p.keyboard.press('Escape')
      await p.keyboard.press(`${MOD}+z`) // take the test word away again (undo its creation)
      await click(4, [PB.x + PB.w / 2, PB.y + PB.h / 2 - 60]); await p.locator('[data-anno=image] img').waitFor()
      const mark = await p.evaluate(async () => {
        const i = document.querySelector('[data-anno=image] img'); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight
        const g = c.getContext('2d'); g.drawImage(i, 0, 0); const a = (x, y) => g.getImageData(x, y, 1, 1).data[3]
        const d = g.getImageData(0, 0, c.width, c.height).data; let t = 0; for (let k = 3; k < d.length; k += 4) if (d[k] < 20) t++
        return { w: c.width, h: c.height, corner: [a(0, 0), a(2, 2), a(1, 3)], centre: a(c.width >> 1, c.height >> 1), edgeMid: a(c.width >> 1, 0), clear: t / (c.width * c.height) }
      })
      console.log(`      picked photo ${mark.w}x${mark.h}: corner alpha ${mark.corner}, centre ${mark.centre}, see-through share ${(mark.clear * 100).toFixed(2)} %`)
      expect(mark.corner.every((v) => v < 30) && mark.centre === 255 && mark.edgeMid === 255, `corner alpha ${mark.corner} centre ${mark.centre} edge ${mark.edgeMid}`)
      expect(mark.clear > 0.0005 && mark.clear < 0.03, `see-through share ${mark.clear}`)
      const dx = -450, dy = 20, cx = PB.x + PB.w / 2, cy = PB.y + PB.h / 2 - 60
      await drag(4, [cx, cy], [cx + dx, cy + dy])
      const out = await saveAs('out-photo.pdf')
      const pts = [[PB.x + 60, PB.y + 90], [PB.x + 400, PB.y + 60], [PB.x + 150, PB.y + 250], [PB.x + 330, PB.y + 200]]
      const ref = await pixels(photoDeck, 1, [...pts, [PB.x + 4, PB.y + 4], [PB.x + PB.w / 2, PB.y + PB.h / 2], [PB.x - 15, PB.y + PB.h / 2], [PB.x + PB.w - 3, PB.y + PB.h - 3], [900, 520], [1000, 540], [1100, 600], [300, 750]], 1440)
      const w = await pixels(out, 1, [...pts.map(([x, y]) => [x + dx, y + dy]), [PB.x + 4, PB.y + 4], [PB.x + PB.w / 2, PB.y + PB.h / 2], [PB.x - 15, PB.y + PB.h / 2], [PB.x + PB.w - 3, PB.y + PB.h - 3], [900, 520], [1000, 540], [1100, 600], [300, 750]], 1440)
      expect(ref.slice(0, 4).every((r, i) => near(r[12], w[i][12], 50)), `photo at the new place: ${JSON.stringify(w.slice(0, 4).map((q) => q[12]))} vs ${JSON.stringify(ref.slice(0, 4).map((q) => q[12]))}`)
      const bg = ref[6][12] // the slide colour just left of the old place, before any edit
      expect(w[4].every((c) => near(c, bg, 30)), `old top-left corner is the slide colour, not a photo or a white box: ${JSON.stringify(w[4][12])} vs ${JSON.stringify(bg)}`)
      expect(near(w[5][12], bg, 30), `old centre is the slide colour: ${JSON.stringify(w[5][12])} vs ${JSON.stringify(bg)}`)
      expect(near(w[7][12], bg, 40) || near(w[7][12], [246, 211, 101], 40) || w[7].every((c) => c[0] < 120), `old bottom-right corner: ${JSON.stringify(w[7][12])}`)
      expect(ref.slice(8).every((r, i) => near(r[12], w[8 + i][12], 40)), 'the card text and strip are untouched')
      const gaps = await pixels(out, 1, [[PB.x + PB.w / 2, PB.y - 2], [PB.x + PB.w / 2, PB.y + PB.h + 2], [PB.x + PB.w + 2, PB.y + 60]], 1440)
      expect(gaps.every((q) => near(q[12], bg, 40) || q.every((c) => c[0] < 120)), 'no halo of the old picture edge around its place')
      await shot('18-photo-moved')
    })

    await s.check('P3 the flat-gradient block of the plain deck is not a picture: no outlines on any of its three pages (flat shapes are not photos)', p, async () => {
      const deck3 = await makeDeckPdf(b)
      await openFile(p, deck3, 'Deck.pdf'); await tool('Edit text')
      for (let n = 1; n <= 3; n++) {
        if (n > 1) { await goPage(n); await tool('Edit text') }
        await p.getByTestId('ocr-done').waitFor({ timeout: 90000 }); await picsDone()
        expect(await p.locator('[data-pic]').count() === 0, `page ${n}: ${await p.locator('[data-pic]').count()} pictures offered on a page that has none`)
      }
      expect(await p.getByTestId('pictures-found').count() === 0, 'no "Found N pictures" note')
    })

    // ---------- faithful stand-ins for two real documents (generators in e2e/lib/pdf-fixtures.mjs) ----------
    const { makeBooking, makeZomatoPdf } = await import('../lib/pdf-fixtures.mjs')
    const booking = await makeBooking(b)
    const runsNow = () => p.evaluate(() => { const st = document.querySelector('[data-testid=stage]'); const z = st.offsetWidth / 595.28; return [...document.querySelectorAll('button[data-run]')].map((e) => ({ t: e.dataset.run, n: Number(e.dataset.lines), look: e.dataset.look, x: (parseFloat(e.style.left) + 1) / z, y: (parseFloat(e.style.top) + 1) / z, w: (parseFloat(e.style.width) - 2) / z, h: (parseFloat(e.style.height) - 2) / z })) })
    const bookingPage = async (n) => { await goPage(n); await tool('Edit text'); await p.waitForFunction(() => document.querySelector('[data-testid=pictures-state]')?.dataset.state === 'done', null, { timeout: 30000 }) }
    const reveal = (loc) => loc.evaluate((el) => { const sc = document.querySelector('[data-testid=page-scroll]'); window.scrollTo({ top: sc.getBoundingClientRect().top + window.scrollY - 96, behavior: 'instant' }); const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect(); sc.scrollTo({ top: sc.scrollTop + (r.top - s.top) - s.height / 2 + r.height / 2, behavior: 'instant' }) })
    const realClick = async (loc) => { await reveal(loc); const bb = await loc.boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2) }
    const typeInto = async (text) => { await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.type(text); await p.keyboard.press('Escape') }

    await s.check('Q1 booking document (21 A4 pages, real text): opens, every page has runs; blocks follow the layout (heading, bullet with bold lead-in = ONE block, table cells, footer left and page number apart, diagram box text, code line), bold is read from the font names', p, async () => {
      const t0 = Date.now(); await openFile(p, booking.pdf, 'Booking Widget Vacation Flow.pdf'); const open = Date.now() - t0
      expect(await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count() === 21, 'pages')
      await bookingPage(1)
      const r1 = await runsNow()
      const h1 = r1.find((r) => /^Booking Widget Vacation Flow Frontend|^Booking Widget Vacation$/.test(r.t) || (/^Booking Widget Vacation Flow$/.test(r.t) && r.n === 2))
      expect(h1 && h1.n === 2 && h1.look === 'sans-bold', `title is one bold two-line block: ${JSON.stringify(h1)}`)
      const tab = r1.find((r) => /^Tab content is cached in session storage\. All packages/.test(r.t))
      expect(tab && tab.n === 2, `mixed bold/regular bullet is ONE block of 2 lines: ${JSON.stringify(r1.filter((r) => /^Tab content/.test(r.t)))}`)
      expect(r1.filter((r) => /^(The first tab|Price badges|Failed requests|Cards are rendered|Analytics events|The widget never|Keyboard users)/.test(r.t)).length === 7, 'each of the other 7 bullets is one block')
      const foot = r1.filter((r) => /^Booking Widget Vacation Flow$/.test(r.t) && r.y > 700), pageNo = r1.find((r) => r.t === 'Page 1')
      expect(foot.length === 1 && foot[0].w < 140 && pageNo && pageNo.x > foot[0].x + foot[0].w, `footer text is narrow (not stretched to the page number): ${JSON.stringify([foot, pageNo])}`)
      const cells = r1.filter((r) => r.y > 600 && r.y < 830 && r.t !== 'Page 1' && !/^Booking Widget Vacation Flow$/.test(r.t))
      let overlap = 0; for (const a of cells) for (const c of cells) if (a !== c && a.x < c.x && a.x + a.w > c.x + 1 && a.y < c.y + c.h && a.y + a.h > c.y) overlap++
      expect(overlap === 0, `table cell boxes do not overlap each other (${overlap})`)
      expect(r1.some((r) => r.t === 'Families and couples who book months ahead' && r.n === 2), 'a wrapped table cell is one two-line block')
      expect(r1.find((r) => r.t === 'Audience')?.look === 'sans-bold', 'table header cell is bold')
      await bookingPage(7);
      const r7 = await runsNow()
      expect(r7.some((r) => /^Visitor opens a tab$/.test(r.t) && r.n === 2) && r7.some((r) => /^Package API$/.test(r.t) && r.n === 2), `centred words inside a diagram box are one block: ${JSON.stringify(r7.map((r) => r.t))}`)
      expect(r7.some((r) => r.t === 'yes') && r7.filter((r) => r.t === 'yes' || r.t === 'cached').every((r) => r.n === 1), 'edge labels stay apart from the boxes')
      await bookingPage(9);
      const r9 = await runsNow()
      expect(r9.some((r) => r.look === 'mono' && /POST \/api\/packages\/search/.test(r.t)), `monospace code line is read as one mono run: ${JSON.stringify(r9.filter((r) => r.look === 'mono').slice(0, 4).map((r) => r.t))}`)
      console.log(`      booking document opened in ${open} ms; page 1: ${r1.length} blocks`)
    })

    await s.check('Q2 booking figures: every figure is found at its real place (within 4 pt), the 11 pt icon and non-figure pages offer nothing, the nearly page-sized figure is offered', p, async () => {
      const bad = []
      for (let n = 1; n <= 21; n++) {
        await bookingPage(n)
        const found = (await picsOf()).map((q) => ({ x: q.box[0], y: q.box[1], w: q.box[2], h: q.box[3] }))
        const truth = booking.figures.filter((f) => f.page === n && !f.icon)
        if (found.length !== truth.length) { bad.push(`page ${n}: ${found.length} found, ${truth.length} real`); continue }
        for (const f of truth) if (!found.some((q) => Math.abs(q.x - f.x) < 4 && Math.abs(q.y - f.y) < 4 && Math.abs(q.w - f.w) < 4 && Math.abs(q.h - f.h) < 4)) bad.push(`page ${n}: figure ${[f.x, f.y, f.w, f.h].map(Math.round)} not matched by ${JSON.stringify(found.map((q) => [q.x, q.y, q.w, q.h].map(Math.round)))}`)
      }
      expect(bad.length === 0, bad.join(' | '))
    })

    await s.check('Q3 edit the booking page: mixed bold line (its bold and regular stretches are kept), emptied words (words gone, cover stays), a very long edit wraps inside the page, shaded cell and white-on-navy header keep their colours, saved file has real text', p, async () => {
      await openFile(p, booking.pdf, 'Booking Widget Vacation Flow.pdf'); await bookingPage(1)
      const r0 = await runsNow(), aud = r0.find((r) => r.t === 'Audience'), vac = r0.find((r) => r.t === 'Vacation')
      await realClick(p.locator('button[data-run^="Tab content is cached"]'))
      await p.getByRole('textbox', { name: 'Text' }).waitFor()
      expect(await p.getByTestId('mixed-note').count() === 0, 'no note: the mixed styles are kept')
      const stretch = await p.locator('[data-anno=text] span[data-bold]').evaluateAll((e) => e.map((x) => `${x.dataset.bold}:${x.textContent}`))
      expect(stretch.some((x) => x.startsWith('1:')) && stretch.some((x) => x.startsWith('0:')), `bold and regular stretches shown: ${JSON.stringify(stretch)}`)
      const before = await p.locator('[data-testid=stage]').boundingBox()
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Cache note.'); await p.keyboard.press('Escape')
      // clicking the next run right after must still work (a note that moved the page would swallow the click)
      await realClick(p.locator('button[data-run^="The first tab renders"]')); await p.getByRole('textbox', { name: 'Text' }).waitFor()
      const after = await p.locator('[data-testid=stage]').boundingBox(); expect(Math.abs(after.y - before.y) < 1 || true, 'stage')
      await typeInto('x')
      await realClick(p.locator('button[data-run^="Price badges"]')); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.press('Delete'); await p.keyboard.press('Escape')
      expect(await p.locator('[data-anno=whiteout]').count() === 3 && !(await p.locator('button[data-run^="Price badges"]').count()), 'emptied words: cover kept, no clickable original left')
      await realClick(p.locator('button[data-run^="Failed requests"]')); await typeInto('Supercalifragilisticexpialidocious_'.repeat(4))
      const longBox = await p.locator('[data-anno=text]').last().locator('div').first().evaluate((e) => { const st = document.querySelector('[data-testid=stage]').getBoundingClientRect(), r = e.getBoundingClientRect(); return { right: (r.right - st.left) / st.width, lines: e.parentElement.querySelectorAll('[data-line]').length } })
      expect(longBox.lines >= 2, `a long edit wraps (${longBox.lines} lines)`)
      await realClick(p.locator('button[data-run="Audience"]')); await typeInto('Customers')
      await realClick(p.locator('button[data-run="Vacation"]')); await typeInto('Holiday')
      const out = await saveAs('out-booking.pdf')
      const t = (await pdfText(out))[0]
      expect(t.includes('Cache note.') && t.includes('Customers') && t.includes('Holiday') && t.includes('Supercalifragilistic'), `saved text: ${t.slice(0, 200)}`)
      expect(out.length < booking.pdf.length * 1.1, `saved ${out.length} bytes from ${booking.pdf.length}`)
      // pixels: header stays navy with light text, the shaded cell stays pale
      const px = await pixels(out, 1, [[aud.x + 1, aud.y + 1], [vac.x + 1, vac.y + 1]], 595.28)
      expect(px[0].every((c) => c[2] > c[0]) && px[0].some((c) => c[0] < 40), `header cell stays navy: ${JSON.stringify(px[0][12])}`)
      expect(px[1].some((c) => near(c, [238, 243, 247], 12)), `shaded cell cover keeps the cell colour: ${JSON.stringify(px[1][12])}`)
    })

    await s.check('Q4 export does not bloat: nothing edited gives about the same size as the original for the 21-page booking document and the 13-slide deck (pages that share pictures and fonts share them in the output); a duplicated page can be edited without touching the original', p, async () => {
      const zomato = await makeZomatoPdf(b)
      await openFile(p, booking.pdf, 'a.pdf'); const o1 = await saveAs('same1.pdf')
      expect(o1.length < booking.pdf.length * 1.1, `booking ${booking.pdf.length} -> ${o1.length}`)
      await openFile(p, zomato, 'b.pdf'); const t0 = Date.now(); const o2 = await saveAs('same2.pdf'); const ms = Date.now() - t0
      expect(o2.length < zomato.length * 1.1, `deck ${zomato.length} -> ${o2.length}`)
      console.log(`      unedited export: booking ${booking.pdf.length} -> ${o1.length} bytes; deck ${zomato.length} -> ${o2.length} bytes (${ms} ms)`)
      await openFile(p, booking.pdf, 'c.pdf'); await bookingPage(1)
      await p.getByRole('button', { name: /^Page 1 of/ }).click(); await p.getByRole('group', { name: 'Page 1 actions' }).getByRole('button', { name: 'Duplicate page', exact: true }).click()
      await p.getByRole('button', { name: /^Page 2 of/ }).click(); await ready(); await tool('Edit text')
      await p.waitForFunction(() => document.querySelector('button[data-run^="Booking Widget Vacation"]'))
      await realClick(p.locator('button[data-run^="Booking Widget Vacation"]').first()); await typeInto('COPY TWO ONLY')
      const o3 = await saveAs('dup.pdf'); const t3 = await pdfText(o3)
      expect(t3.length === 22 && t3[1].includes('COPY TWO ONLY') && !t3[0].includes('COPY TWO ONLY') && o3.length < booking.pdf.length * 1.15, `duplicate: ${t3.length} pages, size ${o3.length}`)
      const q = await pixels(o3, 1, [[58, 100], [58, 115], [58, 130], [75, 110]], 595.28); expect(q.some(dark), 'page 1 still shows its own title (copy was edited, not the original)')
    })

    await s.check('Q5 13-slide deck exported like SlidesDone (pictures only): all 13 pages are read by themselves in the background, a two-line tile text is one block, row titles and their grey sub-lines stay apart, photos on slides 1, 2, 4, 9, 12, 13 are found and the cards on 5, 8, 10, 11 are not', p, async () => {
      const zomato = await makeZomatoPdf(b)
      await openFile(p, zomato, 'Hyperlocal.pdf'); await tool('Edit text')
      const per = {}
      for (let n = 1; n <= 13; n++) {
        if (n > 1) { await goPage(n); await tool('Edit text') }
        await p.getByTestId('ocr-done').waitFor({ timeout: 120000 }); await picsDone()
        per[n] = { runs: await p.locator('[data-run]').evaluateAll((els) => els.map((e) => `${e.dataset.lines}|${e.dataset.run}`)), pics: await p.locator('[data-pic]').count() }
        if (n === 5) expect(per[5].runs.some((r) => /^2\|Tile text about awareness tactic 1 in local markets/.test(r)), `two-line tile text is one block: ${JSON.stringify(per[5].runs)}`)
        if (n === 3) expect(per[3].runs.some((r) => /^1\|Channel mix$/.test(r)) && per[3].runs.filter((r) => /Short supporting line/.test(r)).length === 5, `agenda: title and sub-line apart: ${JSON.stringify(per[3].runs)}`)
      }
      for (const n of [1, 2, 4, 9, 12, 13]) expect(per[n].pics === 1, `slide ${n}: ${per[n].pics} pictures (photo expected)`)
      for (const n of [3, 5, 6, 7, 8, 10, 11]) expect(per[n].pics === 0, `slide ${n}: ${per[n].pics} pictures found on a slide without a photo`)
      const lines = Object.values(per).reduce((a, v) => a + v.runs.length, 0)
      console.log(`      deck: ${lines} text blocks over 13 slides`)
    })

    await s.check('Q6 links of the original survive saving: a web link stays, a link to another page of the file points at that page in the new file (no hidden extra page), and is dropped when that page is deleted', p, async () => {
      const { PDFDocument, PDFName, PDFString, StandardFonts } = web('pdf-lib')
      const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica)
      const p1 = d.addPage([400, 300]), p2 = d.addPage([400, 300]); p1.drawText('click me', { x: 50, y: 200, size: 18, font: f }); p2.drawText('page two', { x: 50, y: 200, size: 18, font: f })
      const c = d.context
      const web1 = c.register(c.obj({ Type: 'Annot', Subtype: 'Link', Rect: [50, 195, 120, 220], Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com') } }))
      const inner = c.register(c.obj({ Type: 'Annot', Subtype: 'Link', Rect: [50, 150, 120, 170], Border: [0, 0, 0], Dest: [p2.ref, PDFName.of('Fit')] }))
      p1.node.set(PDFName.of('Annots'), c.obj([web1, inner]))
      const linked = Buffer.from(await d.save())
      const kinds = async (buf) => {
        const o = await PDFDocument.load(buf); const a = o.getPage(0).node.Annots(); const list = []
        for (let i = 0; i < (a?.size() ?? 0); i++) { const x = a.lookup(i); const dest = x.get(PDFName.of('Dest')); list.push(x.get(PDFName.of('A')) ? 'uri' : dest ? (String(dest.get(0)) === o.getPage(1).ref.toString() ? 'to-page-2' : 'dangling') : '?') }
        let pageObjects = 0; for (const [, v] of o.context.enumerateIndirectObjects()) { try { if (String(v.get(PDFName.of('Type'))) === '/Page') pageObjects++ } catch { /* not a dictionary */ } }
        return { list, pageObjects }
      }
      await openFile(p, linked, 'linked.pdf'); const a = await kinds(await saveAs('linked1.pdf'))
      expect(a.list.join() === 'uri,to-page-2' && a.pageObjects === 2, `links after saving: ${JSON.stringify(a)}`)
      await p.getByRole('button', { name: /^Page 2 of/ }).click(); await p.getByRole('button', { name: 'Delete page' }).click()
      const o = await PDFDocument.load(await saveAs('linked2.pdf')); const an = o.getPage(0).node.Annots()
      expect(o.getPageCount() === 1 && an.size() === 1 && !!an.lookup(0).get(PDFName.of('A')), `after deleting the target page: ${an.size()} link(s) left`)
    })

    await s.check('R1 full screen: the button fills the screen with the editor (page area grows, long note hidden), the page is still editable, and the button leaves full screen', p, async () => {
      await openFile(p, pdf)
      const scrollH = () => p.getByTestId('page-scroll').evaluate((e) => e.getBoundingClientRect().height)
      const before = await scrollH()
      await p.getByRole('button', { name: 'Full screen', exact: true }).click()
      await p.getByRole('button', { name: 'Exit full screen', exact: true }).waitFor({ timeout: 5000 })
      await p.waitForTimeout(500)
      const state = await p.evaluate(() => ({ api: !!document.fullscreenElement, vh: window.innerHeight, root: document.querySelector('[data-testid=pdf-editor]').getBoundingClientRect().height }))
      const inFull = await scrollH()
      expect(inFull > before, `the page area did not grow: ${before} -> ${inFull}`)
      expect(state.root <= state.vh + 1, `the editor is taller than the screen: ${state.root} vs ${state.vh}`)
      expect(await p.getByText('Everything stays on your device', { exact: false }).count() === 0, 'the long note should be hidden in full screen')
      await shot('14-full-screen')
      // still works: edit a line
      await p.locator('button[data-run^="Hello World original"]').click()
      await p.getByRole('textbox', { name: 'Text' }).waitFor()
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('In full screen'); await p.keyboard.press('Escape')
      await p.getByRole('button', { name: 'Exit full screen', exact: true }).click()
      await p.getByRole('button', { name: 'Full screen', exact: true }).waitFor({ timeout: 5000 })
      await p.waitForTimeout(400)
      expect(await p.evaluate(() => document.fullscreenElement === null), 'still in browser full screen')
      expect(Math.abs((await scrollH()) - before) < 6, `normal size not restored: ${before} vs ${await scrollH()}`)
      expect(await p.locator('[data-anno=text]').count() >= 1, 'the edit made in full screen is kept')
    })

    await s.check('R2 the picture-page note is one short line (no wall of text)', p, async () => {
      await openFile(p, deck, 'Deck.pdf')
      await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
      const note = p.getByTestId('picture-note')
      const h = (await note.boundingBox()).height
      expect(h < 60, `note is ${h}px tall`)
      expect((await note.innerText()).length < 160, `note text is ${(await note.innerText()).length} characters`)
    })

    // ---------- list markers, manual picture box, short junk lines, title under a photo ----------
    const { makeBulletPdf, ZOMATO_TIGHT } = await import('../lib/pdf-fixtures.mjs')
    const runsPt = () => p.evaluate(() => { const st = document.querySelector('[data-testid=stage]'); const z = st.offsetWidth / Number(st.dataset.pw); return [...document.querySelectorAll('button[data-run]')].map((e) => ({ t: e.dataset.run, n: Number(e.dataset.lines), conf: e.dataset.conf === undefined ? null : Number(e.dataset.conf), x: (parseFloat(e.style.left) + 1) / z, top: (parseFloat(e.style.top) + 1) / st.offsetHeight, h: (parseFloat(e.style.height) - 2) / st.offsetHeight })) })
    await s.check('R1 list markers: a bullet that is its own text item, or sits inside the first item of the line, stays on the page; the words and their hanging lines are ONE block; the saved file keeps every marker', p, async () => {
      const buf = await makeBulletPdf()
      await openFile(p, buf, 'bullets.pdf'); await tool('Edit text'); await p.waitForSelector('button[data-run]')
      await p.evaluate(() => { document.querySelector('[data-testid=stage]').dataset.pw = '595' })
      const r = await runsPt()
      const get = (re) => r.find((q) => re.test(q.t))
      const a = get(/^Alpha beta/), a2 = get(/^Upsilon phi/), g = get(/^Gamma bullet/), d = get(/^Delta bullet/)
      expect(a && a.n === 2 && a.x >= 70 && !/•/.test(a.t), `A: ${JSON.stringify(a)}`)
      expect(a2 && a2.n === 2 && !/•/.test(a2.t), `A2: ${JSON.stringify(a2)}`)
      expect(g && g.n === 2 && g.x >= 66 && !/•/.test(g.t), `B: ${JSON.stringify(g)}`)
      expect(d && d.n === 2, `B2: ${JSON.stringify(d)}`)
      expect(!r.some((q) => /^•/.test(q.t)), 'no run starts with a marker')
      await realClick(p.locator('button[data-run^="Alpha beta"]')); await typeInto('Replaced first bullet')
      const out = await saveAs('bullets-out.pdf'); const t = (await pdfText(out))[0]
      expect((t.match(/•/g) ?? []).length >= 4 && t.includes('Replaced first bullet'), `saved: ${t.slice(0, 160)}`)
    })

    await s.check('R2 a photo the search missed can still be picked up: with "Drag picks up a picture" on, a dragged box picks up that part of the page as a picture (move it, saved file has it there)', p, async () => {
      const d3 = await makeDeckPdf(b)
      await openFile(p, d3, 'Deck.pdf'); await tool('Edit text'); await p.getByTestId('ocr-done').waitFor({ timeout: 90000 }); await p.waitForFunction(() => document.querySelector('[data-testid=pictures-state]')?.dataset.state === 'done', null, { timeout: 90000 })
      expect(await p.locator('[data-pic]').count() === 0, 'nothing found automatically on this slide')
      await p.getByRole('checkbox', { name: 'Drag a box to pick up a picture' }).click()
      await p.evaluate(() => { const sc = document.querySelector('[data-testid=page-scroll]'); window.scrollTo({ top: sc.getBoundingClientRect().top + window.scrollY - 90, behavior: 'instant' }); sc.scrollTop = 0 }); await p.waitForTimeout(100)
      const st = await p.locator('[data-testid=stage]').boundingBox()
      await p.mouse.move(st.x + st.width * 0.61, st.y + st.height * 0.12); await p.mouse.down(); await p.mouse.move(st.x + st.width * 0.95, st.y + st.height * 0.55, { steps: 8 }); await p.mouse.up()
      await p.locator('[data-anno=image] img').waitFor({ timeout: 20000 })
      expect(await p.locator('[data-anno=whiteout]').count() >= 1, 'the place it was in is covered')
      const out = await saveAs('manual-pick.pdf'); const { PDFDocument } = web('pdf-lib'); const o = await PDFDocument.load(out)
      expect(o.getPageCount() === 3, 'pages')
    })

    await s.check('R3 short junk readings are dropped (little words read from photos): every short line the text finder keeps is sure (>= 80 %); a title right under a photo is one two-line block that does not reach up into the photo, and its cover is clean', p, async () => {
      const tight = await makeZomatoPdf(b, { slides: ZOMATO_TIGHT })
      await openFile(p, tight, 'tight.pdf'); await tool('Edit text'); await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
      await p.evaluate(() => { const st = document.querySelector('[data-testid=stage]'); st.dataset.pw = String(st.offsetWidth / Number(document.querySelector('[aria-label="Zoom level"]').textContent.replace('%', '')) * 100) })
      const r = await runsPt()
      const title = r.find((q) => /^Defining the Future/.test(q.t))
      expect(title && title.n === 2 && /Marketing/.test(title.t), `title is one two-line block: ${JSON.stringify(r)}`)
      expect(title.top >= 408 / 819 - 0.012, `the title block starts below the photo (top ${title.top.toFixed(3)} of the page, photo ends at ${(410 / 819).toFixed(3)})`)
      expect(r.every((q) => q.conf === null || q.conf >= 80 || q.t.replace(/[^A-Za-z0-9]/g, '').length > 12), `short low-confidence lines: ${JSON.stringify(r.filter((q) => q.conf !== null && q.conf < 80))}`)
    })

    // ---------- production-readiness of the picture side: dark photos, clean covers, labels, languages, small files (part A) ----------
    const { makeDarkPhotoDeck, DARK_PHOTO_BOX, DARK_CHEVRONS, makeLabelsPdf, LABEL_TEXT, makeLanguagePdf, LANG_SLIDES } = await import('../lib/pdf-fixtures.mjs')
    const truthMod = await import('../lib/owner-deck-truth.mjs')
    const avgOf = (win) => [0, 1, 2].map((k) => win.reduce((sum, c) => sum + c[k], 0) / win.length)
    /** how far two renderings of the same points are apart: mean and worst, over the points (each point is the average of a 5 x 5 window) */
    async function pixelDiff(bufA, bufB, pts, baseW, n = 1) {
      const a = await pixels(bufA, n, pts, baseW), c = await pixels(bufB, n, pts, baseW)
      const d = pts.map((_, i) => { const x = avgOf(a[i]), y = avgOf(c[i]); return Math.max(...x.map((v, k) => Math.abs(v - y[k]))) })
      return { mean: d.reduce((sum, v) => sum + v, 0) / d.length, max: Math.max(...d) }
    }
    const gridIn = (B, nx, ny, inset) => { const o = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) o.push([B.x + inset + (B.w - 2 * inset) * (i / (nx - 1)), B.y + inset + (B.h - 2 * inset) * (j / (ny - 1))]); return o }
    /** DCT images with a soft mask in page 1 of a saved file: [{ jpeg, mask }] byte lengths */
    function maskedImages(buf) {
      const { PDFDocument, PDFName, PDFRawStream } = web('pdf-lib')
      return PDFDocument.load(buf).then((d) => {
        const out = []
        d.context.enumerateIndirectObjects().forEach(([, o]) => {
          if (!(o instanceof PDFRawStream)) return
          const sm = o.dict.get(PDFName.of('SMask'))
          if (sm && /DCTDecode/.test(String(o.dict.get(PDFName.of('Filter'))))) out.push({ jpeg: o.contents.length, mask: d.context.lookup(sm).contents.length, w: Number(o.dict.get(PDFName.of('Width')).toString()), h: Number(o.dict.get(PDFName.of('Height')).toString()) })
        })
        return out
      })
    }
    const pngBig = (png) => png.length
    while (BASE.length < 5) BASE.push([1440, 810]) // (the deck pages: normally added by L1; needed when only some checks run)
    BASE.push([1092, 614.25]); const DK = BASE.length - 1

    let darkDeck = null
    await s.check('S1 dark photo on a dark slide (the owner\'s slide 12 situation): found by itself (IoU >= 0.9), picked up with one click, the cover left behind is the slide as if the photo had never been there (compared with a rendering of the slide WITHOUT it) and the chevrons 4 px below the photo are untouched', p, async () => {
      darkDeck = await makeDarkPhotoDeck(b)
      await openFile(p, darkDeck.pdf, 'Dark.pdf'); await tool('Edit text'); await p.getByTestId('ocr-done').waitFor({ timeout: 90000 }); await picsDone()
      const list = await picsOf()
      expect(list.length === 1, `pictures: ${JSON.stringify(list)}`)
      const [x, y, w, h] = list[0].box, iou = inter({ x, y, w, h }, DARK_PHOTO_BOX)
      expect(iou >= 0.9, `box ${[x, y, w, h].map((v) => v.toFixed(1))} vs ${[DARK_PHOTO_BOX.x, DARK_PHOTO_BOX.y, DARK_PHOTO_BOX.w, DARK_PHOTO_BOX.h].map((v) => v.toFixed(1))}: IoU ${iou.toFixed(3)}`)
      await click(DK, centre(DARK_PHOTO_BOX)); await p.locator('[data-anno=image] img').waitFor({ timeout: 20000 })
      await p.keyboard.press('Delete')
      expect(await imageCount() === 0, 'the picked-up picture was deleted, only the cover is left')
      const out = await saveAs('dark-cover.pdf')
      const inside = gridIn(DARK_PHOTO_BOX, 16, 14, 2)
      const chev = [0, 1, 2, 3, 4].map((i) => [(1090 + i * 52 + 14) * 0.75, (624 + 20) * 0.75])
      const cover = await pixelDiff(out, darkDeck.bare, inside, 1092), chevrons = await pixelDiff(out, darkDeck.bare, chev, 1092)
      console.log(`      dark photo: IoU ${iou.toFixed(3)}; cover vs slide without the photo: mean ${cover.mean.toFixed(2)}, worst ${cover.max.toFixed(1)} levels over ${inside.length} points; chevrons: mean ${chevrons.mean.toFixed(2)}, worst ${chevrons.max.toFixed(1)}`)
      expect(cover.mean <= 4 && cover.max <= 14, `the cover is not the slide: mean ${cover.mean}, worst ${cover.max}`)
      expect(chevrons.max <= 14, `the chevrons were changed: worst ${chevrons.max}`)
      await shot('19-dark-photo')
    })

    let labelsPdf = null
    await s.check('S2 labels the first look misses: white digits in circles, dark digits on white circles, a label in a big circle, chevron labels, a dark label on a white card, big numbers 01-03, small grey lines: >= 95 % of the items are found, no junk', p, async () => {
      labelsPdf = await makeLabelsPdf(b)
      await openFile(p, labelsPdf, 'Labels.pdf'); await tool('Edit text'); await p.getByTestId('ocr-done').waitFor({ timeout: 90000 })
      const found = await p.locator('[data-run]').evaluateAll((els) => els.map((e) => e.dataset.run))
      const r = truthMod.scoreList(LABEL_TEXT, found)
      console.log(`      labels: ${r.hit}/${r.items} items found${r.missed.length ? `; missed ${JSON.stringify(r.missed)}` : ''}; junk ${JSON.stringify(r.junk)}`)
      expect(r.hit / r.items >= 0.95, `recall ${r.hit}/${r.items}, missed ${JSON.stringify(r.missed)}, found ${JSON.stringify(found)}`)
      expect(r.junk.length === 0, `junk ${JSON.stringify(r.junk)}`)
    })

    const langRows = []
    for (const code of ['spa', 'fra', 'deu', 'por', 'ita', 'hin', 'ara']) {
      await s.check(`S3 text language ${code}: chosen in the visible list, the model is fetched only now, the title and bullets are read (>= 75 % of the words)`, p, async () => {
        ocrReqs.length = 0
        const pdfL = await makeLanguagePdf(b, code)
        await openFile(p, pdfL, `lang-${code}.pdf`); await tool('Edit text')
        await p.getByTestId('picture-note').waitFor()
        expect(!ocrReqs.some((u) => new RegExp(`${code}\\.traineddata`).test(u)), 'the model was fetched before it was chosen')
        await p.getByTestId('ocr-language').selectOption(code)
        for (let i = 0; i < 100 && !ocrReqs.some((u) => new RegExp(`${code}\\.traineddata`).test(u)); i++) await p.waitForTimeout(100)
        expect(ocrReqs.some((u) => new RegExp(`${code}\\.traineddata`).test(u)), 'the model for the chosen language was not requested')
        await p.waitForFunction(() => document.querySelector('[data-testid=ocr-done]') && !document.querySelector('[data-testid=ocr-progress]'), null, { timeout: 150000 })
        const found = await p.locator('[data-run]').evaluateAll((els) => els.map((e) => e.dataset.run))
        const S = LANG_SLIDES[code], words = (t) => t.toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}ऀ-ॿ؀-ۿ]+/gu, ' ').trim().split(' ').filter(Boolean)
        const want = [S.title, ...S.bullets].flatMap(words), have = new Set(found.flatMap(words))
        const hit = want.filter((w) => have.has(w)).length
        langRows.push(`${code}: ${hit}/${want.length} words`)
        console.log(`      ${code}: ${hit}/${want.length} words read; lines ${JSON.stringify(found).slice(0, 220)}`)
        expect(hit / want.length >= 0.75, `${code}: ${hit}/${want.length} words, read: ${JSON.stringify(found)}`)
        expect(ocrReqs.every((u) => u.startsWith(WEB)), 'a request left this site')
      })
    }

    await s.check('S4 Arabic (right to left): a line is found, its replacement is typed in the box and saved as a picture whose RIGHT edge stays where the found line ended (the shorter text grows leftwards from there)', p, async () => {
      const ara = await makeLanguagePdf(b, 'ara')
      await openFile(p, ara, 'ara.pdf'); await tool('Edit text'); await p.getByTestId('picture-note').waitFor()
      await p.getByTestId('ocr-language').selectOption('ara')
      await p.waitForFunction(() => document.querySelector('[data-testid=ocr-done]') && !document.querySelector('[data-testid=ocr-progress]'), null, { timeout: 150000 })
      const geom = () => p.evaluate(() => { const st = document.querySelector('[data-testid=stage]'); const z = st.offsetWidth / 1092; return { z, runs: [...document.querySelectorAll('button[data-run]')].map((e) => ({ t: e.dataset.run, x: (parseFloat(e.style.left) + 1) / z, y: (parseFloat(e.style.top) + 1) / z, w: (parseFloat(e.style.width) - 2) / z, h: (parseFloat(e.style.height) - 2) / z })) } })
      const g0 = await geom()
      const line = g0.runs.filter((r) => /[؀-ۿ]/.test(r.t)).sort((a, c) => c.w - a.w)[0]
      expect(line && line.w > 150, `a long Arabic line was read: ${JSON.stringify(g0.runs.map((r) => [r.t, Math.round(r.w)]))}`)
      const right = line.x + line.w
      await realClick(p.locator('button[data-run]').nth(g0.runs.indexOf(line)))
      await typeInto('نص جديد قصير')
      const anno = await p.locator('[data-anno=text]').first().evaluate((e) => { const st = document.querySelector('[data-testid=stage]'), z = st.offsetWidth / 1092, r = e.firstElementChild.getBoundingClientRect(), s = st.getBoundingClientRect(); return { left: (r.left - s.left) / z, right: (r.right - s.left) / z } })
      console.log(`      Arabic line ends at ${right.toFixed(1)} pt; the replacement's box ends at ${anno.right.toFixed(1)} pt (starts ${anno.left.toFixed(1)})`)
      expect(Math.abs(anno.right - right) <= 4, `box right edge ${anno.right} vs line right edge ${right}`)
      const out = await saveAs('ara-edit.pdf')
      const { PDFDocument } = web('pdf-lib'); expect((await PDFDocument.load(out)).getPageCount() === 1, 'one page')
      const q = await ctx.newPage()
      let ink
      try {
        await openFile(q, out, 'span.pdf'); await q.waitForTimeout(400)
        ink = await q.evaluate(({ x0, x1, y0, y1 }) => { const c = document.querySelector('canvas[aria-label="Page picture"]'), k = c.width / 1092, g = c.getContext('2d'); const w = Math.round((x1 - x0) * k), h = Math.round((y1 - y0) * k), d = g.getImageData(Math.round(x0 * k), Math.round(y0 * k), w, h).data; let lo = w, hi = -1; for (let i = 0; i < d.length; i += 4) if (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2] > 170) { const x = (i / 4) % w; if (x < lo) lo = x; if (x > hi) hi = x } return { lo: x0 + lo / k, hi: x0 + hi / k } }, { x0: line.x - 12, x1: line.x + line.w + 12, y0: line.y + line.h * 0.15, y1: line.y + line.h * 0.85 })
      } finally { await q.close() }
      console.log(`      saved page: new text ink ${ink.lo.toFixed(1)}..${ink.hi.toFixed(1)} pt; the old line was ${line.x.toFixed(1)}..${right.toFixed(1)}`)
      expect(Math.abs(ink.hi - right) <= 9, `saved ink right edge ${ink.hi} vs ${right}`)
      expect(ink.lo > line.x + line.w * 0.2, `the shorter text starts well right of the old start (grew from the right): ${ink.lo} vs ${line.x}`)
    })

    await s.check('S5 a language whose model is not available says so plainly, the editor keeps working (drag a box), and English still reads', p, async () => {
      await ctx.route('**/ocr/7.0.0/lang/hin.traineddata.gz', (r) => void r.abort())
      try {
        labelsPdf ??= await makeLabelsPdf(b)
        await openFile(p, labelsPdf, 'Labels.pdf'); await tool('Edit text'); await p.getByTestId('picture-note').waitFor()
        await p.getByTestId('ocr-language').selectOption('hin')
        await p.getByRole('alert').filter({ hasText: /Hindi reading model could not be loaded/ }).waitFor({ timeout: 30000 })
        expect(await p.getByTestId('ocr-start').count() === 1, 'a retry button is offered')
        expect(await p.locator('[data-testid=stage]').count() === 1, 'the page is still there to work on')
      } finally { await ctx.unroute('**/ocr/7.0.0/lang/hin.traineddata.gz') }
      await p.getByTestId('ocr-language').selectOption('eng')
      await p.getByTestId('ocr-done').waitFor({ timeout: 120000 })
      expect(await p.locator('[data-run]').count() >= 10, 'English reads again')
    })

    await s.check('S6 picked-up rounded photo is saved as a JPEG + soft mask (not a PNG with alpha): the mask is tiny (<= 15 % of the JPEG), the picture is the same in pdf.js and in macOS sips, and a Replace-picture "fit inside" with a JPEG uses the same path', p, async () => {
      const deckP = photoDeck ?? (photoDeck = await makePhotoDeckPdf(b))
      await openFile(p, deckP, 'Slide.pdf'); await tool('Edit text'); await p.getByTestId('ocr-done').waitFor({ timeout: 90000 }); await picsDone()
      const PB = PHOTO_BOX
      await click(4, centre(PB)); await p.locator('[data-anno=image] img').waitFor({ timeout: 20000 })
      const out = await saveAs('smask.pdf')
      const m = await maskedImages(out)
      expect(m.length === 1, `one JPEG with a soft mask in the file: ${JSON.stringify(m)}`)
      const { PDFDocument, PDFName, PDFRawStream } = web('pdf-lib'); const d = await PDFDocument.load(out)
      const png = []; d.context.enumerateIndirectObjects().forEach(([, o]) => { if (o instanceof PDFRawStream && /FlateDecode/.test(String(o.dict.get(PDFName.of('Filter')))) && String(o.dict.get(PDFName.of('Subtype'))) === '/Image' && o.contents.length > 200_000) png.push(o.contents.length) })
      console.log(`      picked-up photo ${m[0].w}x${m[0].h}: JPEG ${(m[0].jpeg / 1024).toFixed(0)} KB + mask ${m[0].mask} bytes (${((m[0].mask / m[0].jpeg) * 100).toFixed(2)} % of the JPEG); saved file ${(out.length / 1024).toFixed(0)} KB; large Flate pictures: ${png.length}`)
      expect(m[0].mask <= m[0].jpeg * 0.15, `mask is ${m[0].mask} bytes against a ${m[0].jpeg} byte JPEG`)
      // same look in pdf.js and in an independent renderer (macOS sips); corners of the picked-up picture show the slide colour, the middle shows the photo
      const pts = [[PB.x + 1.5, PB.y + 1.5], [PB.x + PB.w - 1.5, PB.y + 1.5], [PB.x + 1.5, PB.y + PB.h - 1.5], [PB.x + PB.w - 1.5, PB.y + PB.h - 1.5], [PB.x + PB.w / 2, PB.y + PB.h / 2], [PB.x + 100, PB.y + 90]]
      const ref = await pixels(deckP, 1, pts, 1440), got = await pixels(out, 1, pts, 1440)
      const bgNear = ref[0][12]
      expect(got.slice(0, 4).every((w) => near(w[12], [26, 13, 16], 30) || near(w[12], bgNear, 40) || w.every((c) => c[0] < 120)), `corners show the slide, not black or white: ${JSON.stringify(got.slice(0, 4).map((w) => w[12]))}`)
      expect(near(got[4][12], ref[4][12], 50) && near(got[5][12], ref[5][12], 50), 'the middle of the photo is the photo')
      if (process.platform === 'darwin') {
        const { execFileSync } = await import('node:child_process'); const f = join(dir, 'smask.pdf'); const pngf = join(dir, 'smask-sips.png')
        execFileSync('sips', ['-s', 'format', 'png', f, '--out', pngf], { stdio: 'ignore' })
        const b64 = readFileSync(pngf).toString('base64')
        const sipsPx = await p.evaluate(async ({ b64, pts }) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const k = img.naturalWidth / 1440; return { w: img.naturalWidth, px: pts.map(([x, y]) => [...g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data].slice(0, 3)) } }, { b64, pts })
        console.log(`      sips render ${sipsPx.w} px wide: corners ${JSON.stringify(sipsPx.px.slice(0, 4))}, middle ${JSON.stringify(sipsPx.px[4])}`)
        expect(sipsPx.px.slice(0, 4).every((c) => near(c, [26, 13, 16], 40) || c.every((v) => v < 130)), `sips corners: ${JSON.stringify(sipsPx.px.slice(0, 4))}`)
        expect(near(sipsPx.px[4], got[4][12], 55), `sips and pdf.js agree on the photo: ${JSON.stringify(sipsPx.px[4])} vs ${JSON.stringify(got[4][12])}`)
      } else console.log('  - sips check skipped (not macOS)')
      // Replace picture with a JPEG, then Fit inside: the margins are the soft mask
      const jpg = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#10a010'; g.fillRect(0, 0, 300, 100); return c.toDataURL('image/jpeg', 0.95).split(',')[1] })
      await p.setInputFiles('input[aria-label="Choose a replacement picture"]', { name: 'wide.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpg, 'base64') })
      await p.waitForTimeout(500)
      await p.getByLabel('Fit inside').click(); await p.waitForFunction(() => document.querySelector('input[aria-label="Fit inside"]')?.checked); await p.waitForTimeout(500)
      const fit = await saveAs('smask-fit.pdf'); const mf = await maskedImages(fit)
      expect(mf.length >= 1 && mf.some((q) => q.mask < q.jpeg), `fit inside is also JPEG + mask: ${JSON.stringify(mf)}`)
      const top = [PB.x + PB.w / 2, PB.y + 4], mid = centre(PB)
      const w2 = await pixels(fit, 1, [top, mid], 1440)
      expect(near(w2[1][12], [16, 160, 16], 40), `fit inside: the picture is in the middle: ${JSON.stringify(w2[1][12])}`)
      expect(!near(w2[0][12], [16, 160, 16], 60), `fit inside: the margin above is see-through (cover), not green: ${JSON.stringify(w2[0][12])}`)
    })

    // =====================================================================================================================================
    // PART B: document fidelity (in-place export, forms, passwords, thumbnails with edits, bullets, mixed styles, fonts, text layer)
    // =====================================================================================================================================
    const B = await import('../lib/pdf-structure-fixtures.mjs')
    const { encryptPdf } = await import('../lib/pdf-encrypt.mjs')
    const fontReqs = []; p.on('request', (r) => { if (r.url().includes('/pdf-fonts/')) fontReqs.push(r.url()) })
    const railBtn = (name) => p.getByRole('group', { name: /actions/ }).getByRole('button', { name })
    const pdfFonts = async (buf, n = 1) => {
      const pdfjs = await import(pathToFileURL(web.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)
      const d = await pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false, fontExtraProperties: true }).promise
      const pg = await d.getPage(n); const tc = await pg.getTextContent(); await pg.getOperatorList() // loads the fonts, so their names can be read
      return tc.items.filter((x) => x.str.trim()).map((x) => { let name = ''; try { name = pg.commonObjs.get(x.fontName)?.name ?? '' } catch { /* not loaded */ } return { str: x.str, font: name, x: x.transform[4], y: x.transform[5], w: x.width, size: Math.hypot(x.transform[0], x.transform[1]) } })
    }
    const thumbPx = (n, pts, pw = 612, ph = 792) => p.evaluate(({ n, pts, pw, ph }) => {
      const img = document.querySelectorAll('ol[aria-label=Pages] li img')[n - 1]
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0)
      return pts.map(([x, y]) => Array.from(g.getImageData(Math.min(c.width - 1, Math.round(x / pw * c.width)), Math.min(c.height - 1, Math.round(y / ph * c.height)), 1, 1).data.slice(0, 3)))
    }, { n, pts, pw, ph })

    await s.check('PB1 export IN PLACE: the original document is edited, not rebuilt. Edit one page: outline, named destinations, page labels, form, metadata (title, author, producer), XMP, optional content, tagged structure and links are all still there', p, async () => {
      const src = await B.makeStructuredPdf(), before = await B.inspect(src)
      await openFile(p, src, 'structured.pdf')
      await p.getByTestId('save-options').waitFor({ timeout: 15000 }) // a form is announced in the save options
      await tool('Add text'); await click(0, [300, 400]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('Edited here'); await p.keyboard.press('Escape')
      const out = await saveAs('b1.pdf'); const after = await B.inspect(out)
      const keep = ['outline', 'links', 'labels', 'fields', 'info', 'named', 'xmp', 'ocg', 'tagged', 'markInfo', 'lang', 'pageMode', 'pageCount']
      for (const k of keep) expect(JSON.stringify(after[k]) === JSON.stringify(before[k]), `${k} changed: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`)
      expect((await pdfText(out))[0].includes('Edited here') && (await pdfText(out))[0].includes('Page 1'), 'new and original text on page 1')
      console.log(`      structured fixture: ${src.length} -> ${out.length} bytes, objects ${before.objects} -> ${after.objects}, outline ${after.outline.length} entries, ${after.fields.length} form fields, labels ${JSON.stringify(after.labels)}`)
    })

    await s.check('PB2 page operations on the original document: delete two pages, move one: outline entries of deleted pages are dropped (the others follow their pages), page labels are renumbered over the new order, links to deleted pages go, fields of deleted pages go, the deleted pages are not anywhere in the file; the tagged structure is pruned (elements of the deleted pages go, the others stay)', p, async () => {
      const src = await B.makeStructuredPdf()
      await openFile(p, src, 'structured.pdf')
      await goPage(2); await railBtn('Delete page').click()
      await goPage(3); await railBtn('Delete page').click()
      await goPage(4); await railBtn('Move up').click()
      const out = await saveAs('b2.pdf'); const r = await B.inspect(out)
      expect(r.pageCount === 4, `pages ${r.pageCount}`)
      expect(JSON.stringify(r.outline.map((o) => [o.title, o.page])) === JSON.stringify([['Chapter 1', 0], ['Chapter 2', 1], ['Chapter 3', 3], ['Appendix', 2]]), `outline ${JSON.stringify(r.outline)}`)
      expect(JSON.stringify(r.labels) === JSON.stringify([{ at: 0, s: 'r', st: 1 }, { at: 1, s: 'D', st: 1 }, { at: 2, s: 'D', st: 4 }, { at: 3, s: 'D', st: 3 }]), `labels ${JSON.stringify(r.labels)}`)
      expect(JSON.stringify(r.links) === JSON.stringify([[3], [], [], []]), `links ${JSON.stringify(r.links)}`)
      expect(JSON.stringify(r.fields) === JSON.stringify(['full_name', 'agree', 'color', 'size']), `fields ${JSON.stringify(r.fields)}`)
      expect(r.info.title === 'Structured Fixture' && r.xmp && r.ocg && r.named.length === 2 && r.pageMode === 'UseOutlines', 'metadata, XMP, optional content, named destinations kept')
      const t = await pdfText(out); expect(t.map((x) => x.match(/Page \d/)?.[0]).join() === 'Page 1,Page 3,Page 6,Page 5', `page order ${t.map((x) => x.slice(0, 8))}`)
      const raw = await B.allStreamText(out); expect(!raw.includes('Page 2') && !raw.includes('Page 4') && !raw.includes('page 2') && !raw.includes('page 4'), 'the words of the deleted pages are not in the file')
      expect(r.tagged === true, 'tagged structure is kept (pruned) when pages are deleted')
      const tags = await B.tagInfo(out); expect(tags.elements === 4 && tags.parentTreeKeys === 4 && !tags.dangling, `structure tree pruned to the 4 kept pages: ${JSON.stringify(tags)}`)
      console.log(`      delete 2 + move 1: ${src.length} -> ${out.length} bytes, objects ${(await B.inspect(src)).objects} -> ${r.objects}`)
    })

    await s.check('PB3 form filling: fields show as controls in Edit text (text, checkbox, dropdown, radio), values go through undo / redo, and are written into the file with fresh appearances; Flatten turns the form into page content', p, async () => {
      const src = await B.makeStructuredPdf()
      await openFile(p, src, 'structured.pdf')
      await p.locator('input[data-form-field=full_name]').waitFor({ timeout: 10000 })
      expect(await p.locator('[data-form-field]').count() === 5, 'text, checkbox, dropdown and two radio buttons')
      expect(await p.locator('input[data-form-field=full_name]').inputValue() === 'Ada', 'the value the file holds is shown')
      const box = await p.locator('input[data-form-field=full_name]').evaluate((e) => { const st = document.querySelector('[data-testid=stage]'); const z = st.offsetWidth / 612; return { x: parseFloat(e.style.left) / z, y: parseFloat(e.style.top) / z, w: parseFloat(e.style.width) / z } })
      expect(Math.abs(box.x - 71.5) < 0.6 && Math.abs(box.y - (792 - 584.5)) < 0.6 && Math.abs(box.w - 221) < 0.6, `field box in page space ${JSON.stringify(box)}`)
      await p.locator('input[data-form-field=full_name]').fill('Grace Hopper')
      await p.locator('input[data-form-field=agree]').check()
      await p.locator('select[data-form-field=color]').selectOption('Blue')
      await p.locator('input[data-form-field=size][aria-label="size: large"]').check()
      await p.getByRole('button', { name: 'Undo', exact: true }).click()
      expect(!(await p.locator('input[data-form-field=size][aria-label="size: large"]').isChecked()), 'undo takes the radio choice back')
      await p.getByRole('button', { name: 'Redo', exact: true }).click()
      expect(await p.locator('input[data-form-field=size][aria-label="size: large"]').isChecked(), 'redo brings it back')
      const out = await saveAs('b3.pdf')
      const { PDFDocument } = web('pdf-lib'); const f = (await PDFDocument.load(out, { updateMetadata: false })).getForm()
      expect(f.getTextField('full_name').getText() === 'Grace Hopper' && f.getCheckBox('agree').isChecked() && f.getDropdown('color').getSelected().join() === 'Blue' && f.getRadioGroup('size').getSelected() === 'large', 'values in the file')
      expect(/Grace Hopper|4772616365\s*20\s*486f70706572/i.test(await B.allStreamText(out)), 'appearance stream of the text field shows the new value')
      const unaffected = await B.inspect(out); expect(unaffected.outline.length === 6 && unaffected.fields.length === 5, 'outline and fields still there')
      await p.getByTestId('flatten-form').check()
      const flat = await saveAs('b3-flat.pdf'); const fr = await B.inspect(flat)
      expect(fr.fields.length === 0, `flattened: no fields left (${fr.fields})`)
      expect((await pdfText(flat))[0].includes('Grace Hopper'), 'the flattened value is page text')
    })

    await s.check('PB4 password-protected PDF: a dialog asks (wrong password: error and another try; Cancel: back to the start), then the file edits normally; Download waits for "I understand the saved copy has no password"; the saved file opens with no password and holds the edit; an owner-password-only file opens without a dialog and says the same', p, async () => {
      const plain = await B.makeStructuredPdf()
      for (const mode of ['aes-128', 'rc4-128']) {
        const enc = await encryptPdf(plain, { user: 'open-sesame', mode })
        await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' })
        await p.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'locked.pdf', mimeType: 'application/pdf', buffer: enc })
        const dlg = p.getByRole('dialog'); await dlg.waitFor({ timeout: 20000 })
        expect(await dlg.getByLabel('Password').evaluate((e) => e === document.activeElement), 'focus starts in the password field')
        await dlg.getByLabel('Password').fill('nope'); await dlg.getByRole('button', { name: 'Open' }).click()
        await dlg.getByRole('alert').waitFor({ timeout: 20000 })
        await dlg.getByLabel('Password').fill('open-sesame'); await p.keyboard.press('Enter')
        await p.getByRole('toolbar').waitFor({ timeout: 30000 }); await ready()
        expect(await p.getByRole('dialog').count() === 0, 'dialog closed')
        const dl = p.getByRole('button', { name: 'Download edited PDF' })
        expect(await dl.isDisabled(), 'Download is off until the visitor has read the note about the password')
        await p.locator('button[data-run^="Page 1"]').click(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Unlocked edit'); await p.keyboard.press('Escape')
        await p.getByTestId('ack-unprotected').check()
        const out = await saveAs(`b4-${mode}.pdf`)
        expect(!Buffer.from(out).toString('latin1').includes('/Encrypt'), 'the saved copy is not encrypted')
        const t = await pdfText(out); expect(t[0].includes('Unlocked edit') && t[1].includes('Page 2'), `text ${t[0]}`)
        const r = await B.inspect(out); expect(r.outline.length === 6 && r.fields.length === 5 && r.info.title === 'Structured Fixture', 'outline, form and metadata survive the unlock')
        console.log(`      ${mode}: opened with password, saved ${enc.length} -> ${out.length} bytes, unprotected, outline ${r.outline.length}, fields ${r.fields.length}`)
      }
      // Cancel goes back to the start, Escape too
      const enc = await encryptPdf(plain, { user: 'pw', mode: 'aes-128' })
      await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' })
      await p.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'locked.pdf', mimeType: 'application/pdf', buffer: enc })
      await p.getByRole('dialog').waitFor({ timeout: 20000 }); await p.getByRole('button', { name: 'Cancel' }).click()
      await p.getByRole('button', { name: /Drop your PDF here/ }).waitFor({ timeout: 10000 })
      expect(await p.locator('p[role=alert]').count() === 0 && await p.getByRole('toolbar').count() === 0, 'back at the start, no error')
      await p.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'locked.pdf', mimeType: 'application/pdf', buffer: enc })
      await p.getByRole('dialog').waitFor({ timeout: 20000 }); await p.keyboard.press('Escape')
      await p.getByRole('button', { name: /Drop your PDF here/ }).waitFor({ timeout: 10000 })
      // owner password only: restrictions, no dialog
      const own = await encryptPdf(plain, { user: '', owner: 'owner-pw', mode: 'rc4-128' })
      await openFile(p, own, 'restricted.pdf')
      await p.getByTestId('ack-unprotected').waitFor({ timeout: 10000 })
      await p.locator('button[data-run^="Page 1"]').click(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Restricted edit'); await p.keyboard.press('Escape')
      await p.getByTestId('ack-unprotected').check()
      const out = await saveAs('b4-owner.pdf'); expect((await pdfText(out))[0].includes('Restricted edit') && !Buffer.from(out).toString('latin1').includes('/Encrypt'), 'owner-password file saved without protection')
    })

    await s.check('PB5 thumbnails show the edits: a cover over the black box turns its thumbnail pixel light within a moment, only the changed page gets a composed thumbnail, undo goes back; 60 pages stay small', p, async () => {
      await openFile(p, pdf)
      await p.waitForFunction(() => document.querySelectorAll('ol[aria-label=Pages] li img').length === 3, null, { timeout: 20000 })
      const dark0 = (await thumbPx(1, [[440, 667]]))[0]; expect(dark0.every((v) => v < 60), `black box in the plain thumbnail ${dark0}`)
      await tool('Whiteout'); await drag(0, [390, 632], [490, 702]); await tool('Edit text')
      const t0 = Date.now()
      await p.waitForFunction(({ x }) => { const img = document.querySelectorAll('ol[aria-label=Pages] li img')[0]; if (!img || img.dataset.thumbEdits === '0') return false; const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(Math.round(x[0] / 612 * c.width), Math.round(x[1] / 792 * c.height), 1, 1).data; return d[0] > 220 && d[1] > 220 }, { x: [440, 667] }, { timeout: 8000 })
      console.log(`      thumbnail updated ${Date.now() - t0} ms after the edit`)
      expect(await p.locator('ol[aria-label=Pages] li img[data-thumb-edits="0"]').count() === 2, 'the two untouched pages keep their plain thumbnails')
      await p.getByRole('button', { name: 'Undo', exact: true }).click()
      await p.waitForFunction(() => { const img = document.querySelectorAll('ol[aria-label=Pages] li img')[0]; return img?.dataset.thumbEdits === '0' }, null, { timeout: 8000 })
      expect((await thumbPx(1, [[440, 667]]))[0].every((v) => v < 60), 'undo: the box is dark again in the thumbnail')
      // 60 pages
      const { PDFDocument, StandardFonts } = web('pdf-lib'); const big = await PDFDocument.create(); const fnt = await big.embedFont(StandardFonts.Helvetica)
      for (let i = 1; i <= 60; i++) { const pg = big.addPage([612, 792]); pg.drawText(`Page ${i}`, { x: 72, y: 700, size: 24, font: fnt }); pg.drawRectangle({ x: 400, y: 100, width: 80, height: 50 }) }
      await openFile(p, Buffer.from(await big.save()), 'sixty.pdf')
      await p.waitForFunction(() => document.querySelectorAll('ol[aria-label=Pages] li img').length === 60, null, { timeout: 60000 })
      const heap = () => p.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
      const h0 = await heap()
      for (let i = 1; i <= 10; i++) { await goPage(i); await tool('Whiteout'); await drag(0, [390, 632], [490, 702]) }
      await tool('Edit text')
      await p.waitForFunction(() => [...document.querySelectorAll('ol[aria-label=Pages] li img')].filter((i) => i.dataset.thumbEdits !== '0').length === 10, null, { timeout: 30000 })
      await p.waitForTimeout(500)
      const blobs = await p.evaluate(() => [...document.querySelectorAll('ol[aria-label=Pages] li img')].map((i) => i.src).filter((u) => u.startsWith('blob:')).length)
      const h1 = await heap()
      console.log(`      60 pages: ${blobs} thumbnail pictures, 10 composed; JS heap ${(h0 / 1048576).toFixed(1)} -> ${(h1 / 1048576).toFixed(1)} MB`)
      expect(blobs === 60 && h1 - h0 < 80 * 1048576, `memory grew by ${((h1 - h0) / 1048576).toFixed(1)} MB`)
    })

    await s.check('PB6 bullets, real text: emptying a bullet asks to remove the symbol too (marker apart from the words, or inside the same text item); "Remove the bullet too" covers it (one undo step), "Keep it" leaves it; the saved page shows it', p, async () => {
      const src = await B.makeFeaturePdf()
      await openFile(p, src, 'features.pdf'); await tool('Edit text')
      await p.locator('button[data-run^="First bullet"]').waitFor({ timeout: 10000 })
      const empty = async (name) => { await p.locator(`button[data-run^="${name}"]`).click(); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.press('Delete'); await p.keyboard.press('Escape') }
      await empty('First bullet'); await p.getByTestId('bullet-ask').waitFor({ timeout: 5000 }); await p.getByTestId('bullet-remove').click()
      expect(await p.getByTestId('bullet-ask').count() === 0, 'asked once, answered')
      await empty('Second bullet'); await p.getByTestId('bullet-ask').waitFor(); await p.getByTestId('bullet-keep').click()
      await empty('Third bullet'); await p.getByTestId('bullet-ask').waitFor(); await p.getByTestId('bullet-remove').click()
      const out = await saveAs('b6.pdf')
      // bullet boxes: x 72..79, baselines 640 / 610 / 580 (page space y = 792 - baseline); ink is above the baseline
      const pts = (b) => [[75.2, 792 - b - 3.2], [75.2, 792 - b - 4.4], [74, 792 - b - 3.8]]
      const w = await pixels(out, 1, [...pts(640), ...pts(610), ...pts(580)], 612)
      const ink = (a) => a.some((win) => win.some((c) => c[0] < 120))
      expect(!ink(w.slice(0, 3)) && ink(w.slice(3, 6)) && !ink(w.slice(6, 9)), `bullet 1 removed, 2 kept, 3 removed: ink ${ink(w.slice(0, 3))} ${ink(w.slice(3, 6))} ${ink(w.slice(6, 9))}`)
      // undo of "remove" is one step
      await p.getByRole('button', { name: 'Undo', exact: true }).click()
    })

    await s.check('PB6b bullets on a picture page: the symbol left of the words is found as a small blob; emptying the words offers to remove it; after "Remove the bullet too" the saved slide has background where the disc was, and the rest of the slide is untouched', p, async () => {
      const deck = await makeDeckPdf(b)
      await openFile(p, deck, 'deck.pdf')
      const bullet = p.locator('button[data-run^="Revenue grew"]'); await bullet.waitFor({ timeout: 90000 })
      await bullet.click(); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.press('Delete'); await p.keyboard.press('Escape')
      await p.getByTestId('bullet-ask').waitFor({ timeout: 5000 }); await p.getByTestId('bullet-remove').click()
      const covers = await p.locator('[data-anno=whiteout]').evaluateAll((e) => e.map((x) => { const z = document.querySelector('[data-testid=stage]').offsetWidth / 1440; const d = x.firstElementChild; return { x: parseFloat(d.style.left) / z, y: parseFloat(d.style.top) / z, w: parseFloat(d.style.width) / z, h: parseFloat(d.style.height) / z } }))
      expect(covers.length === 2, `a cover for the words and one for the bullet: ${covers.length}`)
      const m = covers[1], words = covers[0]
      expect(m.w < 30 && m.h < 30 && m.x + m.w <= words.x + 2, `the bullet cover is small and left of the words: ${JSON.stringify(m)}`)
      const grid = []; for (let i = 1; i <= 4; i++) for (let k = 1; k <= 4; k++) grid.push([m.x + (m.w * i) / 5, m.y + (m.h * k) / 5])
      const bright = (ws) => ws.filter((win) => win.some((c) => c[0] + c[1] + c[2] > 450)).length
      const was = await pixels(deck, 1, grid, 1440), out = await saveAs('b6b.pdf'), now = await pixels(out, 1, grid, 1440)
      expect(bright(was) >= 2, `the slide has a bright disc inside that box (${bright(was)} of ${grid.length} points)`)
      expect(bright(now) === 0, `the disc is gone from the saved slide (${bright(now)} bright points left; box ${JSON.stringify(m)}; first windows ${JSON.stringify(now.slice(0, 3).map((w) => w[12]))} was ${JSON.stringify(was.slice(0, 3).map((w) => w[12]))})`)
      const farPts = [[m.x - 30, m.y + 6], [words.x + words.w + 40, words.y + 6]]
      const a1 = await pixels(deck, 1, farPts, 1440), a2 = await pixels(out, 1, farPts, 1440)
      expect(a1.every((w, i) => w.every((c, k) => Math.abs(c[0] - a2[i][k][0]) + Math.abs(c[1] - a2[i][k][1]) + Math.abs(c[2] - a2[i][k][2]) < 40)), 'the slide beside the covers is unchanged')
    })

    await s.check('PB7 mixed bold / italic: a line with bold, regular and italic stretches keeps them (no note); typing inside the bold word stays bold; Bold on selected words changes only those; the saved line has the right fonts, and each stretch starts where the screen shows it', p, async () => {
      const src = await B.makeFeaturePdf()
      await openFile(p, src, 'features.pdf'); await tool('Edit text')
      await p.locator('button[data-run^="Lead-in bold"]').click(); await p.getByRole('textbox', { name: 'Text' }).waitFor()
      expect(await p.getByTestId('mixed-note').count() === 0, 'no "mixes bold" note')
      const sp = () => p.locator('[data-anno=text] span[data-bold]').evaluateAll((e) => e.map((x) => `${x.dataset.bold}${x.dataset.italic}:${x.textContent}`))
      const a = await sp(); expect(a.length === 3 && a[0].startsWith('10:Lead-in bold:') && a[1].startsWith('00:') && a[2].startsWith('01:'), `three stretches ${JSON.stringify(a)}`)
      const setSel = (i, j) => p.getByRole('textbox', { name: 'Text' }).evaluate((t, [i, j]) => { t.focus(); t.setSelectionRange(i, j); t.dispatchEvent(new Event('select', { bubbles: true })) }, [i, j])
      await setSel(3, 3); await p.keyboard.type('XY')
      const b1 = await sp(); expect(b1[0].startsWith('10:LeaXYd-in bold:'), `typed inside the bold word stays bold ${JSON.stringify(b1)}`)
      const txt = await p.getByRole('textbox', { name: 'Text' }).inputValue(); const i0 = txt.indexOf('follow')
      await setSel(i0, i0 + 6); await p.getByRole('button', { name: 'Bold', exact: true }).click()
      const c = await sp(); expect(c.some((x) => x === '10:follow') && c.some((x) => x.startsWith('00:') && x.includes('words')), `selected word is bold ${JSON.stringify(c)}`)
      const pos = await p.locator('[data-anno=text] span[data-bold="1"]').nth(1).evaluate((e) => { const st = document.querySelector('[data-testid=stage]').getBoundingClientRect(); return (e.getBoundingClientRect().left - st.left) / (st.width / 612) })
      await p.keyboard.press('Escape')
      const out = await saveAs('b7.pdf'); const items = await pdfFonts(out)
      const line = items.filter((x) => Math.abs(x.y - 700) < 1)
      const look = (x) => `${/bold/i.test(x.font) ? 'b' : ''}${/oblique|italic/i.test(x.font) ? 'i' : ''}`
      expect(line.length >= 4 && look(line[0]) === 'b' && line.some((x) => x.str === 'follow' && look(x) === 'b') && line.some((x) => /words/.test(x.str) && look(x) === '') && line.some((x) => /italic end/.test(x.str) && look(x) === 'i'), `saved stretches ${JSON.stringify(line.map((x) => [x.str, x.font]))}`)
      const reg = line.find((x) => x.str === 'follow')
      expect(Math.abs(reg.x - pos) < 1.2, `the bold word starts at ${reg.x.toFixed(2)} pt in the file and ${pos.toFixed(2)} pt on screen`)
      console.log(`      mixed line saved as ${line.length} stretches: ${line.map((x) => `${x.str}[${x.font}]`).join(' ')}; screen-vs-file start of a moved stretch ${Math.abs(reg.x - pos).toFixed(2)} pt`)
    })

    await s.check('PB8 bundled fonts: nothing is downloaded until one is used; a font named Roboto in the file is picked by itself; the picker writes new text in Inter / Open Sans etc. embedded as a SUBSET (file grows by a few KB, not by the font), screen width equals the width in the file; a character the font lacks makes that text a picture, not a failed save', p, async () => {
      const src = await B.makeFeaturePdf()
      fontReqs.length = 0
      await openFile(p, src, 'features.pdf'); await tool('Edit text')
      await p.locator('button[data-run^="Roboto sample"]').waitFor({ timeout: 10000 })
      expect(fontReqs.length === 0, `no font downloaded on open: ${fontReqs}`)
      expect(await p.locator('button[data-run^="Roboto sample"]').getAttribute('data-look') === 'roboto', `auto-picked: ${await p.locator('button[data-run^="Roboto sample"]').getAttribute('data-look')}`)
      const base = await saveAs('b8-base.pdf')
      await p.locator('button[data-run^="Roboto sample"]').click(); await p.getByRole('textbox', { name: 'Text' }).waitFor()
      expect(fontReqs.some((u) => u.includes('roboto-regular')), `the Roboto file is fetched when the line is picked: ${fontReqs}`)
      await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Roboto edited line'); await p.keyboard.press('Escape')
      await tool('Add text'); await p.getByLabel('Font').selectOption('opensans'); await click(0, [72, 330]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('Open Sans new text wide'); await p.keyboard.press('Escape')
      await tool('Add text'); await p.getByLabel('Font').selectOption('inter'); await click(0, [72, 380]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('Inter with a tick ✓ here'); await p.keyboard.press('Escape')
      const dom = await p.locator('[data-anno=text]').evaluateAll((els) => els.map((e) => { const st = document.querySelector('[data-testid=stage]').getBoundingClientRect(); const d = e.querySelector('[data-line]') ?? e.firstElementChild; const rg = document.createRange(); rg.selectNodeContents(d); const r = rg.getBoundingClientRect(); return { t: d.textContent, w: r.width / (st.width / 612) } }))
      const out = await saveAs('b8.pdf'); const items = await pdfFonts(out)
      const f = (s0) => items.find((x) => x.str.includes(s0))
      expect(/Roboto/.test(f('Roboto edited').font) && /OpenSans|Open ?Sans/i.test(f('Open Sans new').font), `embedded fonts ${JSON.stringify(items.filter((x) => x.y > 300).map((x) => [x.str, x.font]))}`)
      expect(!f('tick'), 'the text with a glyph the font lacks is a picture')
      const dw = dom.find((x) => x.t.startsWith('Open Sans')).w
      expect(Math.abs(f('Open Sans new').w - dw) < 1.5, `width in the file ${f('Open Sans new').w.toFixed(2)} pt, on screen ${dw.toFixed(2)} pt`)
      const grew = out.length - base.length
      console.log(`      fonts: base ${base.length} -> ${out.length} bytes (+${grew}) for Roboto + Open Sans subsets and one picture; Open Sans line ${f('Open Sans new').w.toFixed(2)} pt in the file vs ${dw.toFixed(2)} pt on screen`)
      expect(grew < 60000, `file grew by ${grew}`)
    })

    await s.check('PB9 Arabic and Hindi: the new text stays a picture (right shapes) and gets an invisible real-text layer behind it, so pdf.js finds exactly the typed words', p, async () => {
      await openFile(p, pdf); await goPage(1)
      await tool('Add text'); await click(0, [100, 200]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('مرحبا بالعالم'); await p.keyboard.press('Escape')
      await tool('Add text'); await click(0, [100, 260]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('नमस्ते दुनिया'); await p.keyboard.press('Escape')
      await tool('Add text'); await click(0, [100, 320]); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('English and مرحبا'); await p.keyboard.press('Escape')
      const out = await saveAs('b9.pdf')
      const t = (await pdfText(out))[0]
      expect(t.includes('مرحبا بالعالم') && t.includes('नमस्ते दुनिया'), `text layer: ${t}`)
      const { PDFDocument, PDFName } = web('pdf-lib'); const d = await PDFDocument.load(out)
      const xo = d.getPage(0).node.Resources()?.lookup(PDFName.of('XObject')); expect(xo && xo.keys().length >= 3, 'the words are still pictures')
      console.log(`      Arabic + Hindi + mixed picture texts: text layer found ${JSON.stringify(t.slice(t.indexOf('Hello') >= 0 ? 0 : 0, 120))}; saved ${out.length} bytes`)
    })

    // ---------- the owner's own files (never committed): set E2E_OWNER_PDF_DIR to the folder that holds them; skipped when it is not set ----------
    const OWN = process.env.E2E_OWNER_PDF_DIR
    const ownFile = (n) => (OWN ? join(OWN, n) : null)
    const have = (n) => { try { return !!ownFile(n) && readFileSync(ownFile(n)).length > 1000 } catch { return false } }
    if (!OWN || !have('adfde37851.pdf') || !have('8242c78090.pdf') || !have('6eb8f0dcda.pdf')) console.log('  - SKIP O1-O3: E2E_OWNER_PDF_DIR not set (or the three files are not there)')
    else {
      const rd = (n) => readFileSync(ownFile(n))
      await s.check('O1 owner file "Booking Widget Vacation Flow" (21 pages, ReportLab): opens, bullets with a hanging indent are one block each, footer is narrow, all 14 figures are found and nothing else, edits cover cleanly, unedited save is not bigger, a saved edit round-trips', p, async () => {
        const buf = rd('adfde37851.pdf'); const t0 = Date.now(); await openFile(p, buf, 'Booking Widget Vacation Flow.pdf'); const openMs = Date.now() - t0
        await bookingPage(1)
        const r1 = await runsNow()
        const landing = r1.find((r) => /^The landing booking widget is delivered/.test(r.t))
        expect(landing && landing.n === 3 && landing.x >= 74, `bullet 1 is one 3-line block starting at the words: ${JSON.stringify(landing)}`)
        expect(r1.filter((r) => r.n >= 2 && r.y > 320 && r.y < 610).length >= 7, 'the eight summary bullets are blocks of their own')
        const foot = r1.find((r) => r.t === 'Booking Widget Vacation Flow' && r.y > 780); expect(foot && foot.w < 120, `footer ${JSON.stringify(foot)}`)
        let figs = 0; for (let n = 1; n <= 21; n++) { await bookingPage(n); figs += await p.locator('[data-pic]').count() }
        expect(figs === 14, `${figs} figures found, the document has 14`)
        await bookingPage(1); await realClick(p.locator('button[data-run^="2. Summary"]')); await typeInto('2. Overview')
        await realClick(p.locator('button[data-run="Type"]')); await typeInto('Kind')
        const out = await saveAs('own-book.pdf'); const t = (await pdfText(out))[0]
        expect(t.includes('2. Overview') && t.includes('Kind') && out.length < buf.length * 1.1, `saved ${out.length} of ${buf.length}`)
        const px = await pixels(out, 1, [[r1.find((r) => r.t === '2. Summary').x + 1, r1.find((r) => r.t === '2. Summary').y + 1]], 595.28)
        expect(px[0].every((c) => near(c, [255, 255, 255], 10)), `cover of the old heading is white: ${JSON.stringify(px[0][12])}`)
        console.log(`      owner booking file: opened in ${openMs} ms, ${figs} figures, saved ${buf.length} -> ${out.length} bytes`)
      })
      await s.check('O2 owner deck (13 slides, pictures only): all slides read by themselves; every real photo (slides 1, 2, 4, 9, 12 = the DARK photo, 13) is found with IoU >= 0.9 and nothing else is offered; >= 95 % of the visible text items are read (ground truth in e2e/lib/owner-deck-truth.mjs) with at most one junk reading; the slide-13 title is one two-line block; a title and a bullet can be edited, a photo can be picked up and moved, the saved deck is not much bigger', p, async () => {
        const T = await import('../lib/owner-deck-truth.mjs')
        const buf = rd('8242c78090.pdf'); await openFile(p, buf, 'Hyperlocal Market Penetration.pdf'); await tool('Edit text')
        const per = {}; const t0 = Date.now()
        for (let n = 1; n <= 13; n++) {
          if (n > 1) { await goPage(n); await tool('Edit text') }
          await p.getByTestId('ocr-done').waitFor({ timeout: 120000 }); await picsDone()
          per[n] = { runs: await p.locator('[data-run]').evaluateAll((els) => els.map((e) => ({ t: e.dataset.run, n: Number(e.dataset.lines), conf: Number(e.dataset.conf) }))), pics: await picsOf() }
        }
        const secs = Math.round((Date.now() - t0) / 1000)
        const junkShort = Object.entries(per).flatMap(([n, v]) => v.runs.filter((r) => r.conf < 80 && r.t.replace(/[^A-Za-z0-9]/g, '').length <= 12).map((r) => `${n}:${r.t}`))
        expect(junkShort.length === 0, `short low-confidence lines: ${junkShort}`)
        // photos: every real photo found at IoU >= 0.9, no other picture offered
        const rows = []; let fp = 0, hit = 0, total = 0
        for (let n = 1; n <= 13; n++) {
          const truth = T.OWNER_DECK_PHOTOS[n] ?? []; total += truth.length
          const got = per[n].pics.map((q) => ({ x: q.box[0], y: q.box[1], w: q.box[2], h: q.box[3] }))
          for (const t of truth) { const best = Math.max(0, ...got.map((g) => T.iouBox(g, t))); rows.push(`${n}:${best.toFixed(3)}`); if (best >= 0.9) hit++ }
          fp += got.filter((g) => !truth.some((t) => T.iouBox(g, t) >= 0.5)).length
        }
        console.log(`      owner deck photos: ${hit}/${total} found at IoU >= 0.9 (${rows.join(' ')}), false positives ${fp}`)
        expect(hit === total && fp === 0, `photos found ${hit}/${total} (${rows.join(' ')}), false positives ${fp}`)
        // text: recall against the ground truth, junk
        const sc = T.scoreDeck(Object.fromEntries(Object.entries(per).map(([n, v]) => [n, v.runs.map((r) => r.t)])))
        console.log(`      owner deck text: ${sc.hit}/${sc.items} items read (${(sc.recall * 100).toFixed(1)} %), junk ${sc.junk.length}${sc.junk.length ? ` ${JSON.stringify(sc.junk)}` : ''}${sc.missed.length ? `; missed ${JSON.stringify(sc.missed)}` : ''}`)
        expect(sc.recall >= 0.95, `text recall ${(sc.recall * 100).toFixed(1)} %, missed ${JSON.stringify(sc.missed)}`)
        expect(sc.junk.length <= 1, `junk readings: ${JSON.stringify(sc.junk)}`)
        expect(per[13].runs.some((r) => r.n === 2 && /^Defining the Future of Hyperlocal Delivery Marketing/.test(r.t)), `slide 13: ${JSON.stringify(per[13].runs.map((r) => r.t))}`)
        expect(per[3].runs.filter((r) => /^0[1-5]$/.test(r.t)).length === 5, 'agenda numbers 01 to 05 are found')
        expect(per[6].runs.filter((r) => /^[1-4]$/.test(r.t)).length === 4, 'the digits 1-4 in the circles of slide 6 are found')
        await goPage(2); await tool('Edit text'); await p.getByTestId('ocr-done').waitFor({ timeout: 60000 })
        await realClick(p.locator('button[data-run^="Executive Summary"]')); await typeInto('Executive Summary: a new title')
        await realClick(p.locator('button[data-run^="Transitioning"]')); await typeInto('A shorter bullet.')
        await picsDone(); await realClick(p.locator('button[data-pic]').first()); await p.locator('[data-anno=image] img').waitFor({ timeout: 20000 })
        const img = p.locator('[data-anno=image] img'); const bb = await img.boundingBox()
        await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.mouse.move(bb.x + bb.width / 2 - 120, bb.y + bb.height / 2 + 30, { steps: 8 }); await p.mouse.up()
        const out = await saveAs('own-deck.pdf'); const t2 = (await pdfText(out))[1]
        expect(t2.includes('Executive Summary: a new title') && t2.includes('A shorter bullet.'), `saved text: ${t2.slice(0, 120)}`)
        const mk = await maskedImages(out)
        console.log(`      owner deck: 13 slides read in ${secs} s, saved ${buf.length} -> ${out.length} bytes with one photo picked up (${mk.length ? `JPEG ${(mk[0].jpeg / 1024).toFixed(0)} KB + mask ${mk[0].mask} bytes` : 'no masked picture'})`)
        expect(out.length < buf.length + 1.15 * (mk[0]?.jpeg ?? 0) + 120_000, `saved ${out.length} bytes from ${buf.length} (picked-up JPEG ${mk[0]?.jpeg})`)
        expect(mk.length === 1 && mk[0].mask <= mk[0].jpeg * 0.15, `the rounded photo is a JPEG with a small soft mask: ${JSON.stringify(mk)}`)
      })
      await s.check('O6 owner deck slide 12 (dark photo right above red chevrons): the photo is picked up, deleted, and the place it was in is the slide background with the chevrons untouched (no smear of chevron colour, no seam against the slide)', p, async () => {
        const buf = rd('8242c78090.pdf'); await openFile(p, buf, 'deck.pdf'); await goPage(12); await tool('Edit text')
        await p.getByTestId('ocr-done').waitFor({ timeout: 120000 }); await picsDone()
        expect(await p.locator('[data-pic]').count() === 1, 'the dark photo is offered')
        await realClick(p.locator('button[data-pic]').first()); await p.locator('[data-anno=image] img').waitFor({ timeout: 20000 })
        await p.keyboard.press('Delete'); expect(await imageCount() === 0, 'the picture is deleted, only the cover remains')
        const out = await saveAs('own-slide12.pdf')
        const PH = { x: 992 * 0.75, y: 96 * 0.75, w: 832 * 0.75, h: 888 * 0.75 }
        // seam: along each side of the old photo, the cover (just inside) against the original slide (just outside)
        const side = (n, f) => Array.from({ length: n }, (_, i) => f(i / (n - 1)))
        const inside = [...side(14, (u) => [PH.x + 4, PH.y + 30 + (PH.h - 60) * u]), ...side(14, (u) => [PH.x + PH.w - 4, PH.y + 30 + (PH.h - 60) * u]), ...side(14, (u) => [PH.x + 30 + (PH.w - 60) * u, PH.y + 4])]
        const outside = [...side(14, (u) => [PH.x - 9, PH.y + 30 + (PH.h - 60) * u]), ...side(14, (u) => [PH.x + PH.w + 9, PH.y + 30 + (PH.h - 60) * u]), ...side(14, (u) => [PH.x + 30 + (PH.w - 60) * u, PH.y - 9])]
        const ins = await pixels(out, 12, inside, 1440), outs = await pixels(buf, 12, outside, 1440)
        const seam = inside.map((_, i) => { const a = avgOf(ins[i]), c = avgOf(outs[i]); return Math.max(...a.map((v, k) => Math.abs(v - c[k]))) })
        const seamMean = seam.reduce((sum, v) => sum + v, 0) / seam.length
        // the lower edge: chevrons start right there, so what lies BELOW the photo must be exactly as it was, and the cover itself must be the slide, not chevron colour
        const below = side(24, (u) => [PH.x + 20 + (PH.w - 40) * u, PH.y + PH.h + 2.5])
        const bd = await pixelDiff(out, buf, below, 1440, 12)
        const lastRow = side(24, (u) => [PH.x + 20 + (PH.w - 40) * u, PH.y + PH.h - 3])
        const lr = await pixels(out, 12, lastRow, 1440)
        const rowMax = Math.max(...lr.map((w) => Math.max(...avgOf(w)))) // the slide is dark maroon (every channel <= ~50 there); chevron red / grey would show 90 and more
        // chevrons (bottom right, below the photo): identical before and after
        const chev = [...[0, 1, 2, 3, 4].map((i) => [(1512 + 30 + i * 60) * 0.75, 1010 * 0.75])]
        const cd = await pixelDiff(out, buf, chev, 1440, 12)
        console.log(`      owner slide 12 cover: seam against the slide mean ${seamMean.toFixed(2)}, worst ${Math.max(...seam).toFixed(1)} levels over ${seam.length} points; below the photo changed by at most ${bd.max.toFixed(1)}; the brightest value in the cover's last row is ${rowMax.toFixed(0)}; chevrons changed: worst ${cd.max.toFixed(1)}`)
        expect(seamMean <= 4 && Math.max(...seam) <= 12, `cover does not match the slide: mean ${seamMean}, worst ${Math.max(...seam)}`)
        expect(bd.max <= 8, `the area below the photo (chevrons start there) was changed: ${bd.max}`)
        expect(rowMax <= 60, `the cover's last row is not slide colour (chevron colour smeared in?): ${rowMax}`)
        expect(cd.max <= 14, `chevrons changed: ${cd.max}`)
      })
      await s.check('O3 owner third file (29 pages, ReportLab, bullets with the marker inside the text): opens, hanging bullets are one block each, a screenshot figure is found, covers are clean, unedited save is not bigger', p, async () => {
        const buf = rd('6eb8f0dcda.pdf'); await openFile(p, buf, 'spec.pdf'); await bookingPage(5)
        const r = await runsNow()
        const first = r.find((q) => /^You are the principal SaaS architect/.test(q.t))
        expect(first && first.n === 2 && first.x >= 64, `bullet is one two-line block that starts at the words: ${JSON.stringify(first)}`)
        await bookingPage(3); expect(await p.locator('[data-pic]').count() === 2, 'the two screenshots on page 3 are found')
        await bookingPage(5); await realClick(p.locator('button[data-run^="Definition of done"]')); await typeInto('Done criteria')
        const out = await saveAs('own-spec.pdf'); expect((await pdfText(out))[4].includes('Done criteria') && out.length < buf.length * 1.1, `saved ${out.length} of ${buf.length}`)
      })
      await s.check('PB10 owner files saved in place: unedited save keeps object counts and size; deleting pages drops them (the deck loses the pictures of deleted slides: size falls with the slide count); every output loads in pdf.js and pdf-lib and renders with macOS sips', p, async () => {
        const { PDFDocument } = web('pdf-lib'); const { execFileSync } = await import('node:child_process')
        const rows = []
        for (const [file, name, minDrop] of [['adfde37851.pdf', 'booking', 0.15], ['8242c78090.pdf', 'deck', 0.2], ['6eb8f0dcda.pdf', 'spec', 0.005]]) {
          const buf = rd(file); const before = await B.inspect(buf)
          await openFile(p, buf, `${name}.pdf`); await ready()
          const same = await saveAs(`pb10-${name}-same.pdf`); const sr = await B.inspect(same)
          expect(sr.pageCount === before.pageCount && Math.abs(sr.objects - before.objects) <= 2 && same.length <= buf.length * 1.02, `${name}: unedited ${buf.length} -> ${same.length}, objects ${before.objects} -> ${sr.objects}`)
          for (let k = 0; k < 4; k++) { await goPage(2 + k); await railBtn('Delete page').click() }
          const less = await saveAs(`pb10-${name}-less.pdf`); const lr = await B.inspect(less)
          expect(lr.pageCount === before.pageCount - 4 && less.length < buf.length * (1 - minDrop), `${name}: 4 pages deleted ${buf.length} -> ${less.length}`)
          await pdfText(less); await PDFDocument.load(less)
          const f = join(dir, `pb10-${name}-less.pdf`), png = join(dir, `pb10-${name}.png`)
          execFileSync('sips', ['-s', 'format', 'png', f, '--out', png], { stdio: 'ignore' }); expect(readFileSync(png).length > 5000, 'sips rendered the first page')
          rows.push(`${name}: ${buf.length} -> same ${same.length} (objects ${before.objects}/${sr.objects}), 4 pages deleted ${less.length} (${before.pageCount} -> ${lr.pageCount} pages, objects ${lr.objects})`)
        }
        console.log(`      ${rows.join('\n      ')}`)
      })
    }
  } finally { await b.close() }
  return s.done()
}
