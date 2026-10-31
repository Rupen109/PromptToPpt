import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, EDITOR, WEB, expect, launch, suite, uniqueEmail } from '../lib.mjs'
import { JSON_HEADERS, file, tsx } from '../kits-lib.mjs'

/**
 * C4 — Word, spreadsheet, email and Google-link sources, in a real browser against the real server and database (no AI: reading files costs nothing;
 * the AI runs in suite 27). Flow ids refer to docs/SOURCES_C4_FUNCTIONAL_FLOWS.md. Files in e2e/fixtures/sources were written by python-docx,
 * openpyxl and Python's email package (e2e/fixtures/make-sources.py).
 */
const FX = new URL('../fixtures/sources/', import.meta.url).pathname
const fx = (n) => join(FX, n)
const SETS = [
  { f: 'lighthouse-plan.docx', icon: 'file-text', title: 'Lighthouse Coffee — Expansion Plan', type: 'docx' },
  { f: 'sales-2025.xlsx', icon: 'file-spreadsheet', title: 'sales-2025', type: 'xlsx' },
  { f: 'stores.csv', icon: 'table', title: 'stores', type: 'csv' },
  { f: 'q3-update.eml', icon: 'mail', title: 'Q3 update — café sales & Mumbai plan', type: 'email' },
]

