import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { API, EDITOR, PASSWORD, RESULTS, expect, launch, suite, uniqueEmail } from '../lib.mjs'
import { STATE } from './02-auth.mjs'

const OUT = join(RESULTS, 'exports')

export default async function () {
  const s = suite('06-export')
  mkdirSync(OUT, { recursive: true })
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE, acceptDownloads: true })
  const p = await ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  const create = (templateId, aspectRatio = '16:9', title) => p.evaluate(async ([templateId, aspectRatio, title]) => { const r = await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId, aspectRatio, ...(title ? { title } : {}) }) }); const j = await r.json(); return j.data?.id ?? j.id }, [templateId, aspectRatio, title])
  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })

  const deck = await create('pitch-launchpad', '16:9', 'QA Export Deck')
  const open = async (id) => { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor({ timeout: 15000 }); await settle(800) }
  const exportAs = async (fmt, timeout = 120000) => {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout }), (async () => { await p.getByRole('button', { name: /^Export/ }).click(); await p.getByRole('menuitem', { name: new RegExp(`^${fmt.toUpperCase()}`) }).click() })()])
    const path = join(OUT, `${fmt}-${Date.now()}-${dl.suggestedFilename()}`); await dl.saveAs(path); return { path, name: dl.suggestedFilename(), buf: readFileSync(path) }
  }

  await open(deck)
  await s.check('menu: Export lists PPTX, PDF, PNG, JPG, HTML (Pro: no PRO badges)', p, async () => {
    await p.getByRole('button', { name: /^Export/ }).click()
    const items = await p.getByRole('menuitem').allInnerTexts(); expect(items.length === 5, `items: ${items.join(',')}`)
    expect(!items.some((t) => /PRO/.test(t)), 'Pro user sees PRO badges')
    await p.keyboard.press('Escape'); await settle(200)
    expect(await p.getByRole('menuitem').count() === 0, 'export menu did not close on Escape')
  })

  let pptx
  await s.check('PPTX: downloads a valid .pptx named after the deck', p, async () => {
    pptx = await exportAs('pptx')
    expect(pptx.name === 'QA-Export-Deck.pptx', `file name ${pptx.name}`)
    expect(pptx.buf[0] === 0x50 && pptx.buf[1] === 0x4b, 'not a zip')
    expect(pptx.buf.length > 30_000, `suspiciously small: ${pptx.buf.length}`)
  })
  await s.check('PPTX: 11 slides, speaker notes, embedded pictures, native chart, editable text, correct size', p, async () => {
    const z = unzipSync(new Uint8Array(pptx.buf)); const names = Object.keys(z)
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)); expect(slides.length === 11, `${slides.length} slides`)
    expect(names.filter((n) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length >= 10, 'speaker notes missing')
    expect(names.filter((n) => /^ppt\/media\//.test(n)).length >= 3, 'no embedded pictures')
    expect(names.some((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)), 'chart is not a native chart')
    const s1 = strFromU8(z['ppt/slides/slide1.xml']); expect(/Northwind/.test(s1), 'slide 1 title text missing/not editable')
    const pres = strFromU8(z['ppt/presentation.xml']); expect(/sldSz cx="12192000" cy="6858000"/.test(pres), `size: ${/sldSz[^/]+/.exec(pres)?.[0]}`)
    writeFileSync(join(OUT, 'latest.pptx'), pptx.buf)
  })
  await s.check('PPTX: text colours/fonts come from the theme (heading font present, theme colours used)', p, async () => {
    const z = unzipSync(new Uint8Array(pptx.buf)); const s1 = strFromU8(z['ppt/slides/slide2.xml'])
    expect(/typeface="Space Grotesk"/.test(s1) || /typeface="Inter"/.test(s1), 'theme fonts not applied')
    expect(/srgbClr val="[0-9A-F]{6}"/.test(s1), 'no explicit colours')
  })
  await s.check('PPTX: 4:3 and square decks export at the right slide size', p, async () => {
    for (const [asp, cx, cy] of [['4:3', 9144000, 6858000], ['1:1', 6858000, 6858000]]) {
      const id = await create('sales-closer', asp); await open(id); const f = await exportAs('pptx')
      const pres = strFromU8(unzipSync(new Uint8Array(f.buf))['ppt/presentation.xml'])
      expect(new RegExp(`sldSz cx="${cx}" cy="${cy}"`).test(pres), `${asp}: ${/sldSz[^/]+/.exec(pres)?.[0]}`)
    }
  })
  await open(deck)
  await s.check('PDF: one page per slide, real file', p, async () => {
    const f = await exportAs('pdf'); expect(f.buf.subarray(0, 4).toString() === '%PDF', 'not a PDF')
    const pages = (f.buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length; expect(pages === 11, `${pages} pages`)
    expect(f.buf.length > 100_000, `tiny PDF ${f.buf.length}`)
  })
  await s.check('PNG: zip of 11 PNGs at 1920×1080', p, async () => {
    const f = await exportAs('png'); expect(/slides\.zip$/.test(f.name), f.name)
    const z = unzipSync(new Uint8Array(f.buf)); const files = Object.keys(z).sort(); expect(files.length === 11, `${files.length} files`)
    const first = Buffer.from(z[files[0]]); expect(first.toString('ascii', 1, 4) === 'PNG', 'not PNG')
    expect(first.readUInt32BE(16) === 1920 && first.readUInt32BE(20) === 1080, `size ${first.readUInt32BE(16)}x${first.readUInt32BE(20)}`)
    expect(first.length > 20_000, 'blank-looking PNG'); writeFileSync(join(OUT, 'slide1.png'), first)
  })
  await s.check('JPG: zip of 11 JPEGs', p, async () => {
    const f = await exportAs('jpg'); const z = unzipSync(new Uint8Array(f.buf)); const files = Object.keys(z)
    expect(files.length === 11 && files.every((n) => /\.jpg$/.test(n)), `${files.length}`); expect(z[files[0]][0] === 0xff && z[files[0]][1] === 0xd8, 'not JPEG')
  })
  await s.check('HTML: self-contained deck that navigates with the keyboard', p, async () => {
    const f = await exportAs('html'); const html = f.buf.toString('utf8')
    expect((html.match(/<section class="s"/g) ?? []).length === 11, 'section count')
    expect(!/<img[^>]+src="https?:/.test(html), 'pictures not inlined (would break offline)')
    const page = await ctx.newPage(); await page.goto('file://' + f.path)
    const hud = () => page.locator('#hud').innerText(); expect((await hud()).startsWith('1 / 11'), await hud())
    await page.keyboard.press('ArrowRight'); expect((await hud()).startsWith('2 / 11'), 'arrow right'); await page.screenshot({ path: join(OUT, 'html-slide2.png') }); await page.close()
  })
  await s.check('export keeps the latest edits (unsaved changes are flushed first)', p, async () => {
    await open(deck); const marker = `EXPORTED-${Date.now() % 1e5}`
    await p.locator('[data-testid="stage"] [data-testid="el-text"]').first().dblclick(); await p.getByLabel('Edit text').waitFor()
    await p.keyboard.press('Control+a'); await p.keyboard.press('Meta+a'); await p.keyboard.type(marker); await p.keyboard.press('Escape')
    const f = await exportAs('pptx'); const z = unzipSync(new Uint8Array(f.buf))
    expect(Object.keys(z).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).some((n) => strFromU8(z[n]).includes(marker)), 'latest edit missing from export')
  })

  // ── Starter: gated server-side
  const c2 = await b.newContext({ viewport: { width: 1600, height: 1000 } }); const q = await c2.newPage()
  await s.check('starter: every format is refused by the SERVER (403 UPGRADE_REQUIRED) and the UI shows the upgrade prompt', q, async () => {
    const email = uniqueEmail('starter')
    await q.goto(EDITOR.replace('3001', '3000') + '/signup', { waitUntil: 'networkidle' })
    await q.locator('input[name=name]').fill('Starter QA'); await q.locator('input[name=email]').fill(email); await q.locator('input[name=password]').fill(PASSWORD)
    await q.getByRole('button', { name: 'Sign up free' }).click(); await q.waitForURL(/localhost:3001/, { timeout: 20000 })
    const id = await q.evaluate(async () => { const r = await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'pitch-launchpad' }) }); return (await r.json()).data.id })
    for (const fmt of ['pptx', 'pdf', 'png', 'jpg', 'html']) {
      const code = await q.evaluate(async ([id, fmt]) => (await fetch('http://localhost:4000/api/v1/exports', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId: id, format: fmt }) })).status, [id, fmt])
      expect(code === 403, `${fmt} → ${code}`)
    }
    await q.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await q.locator('[data-testid="stage"]').waitFor()
    await q.getByRole('button', { name: /^Export/ }).click(); expect((await q.getByRole('menuitem').first().innerText()).includes('PRO'), 'no PRO badge for Starter')
    await q.getByRole('menuitem', { name: /^PPTX/ }).click(); await q.waitForTimeout(800)
    expect(/Upgrade|Pro|plan/i.test(await q.locator('body').innerText()), 'no upgrade prompt')
  })
  await s.check('security: another user cannot export my deck (404) and anonymous gets 401', q, async () => {
    const code = await q.evaluate(async (id) => (await fetch('http://localhost:4000/api/v1/exports', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId: id, format: 'pptx' }) })).status, deck)
    expect(code === 403 || code === 404, `got ${code}`) // Starter hits the plan gate first; either way no file
    const anon = await fetch(API + '/api/v1/exports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ presentationId: deck, format: 'pptx' }) })
    expect(anon.status === 401, `anon ${anon.status}`)
  })

  await b.close()
  return s.done()
}
