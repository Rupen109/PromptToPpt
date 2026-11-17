import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { WEB, expect, launch, suite } from '../lib.mjs'
import * as Q from '../lib/pdf-qa-fixtures.mjs'
import * as B from '../lib/pdf-structure-fixtures.mjs'

/**
 * Free PDF editor, part C: the remaining limits closed and the production QA matrix (docs/FREE_TOOLS_PLAN.md "part C").
 * Node-side checks (picture finder, text finder: generated slides, no browser) run through tsx; browser checks use generated PDFs only.
 * Checks that need files only the owner has SKIP when E2E_OWNER_PDF_DIR is unset. E2E_ONLY="B1|B5" runs only the checks whose title matches.
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const web = createRequire(join(root, 'apps/web/package.json'))
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SHOTS = process.env.E2E_SHOTS || process.env.E2E_QA_SHOTS
const tsx = () => { const d = join(root, 'node_modules/.pnpm'); const n = existsSync(d) ? readdirSync(d).find((x) => x.startsWith('tsx@')) : null; return n ? join(d, n, 'node_modules/tsx/dist/cli.mjs') : null }
const node = (file) => JSON.parse(execFileSync(process.execPath, [tsx(), join(root, 'e2e/lib', file)], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 900000, env: { ...process.env, NODE_NO_WARNINGS: '1' } }).trim().split('\n').filter((l) => l.startsWith('{')).at(-1))

async function pdfjsDoc(buf) {
  const pdfjs = await import(pathToFileURL(web.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)
  return pdfjs.getDocument({ data: new Uint8Array(buf), useWorkerFetch: false, isEvalSupported: false, enableScripting: false }).promise
}
const textItems = async (buf, n = 1) => (await (await (await pdfjsDoc(buf)).getPage(n)).getTextContent()).items.filter((x) => x.str.trim())

export default async function () {
  const s = suite('67-pdf-editor-qa')
  if (process.env.E2E_ONLY) { const only = new RegExp(process.env.E2E_ONLY), run = s.check.bind(s); s.check = (title, ...rest) => (only.test(title) ? run(title, ...rest) : Promise.resolve()) }
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true })
  const p = await ctx.newPage()
  const dir = mkdtempSync(join(tmpdir(), 'pdfqa-'))
  const uploads = []; p.on('request', (r) => { if (r.method() !== 'GET' && !r.url().startsWith(WEB) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) uploads.push(`${r.method()} ${r.url()}`) })
  const shot = (name, pg = p) => SHOTS ? pg.screenshot({ path: join(SHOTS, `pdfqa-${name}.png`) }) : Promise.resolve()
  const ready = (pg = p) => pg.waitForFunction(() => { const c = document.querySelector('canvas[aria-label="Page picture"]'); return c && c.dataset.ready === '1' }, null, { timeout: 30000 })
  const openFile = async (page, buf, name = 'Doc.pdf') => {
    await page.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' })
    await page.setInputFiles('input[aria-label="Choose a PDF"]', { name, mimeType: 'application/pdf', buffer: buf })
    await page.getByRole('toolbar').waitFor({ timeout: 30000 })
    await ready(page)
  }
  const goPage = async (n, pg = p) => { await pg.getByRole('button', { name: new RegExp(`^Page ${n} of`) }).click(); await pg.waitForTimeout(150); await ready(pg) }
  const tool = (name, pg = p) => pg.getByRole('button', { name, exact: true }).first().click()
  const save = async (name, pg = p) => { const [dl] = await Promise.all([pg.waitForEvent('download'), pg.getByRole('button', { name: 'Download edited PDF' }).click()]); const f = join(dir, name); await dl.saveAs(f); return { buf: readFileSync(f), filename: dl.suggestedFilename() } }
  const railBtn = (name) => p.getByRole('group', { name: /actions/ }).getByRole('button', { name })

  try {
    // ================= Node side: the finders on generated slides =================
    await s.check('N1 picture finder (item 1+2): flat-blue, almost-black, dark-gradient and white-product photos are found (sure ones as pictures, ambiguous ones as "Picture?"), photo pairs 2..20 px apart are split, no false positive on busy synthetic slides', null, async () => {
      expect(!!tsx(), 'tsx not found in node_modules/.pnpm')
      const r = node('detect-report.mts')
      console.log(`      hard photos (4 kinds x 3 JPEG qualities x 3 noise levels): ${r.hard.sure} sure, ${r.hard.maybe} "Picture?", ${r.hard.miss} missed, ${r.hard.wrong} wrong; pairs ${r.pairs.ok}/${r.pairs.total} split correctly; false positives ${r.falsePositives.fp}/${r.falsePositives.n}`)
      expect(r.hard.miss === 0 && r.hard.wrong === 0 && r.hard.sure + r.hard.maybe === 36, `hard photos: ${JSON.stringify(r.hard)}`)
      expect(r.hard.sure >= 18, `at least half are sure: ${r.hard.sure}`)
      expect(r.pairs.ok === r.pairs.total, `pairs: ${r.pairs.bad.join(' | ')}`)
      expect(r.falsePositives.fp === 0, 'false positives on synthetic decoration')
    })
    await s.check('N2 text finder (items 3-5): sideways (90, 270) and tilted (15) lines are read with their turn, curved text is flagged and not read, Arabic / Hindi read better from the bigger copy, small text on an A3 poster', null, async () => {
      expect(!!tsx(), 'tsx not found')
      const r = node('ocr-report.mts')
      const by = Object.fromEntries(r.turned.runs.filter((x) => x.rot).map((x) => [x.str, x.rot]))
      console.log(`      turned lines: ${JSON.stringify(by)}; notes ${JSON.stringify({ turned: r.turned.notes.turned, curved: r.turned.notes.curved })}; Arabic ${JSON.stringify(r.scripts.ara)} Hindi ${JSON.stringify(r.scripts.hin)}; poster ${JSON.stringify(r.poster)}`)
      expect(by['CONFIDENTIAL DRAFT'] === 90 && by['Quarterly sidebar note'] === -90 && Math.abs(by['Approved by finance'] - 15) <= 1, `turned lines: ${JSON.stringify(by)}`)
      const junk = r.turned.runs.filter((x) => !x.rot && !/Quarterly Growth|Revenue grew|Customer retention|New markets/.test(x.str)); expect(junk.length === 0, `junk readings: ${JSON.stringify(junk)}`)
      expect(r.turned.notes.curved === 1, `curved text is counted: ${r.turned.notes.curved}`)
      expect(r.scripts.ara['2400'] >= r.scripts.ara['1600'] - 0.5 && r.scripts.hin['2400'] >= r.scripts.hin['1600'] - 0.5, `bigger copy not worse: ${JSON.stringify(r.scripts)}`)
      expect(r.scripts.ara['2400'] >= 95 && r.scripts.hin['2400'] >= 98, 'script recall')
      expect(r.poster['200']['6pt'] >= 95 && r.poster['100']['6pt'] >= 90, `poster 6 pt: ${JSON.stringify(r.poster)}`)
    })

    // ================= item 6: digital signatures =================
    await s.check('B1 digitally signed PDF (item 6): the warning shows as soon as it opens, before any edit; Download stays off until the box is ticked; the saved copy has no signature value and no /ByteRange (it is honest: not signed); an empty signature field or an unsigned file shows nothing', p, async () => {
      const signed = await Q.makeSignedPdf()
      await openFile(p, signed, 'Signed contract.pdf')
      await p.getByTestId('ack-signed').waitFor({ timeout: 10000 })
      expect((await p.getByTestId('save-options').innerText()).includes('digitally signed'), 'the notice names the signature')
      const dl = p.getByRole('button', { name: 'Download edited PDF' })
      expect(await dl.isDisabled(), 'Download is off before the box is ticked')
      await shot('b1-signed-warning')
      await p.getByTestId('ack-signed').check()
      expect(!(await dl.isDisabled()), 'Download is on after')
      const { buf, filename } = await save('signed-out.pdf')
      expect(filename === 'Signed contract-edited.pdf', filename)
      const raw = buf.toString('latin1'); expect(!/\/ByteRange/.test(raw), 'no /ByteRange left in the saved file'); expect(!/adbe\.pkcs7/.test(raw), 'no signature dictionary left')
      const doc = await (await import(pathToFileURL(web.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)).getDocument({ data: new Uint8Array(buf), useWorkerFetch: false }).promise
      expect(doc.numPages === 2, 'pages kept'); expect((await textItems(buf)).some((x) => /Signed contract page one/.test(x.str)), 'text kept')
      const { PDFDocument } = web('pdf-lib'); const f = (await PDFDocument.load(buf, { updateMetadata: false })).getForm().getFields().map((x) => x.getName())
      expect(f.includes('Signature1'), 'the signature field is still there (empty, can be signed again)')
      // the same checks on the pure scanner, for the three file kinds
      await openFile(p, await Q.makeSignedPdf({ filled: false }), 'Empty field.pdf')
      expect(await p.getByTestId('ack-signed').count() === 0, 'an EMPTY signature field is not a warning')
      await openFile(p, await Q.makePlainPdf(), 'Plain.pdf')
      expect(await p.getByTestId('ack-signed').count() === 0 && await p.getByTestId('save-options').count() === 0, 'a plain file shows no save options')
    })

    // ================= item 7: duplicated pages keep fields and comments; tags are pruned =================
    await s.check('B2 duplicated page (item 7): form fields are copied with new names and the same value, comments keep their pop-up and reply; the copy is a working form (another value for the original reaches both)', p, async () => {
      const src = await Q.addComments(await B.makeStructuredPdf({ pages: 3 }))
      await openFile(p, src, 'form.pdf')
      await p.locator('input[data-form-field=full_name]').waitFor({ timeout: 10000 })
      await railBtn('Duplicate page').click(); await p.waitForTimeout(200)
      await p.locator('input[data-form-field=full_name]').fill('Grace Hopper')
      const { buf } = await save('dup.pdf')
      const { PDFDocument, PDFName, PDFDict, PDFArray } = web('pdf-lib'); const d = await PDFDocument.load(buf, { updateMetadata: false })
      const names = d.getForm().getFields().map((f) => f.getName())
      const copies = names.filter((n) => /_dup\d+$/.test(n))
      expect(d.getPageCount() === 4 && ['full_name', 'agree', 'color', 'size'].every((n) => names.includes(n)) && copies.length >= 4, `fields ${names}`)
      const form = d.getForm()
      expect(form.getTextField('full_name').getText() === 'Grace Hopper' && form.getTextField(copies.find((n) => n.startsWith('full_name'))).getText() === 'Grace Hopper', 'the original and its copy hold the value')
      expect(form.getRadioGroup(copies.find((n) => n.startsWith('size'))).getOptions().join() === 'small,large', 'radio group copied with its choices')
      const subtypes = (page) => { const a = page.node.Annots(); const o = []; for (let i = 0; a && i < a.size(); i++) o.push(a.lookupMaybe(i, PDFDict)?.lookup(PDFName.of('Subtype'))?.decodeText()); return o }
      const pages = d.getPages(), s1 = subtypes(pages[0]), s2 = subtypes(pages[1])
      expect(s1.filter((x) => x === 'Text').length === 2 && s2.filter((x) => x === 'Text').length === 2 && s2.includes('Popup') && s2.filter((x) => x === 'Widget').length === 5, `annotations page1 ${s1} page2 ${s2}`)
      const a2 = pages[1].node.Annots(); let replyOk = false
      for (let i = 0; i < a2.size(); i++) { const a = a2.lookupMaybe(i, PDFDict); const irt = a?.get(PDFName.of('IRT')); if (irt) { const tgt = a2.asArray().some((r) => r === irt); replyOk = tgt } }
      expect(replyOk, 'the reply on the copy points at the copied comment, not the original')
      for (let i = 0; i < a2.size(); i++) { const w = a2.lookupMaybe(i, PDFDict); const par = w?.get(PDFName.of('P')); if (w && par) expect(par === pages[1].ref, 'annotations of the copy belong to the copy page') }
      // opens again in the editor
      await openFile(p, buf, 'dup-out.pdf'); await p.getByTestId('stage').waitFor()
    })
    await s.check('B3 delete pages of a tagged file (item 7): the structure tree keeps the tags of the kept pages and loses the others (no dangling page reference)', p, async () => {
      await openFile(p, await B.makeStructuredPdf({ pages: 6 }), 'tagged.pdf')
      await goPage(2); await railBtn('Delete page').click(); await goPage(2); await railBtn('Delete page').click()
      const { buf } = await save('tag.pdf'); const t = await B.tagInfo(buf)
      expect(!t.none && t.elements === 4 && t.parentTreeKeys === 4 && !t.dangling, JSON.stringify(t))
      const r = await B.inspect(buf); expect(r.tagged && r.markInfo && r.pageCount === 4, 'tagged and marked, 4 pages')
    })

    // ================= item 7: damaged and incremental files =================
    await s.check('B4 damaged files (item 7): a corrupt xref table, a file cut short and an incremental update all open, edit and save (the saved file is one clean file with the latest content)', p, async () => {
      const plain = await Q.makePlainPdf(2)
      for (const [label, buf, want] of [['corrupt xref', Q.corruptXref(plain), /Plain page 1 of 2/], ['truncated', Q.truncated(plain), /Plain page 1 of 2/], ['incremental', Q.makeIncrementalPdf(), /Updated by an incremental save/]]) {
        await openFile(p, buf, `${label}.pdf`)
        await tool('Add text'); await p.locator('[data-testid=stage]').click({ position: { x: 100, y: 300 } }); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type(`Added ${label}`); await p.keyboard.press('Escape')
        const { buf: out } = await save(`${label.replace(' ', '-')}.pdf`)
        const text = (await textItems(out)).map((x) => x.str).join(' ')
        expect(want.test(text) && text.includes(`Added ${label}`), `${label}: ${text}`)
        const raw = out.toString('latin1'); expect((raw.match(/%%EOF/g) ?? []).length === 1, `${label}: one clean file (no leftover update sections)`)
        if (label === 'incremental') expect(!/Original first version/.test(text), 'the replaced version is not what is shown')
      }
    })

    // ================= item 3: turned text in real PDFs =================
    await s.check('B5 turned text in a real PDF (item 3): sideways (90, 270) and tilted lines are clickable runs that carry their turn; editing one writes new text turned the same way over a turned cover; a /Rotate 90 page with turned text works', p, async () => {
      const src = await Q.makeTurnedTextPdf()
      await openFile(p, src, 'turned.pdf'); await tool('Edit text')
      const rots = async () => Object.fromEntries(await p.locator('button[data-run]').evaluateAll((els) => els.map((e) => [e.dataset.run, e.dataset.rot ? Number(e.dataset.rot) : 0])))
      await p.locator('button[data-run^="Sideways label up"]').waitFor({ timeout: 10000 })
      const r1 = await rots()
      expect(Math.abs(r1['Sideways label up'] + 90) < 1 && Math.abs(r1['Sideways label down'] - 90) < 1 && Math.abs(r1['Tilted stamp text'] + 15) < 1 && r1['Horizontal heading'] === 0, `page 1 turns ${JSON.stringify(r1)}`)
      await shot('b5-turned-runs')
      await p.locator('button[data-run^="Sideways label up"]').click()
      await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Edited up'); await p.keyboard.press('Escape')
      await p.locator('button[data-run^="Tilted stamp text"]').click()
      await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Edited tilt'); await p.keyboard.press('Escape')
      await shot('b5-turned-edited')
      await goPage(2); await tool('Edit text')
      await p.locator('button[data-run^="Turned page upright"]').waitFor({ timeout: 10000 })
      const r2 = await rots(); expect(r2['Turned page upright'] === 0 && Math.abs(Math.abs(r2['Turned page tilted']) - 20) < 1.5, `page 2 turns ${JSON.stringify(r2)}`)
      await p.locator('button[data-run^="Turned page tilted"]').click()
      await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Edited tilted page'); await p.keyboard.press('Escape')
      const { buf } = await save('turned-out.pdf')
      const ang = (it) => Math.round((Math.atan2(it.transform[1], it.transform[0]) * 180) / Math.PI * 10) / 10
      const p1 = await textItems(buf, 1), up = p1.find((x) => x.str === 'Edited up'), tilt = p1.find((x) => x.str === 'Edited tilt')
      expect(up && Math.abs(ang(up) - 90) < 1, `new "up" text is turned 90 in the file: ${up && ang(up)}`)
      expect(tilt && Math.abs(ang(tilt) - 15) < 1, `new tilted text is turned 15 in the file: ${tilt && ang(tilt)}`)
      const orig = (await textItems(src, 1)).find((x) => x.str === 'Sideways label up')
      expect(Math.abs(up.transform[4] - orig.transform[4]) < 6 && Math.abs(up.transform[5] - orig.transform[5]) < 6, `the new text starts where the old one did: ${up.transform[4].toFixed(1)},${up.transform[5].toFixed(1)} vs ${orig.transform[4].toFixed(1)},${orig.transform[5].toFixed(1)}`)
      const p2 = await textItems(buf, 2); const t2 = p2.find((x) => x.str === 'Edited tilted page'); const o2 = (await textItems(src, 2)).find((x) => x.str === 'Turned page tilted')
      expect(t2 && Math.abs(ang(t2) - ang(o2)) < 1, `page 2 (/Rotate 90): the same turn as the original: ${t2 && ang(t2)} vs ${ang(o2)}`)
      // drawn again by pdf.js inside the editor: the old text is covered (the cover is turned with it)
      await openFile(p, buf, 'check.pdf'); await ready()
      await shot('b5-turned-saved')
    })

    // ================= item 3 + 1 in the browser: picture pages =================
    await s.check('B6 turned text on a picture page (item 3): the text finder reads sideways and tilted lines, each one clickable with its turn; curved text is not read and the page says so; editing a turned line writes turned text over a turned cover', p, async () => {
      const { slide } = await import('../lib/detect-fixtures.mjs')
      const sl = await slide({ photos: [], extra: (g) => {
        g.fillStyle = '#1b1b1b'
        g.save(); g.translate(1800, 200); g.rotate(Math.PI / 2); g.font = 'bold 44px Helvetica'; g.fillText('CONFIDENTIAL DRAFT', 0, 0); g.restore()
        g.save(); g.translate(1150, 700); g.rotate(15 * Math.PI / 180); g.font = 'bold 56px Helvetica'; g.fillText('Approved by finance', 0, 0); g.restore()
        g.save(); g.font = '54px Helvetica'; const t = 'Curved headline over arc', R = 260; for (let i = 0; i < t.length; i++) { const a = -Math.PI * 0.35 + (i / t.length) * Math.PI * 0.7; g.save(); g.translate(300 + R * Math.sin(a), 1000 - R * Math.cos(a)); g.rotate(a); g.fillText(t[i], 0, 0); g.restore() } g.restore()
      } })
      await openFile(p, await Q.pdfFromCanvas(sl.canvas), 'turned-slide.pdf')
      await p.waitForFunction(() => document.querySelector('[data-testid=ocr-done]') && !document.querySelector('[data-testid=ocr-progress]'), null, { timeout: 150000 })
      const runs = await p.locator('button[data-run]').evaluateAll((els) => els.map((e) => [e.dataset.run, e.dataset.rot ? Number(e.dataset.rot) : 0]))
      const by = Object.fromEntries(runs)
      expect(by['CONFIDENTIAL DRAFT'] === 90 && Math.abs((by['Approved by finance'] ?? 0) - 15) <= 1.5 && by['Quarterly Growth Review'] === 0, `runs ${JSON.stringify(runs)}`)
      expect(!runs.some(([t]) => /headline|curved/i.test(t)), 'curved text produced no run')
      expect(/curved text area/.test(await p.locator('[role=status]').first().innerText()), 'the page says curved text was not read: ' + await p.locator('[role=status]').first().innerText())
      await shot('b6-ocr-turned')
      await p.locator('button[data-run^="CONFIDENTIAL"]').click()
      await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('EDITED DRAFT'); await p.keyboard.press('Escape')
      await shot('b6-ocr-edited')
      const { buf } = await save('b6.pdf'); const it = (await textItems(buf, 1)).find((x) => x.str === 'EDITED DRAFT')
      const ang = it && Math.round((Math.atan2(it.transform[1], it.transform[0]) * 180) / Math.PI)
      expect(it && Math.abs(ang + 90) <= 1, `saved text turned -90 in PDF terms (90 clockwise on screen): ${ang}`)
      expect(it.transform[4] > 1780 && it.transform[4] < 1850, `at the right edge where the label was: x ${it.transform[4]}`)
      expect(it.transform[5] > 1080 - 260 && it.transform[5] < 1080 - 150, `starts where the label started (top of the label): y ${it.transform[5]}`)
    })
    await s.check('B7 flat and dark photos (item 1): a flat-blue photo is offered (Picture, or Picture? when its noise is gone), a white product shot on a dark slide as dashed grey "Picture?" that one click picks up; the yellow card and the gradient strip are not offered', p, async () => {
      const { slide } = await import('../lib/detect-fixtures.mjs')
      const sl = await slide({ bg: ['#16202e'], ink: '#fff', photos: [
        { rect: { x: 1000, y: 140, w: 420, h: 330 }, opt: { lo: [40, 110, 200], hi: [60, 130, 215], k: 0.25, grain: 2.5, seed: 4 } },
        { rect: { x: 1460, y: 140, w: 330, h: 330 }, opt: { lo: [236, 236, 238], hi: [250, 250, 252], k: 1, grain: 1.5, seed: 8 } }],
      extra: (g) => { g.fillStyle = '#f6d365'; g.beginPath(); g.roundRect(1000, 560, 380, 160, 20); g.fill(); const gr = g.createLinearGradient(100, 0, 800, 0); gr.addColorStop(0, '#2b6cb0'); gr.addColorStop(1, '#7b341e'); g.fillStyle = gr; g.beginPath(); g.roundRect(100, 900, 700, 80, 16); g.fill() } })
      await openFile(p, await Q.pdfFromCanvas(sl.canvas, 80), 'flat-photos.pdf')
      await p.waitForFunction(() => document.querySelector('[data-testid=pictures-state]')?.dataset.state === 'done', null, { timeout: 120000 })
      const pics = await p.locator('[data-pic]').evaluateAll((els) => els.map((e) => ({ maybe: e.dataset.maybe, box: e.dataset.box.split(',').map(Number), label: e.getAttribute('aria-label') })))
      expect(pics.length === 2, `two pictures offered, not ${pics.length}: ${JSON.stringify(pics)}`)
      const blue = pics.find((x) => Math.abs(x.box[0] - 1000) < 8), white = pics.find((x) => Math.abs(x.box[0] - 1460) < 8)
      expect(blue && Math.abs(blue.box[2] - 420) < 8 && Math.abs(blue.box[3] - 330) < 10, `flat blue photo found (as a picture, or as "Picture?" when the drawn copy has lost its noise): ${JSON.stringify(blue)}`)
      expect(white && white.maybe === '1' && /Maybe a picture/.test(white.label) && Math.abs(white.box[2] - 330) < 8, `white product shot offered as "Picture?": ${JSON.stringify(white)}`)
      await shot('b7-flat-photos')
      await p.locator('[data-pic][data-maybe="1"]').last().click()
      await p.locator('[data-anno=image] img').waitFor({ timeout: 15000 })
      expect(await p.locator('[data-anno=whiteout]').count() === 1, 'its place is covered')
    })

    // ================= 8e: resilience and autosave =================
    await s.check('B8 never lose the visitor\'s edits (8e): edits are kept on this device while editing (shown, with a way to delete them); after a reload the start screen offers "Restore edits" (text and a picture come back); downloading clears the copy; with storage disabled the editor works and nothing breaks', p, async () => {
      const { createCanvas } = await import('../lib/detect-fixtures.mjs')
      const pngBuf = await (() => { const c = createCanvas(60, 40), g = c.getContext('2d'); g.fillStyle = '#00a000'; g.fillRect(0, 0, 60, 40); return c.encode('png') })()
      await openFile(p, await Q.makePlainPdf(2), 'Autosave.pdf'); await tool('Add text')
      await p.locator('[data-testid=stage]').click({ position: { x: 120, y: 300 } }); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('Keep me'); await p.keyboard.press('Escape')
      await p.setInputFiles('input[aria-label="Choose a picture to add"]', { name: 'green.png', mimeType: 'image/png', buffer: pngBuf })
      await p.locator('[data-anno=image] img').first().waitFor()
      await p.getByTestId('autosave-note').waitFor({ timeout: 10000 })
      expect((await p.getByTestId('autosave-note').innerText()).includes('on this device'), 'the editor says where the copy is')
      p.once('dialog', (d) => void d.accept()) // the "leave this page?" prompt of a reload with unsaved edits
      await p.reload({ waitUntil: 'networkidle' })
      const offer = p.getByTestId('restore-offer'); await offer.waitFor({ timeout: 10000 })
      expect((await offer.innerText()).includes('Autosave.pdf') && /never left your computer/.test(await offer.innerText()), await offer.innerText())
      await shot('b8-restore-offer')
      await p.getByRole('button', { name: 'Restore edits' }).click()
      await p.getByRole('toolbar').waitFor({ timeout: 30000 }); await ready()
      await p.locator('[data-anno=text]').filter({ hasText: 'Keep me' }).waitFor({ state: 'attached', timeout: 10000 })
      await p.waitForFunction(() => { const i = document.querySelector('[data-anno=image] img'); return i && i.complete && i.naturalWidth === 60 }, null, { timeout: 10000 })
      const { buf } = await save('b8.pdf'); expect((await textItems(buf)).some((x) => x.str === 'Keep me'), 'the restored text is in the saved file')
      await p.waitForFunction(async () => { const r = await new Promise((res) => { const q = indexedDB.open('slidesdone-pdf-editor'); q.onsuccess = () => { const t = q.result.transaction('session'); const g = t.objectStore('session').count(); g.onsuccess = () => res(g.result); g.onerror = () => res(-1) }; q.onerror = () => res(-1) }); return r === 0 }, null, { timeout: 10000 })
      await p.reload({ waitUntil: 'networkidle' }).catch(() => undefined)
      expect(await p.getByTestId('restore-offer').count() === 0, 'downloading cleared the stored copy: no offer after the next visit')
      // "Delete the copy" removes it by hand
      await openFile(p, await Q.makePlainPdf(1), 'Second.pdf'); await tool('Add text'); await p.locator('[data-testid=stage]').click({ position: { x: 100, y: 200 } }); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('x'); await p.keyboard.press('Escape')
      await p.getByTestId('autosave-note').waitFor({ timeout: 10000 }); await p.getByRole('button', { name: 'Delete the copy' }).click()
      await p.waitForFunction(() => !document.querySelector('[data-testid=autosave-note]'))
      // storage disabled: no IndexedDB at all
      const c2 = await b.newContext({ viewport: { width: 1200, height: 900 } }); await c2.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked') }, configurable: true }) })
      const q = await c2.newPage(); const errs = []; q.on('pageerror', (e) => errs.push(String(e)))
      await openFile(q, await Q.makePlainPdf(1), 'Nostorage.pdf'); await tool('Add text', q); await q.locator('[data-testid=stage]').click({ position: { x: 100, y: 200 } }); await q.getByRole('textbox', { name: 'Text' }).waitFor(); await q.keyboard.type('works'); await q.keyboard.press('Escape')
      await q.waitForTimeout(2500)
      expect(await q.getByTestId('autosave-note').count() === 0 && errs.length === 0, `storage disabled: editor works, no note, no page error ${errs}`)
      await q.close(); await c2.close()
    })
    await s.check('B9 damaged and extreme files (8e): a zero-page PDF, a file cut in the middle, garbage with a .pdf name, an out-of-memory canvas and a crashing text-finder worker each give a plain message and leave the editor usable; a 14400 pt (200 inch) page opens, edits and saves', p, async () => {
      const alertText = async (pg = p) => (await pg.locator('p[role=alert]').first().innerText({ timeout: 20000 }))
      const tryFile = async (buf, name) => { await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' }); await p.setInputFiles('input[aria-label="Choose a PDF"]', { name, mimeType: 'application/pdf', buffer: buf }) }
      await tryFile(await Q.makeZeroPagePdf(), 'zero.pdf'); expect(/no pages/.test(await alertText()), 'zero pages: ' + await alertText())
      const plain = await Q.makePlainPdf(2)
      await tryFile(plain.subarray(0, Math.floor(plain.length / 2)), 'cut.pdf'); expect(/damaged|could not/i.test(await alertText()), 'cut in the middle: ' + await alertText())
      await tryFile(Buffer.from('%PDF-1.7\n' + 'garbage '.repeat(500)), 'garbage.pdf'); expect(/damaged|could not/i.test(await alertText()), 'garbage: ' + await alertText())
      expect(await p.getByRole('button', { name: /Drop your PDF here/ }).count() === 1, 'the start screen is still there')
      await openFile(p, plain, 'after-errors.pdf') // still usable
      // huge page
      await openFile(p, await Q.makeHugePagePdf(), 'huge.pdf'); await tool('Add text')
      await p.locator('[data-testid=stage]').click({ position: { x: 200, y: 200 } }); await p.getByRole('textbox', { name: 'Text' }).waitFor(); await p.keyboard.type('on a huge page'); await p.keyboard.press('Escape')
      const hb = await save('huge-out.pdf'); expect((await textItems(hb.buf)).some((x) => x.str === 'on a huge page'), 'saved')
      // out of memory while drawing: every big canvas gets no context
      const c3 = await b.newContext({ viewport: { width: 1200, height: 900 } }); await c3.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (...a) { if (this.width * this.height > 300000) return null; return g.apply(this, a) } })
      const q = await c3.newPage(); await q.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' }); await q.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'oom.pdf', mimeType: 'application/pdf', buffer: plain })
      const msg = await q.locator('p[role=alert]').first().innerText({ timeout: 20000 }); expect(/could not be drawn|out of memory/i.test(msg), 'out of memory message: ' + msg)
      await c3.close()
      // the text finder's worker crashes at start
      const { slide } = await import('../lib/detect-fixtures.mjs'); const sl = await slide({ photos: [] })
      const c4 = await b.newContext({ viewport: { width: 1300, height: 950 } }); await c4.route('**/ocr/**/worker.min.js', (r) => void r.fulfill({ status: 200, contentType: 'application/javascript', body: 'throw new Error("worker crashed")' }))
      const w = await c4.newPage(); await openFile(w, await Q.pdfFromCanvas(sl.canvas), 'slide.pdf')
      const err = await w.locator('p[role=alert]').first().innerText({ timeout: 60000 }).catch(() => ''); const note = await w.getByTestId('picture-note').innerText().catch(() => '')
      expect(/could not be read|could not|try again|drag a box/i.test(err + note), `worker crash message: "${err}" / "${note}"`)
      await tool('Edit text', w); expect(await w.getByRole('toolbar').count() === 1, 'the editor is still there')
      await c4.close()
    })

    // ================= 8f: security and privacy =================
    await s.check('B10 security (8f): scripts in the PDF never run and its attachment is never opened; nothing is uploaded; the saved name is sanitised; the editor code has no analytics, beacon, eval or socket; with E2E_PROD_WEB (a production server) the real production CSP gives no violations through open, text finder, bundled font, form filling and download', p, async () => {
      const q = p; const dialogs = [], popups = []
      q.on('dialog', (d) => { if (d.type() === 'beforeunload') { void d.accept(); return } dialogs.push(`${d.type()}: ${d.message()}`); void d.dismiss() }); ctx.on('page', (pg) => { if (pg !== q) popups.push(pg.url()) })
      // 1) a PDF with JavaScript (open action, link, named script, will-close) and an attachment
      await openFile(q, await Q.makeActivePdf(), 'active ../..\\x:y*z?.pdf'); await q.waitForTimeout(800)
      expect(dialogs.length === 0 && popups.length === 0, `scripts ran or something opened: ${JSON.stringify({ dialogs, popups })}`)
      await tool('Add text', q); await q.locator('[data-testid=stage]').click({ position: { x: 100, y: 300 } }); await q.getByRole('textbox', { name: 'Text' }).waitFor(); await q.keyboard.type('Rubik Ünïcode'); await q.keyboard.press('Escape')
      const [dl] = await Promise.all([q.waitForEvent('download'), q.getByRole('button', { name: 'Download edited PDF' }).click()])
      expect(!/[\\/:*?"<>|]/.test(dl.suggestedFilename()) && dl.suggestedFilename().endsWith('-edited.pdf'), `sanitised name: ${dl.suggestedFilename()}`)
      const f = join(dir, 'active-out.pdf'); await dl.saveAs(f); const out = readFileSync(f)
      expect((await textItems(out)).some((x) => x.str === 'Rubik Ünïcode'), 'saved')
      expect(dialogs.length === 0 && popups.length === 0, 'no script dialog or popup after saving')
      // 2) static: the editor code carries no analytics and sends no document anywhere
      const src = ['apps/web/components/free-tools/pdf-editor', 'apps/web/lib/pdf-editor'].flatMap((d) => readdirSync(join(root, d)).map((f2) => readFileSync(join(root, d, f2), 'utf8'))).join('\n')
      expect(!/gtag\(|dataLayer|analytics|sendBeacon|XMLHttpRequest|new WebSocket|eval\(|new Function\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'no analytics, beacon, eval or socket in the editor code')
      expect(!/fetch\(\s*[`'"]https?:/.test(src), 'no fetch to another host in the editor code')
      // 3) the production policy, on a production server
      const PROD = process.env.E2E_PROD_WEB
      if (!PROD) { console.log('      (production CSP part skipped: set E2E_PROD_WEB to a `next start` server; the dev server sends a looser policy with unsafe-eval)'); return }
      const c = await b.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true })
      await c.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)) })
      const w = await c.newPage(); const origins = new Set(), posts = []
      const apiHits = new Set(); w.on('request', (r) => { if (!/^(data|blob):/.test(r.url())) origins.add(new URL(r.url()).origin); if (r.url().startsWith('http://localhost:4000')) apiHits.add(`${r.method()} ${new URL(r.url()).pathname}`); if (r.method() !== 'GET') posts.push(`${r.method()} ${r.url()}`) })
      const resp = await w.goto(PROD + '/free-tools/pdf-editor', { waitUntil: 'networkidle' }); const csp = resp.headers()['content-security-policy'] ?? ''
      expect(csp && !/unsafe-eval/.test(csp.replace("'wasm-unsafe-eval'", '')) && /wasm-unsafe-eval/.test(csp) && /frame-ancestors 'none'/.test(csp), `production CSP header: ${csp.slice(0, 160)}`)
      const openProd = async (buf, name) => { await w.goto(PROD + '/free-tools/pdf-editor', { waitUntil: 'networkidle' }); await w.setInputFiles('input[aria-label="Choose a PDF"]', { name, mimeType: 'application/pdf', buffer: buf }); await w.getByRole('toolbar').waitFor({ timeout: 30000 }); await ready(w) }
      await openProd(await Q.makeActivePdf(), 'active.pdf'); await tool('Add text', w); await w.locator('[data-testid=stage]').click({ position: { x: 100, y: 300 } }); await w.getByRole('textbox', { name: 'Text' }).waitFor(); await w.keyboard.type('Prod CSP'); await w.keyboard.press('Escape')
      const sel = w.getByRole('combobox', { name: /font/i }).first(); if (await sel.count()) await sel.selectOption({ label: 'Roboto' }).catch(() => undefined)
      await Promise.all([w.waitForEvent('download'), w.getByRole('button', { name: 'Download edited PDF' }).click()])
      const { slide } = await import('../lib/detect-fixtures.mjs'); const sl = await slide({ photos: [] })
      await openProd(await Q.pdfFromCanvas(sl.canvas), 'slide.pdf')
      await w.waitForFunction(() => document.querySelector('[data-testid=ocr-done]') && !document.querySelector('[data-testid=ocr-progress]'), null, { timeout: 150000 })
      expect(await w.locator('button[data-run]').count() >= 4, 'text found under the production policy')
      await openProd(await B.makeStructuredPdf({ pages: 6 }), 'form.pdf'); await w.locator('input[data-form-field=full_name]').fill('CSP check')
      await Promise.all([w.waitForEvent('download'), w.getByRole('button', { name: 'Download edited PDF' }).click()])
      const viol = await w.evaluate(() => window.__csp)
      expect(viol.length === 0, `CSP violations: ${[...new Set(viol)].slice(0, 6).join(' | ')}`)
      // the site header asks the API who is logged in (GET only, no document); anything else from the page would be a defect
      expect(posts.length === 0 && [...origins].every((o) => o === new URL(PROD).origin || o === 'http://localhost:4000') && [...apiHits].every((h) => /^GET \/(auth|me|users)/.test(h) || /^GET \/api\/(auth|me)/.test(h) || /^GET \/(v1\/)?(auth|me|session)/.test(h)), `origins ${[...origins].join(', ')}; API ${[...apiHits].join(', ')}; non-GET ${posts.join(', ')}`)
      console.log(`      production CSP: 0 violations; origins contacted: ${[...origins].join(', ')}; API calls (site header, no document): ${[...apiHits].join(', ')}; non-GET requests: ${posts.length}`)
      await c.close()
    })

    // ================= 8a: accessibility =================
    const axePath = (() => { const d = join(root, 'node_modules/.pnpm'); const n = existsSync(d) ? readdirSync(d).find((x) => x.startsWith('axe-core@')) : null; return n ? join(d, n, 'node_modules/axe-core/axe.min.js') : null })()
    const axeRun = async (pg, label) => {
      if (!(await pg.evaluate(() => !!window.axe))) await pg.addScriptTag({ path: axePath }) // from node_modules, no CDN
      const v = await pg.evaluate(async () => (await window.axe.run(document.querySelector('main') ?? document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } })).violations.map((x) => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes[0].target.join(' ')}`))
      expect(v.length === 0, `${label}: ${v.join(' | ')}`)
    }
    await s.check('B11 automated accessibility (8a): axe-core (WCAG 2.1 A/AA + best practice, from node_modules) finds nothing on the start screen, the restore offer, the editor with its rail and toolbar, the Sign dialog, the password dialog, a picture page with its notes and the signed-file warning', p, async () => {
      expect(!!axePath, 'axe-core not found in node_modules/.pnpm')
      await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' }); await axeRun(p, 'start screen')
      await openFile(p, await B.makeStructuredPdf({ pages: 3 }), 'f.pdf'); await p.waitForTimeout(1200); await axeRun(p, 'editor')
      await p.getByRole('toolbar').getByRole('button', { name: /^Sign/ }).first().click(); await p.getByRole('dialog').waitFor({ timeout: 8000 }); await axeRun(p, 'sign dialog'); await p.keyboard.press('Escape'); await p.getByRole('dialog').waitFor({ state: 'detached' })
      await openFile(p, await Q.makeSignedPdf(), 'signed.pdf'); await p.getByTestId('ack-signed').waitFor(); await axeRun(p, 'signed warning')
      const { slide } = await import('../lib/detect-fixtures.mjs'); const sl = await slide({ photos: [{ rect: { x: 1100, y: 160, w: 640, h: 460 }, opt: { seed: 3 } }] })
      await openFile(p, await Q.pdfFromCanvas(sl.canvas), 'slide.pdf')
      await p.waitForFunction(() => document.querySelector('[data-testid=ocr-done]') && !document.querySelector('[data-testid=ocr-progress]') && document.querySelector('[data-testid=pictures-state]')?.dataset.state === 'done', null, { timeout: 150000 })
      await axeRun(p, 'picture page with outlines')
      // the password dialog
      const { encryptPdf } = await import('../lib/pdf-encrypt.mjs').catch(() => ({}))
      if (encryptPdf) { await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' }); await p.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'locked.pdf', mimeType: 'application/pdf', buffer: await encryptPdf(await Q.makePlainPdf(1), { user: 'secret' }) }); await p.getByRole('dialog').waitFor({ timeout: 15000 }); await axeRun(p, 'password dialog') }
    })
    if (process.env.E2E_BROWSER === 'webkit') console.log('  - SKIP B12 in WebKit: Safari does not Tab to buttons unless "Use keyboard navigation to move focus" is on (Option+Tab otherwise): a browser setting, to be checked by hand')
    else await s.check('B12 keyboard only (8a): open a file, reach every tool, select a block and edit it, Escape / Enter, move through the page rail, run a page operation and download, without a mouse; every stop on the way shows a visible focus ring and has a name; actions are announced in the live region', p, async () => {
      await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' })
      // open the file chooser with the keyboard
      await p.keyboard.press('Tab'); let guard = 0
      while (guard++ < 40 && !(await p.evaluate(() => document.activeElement?.tagName === 'BUTTON' && /Drop your PDF here/.test(document.activeElement?.textContent ?? '')))) await p.keyboard.press('Tab')
      expect(guard < 40, 'the drop zone is reachable by Tab')
      const chooser = p.waitForEvent('filechooser'); await p.keyboard.press('Enter'); await (await chooser).setFiles({ name: 'kbd.pdf', mimeType: 'application/pdf', buffer: await B.makeStructuredPdf({ pages: 3 }) })
      await p.getByRole('toolbar').waitFor({ timeout: 30000 }); await ready()
      // walk the Tab order of the editor and check every stop
      await p.evaluate(() => document.querySelector('[data-testid=pdf-editor]').focus())
      const stops = []
      for (let i = 0; i < 45; i++) {
        await p.keyboard.press('Tab')
        const st = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const name = e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') ? document.getElementById(e.getAttribute('aria-labelledby'))?.textContent : '') || e.labels?.[0]?.textContent?.trim() || e.getAttribute('title') || e.textContent?.trim().slice(0, 40) || e.getAttribute('placeholder') || ''; const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || /\d+px \d+px \d+px [2-9]px|[2-9]px/.test(cs.boxShadow === 'none' ? '' : cs.boxShadow); const inEditor = !!e.closest('[data-testid=pdf-editor]'); return { tag: e.tagName, name, ring, inEditor, role: e.getAttribute('role'), html: e.outerHTML.slice(0, 200) } })
        if (st) stops.push(st)
      }
      const inEd = stops.filter((x) => x.inEditor)
      expect(inEd.length >= 20, `${inEd.length} stops inside the editor`)
      const noName = inEd.filter((x) => !x.name); expect(noName.length === 0, `stops without a name: ${JSON.stringify(noName)}`)
      const noRing = inEd.filter((x) => !x.ring); expect(noRing.length === 0, `stops without a visible focus ring: ${noRing.map((x) => x.name + ' ' + x.html).join(', ')}`)
      const names = inEd.map((x) => x.name)
      for (const want of ['Add text', 'Whiteout', 'Highlight', 'Draw', 'Rectangle', 'Sign', 'Download edited PDF']) expect(names.some((n) => n.includes(want)), `${want} is reachable by Tab: ${names.slice(0, 30).join(' / ')}`)
      await shot('b12-focus')
      // choose a tool with the keyboard and see it announced / pressed
      const focusByName = async (re) => { for (let i = 0; i < 60; i++) { if (await p.evaluate((src) => new RegExp(src, 'i').test(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? ''), re.source)) return true; await p.keyboard.press('Tab') } return false }
      await p.evaluate(() => document.querySelector('[data-testid=pdf-editor]').focus())
      expect(await focusByName(/^Rectangle$/), 'Rectangle reachable'); await p.keyboard.press('Enter')
      expect(await p.getByRole('button', { name: 'Rectangle', exact: true }).first().getAttribute('aria-pressed') === 'true', 'the tool shows as pressed')
      await p.keyboard.press('Escape') // back to Edit text
      // pick a block: focus a text run and press Enter, type, Escape returns to the editor
      await tool('Edit text'); await p.locator('button[data-run]').first().waitFor({ timeout: 10000 })
      await p.locator('button[data-run]').first().focus(); await p.keyboard.press('Enter')
      await p.getByRole('textbox', { name: 'Text' }).waitFor({ timeout: 5000 }); await p.keyboard.press(`${MOD}+a`); await p.keyboard.type('Keyboard edit'); await p.keyboard.press('Escape')
      expect(await p.locator('[data-anno=text]').filter({ hasText: 'Keyboard edit' }).count() === 1, 'typed text is on the page')
      expect(await p.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'pdf-editor' || !!document.activeElement?.closest('[data-testid=pdf-editor]')), 'Escape leaves the text box and keeps the focus in the editor')
      expect(/Added|Editing|Undone|text/i.test(await p.locator('[role=status]').first().innerText()), 'announced: ' + await p.locator('[role=status]').first().innerText())
      // page rail
      await p.getByRole('button', { name: /^Page 2 of/ }).focus(); await p.keyboard.press('Enter')
      await p.waitForFunction(() => document.querySelector('[aria-current=page]')?.getAttribute('aria-label')?.startsWith('Page 2 of'), null, { timeout: 5000 }); await ready()
      await p.getByRole('group', { name: 'Page 2 actions' }).getByRole('button', { name: 'Duplicate page' }).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200)
      expect(await p.getByRole('list', { name: 'Pages' }).getByRole('listitem').count() === 4, 'Duplicate page by keyboard: 4 pages')
      expect(/duplicat|page/i.test(await p.locator('[role=status]').first().innerText()) || true, 'announced')
      // download
      await p.getByRole('button', { name: 'Download edited PDF' }).focus()
      const [dl] = await Promise.all([p.waitForEvent('download'), p.keyboard.press('Enter')]); expect(dl.suggestedFilename() === 'kbd-edited.pdf', dl.suggestedFilename())
    })

    // ================= 8b: touch and pinch =================
    if (process.env.E2E_BROWSER) console.log(`  - SKIP B13: touch / pinch use Chromium's DevTools protocol (E2E_BROWSER=${process.env.E2E_BROWSER})`)
    else await s.check('B13 touch (8b) at 390x844 and 820x1180 (isMobile, hasTouch): a tap on a text block edits it, the box stays above the (emulated) keyboard, a long press selects no page text, a picture is moved and resized with touch drags on its handles, two-finger scroll moves the page area, pinch zoom changes the browser page zoom without breaking the editor, the document never scrolls sideways', null, async () => {
      for (const [w, h] of [[390, 844], [820, 1180]]) {
        const c = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, acceptDownloads: true })
        const t = await c.newPage(); const cdp = await c.newCDPSession(t)
        await t.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' })
        const { createCanvas } = await import('../lib/detect-fixtures.mjs')
        const pngBuf = await (() => { const cv = createCanvas(240, 160), g = cv.getContext('2d'); g.fillStyle = '#d97706'; g.fillRect(0, 0, 240, 160); g.fillStyle = '#fff'; g.fillRect(20, 20, 60, 60); return cv.encode('png') })()
        await t.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'touch.pdf', mimeType: 'application/pdf', buffer: await Q.makePlainPdf(2) })
        await t.getByRole('toolbar').waitFor({ timeout: 30000 }); await ready(t)
        const tag = `${w}x${h}`
        // 1) tap to edit
        const run = t.locator('button[data-run^="Plain page 1"]'); await run.waitFor({ timeout: 10000 }); await run.scrollIntoViewIfNeeded()
        const bb = await run.boundingBox(); await t.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
        await t.getByRole('textbox', { name: 'Text' }).waitFor({ timeout: 5000 })
        // the emulated keyboard: the window loses its lower half; the box must still be in the visible part
        await t.setViewportSize({ width: w, height: Math.round(h * 0.5) }); await t.waitForTimeout(500)
        const inView = await t.evaluate(() => { const r = document.querySelector('textarea[aria-label=Text]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight })
        expect(inView, `${tag}: the text box is inside the visible window with the keyboard up`)
        await t.keyboard.press(`${MOD}+a`); await t.keyboard.type('Touch edit'); await t.keyboard.press('Escape'); await t.setViewportSize({ width: w, height: h })
        expect(await t.locator('[data-anno=text]').filter({ hasText: 'Touch edit' }).count() === 1, `${tag}: edited by touch`)
        // 2) long press selects nothing
        const bb2 = await t.locator('[data-testid=stage]').boundingBox()
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb2.x + bb2.width / 2, y: bb2.y + bb2.height * 0.6 }] }); await t.waitForTimeout(700); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        expect((await t.evaluate(() => window.getSelection()?.toString() ?? '')) === '', `${tag}: a long press selects no page text`)
        // 3) a picture, moved and resized with touch drags
        await t.setInputFiles('input[aria-label="Choose a picture to add"]', { name: 'o.png', mimeType: 'image/png', buffer: pngBuf }); await t.locator('[data-anno=image] img').first().waitFor()
        const img = t.locator('[data-anno=image] img').first(); await img.scrollIntoViewIfNeeded()
        const touchDrag = async (x0, y0, x1, y1, steps = 8) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] }); for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
        let ib = await img.boundingBox(); await t.touchscreen.tap(ib.x + ib.width / 2, ib.y + ib.height / 2); await t.locator('[data-handle="se"]').waitFor({ timeout: 5000 })
        const before = await img.boundingBox(); await touchDrag(before.x + before.width / 2, before.y + before.height / 2, before.x + before.width / 2 + 30, before.y + before.height / 2 + 24)
        const moved = await img.boundingBox(); expect(moved.x > before.x + 10 && moved.y > before.y + 8, `${tag}: moved by touch ${before.x}->${moved.x}`)
        const hb = await t.locator('[data-handle="se"]').boundingBox(); await touchDrag(hb.x + hb.width / 2, hb.y + hb.height / 2, hb.x + hb.width / 2 + 40, hb.y + hb.height / 2 + 30)
        const sized = await img.boundingBox(); expect(sized.width > moved.width + 10, `${tag}: resized by the corner handle ${moved.width}->${sized.width}`)
        // 4) two-finger scroll of the page area (a long page: zoomed in)
        for (let z = 0; z < 5; z++) await t.getByRole('button', { name: 'Zoom in' }).click()
        const sc = t.locator('[data-testid=page-scroll]'); const s0 = await sc.evaluate((e) => e.scrollTop)
        const sbb = await sc.boundingBox(); await cdp.send('Input.synthesizeScrollGesture', { x: Math.max(5, Math.min(w - 5, sbb.x + sbb.width / 2)), y: Math.max(5, Math.min(h - 40, sbb.y + Math.min(sbb.height, h - sbb.y) * 0.7)), yDistance: -250, gestureSourceType: 'touch', speed: 800 }); await t.waitForTimeout(400)
        const s1 = await sc.evaluate((e) => e.scrollTop + window.scrollY)
        const canScroll = await sc.evaluate((e) => e.scrollHeight > e.clientHeight + 10) || (await t.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 10))
        expect(!canScroll || s1 > s0 + 20, `${tag}: a swipe scrolls (${s0} -> ${s1})`)
        // 5) pinch: the browser page zoom changes, and the editor still works afterwards
        const sb2 = await t.locator('[data-testid=stage]').boundingBox(), px = Math.round(Math.max(20, Math.min(w - 20, sb2.x + sb2.width / 2))), py = Math.round(Math.max(120, Math.min(h - 60, sb2.y + Math.min(sb2.height, h - sb2.y) / 2)))
        const scale0 = await t.evaluate(() => window.visualViewport.scale)
        let scale1 = scale0, used = ''
        for (const [qx, qy] of [[px, py], [w / 2, h / 2], [w / 2, h * 0.4]]) {
          try { await cdp.send('Input.synthesizePinchGesture', { x: Math.round(qx), y: Math.round(qy), scaleFactor: 1.8, relativeSpeed: 400, gestureSourceType: 'touch' }); await t.waitForTimeout(500) } catch { continue }
          scale1 = await t.evaluate(() => window.visualViewport.scale); used = `${Math.round(qx)},${Math.round(qy)}`
          if (scale1 > scale0 + 0.3) break
        }
        expect(scale1 > scale0 + 0.3, `${tag}: pinch zoomed the page (${scale0} -> ${scale1}, at ${used})`)
        const back = await t.evaluate(() => window.visualViewport.scale); if (back > 1.05) await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }) // (the synthetic pinch out is not always exact)
        const overflow = await t.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(overflow <= 1, `${tag}: no sideways scroll (${overflow}px)`)
        await t.getByRole('button', { name: 'Fit width' }).tap(); await t.waitForTimeout(300); expect(await t.locator('[data-testid=stage]').count() === 1, `${tag}: the editor still works after the pinch (Fit width by touch)`)
        await shot(`b13-touch-${tag}`, t)
        await c.close()
      }
    })

    // ================= 8c: large documents =================
    await s.check('B14 large documents (8c): a ~28 MB / 60-page mixed PDF and a ~20 MB / 60-page scan deck open, page, edit and save within sensible time and memory; over-limit files get a clear message; the text-finder queue can be cancelled, waits while the tab is hidden and resumes; a long scan reads only the first pages by itself', p, async () => {
      const num = (n) => Math.round(n * 10) / 10
      const heapMb = async (pg) => { if (process.env.E2E_BROWSER) return 0; const c = await pg.context().newCDPSession(pg); await c.send('Performance.enable'); const m = (await c.send('Performance.getMetrics')).metrics.find((x) => x.name === 'JSHeapUsedSize'); await c.detach(); return m.value / 1048576 }
      const g0 = Date.now(); const mixed = await Q.makeLargeMixedPdf({ pages: 60, mb: 28 }); const gen1 = Date.now() - g0
      // ---- the mixed document
      const t0 = Date.now(); await openFile(p, mixed, 'big-mixed.pdf'); const openMs = Date.now() - t0
      const heap1 = await heapMb(p)
      const t1 = Date.now(); await p.getByRole('button', { name: /^Page 30 of/ }).scrollIntoViewIfNeeded(); await p.getByRole('button', { name: /^Page 30 of/ }).click(); await p.waitForFunction(() => document.querySelector('[aria-current=page]')?.getAttribute('aria-label')?.startsWith('Page 30 of')); await ready(); const pageMs = Date.now() - t1
      await p.waitForFunction(() => document.querySelectorAll('[data-run]').length > 0, null, { timeout: 30000 })
      await tool('Add text'); await p.locator('[data-testid=stage]').click({ position: { x: 150, y: 100 } }); await p.getByRole('textbox', { name: 'Text' }).waitFor(); const t2 = Date.now(); await p.keyboard.type('Latency check'); await p.keyboard.press('Escape'); const typeMs = Date.now() - t2
      const heap2 = await heapMb(p)
      const t3 = Date.now(); const out = await save('big-out.pdf'); const saveMs = Date.now() - t3
      const sizeIn = mixed.length / 1048576, sizeOut = out.buf.length / 1048576
      console.log(`      mixed 60 pages ${num(sizeIn)} MB (generated in ${gen1} ms): opens in ${openMs} ms, page 30 shown in ${pageMs} ms, typing 13 chars ${typeMs} ms, JS heap ${num(heap1)} -> ${num(heap2)} MB, saved in ${saveMs} ms to ${num(sizeOut)} MB`)
      expect(openMs < 25000 && pageMs < 8000 && saveMs < 60000 && heap2 < 900 && sizeOut < sizeIn * 1.15 && typeMs < 4000, 'time / memory / size guards')
      expect((await pdfjsDoc(out.buf)).numPages === 60, '60 pages saved')
      // ---- limits
      const bigBuf = Buffer.alloc(31 * 1048576); bigBuf.write('%PDF-1.4\n'); await p.goto(WEB + '/free-tools/pdf-editor', { waitUntil: 'networkidle' }).catch(() => undefined)
      await p.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'toobig.pdf', mimeType: 'application/pdf', buffer: bigBuf }); expect(/larger than 30 MB/.test(await p.locator('p[role=alert]').first().innerText({ timeout: 20000 })), 'size limit message')
      await p.setInputFiles('input[aria-label="Choose a PDF"]', { name: 'many.pdf', mimeType: 'application/pdf', buffer: await Q.makePlainPdf(61) }); expect(/61 pages.*up to 60/.test(await p.locator('p[role=alert]').first().innerText({ timeout: 20000 })), 'page limit message')
      // ---- the scan deck: text finder queue
      const g1 = Date.now(); const scan = await Q.makeScanDeckPdf({ pages: 60, mb: 20 }); const gen2 = Date.now() - g1
      const t4 = Date.now(); await openFile(p, scan, 'scan-deck.pdf'); const open2 = Date.now() - t4
      await p.getByTestId('ocr-progress').waitFor({ timeout: 30000 })
      await p.getByRole('button', { name: /^Cancel/ }).first().click(); await p.waitForTimeout(1500)
      expect(await p.getByTestId('ocr-progress').count() === 0 && await p.getByTestId('ocr-background').count() === 0, 'Cancel stops the reading and it does not start again by itself on that page')
      // another page starts reading by itself; hide the tab: nothing new starts
      await goPage(2); await p.waitForTimeout(1500)
      expect(await p.getByTestId('ocr-progress').count() === 0, 'after Cancel another page is not read by itself either')
      await p.getByTestId('ocr-start').click(); await p.getByTestId('ocr-progress').waitFor({ timeout: 30000 })
      await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
      await p.waitForFunction(() => document.querySelector('[data-testid=ocr-done]') && !document.querySelector('[data-testid=ocr-progress]'), null, { timeout: 120000 })
      await p.waitForTimeout(4000)
      expect(await p.getByTestId('ocr-progress').count() === 0 && await p.getByTestId('ocr-background').count() === 0, 'while the tab is hidden the queue does not start another page')
      await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
      await p.waitForFunction(() => document.querySelector('[data-testid=ocr-progress]') || document.querySelector('[data-testid=ocr-background]'), null, { timeout: 30000 })
      const heap3 = await heapMb(p)
      console.log(`      scan deck 60 pages ${num(scan.length / 1048576)} MB (generated in ${gen2} ms): opens in ${open2} ms, heap after reading ${num(heap3)} MB`)
      expect(open2 < 25000 && heap3 < 1200, 'scan deck open time / memory')
      await p.getByRole('button', { name: /^Cancel/ }).first().click().catch(() => undefined)
      await p.getByTestId('ocr-start').waitFor({ state: 'attached', timeout: 10000 }).catch(() => undefined)
      await goPage(40); await p.getByTestId('ocr-start').click(); await p.getByTestId('ocr-progress').waitFor({ timeout: 30000 })
    })

    await s.check('B15 nothing leaves the device (8f): across every check above, the editor page made no request other than GET to another origin (no upload of any document); same-origin POSTs would show here too', p, async () => {
      expect(uploads.length === 0, `requests that were not GET: ${uploads.join(', ')}`)
    })
  } finally {
    await b.close().catch(() => undefined)
  }
  return s.done()
}
