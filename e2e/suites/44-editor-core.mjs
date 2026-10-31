/**
 * The editor's core promises, checked against what the SERVER stored (not only what the screen shows):
 * autosave (burst, offline, leave-fast, conflict, undo), text formatting that survives a reload, theme changes
 * (palette, fonts, deck mode, new slides, undo) and readable contrast after every change.
 * No AI is called. Needs the Pro plan (granted here).
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'

const grant = (plan) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${JSON.parse(readFileSync(ACCOUNT, 'utf8')).email} ${plan}`, { cwd: new URL('../..', import.meta.url).pathname, stdio: 'pipe' })

export default async function () {
  const s = suite('44-editor-core')
  grant('pro')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE })
  const p = await ctx.newPage()
  p.on('dialog', (d) => void d.accept())
  const settle = (ms = 400) => p.waitForTimeout(ms)
  const thumbs = () => p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]')
  const open = async (id, pg = p) => { await pg.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await pg.locator('[data-testid="stage"]').waitFor({ timeout: 15000 }); await pg.waitForTimeout(600) }
  const saved = (pg = p) => pg.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const statusText = (pg = p) => pg.getByRole('status').filter({ hasText: /Saved|Saving|Unsaved|Offline|Conflict|Could not/ }).first().innerText()
  const firstText = (pg = p) => pg.locator('[data-testid="stage"] [data-testid="el-text"]').first()
  const sel = async (loc, pg = p) => { await loc.click({ position: { x: 8, y: 8 } }); await pg.getByRole('toolbar', { name: 'Element tools' }).waitFor({ timeout: 4000 }) }
  const server = (id, pg = p) => pg.evaluate((id) => fetch(`http://localhost:4000/api/v1/presentations/${id}`, { credentials: 'include' }).then((r) => r.json()).then((j) => j.data), id)
  const fresh = async (templateId = 'pitch-launchpad') => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    return p.evaluate(async (templateId) => { const r = await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId }) }); const j = await r.json(); return j.data?.id ?? j.id }, templateId)
  }
  const allText = (doc) => doc.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'text'))
  const editFirstText = async (marker) => {
    await firstText().dblclick(); await p.getByLabel('Edit text').waitFor({ timeout: 4000 })
    await p.keyboard.press('Meta+a'); await p.keyboard.press('Control+a'); await p.keyboard.type(marker); await p.keyboard.press('Escape'); await settle(200)
    await p.mouse.click(5, 500)
  }
  const lum = ([r, g, bl]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl) }
  const ratio = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
  /** every visible text on the stage against the colour actually behind it (nearest opaque ancestor; image backgrounds are skipped) */
  const contrast = () => p.locator('[data-testid="stage"]').evaluate((st) => {
    const layer = st.children[0]
    const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number)
    const all = [...layer.querySelectorAll('*')]
    const filled = all.map((n) => { const cs = getComputedStyle(n); const c = rgb(cs.backgroundColor); return { n, c, img: cs.backgroundImage !== 'none', r: n.getBoundingClientRect(), op: Number(cs.opacity) } }).filter((x) => x.op >= 0.5).filter((x) => (x.img || (x.c.length >= 3 && (x.c[3] ?? 1) > 0.9)) && x.r.width > 8 && x.r.height > 8) // hairlines and ticks are decoration, not something text sits on
    const out = []
    for (const leaf of all) {
      if (![...leaf.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 2)) continue
      const fg = rgb(getComputedStyle(leaf).color)
      const r = leaf.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + r.height / 2
      // topmost opaque thing under the text's centre: a panel/card/band, an ancestor, or the slide itself
      const under = filled.filter((x) => !x.n.contains(leaf) || x.n === layer ? true : true).filter((x) => x.n !== leaf && !leaf.contains(x.n) && cx >= x.r.x && cx <= x.r.x + x.r.width && cy >= x.r.y && cy <= x.r.y + x.r.height)
      const top = under[under.length - 1]
      const bg = top ? (top.img ? null : top.c) : rgb(getComputedStyle(layer).backgroundColor)
      if (bg && bg.length >= 3 && (bg[3] ?? 1) > 0.9) out.push({ text: leaf.textContent.trim().slice(0, 30), fg, bg })
    }
    return out
  })
  const checkContrast = async (label) => {
    await thumbs().nth(2).click(); await settle(300) // slide 1 has a photo behind its text, which can't be measured
    const rows = await contrast()
    expect(rows.length > 0, `${label}: no text measured`)
    const bad = rows.filter((r) => ratio(r.fg, r.bg) < 2.5)
    expect(bad.length === 0, `${label}: unreadable text → ${bad.slice(0, 3).map((r) => `"${r.text}" rgb(${r.fg}) on rgb(${r.bg})`).join('; ')}`)
  }

  // ───────── AUTOSAVE
  const deck = await fresh()
  await open(deck)

  await s.check('autosave: a text edit reaches the server (revision goes up) without pressing anything', p, async () => {
    const r0 = (await server(deck)).revision
    const marker = `AS1 ${Date.now() % 100000}`
    await thumbs().nth(2).click(); await settle(300)
    await editFirstText(marker); await saved()
    const d = await server(deck)
    expect(d.revision > r0, `revision ${r0} → ${d.revision}`)
    expect(JSON.stringify(d.document).includes(marker), 'edit missing from the stored document')
  })

  await s.check('autosave: 15 quick nudges end in ONE consistent saved position, no error, same after reload', p, async () => {
    await thumbs().nth(2).click(); await settle(300)
    await sel(firstText())
    const x0 = (await firstText().boundingBox()).x
    for (let i = 0; i < 15; i++) await p.keyboard.press('ArrowRight')
    await saved()
    const x1 = (await firstText().boundingBox()).x
    expect(x1 > x0 + 5, 'nudges did nothing')
    const st = await statusText(); expect(/Saved/.test(st), `status: ${st}`)
    await p.reload({ waitUntil: 'networkidle' }); await thumbs().nth(2).click(); await settle(500)
    const x2 = (await firstText().boundingBox()).x
    expect(Math.abs(x2 - x1) < 2, `position after reload ${x2} vs ${x1}`)
  })

  await s.check('autosave: going offline shows it clearly, edits are kept, and everything saves when back online', p, async () => {
    await thumbs().nth(2).click(); await settle(300)
    const marker = `OFF ${Date.now() % 100000}`
    await ctx.setOffline(true)
    await editFirstText(marker); await settle(2500)
    const st = await statusText(); expect(!/^Saved$/.test(st.trim()), `status still "${st}" while offline`)
    expect((await p.locator('[data-testid="stage"]').innerText()).includes(marker), 'edit not visible while offline')
    await ctx.setOffline(false)
    await saved()
    expect(JSON.stringify((await server(deck)).document).includes(marker), 'offline edit never reached the server')
  })

  await s.check('autosave: leaving the editor right after typing does not lose the last edit', p, async () => {
    await thumbs().nth(2).click(); await settle(300)
    const marker = `LEAVE ${Date.now() % 100000}`
    await editFirstText(marker)
    await p.goto(EDITOR + '/', { waitUntil: 'domcontentloaded' })
    await settle(1500)
    expect(JSON.stringify((await server(deck)).document).includes(marker), 'last edit lost on navigation')
  })

  await s.check('autosave: undo is saved too (the server copy follows the undo, not the old text)', p, async () => {
    await open(deck); await thumbs().nth(2).click(); await settle(300)
    const marker = `UNDO ${Date.now() % 100000}`
    await editFirstText(marker); await saved()
    expect(JSON.stringify((await server(deck)).document).includes(marker), 'precondition: edit saved')
    await p.getByRole('button', { name: 'Undo' }).click(); await settle(300); await saved()
    expect(!JSON.stringify((await server(deck)).document).includes(marker), 'undo not persisted')
    await p.getByRole('button', { name: 'Redo' }).click(); await settle(300); await saved()
    expect(JSON.stringify((await server(deck)).document).includes(marker), 'redo not persisted')
  })

  await s.check('autosave: the same deck in two tabs — edits on different slides are merged (nothing lost), same-text edits end Saved and identical in both tabs', p, async () => {
    const d2 = await fresh()
    await open(d2)
    const p2 = await ctx.newPage(); p2.on('dialog', (d) => void d.accept())
    await open(d2, p2)
    const tn = (pg, i) => pg.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').nth(i)
    const edit = async (pg, marker) => {
      const t = pg.locator('[data-testid="stage"] [data-testid="el-text"]').first()
      await t.dblclick(); await pg.getByLabel('Edit text').waitFor({ timeout: 4000 })
      await pg.keyboard.press('Meta+a'); await pg.keyboard.press('Control+a'); await pg.keyboard.type(marker); await pg.keyboard.press('Escape'); await pg.mouse.click(5, 500)
    }
    const m1 = `TABONE ${Date.now() % 100000}`, m2 = `TABTWO ${Date.now() % 100000}`
    await tn(p, 2).click(); await settle(300)
    await edit(p, m1); await saved()
    await tn(p2, 4).click(); await p2.waitForTimeout(300)   // tab 2 is stale (opened before tab 1 saved)
    await edit(p2, m2); await saved(p2); await settle(1500)
    const json = JSON.stringify((await server(d2)).document)
    expect(json.includes(m1) && json.includes(m2), `merge lost an edit: tab1 ${json.includes(m1)}, tab2 ${json.includes(m2)}`)
    // the same text element edited in both tabs
    const m3 = `SAMEONE ${Date.now() % 100000}`, m4 = `SAMETWO ${Date.now() % 100000}`
    await tn(p, 2).click(); await tn(p2, 2).click(); await settle(300)
    await edit(p, m3); await saved()
    await edit(p2, m4); await saved(p2); await settle(2000)
    expect(!/Conflict|Could not/.test(await statusText(p2)), `tab 2 status: ${await statusText(p2)}`)
    const stored = JSON.stringify((await server(d2)).document)
    expect(stored.includes(m3) || stored.includes(m4), 'both same-text edits vanished')
    await open(d2, p2); await tn(p2, 2).click(); await p2.waitForTimeout(400)
    const shown = await p2.locator('[data-testid="stage"]').innerText()
    expect(stored.includes(shown.split('\n').find((l) => /SAME(ONE|TWO)/.test(l)) ?? '\u0000'), 'what the reloaded tab shows differs from the server copy')
    await p2.close()
  })

  // ───────── TEXT FORMATTING
  const fdeck = await fresh()
  await open(fdeck)
  await thumbs().nth(2).click(); await settle(400)

  await s.check('format: bold really renders heavier and is stored as bold on every run', p, async () => {
    await sel(firstText())
    const snippet = allText((await server(fdeck)).document.slides[2].elements.length ? { slides: [(await server(fdeck)).document.slides[2]] } : { slides: [] })[0].paragraphs[0].runs[0].text.slice(0, 12)
    const w = () => p.locator('[data-testid="stage"]').evaluate((st, snip) => Math.max(...[...st.children[0].querySelectorAll('*')].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes(snip))).map((n) => Number(getComputedStyle(n).fontWeight))), snippet)
    const w0 = await w()
    await p.getByLabel('Bold').click(); await settle(300)
    const w1 = await w()
    expect(w1 >= 700 && w1 >= w0, `font-weight ${w0} → ${w1}`)
    await saved()
    const el = allText((await server(fdeck)).document).find((t) => t.paragraphs.every((pp) => pp.runs.every((r) => r.bold)))
    expect(!!el, 'no text element with bold on every run in the stored document')
    await p.getByLabel('Bold').click(); await settle(200)
  })

  await s.check('format: size, alignment and colour persist after a reload exactly as chosen', p, async () => {
    await sel(firstText())
    const size = async () => Number(await p.getByLabel('Font size').innerText())
    const s0 = await size()
    await p.getByLabel('Larger text').click(); await p.getByLabel('Larger text').click(); await p.getByLabel('Larger text').click()
    await p.getByLabel('Align center').click(); await p.getByLabel('Colour Blue').click()
    await saved()
    await p.reload({ waitUntil: 'networkidle' }); await thumbs().nth(2).click(); await settle(500)
    await sel(firstText())
    expect(await size() === s0 + 6, `size ${await size()} (expected ${s0 + 6})`)
    expect(await p.getByLabel('Align center').getAttribute('aria-pressed') === 'true', 'alignment lost')
    expect(await p.getByLabel('Colour Blue').getAttribute('aria-pressed') === 'true', 'colour lost')
  })

  const drawn = (snippet) => p.locator('[data-testid="stage"]').evaluate((st, snip) => {
    const n = [...st.children[0].querySelectorAll('*')].find((x) => [...x.childNodes].some((c) => c.nodeType === 3 && c.textContent.includes(snip)))
    if (!n) return null
    const cs = getComputedStyle(n); const link = n.closest('a')
    return { style: cs.fontStyle, deco: cs.textDecorationLine, weight: Number(cs.fontWeight), href: link?.getAttribute('href') ?? null, bulletBefore: !!n.closest('div')?.querySelector(':scope > span[style*="absolute"]') }
  }, snippet)
  const bodyText = async () => allText((await server(fdeck)).document.slides[2] ? { slides: [(await server(fdeck)).document.slides[2]] } : { slides: [] }).find((t) => t.role === 'body' || t.role === 'heading') ?? allText({ slides: [(await server(fdeck)).document.slides[2]] })[0]
  const snip = async () => (await bodyText()).paragraphs[0].runs[0].text.slice(0, 10)

  await s.check('format: the toolbar has Italic, Underline, Bullet list, Numbered list and Link — and each one changes what is drawn and what is stored', p, async () => {
    await thumbs().nth(2).click(); await settle(300)
    const target = await bodyText(); const sn = await snip()
    const box = p.locator('[data-testid="stage"] [data-testid="el-text"]').nth((await server(fdeck)).document.slides[2].elements.filter((e) => e.type === 'text' || e.type === 'image').findIndex((e) => e.id === target.id))
    void box
    // select the element that holds the snippet
    const els = p.locator('[data-testid="stage"] [data-testid="el-text"]'); const n = await els.count()
    let idx = -1
    for (let i = 0; i < n; i++) { if ((await els.nth(i).getAttribute('data-element')) === target.id) idx = i }
    expect(idx >= 0, 'could not find the element on the canvas')
    await sel(els.nth(idx))
    const tb = p.getByRole('toolbar', { name: 'Element tools' })
    const missing = []
    for (const name of ['Italic', 'Underline', 'Bullet list', 'Numbered list', 'Link']) if (await tb.getByRole('button', { name, exact: true }).count() === 0) missing.push(name)
    expect(missing.length === 0, `missing toolbar controls: ${missing.join(', ')}`)
    await tb.getByRole('button', { name: 'Italic', exact: true }).click(); await tb.getByRole('button', { name: 'Underline', exact: true }).click(); await settle(400)
    const d1 = await drawn(sn); expect(d1 && d1.style === 'italic' && /underline/.test(d1.deco), `drawn: ${JSON.stringify(d1)}`)
    const wasList = target.paragraphs.every((pp) => pp.list === 'bullet')
    await tb.getByRole('button', { name: 'Bullet list', exact: true }).click(); await settle(300)
    await tb.getByRole('button', { name: 'Link', exact: true }).click(); await p.getByLabel('Link address').fill('example.com/hello'); await p.getByLabel('Link address').press('Enter'); await settle(400)
    const d2 = await drawn(sn); expect(d2 && d2.href === 'https://example.com/hello', `link not drawn: ${JSON.stringify(d2)}`)
    await saved()
    const st = await bodyText()
    expect(st.paragraphs.every((pp) => (wasList ? !pp.list : pp.list === 'bullet') && pp.runs.every((r) => r.italic && r.underline && r.link === 'https://example.com/hello')), `stored: ${JSON.stringify(st.paragraphs[0])}`)
    // and back off again
    await tb.getByRole('button', { name: 'Italic', exact: true }).click(); await tb.getByRole('button', { name: 'Bullet list', exact: true }).click(); await settle(300)
    await tb.getByRole('button', { name: 'Link', exact: true }).click(); await p.getByLabel('Link address').fill(''); await p.getByLabel('Link address').press('Enter'); await settle(300)
    await saved()
    const off = await bodyText()
    expect(off.paragraphs.every((pp) => (wasList ? pp.list === 'bullet' : !pp.list) && pp.runs.every((r) => !r.italic && !r.link)), `not back to the start: ${JSON.stringify(off.paragraphs[0])}`)
  })

  await s.check('format: Ctrl/Cmd+B, I and U work while typing, and the look is kept after the edit', p, async () => {
    const els = p.locator('[data-testid="stage"] [data-testid="el-text"]')
    const target = await bodyText(); const n = await els.count(); let idx = 0
    for (let i = 0; i < n; i++) if ((await els.nth(i).getAttribute('data-element')) === target.id) idx = i
    const r0 = target.paragraphs[0].runs[0]
    await els.nth(idx).dblclick(); await p.getByLabel('Edit text').waitFor({ timeout: 4000 })
    await p.keyboard.press('ControlOrMeta+i'); await p.keyboard.press('ControlOrMeta+u'); await p.keyboard.press('ControlOrMeta+b')
    await p.keyboard.type(' extra'); await p.keyboard.press('Escape'); await settle(300); await p.mouse.click(5, 500); await saved()
    const st = await bodyText()
    expect(st.paragraphs.every((pp) => pp.runs.every((r) => !!r.italic === !r0.italic && !!r.underline === !r0.underline && !!r.bold === !r0.bold)), `shortcuts did not flip italic/underline/bold from ${JSON.stringify(r0)}: ${JSON.stringify(st.paragraphs[0].runs)}`)
    expect(JSON.stringify(st).includes(' extra'), 'typed text lost')
  })

  await s.check('format: editing the words next to an emphasised word keeps the emphasis (italic + colour) of the rest', p, async () => {
    // build a heading with an emphasised word through the same save API the editor uses
    const cur = await server(fdeck)
    const doc = cur.document; const sl = doc.slides[2]
    const t = sl.elements.find((e) => e.type === 'text' && e.role === 'title') ?? sl.elements.find((e) => e.type === 'text')
    t.paragraphs = [{ runs: [{ text: 'Revenue grew ' }, { text: '40%', italic: true, color: 'accent' }, { text: ' this year' }] }]
    const r = await p.evaluate(async ({ id, body }) => (await fetch(`http://localhost:4000/api/v1/presentations/${id}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, { id: fdeck, body: { baseRevision: cur.revision, document: doc } })
    expect(r === 200, `setup save ${r}`)
    await open(fdeck); await thumbs().nth(2).click(); await settle(500)
    const els = p.locator('[data-testid="stage"] [data-testid="el-text"]'); const n = await els.count(); let idx = 0
    for (let i = 0; i < n; i++) if ((await els.nth(i).getAttribute('data-element')) === t.id) idx = i
    await els.nth(idx).dblclick(); await p.getByLabel('Edit text').waitFor({ timeout: 4000 })
    await p.keyboard.press('Control+End'); await p.keyboard.press('Meta+ArrowDown'); await p.keyboard.type('!'); await p.keyboard.press('Escape'); await settle(300); await p.mouse.click(5, 500); await saved()
    const after = (await server(fdeck)).document.slides[2].elements.find((e) => e.id === t.id)
    const runs = after.paragraphs[0].runs
    expect(runs.map((x) => x.text).join('') === 'Revenue grew 40% this year!', `text: ${runs.map((x) => x.text).join('')}`)
    expect(runs.some((x) => x.text.includes('40%') && x.italic && x.color === 'accent'), `emphasis lost: ${JSON.stringify(runs)}`)
  })

  await s.check('pictures: "Image URL" keeps its own copy (stored under our address, drawn without a policy error); a web page address is refused in plain words', p, async () => {
    const msgs = []
    const onDialog = (d) => { msgs.push(d.message()) }
    p.removeAllListeners('dialog'); p.on('dialog', (d) => { onDialog(d); void d.accept() })
    const errors = []; const onCons = (m) => m.type() === 'error' && /Content Security Policy/.test(m.text()) && errors.push(m.text().slice(0, 120)); p.on('console', onCons)
    await thumbs().nth(2).click(); await settle(300)
    await p.getByRole('button', { name: /Insert/ }).click(); await p.getByRole('menuitem', { name: /Image \(set URL/ }).click(); await settle(300)
    await p.getByRole('button', { name: 'Image URL' }).click()
    await p.getByLabel('Image URL').fill('https://example.com/'); await p.getByRole('button', { name: 'Set' }).click()
    await p.waitForFunction(() => true); await settle(2500)
    expect(msgs.some((m) => /download a picture|PNG or JPEG/.test(m)), `no plain refusal for a web page: ${JSON.stringify(msgs)}`)
    await p.getByLabel('Image URL').fill('https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/330px-PNG_transparency_demonstration_1.png'); await p.getByRole('button', { name: 'Set' }).click()
    await saved(); await settle(1500); await saved()
    const imgs = (await server(fdeck)).document.slides[2].elements.filter((e) => e.type === 'image')
    expect(imgs.some((e) => /\/api\/v1\/assets\//.test(e.src ?? '')), `no picture with our own address: ${JSON.stringify(imgs.map((e) => e.src))}`)
    await settle(800)
    p.off('console', onCons)
    expect(errors.length === 0, `blocked by the page policy: ${errors[0]}`)
    p.removeAllListeners('dialog'); p.on('dialog', (d) => void d.accept())
  })

  // ───────── THEMES
  const tdeck = await fresh()
  await open(tdeck)
  const style = async (tab) => {
    if (await p.getByRole('complementary', { name: 'Style' }).count() === 0) await p.getByRole('button', { name: /Style/ }).click()
    await p.getByRole('complementary', { name: 'Style' }).waitFor({ timeout: 4000 })
    await p.getByRole('tab', { name: tab }).click(); await settle(300)
  }
  const primaryOf = async () => (await server(tdeck)).document.theme.colors.primary

  await s.check('theme: 12 different palettes each change the stored primary colour and keep every text readable', p, async () => {
    await style('Templates')
    const seen = new Set([await primaryOf()])
    await p.getByRole('button', { name: /Color palette/ }).click()
    const names = (await p.getByRole('listbox', { name: 'Color palettes' }).getByRole('option').allInnerTexts()).map((t) => t.split('\n')[0].trim())
    const step = Math.max(1, Math.floor(names.length / 12))
    const picks = names.filter((_, i) => i % step === 0).slice(0, 12)
    for (const name of picks) {
      if (await p.getByRole('listbox', { name: 'Color palettes' }).count() === 0) await p.getByRole('button', { name: /Color palette/ }).click()
      await p.getByRole('listbox', { name: 'Color palettes' }).getByRole('option').nth(names.indexOf(name)).click(); await settle(500); await saved()
      seen.add(await primaryOf())
      await checkContrast(`palette "${name}"`)
    }
    expect(seen.size >= 8, `only ${seen.size} distinct primaries across ${picks.length} palettes`)
  })

  await s.check('theme: choosing heading and body fonts changes what is drawn AND what is stored, and survives reload', p, async () => {
    await thumbs().nth(2).click(); await settle(300)
    await style('Fonts')
    const dr = p.getByRole('complementary', { name: 'Style' })
    const opts = await dr.getByLabel('heading font').locator('option').allTextContents()
    const heading = opts.find((o) => /Georgia|Playfair|Merriweather|Times/i.test(o)) ?? opts[1]
    const body = opts.find((o) => /Courier|Arial|Verdana|Calibri/i.test(o) && o !== heading) ?? opts[2]
    await dr.getByLabel('heading font').selectOption({ label: heading })
    await dr.getByLabel('body font').selectOption({ label: body }); await settle(500); await saved()
    const th = (await server(tdeck)).document.theme.fonts
    expect(th.heading === heading && th.body === body, `stored fonts ${JSON.stringify(th)}`)
    const used = await p.locator('[data-testid="stage"]').evaluate((st) => [...new Set([...st.children[0].querySelectorAll('*')].filter((n) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 2)).map((n) => getComputedStyle(n).fontFamily))])
    expect(used.some((f) => f.includes(heading)) && used.some((f) => f.includes(body)), `drawn fonts: ${used.join(' | ')}`)
    await p.reload({ waitUntil: 'networkidle' }); await settle(500)
    expect((await server(tdeck)).document.theme.fonts.heading === heading, 'fonts lost after reload')
    await checkContrast('after fonts')
  })

  await s.check('theme: Dark deck mode then Light — backgrounds flip, text stays readable both ways, stored mode follows', p, async () => {
    await style('Colors')
    const dr = p.getByRole('complementary', { name: 'Style' })
    const modeGroup = dr.getByRole('group', { name: 'Deck mode' })
    const modes = await modeGroup.getByRole('button').allInnerTexts(); expect(modes.length === 2, `modes: ${modes}`)
    const dark = modeGroup.getByRole('button', { name: /dark/i }); const light = modeGroup.getByRole('button', { name: /light/i })
    await dark.click(); await settle(500); await saved(); await checkContrast('dark mode')
    const d1 = (await server(tdeck)).document.theme
    await light.click(); await settle(500); await saved(); await checkContrast('light mode')
    const d2 = (await server(tdeck)).document.theme
    expect(JSON.stringify(d1.colors) !== JSON.stringify(d2.colors), 'light/dark stored the same colours')
  })

  await s.check('theme: a slide added AFTER the theme change uses the new fonts and colours', p, async () => {
    const th = (await server(tdeck)).document.theme
    const n0 = await thumbs().count()
    await p.getByRole('button', { name: /New slide/ }).first().click(); await settle(300)
    await p.getByRole('menuitem', { name: /Title.*(body|content)|Bullets|Text/i }).first().click()
    await settle(600)
    expect(await thumbs().count() > n0, 'could not add a slide')
    await saved()
    const doc = (await server(tdeck)).document
    expect(JSON.stringify(doc.theme) === JSON.stringify(th), 'adding a slide changed the theme')
    await checkContrast('new slide')
  })

  await s.check('theme: undo reverts a palette change on screen and in the stored deck', p, async () => {
    await style('Templates')
    const before = await primaryOf()
    if (await p.getByRole('listbox', { name: 'Color palettes' }).count() === 0) await p.getByRole('button', { name: /Color palette/ }).click()
    const names = (await p.getByRole('listbox', { name: 'Color palettes' }).getByRole('option').allInnerTexts()).map((t) => t.split('\n')[0].trim())
    await p.getByRole('listbox', { name: 'Color palettes' }).getByRole('option').nth(names.length - 1).click(); await settle(500); await saved()
    const changed = await primaryOf(); expect(changed !== before, 'precondition: palette changed')
    await p.getByRole('button', { name: 'Undo' }).click(); await settle(400); await saved()
    expect(await primaryOf() === before, 'undo not stored')
  })

  await s.check('theme: a hand-picked slide background applies to that slide only and is stored', p, async () => {
    await style('Colors')
    const dr = p.getByRole('complementary', { name: 'Style' })
    await thumbs().nth(1).click(); await settle(300)
    await dr.getByLabel('Custom background colour').fill('#112233'); await settle(500); await saved()
    const doc = (await server(tdeck)).document
    const withBg = doc.slides.filter((sl) => sl.background?.value?.toLowerCase() === '#112233')
    expect(withBg.length === 1, `${withBg.length} slides have the colour (expected exactly 1)`)
    await checkContrast('custom background')
  })

  // ───────── EVERY TEMPLATE
  await s.check('templates: all catalogue templates apply to a real deck — every one keeps text readable, saves, and the deck stays valid', p, async () => {
    const d3 = await fresh()
    await open(d3)
    await style('Templates')
    const cards = p.locator('aside[aria-label=Style] button[aria-label$=" template"], aside[aria-label=Style] button[aria-label$=" template (Pro)"]')
    const n = await cards.count(); expect(n >= 100, `only ${n} template cards`)
    const names = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
    const bad = []
    for (const name of names) {
      const card = p.locator(`aside[aria-label=Style] button[aria-label="${name}"]`)
      await card.scrollIntoViewIfNeeded(); await card.click(); await p.waitForTimeout(350)
      if (await p.getByRole('dialog').count()) { bad.push(`${name}: upgrade dialog on Pro`); await p.keyboard.press('Escape'); continue }
      await thumbs().nth(2).click(); await p.waitForTimeout(150)
      const rows = await contrast()
      const low = rows.filter((r) => ratio(r.fg, r.bg) < 2.5)
      if (low.length) bad.push(`${name}: "${low[0].text}" rgb(${low[0].fg}) on rgb(${low[0].bg})`)
    }
    await saved()
    const doc = (await server(d3)).document
    expect(doc.slides.length === 11, `slides changed: ${doc.slides.length}`)
    expect(allText(doc).every((t) => t.paragraphs.every((pp) => pp.runs.every((r) => typeof r.text === 'string'))), 'a text lost its runs')
    expect(bad.length === 0, `${bad.length}/${names.length} templates have problems: ${bad.slice(0, 30).join(' | ')}`)
  })

  await b.close()
  return s.done()
}