export default async function () {
  const s = suite('26-sources-c4')
  const b = await launch()
  const email = uniqueEmail('srcc').toLowerCase()
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
  const su = await ctx.request.post(`${API}/api/auth/sign-up/email`, { headers: JSON_HEADERS, data: { email, password: 'Passw0rd!qa-test', name: 'Source QA' } })
  expect(su.ok(), `sign-up ${su.status()}`)
  const p = await ctx.newPage()
  const cool = () => p.waitForTimeout(62000)
  const stored = () => JSON.parse(tsx(`scripts/qa-sources.ts ${email}`))
  const home = async () => { await p.goto(EDITOR + '/', { waitUntil: 'networkidle' }); await p.getByLabel('Presentation prompt').waitFor({ timeout: 10000 }) }
  const openDialog = async () => { await p.getByRole('button', { name: /Upload files, or links/ }).click(); await p.getByRole('dialog', { name: 'Add sources' }).waitFor({ timeout: 5000 }) }
  const chips = () => p.locator('form span[title]')
  const SIZE = (n) => readFileSync(fx(n)).length
  /** a real drag-and-drop of a file onto the prompt bar */
  async function drop(name, mime = '') {
    const data = readFileSync(fx(name)).toString('base64')
    const dt = await p.evaluateHandle(({ name, data, mime }) => { const d = new DataTransfer(); d.items.add(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name, { type: mime })); return d }, { name, data, mime })
    await p.locator('form').first().dispatchEvent('drop', { dataTransfer: dt })
  }
  const dropBytes = async (name, bytes) => {
    const dt = await p.evaluateHandle(({ name, b64 }) => { const d = new DataTransfer(); d.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name)); return d }, { name, b64: Buffer.from(bytes).toString('base64') })
    await p.locator('form').first().dispatchEvent('drop', { dataTransfer: dt })
  }

  try {
    // ───────── A1 + H1 + H2 + H4: the dialog ─────────
    await s.check('H1 the dialog\'s file picker and help text list the new types with their limits', p, async () => {
      await home(); await openDialog()
      const accept = await p.getByLabel('File').getAttribute('accept')
      for (const e of ['.docx', '.xlsx', '.csv', '.eml', '.pdf', '.pptx', '.txt']) expect(accept.includes(e), `${e} is missing from the picker (${accept})`)
      const help = await p.getByRole('dialog', { name: 'Add sources' }).innerText()
      expect(/Word/.test(help) && /Excel/.test(help) && /CSV/.test(help) && /email/i.test(help) && /15 MB/.test(help), `help text: ${help}`)
      await p.getByRole('tab', { name: 'Website link' }).click()
      expect(/Google Doc/.test(await p.getByRole('dialog', { name: 'Add sources' }).innerText()), 'the link tab does not mention Google documents')
    })

    for (const x of SETS) {
      await s.check(`A1 + H2 + H4 "Add sources" → ${x.f}: read, right icon and title, stored with the right type and locators; Remove deletes it`, p, async () => {
        await home(); await openDialog()
        await p.getByLabel('File').setInputFiles(fx(x.f))
        await p.getByRole('button', { name: 'Add source' }).click()
        await p.getByRole('dialog', { name: 'Add sources' }).waitFor({ state: 'detached', timeout: 20000 })
        const chip = chips().filter({ hasText: x.title }).first(); await chip.waitFor({ timeout: 10000 })
        expect(await chip.locator(`svg.lucide-${x.icon}`).count() > 0, `icon ${x.icon} not shown`)
        const row = stored().find((r) => r.title === x.title)
        expect(row && row.type === x.type, `stored as ${row?.type}, expected ${x.type}`)
        expect(row.chunks.length >= 1 && row.chunks.every((c) => c.text.length > 5), 'no readable chunks')
        const text = row.chunks.map((c) => c.text).join('\n')
        if (x.type === 'docx') { expect(text.includes('₹18.6 crore') && text.includes('FY2026 (plan) | 27.9 | 7'), 'the figures or the table row are missing'); expect(row.chunks.some((c) => c.locator === 'Where we are'), 'no heading locators') }
        if (x.type === 'xlsx') { expect(text.includes('West | Q4 | 305 | 17.3% | 2025-12-28') && text.includes('=SUM(C2:C17)'), 'row values, dates or the formula are wrong'); expect(!text.includes('Hidden margin note'), 'a hidden sheet was read'); expect(row.chunks.every((c) => c.text.startsWith('Region |') || c.text.startsWith('Metric |')), 'a part does not start with its header row'); expect(row.chunks.some((c) => /^Sales 2025 \(rows \d+–\d+\)$/.test(c.locator)), 'no row locators') }
        if (x.type === 'csv') expect(text.includes('Koregaon Park | 9200 | 412,50') && text.includes('Drive-through, "pickup lane"'), 'semicolon CSV with BOM was misread')
        if (x.type === 'email') { expect(text.includes('Subject: Q3 update — café sales & Mumbai plan') && text.includes('₹5.2 crore') && text.includes('Attachments (not read): board-pack.pdf'), 'headers/body/attachment line wrong'); expect(!/SECRET-ATTACHMENT/.test(text) && !/<\/?(p|li|b)>/.test(text), 'attachment content or HTML tags leaked') }
        await chip.getByRole('button', { name: /^Remove / }).click()
        await p.waitForFunction((t) => ![...document.querySelectorAll('form span[title]')].some((e) => e.getAttribute('title') === t), x.title, { timeout: 8000 })
        for (let i = 0; i < 20 && stored().some((r) => r.title === x.title); i++) await p.waitForTimeout(300)
        expect(!stored().some((r) => r.title === x.title), 'Remove left the source in the database')
      })
    }

    // ───────── A2 + H5: drag and drop onto the prompt bar ─────────
    await s.check('A2 + H5 dropping each new file type on the prompt bar shows a chip with its icon and settles to the right type', p, async () => {
      await home()
      for (const x of SETS) await drop(x.f)
      for (const x of SETS) await chips().filter({ hasText: x.title.slice(0, 20) }).first().waitFor({ timeout: 20000 })
      for (let i = 0; i < 30 && stored().length < 4; i++) await p.waitForTimeout(400)
      const types = stored().map((r) => r.type).sort(); expect(JSON.stringify(types) === JSON.stringify(['csv', 'docx', 'email', 'xlsx']), `stored types: ${types}`)
      for (const x of SETS) await chips().filter({ hasText: x.title.slice(0, 20) }).first().getByRole('button', { name: /^Remove / }).click()
      for (let i = 0; i < 30 && stored().length; i++) await p.waitForTimeout(300)
    })

    // ───────── A5: things we cannot read ─────────
    await s.check('A5 old .doc / .xls / .ppt / .msg and unknown files each get one plain sentence on the page and nothing is stored', p, async () => {
      await home()
      const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)])
      // pictures are supported now (image to deck): a fake .png gets the picture sentence
      const cases = [['old.doc', ole, /save as \.docx/], ['old.xls', ole, /save as \.xlsx/], ['old.ppt', ole, /save as \.pptx/], ['mail.msg', ole, /save the email as \.eml/], ['setup.exe', Buffer.from('MZ\x90\0'), /use a PDF, Word/i], ['photo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]), /not a JPG, PNG or WebP/i]]
      for (const [name, bytes, re] of cases) {
        await dropBytes(name, bytes)
        const m = await p.getByRole('alert').first().innerText(); expect(re.test(m), `${name}: "${m}"`)
        expect(!/Error|undefined|stack|\/Users\//.test(m), `${name}: technical text "${m}"`)
      }
      expect(stored().length === 0, 'something was stored for an unsupported file')
    })

    await cool() // the sources limiter allows 20 requests a minute per person
    await s.check('A5 (server side) the same files sent straight to the API: right messages; a text file named .docx, an exe named .docx, a zip named .xlsx, an encrypted file, a damaged file', p, async () => {
      const up = async (name, buf) => { const r = await ctx.request.post(`${API}/api/v1/sources/file`, { headers: { Origin: WEB }, multipart: { file: file(name, buf, 'application/octet-stream') } }); return { status: r.status(), body: await r.json().catch(() => ({})) } }
      const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)])
      const enc = Buffer.concat([ole, Buffer.from('EncryptedPackage', 'utf16le'), Buffer.alloc(40)])
      for (const [name, buf, re] of [['a.docx', Buffer.from('just text'), /not a valid Office document/], ['a.docx', Buffer.from('MZ\x90\0\x03\0\0\0'), /not a valid Office document/], ['a.xlsx', Buffer.from([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7]), /damaged|could not be opened/], ['locked.docx', enc, /password-protected/], ['locked.xlsx', enc, /password-protected/], ['x.docx', ole, /save as \.docx|Unsupported/]]) {
        const r = await up(name, buf); expect(r.status === 422 && re.test(r.body.error?.message ?? ''), `${name}: ${r.status} ${JSON.stringify(r.body.error)}`)
      }
      expect(stored().length === 0, 'something was stored')
    })

    // ───────── G1: content decides ─────────
    await s.check('G1 a Word file renamed .pdf / .xlsx / .txt and an Excel file renamed .docx are read as what they are', p, async () => {
      const up = async (name, path) => { const r = await ctx.request.post(`${API}/api/v1/sources/file`, { headers: { Origin: WEB }, multipart: { file: file(name, readFileSync(path), 'application/octet-stream') } }); return { status: r.status(), body: await r.json() } }
      for (const [name, path, type] of [['plan.pdf', fx('lighthouse-plan.docx'), 'docx'], ['plan.xlsx', fx('lighthouse-plan.docx'), 'docx'], ['sheet.docx', fx('sales-2025.xlsx'), 'xlsx'], ['sheet.pptx', fx('sales-2025.xlsx'), 'xlsx']]) {
        const r = await up(name, path); expect(r.status === 201 && r.body.data.type === type, `${name} → ${r.status} ${r.body?.data?.type ?? JSON.stringify(r.body.error)}`)
        await ctx.request.delete(`${API}/api/v1/sources/${r.body.data.id}`, { headers: { Origin: WEB } })
      }
    })

    // ───────── G6: size and time ─────────
    await s.check('G4 + G6 a 15 MB workbook is read in a few seconds and other requests stay responsive meanwhile; one bigger than 15 MB is refused in plain words', p, async () => {
      const { zipSync, strToU8 } = await import('fflate')
      const rows = Array.from({ length: 60000 }, (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c><c r="B${i + 1}" t="inlineStr"><is><t>${'name'.repeat(5)} ${i}</t></is></c></row>`).join('')
      const zip = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Big" sheetId="1" r:id="rId1"/></sheets></workbook>'), 'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'), 'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${rows}</sheetData></worksheet>`) }, { level: 1 })
      const t0 = Date.now()
      const [r, ping] = await Promise.all([
        ctx.request.post(`${API}/api/v1/sources/file`, { headers: { Origin: WEB }, multipart: { file: file('big.xlsx', Buffer.from(zip), 'application/octet-stream') } }),
        (async () => { await new Promise((x) => setTimeout(x, 300)); const t = Date.now(); await ctx.request.get(`${API}/health`); return Date.now() - t })(),
      ])
      const body = await r.json(); expect(r.status() === 201, `big workbook: ${r.status()} ${JSON.stringify(body.error)}`)
      expect(Date.now() - t0 < 15000, `took ${Date.now() - t0} ms`); expect(ping < 2000, `the server stalled for ${ping} ms while reading`)
      await ctx.request.delete(`${API}/api/v1/sources/${body.data.id}`, { headers: { Origin: WEB } })
      const huge = await ctx.request.post(`${API}/api/v1/sources/file`, { headers: { Origin: WEB }, multipart: { file: file('huge.csv', Buffer.alloc(16 * 1024 * 1024, 'a,b\n'), 'text/csv') } })
      expect(huge.status() === 413 && /too large/i.test((await huge.json()).error?.message ?? ''), `16 MB gave ${huge.status()}`)
    })

    // ───────── A4 + E: Google links ─────────
    await cool()
    const GOOGLE = process.env.C4_GOOGLE_LINKS ? JSON.parse(process.env.C4_GOOGLE_LINKS) : null
    await s.check('E4 + E5 a private / unknown Google link says how to share it (page and API); a Drive file link, a Forms link and a malformed link each get a plain sentence', p, async () => {
      await home(); await openDialog(); await p.getByRole('tab', { name: 'Website link' }).click()
      const tryLink = async (u) => { await p.getByLabel('Page URL').fill(u); await p.getByRole('button', { name: 'Add source' }).click(); await p.getByRole('alert').first().waitFor({ timeout: 40000 }); const m = await p.getByRole('alert').first().innerText(); return m }
      const m1 = await tryLink('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit')
      expect(/Anyone with the link|not found/.test(m1) && !/Sign in|accounts\.google|<html/i.test(m1), `private/unknown doc: "${m1}"`)
      expect(/Link to the Google Doc/.test(await tryLink('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view')), 'drive link message')
      expect(/Forms/.test(await tryLink('https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit')), 'forms link message')
      expect(/does not look like/.test(await tryLink('https://docs.google.com/document/d/short/edit')), 'malformed link message')
      expect(stored().length === 0, 'something was stored for a refused link')
    })

    if (GOOGLE) {
      for (const [kind, url, expectText] of [['E1 Google Doc', GOOGLE.doc, GOOGLE.docText], ['E2 Google Sheet', GOOGLE.sheet, GOOGLE.sheetText], ['E3 Google Slides', GOOGLE.slides, GOOGLE.slidesText]].filter((x) => x[1])) {
        await s.check(`${kind}: a real public document pasted in the dialog is read, named after the document and listed with its icon`, p, async () => {
          await home(); await openDialog(); await p.getByRole('tab', { name: 'Website link' }).click()
          await p.getByLabel('Page URL').fill(url); await p.getByRole('button', { name: 'Add source' }).click()
          await p.getByRole('dialog', { name: 'Add sources' }).waitFor({ state: 'detached', timeout: 60000 })
          const row = stored()[0]; expect(row && ['docx', 'xlsx', 'pptx'].includes(row.type) && row.url === url, `stored: ${row?.type} ${row?.title}`)
          expect(row.chunks.map((c) => c.text).join('\n').includes(expectText), `the expected text "${expectText}" is not in the source`)
          await chips().first().getByRole('button', { name: /^Remove / }).click(); for (let i = 0; i < 20 && stored().length; i++) await p.waitForTimeout(300)
        })
      }
      await s.check('A4 a Google link pasted into the prompt bar becomes a chip that settles as a source', p, async () => {
        await home(); await p.getByLabel('Presentation prompt').click()
        await p.evaluate(async (u) => { const el = document.querySelector('textarea'); const dt = new DataTransfer(); dt.setData('text/plain', u); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }, GOOGLE.doc)
        await chips().first().waitFor({ timeout: 40000 })
        for (let i = 0; i < 60 && !stored().length; i++) await p.waitForTimeout(500)
        expect(stored().length === 1 && stored()[0].type === 'docx', 'the pasted link was not stored as a Word-type source')
        await chips().first().getByRole('button', { name: /^Remove / }).click(); for (let i = 0; i < 20 && stored().length; i++) await p.waitForTimeout(300)
      })
    }

    // ───────── H3: phone ─────────
    await s.check('H3 phone width (390 px): the Add sources dialog fits, scrolls and its file list is reachable', p, async () => {
      const pc = await b.newContext({ viewport: { width: 390, height: 780 }, storageState: await ctx.storageState() }); const pp = await pc.newPage()
      await pp.goto(EDITOR + '/', { waitUntil: 'networkidle' })
      await pp.getByRole('button', { name: /Upload files, or links/ }).click(); const d = pp.getByRole('dialog', { name: 'Add sources' }); await d.waitFor()
      const box = await d.boundingBox(); expect(box.x >= 0 && box.x + box.width <= 391, `dialog wider than the screen ${JSON.stringify(box)}`)
      await pp.getByLabel('File').setInputFiles(fx('sales-2025.xlsx')); const btn = d.getByRole('button', { name: 'Add source' }); await btn.scrollIntoViewIfNeeded(); await btn.click()
      await pp.getByRole('dialog', { name: 'Add sources' }).waitFor({ state: 'detached', timeout: 20000 })
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the page scrolls sideways')
      await pc.close()
      for (const r of stored()) await ctx.request.delete(`${API}/api/v1/sources/${r.id}`, { headers: { Origin: WEB } })
    })

    await s.check('A6 adding sources too fast gives a plain "wait a moment" message on the page (not "Too many requests"), and works again afterwards', p, async () => {
      await cool()
      for (let i = 0; i < 22; i++) await ctx.request.get(`${API}/api/v1/sources/none`, { headers: { Origin: WEB } }) // each call counts
      await home(); await openDialog(); await p.getByRole('tab', { name: 'Paste text' }).click()
      await p.getByLabel('Text').fill('Some notes about the coffee roastery that are long enough to be accepted.'); await p.getByRole('button', { name: 'Add source' }).click()
      const m = await p.getByRole('alert').first().innerText(); expect(/adding sources very quickly/.test(m) && !/Too many requests/.test(m), `message: "${m}"`)
      await cool(); await p.getByRole('button', { name: 'Add source' }).click()
      await p.getByRole('dialog', { name: 'Add sources' }).waitFor({ state: 'detached', timeout: 20000 })
      for (const r of stored()) await ctx.request.delete(`${API}/api/v1/sources/${r.id}`, { headers: { Origin: WEB } })
    })

    // ───────── A3: the landing page (signed out) ─────────
    await s.check('A3 a visitor attaches a Word file on the landing page, signs up, and the file is waiting as a source', p, async () => {
      const vctx = await b.newContext({ viewport: { width: 1500, height: 950 } }); const v = await vctx.newPage()
      await v.goto(WEB + '/', { waitUntil: 'networkidle' })
      await v.getByLabel('Presentation prompt').fill('A 5 slide expansion pitch for Lighthouse Coffee for investors')
      await v.getByLabel('Attach files').setInputFiles([fx('lighthouse-plan.docx'), fx('stores.csv')])
      await v.waitForFunction(() => /lighthouse-plan\.docx/.test(document.querySelector('[aria-label="Attached sources"]')?.textContent ?? '') && !document.querySelector('[aria-label="Attached sources"] .animate-spin'), null, { timeout: 30000 })
      const chipText = await v.getByLabel('Attached sources').innerText(); expect(await v.locator('[aria-label="Attached sources"] svg.lucide-file-text').count() > 0 && await v.locator('[aria-label="Attached sources"] svg.lucide-table').count() > 0, `chips (Word file icon + spreadsheet icon): ${chipText}`)
      await v.getByRole('button', { name: /Generate Presentation/ }).click()
      await v.waitForURL(/\/(signup|login)/, { timeout: 15000 })
      if (/\/login/.test(v.url())) await v.getByRole('link', { name: /sign up|create/i }).first().click()
      await v.waitForURL(/\/signup/, { timeout: 10000 })
      const vemail = uniqueEmail('lan').toLowerCase()
      await v.getByLabel(/Email/i).first().fill(vemail); await v.getByLabel(/Password/i).first().fill('Passw0rd!qa-test')
      const name = v.getByLabel(/Name/i); if (await name.count()) await name.first().fill('Visitor')
      await v.getByRole('button', { name: 'Sign up free' }).click()
      await v.waitForURL(/localhost:3001/, { timeout: 30000 })
      let rows = []; for (let i = 0; i < 40 && rows.length < 2; i++) { await v.waitForTimeout(500); rows = JSON.parse(tsx(`scripts/qa-sources.ts ${vemail}`)); if (rows.error) rows = [] }
      expect(rows.map((r) => r.type).sort().join() === 'csv,docx', `sources after sign-up: ${JSON.stringify(rows.map((r) => [r.type, r.title]))}`)
      await vctx.close()
    })
  } finally {
    await b.close()
  }
  return s.done()
}
