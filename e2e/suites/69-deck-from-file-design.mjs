import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, tsx, person } from '../kits-lib.mjs'

/**
 * "Use a file's design" end to end in a real browser: upload a .pptx through the Home prompt box, the chip, the create screen (Write it for me / I'll add the data myself), the finished deck
 * (theme, fonts, colours, words about the new topic, no sample words, nothing overflowing, no uploader pictures), "Use its design too" on an attached .pptx, the editor's "From your
 * template" menu, the Starter upgrade prompt, PDF designs (a text PDF works, a PDF of pictures is refused with the reason), charts kept with placeholder data or the person's own figures, the design list and delete. Two designs are built in code (one dark, one light); two AI decks call the REAL model.
 * Set E2E_SHOTS to a folder to also get screenshots of each design's slides and of the generated decks (rendered by the editor itself).
 */
const SHOTS = process.env.E2E_SHOTS
export default async function () {
  const s = suite('69-deck-from-file-design')
  const b = await launch()
  const dir = mkdtempSync(join(tmpdir(), 'design-fx-'))
  if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  const errors = []
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]|status of (4\d\d|503)/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  }
  const tid = (p, t) => p.locator(`[data-testid="${t}"]`)
  const SAMPLES = ['Mission to Mars', 'crew briefing', 'launch window', 'Fast transfer', 'Slow transfer', 'ORBIT LABS', 'crew@orbitlabs', 'Autumn market', 'Plan your visit', 'GREEN MARKET', 'greenmarket.example', 'Three things to try']
  const wordsOf = (doc) => doc.slides.flatMap((sl) => sl.elements.flatMap((e) => (e.type === 'text' ? e.paragraphs.flatMap((pp) => pp.runs.map((r) => r.text)) : [])))
  const deckIdOf = (p) => /\/edit\/([^/?#]+)/.exec(p.url())?.[1]
  const waitWritten = async (A, id) => { for (let i = 0; i < 160; i++) { const d = (await api.get(A, `/presentations/${id}`)).data?.document; if (d && d.slides.length && d.slides.every((x) => !x.writing)) return d; await new Promise((r) => setTimeout(r, 1500)) } throw new Error('the deck was never completed') }
  const shoot = async (p, A, id, name, count) => {
    if (!SHOTS) return
    await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    await tid(p, 'stage').waitFor({ timeout: 20000 })
    for (let i = 0; i < count; i++) { await tid(p, `thumb-${i}`).click(); await p.waitForTimeout(350); await tid(p, 'stage').screenshot({ path: join(SHOTS, `${name}-${i + 1}.png`) }) }
  }
  /** the template's own slides as a deck, drawn by the editor, for the side-by-side */
  const referenceDeck = async (A, tplId, title) => {
    const t = (await api.get(A, `/file-templates/${tplId}`)).data
    const made = await api.post(A, '/presentations', { title, aspectRatio: t.aspect })
    const id = made.data.id
    const cur = (await api.get(A, `/presentations/${id}`)).data
    const res = await fetchPut(A, id, cur.revision, { ...cur.document, theme: t.theme, slides: t.slides })
    expect(res.status === 200, `reference deck save ${res.status}`)
    return { id, count: t.slides.length }
  }
  const fetchPut = async (A, id, baseRevision, document) => {
    const r = await A.ctx.request.fetch(`${process.env.E2E_API ?? 'http://localhost:4000'}/api/v1/presentations/${id}`, { method: 'PUT', headers: { Origin: process.env.E2E_WEB ?? 'http://localhost:3000', 'Content-Type': 'application/json' }, data: { baseRevision, document } })
    return { status: r.status() }
  }
  const fromHome = async (p, { file, prompt }) => {
    await p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
    await tid(p, 'file-tpl-open').click()
    await tid(p, 'file-tpl-dialog').waitFor({ timeout: 8000 })
    await tid(p, 'file-tpl-input').setInputFiles(file)
    await tid(p, 'home-file-template').waitFor({ timeout: 60000 })
    if (prompt) await p.getByLabel('Presentation prompt').fill(prompt)
    await p.locator('form button[type=submit]').first().click()
    await p.waitForURL(/\/create/, { timeout: 15000 })
    await tid(p, 'tpl-using').waitFor({ timeout: 15000 })
  }
  try {
    console.log(tsx(`scripts/qa-make-design-fixtures.ts ${dir}`))
    const DARK = join(dir, 'midnight-orbit.pptx'), LIGHT = join(dir, 'citrus-paper.pptx')
    const G = await person(b, 'df', 'pro')
    const S = await person(b, 'dfs')
    const { p } = G
    watch(p); watch(S.p)
    let darkId, lightId, darkDeck, lightDeck, manualDeck, darkTpl, manualTplId

    await s.check('T1 Starter: the control is visible with a lock, opens the upgrade prompt, and the server refuses an upload', S.p, async () => {
      await S.p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
      const c = tid(S.p, 'file-tpl-open')
      await c.waitFor({ timeout: 15000 })
      expect(/Pro/.test(await c.innerText()), 'no Pro badge on the locked control')
      await c.click()
      await S.p.getByRole('dialog').waitFor({ timeout: 8000 })
      expect(/Pro, Gold and Premium/.test(await S.p.getByRole('dialog').innerText()), 'no upgrade message')
      expect((await tid(S.p, 'file-tpl-dialog').count()) === 0, 'the picker opened for Starter')
      const r = await api.upload(S, '/file-templates', { name: 'x.pptx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK') })
      expect(r.status === 403 && r.body?.error?.details?.feature === 'templateFromFile', `${r.status} ${JSON.stringify(r.body?.error)}`)
    })

    await s.check('T2 Pro: the picker explains itself (PDF too); a PDF of pictures is refused with the reason; an old .ppt and a text file are refused', p, async () => {
      await p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
      await tid(p, 'file-tpl-open').click()
      await tid(p, 'file-tpl-dialog').waitFor({ timeout: 8000 })
      await tid(p, 'file-tpl-empty').waitFor({ timeout: 8000 })
      expect(!/coming soon/i.test(await tid(p, 'file-tpl-dialog').innerText()), 'still says coming soon')
      expect(/PDF/.test(await tid(p, 'file-tpl-dialog').innerText()), 'no PDF hint')
      await tid(p, 'file-tpl-input').setInputFiles(join(dir, 'picture-pages.pdf'))
      await tid(p, 'file-tpl-error').waitFor({ timeout: 30000 })
      const msg = await tid(p, 'file-tpl-error').innerText()
      expect(/pictures/.test(msg) && /\.pptx/.test(msg), `no reason given: ${msg}`)
      expect((await tid(p, 'home-file-template').count()) === 0, 'a picture PDF became a design')
      await tid(p, 'file-tpl-input').setInputFiles({ name: 'old.ppt', mimeType: 'application/vnd.ms-powerpoint', buffer: Buffer.from('x') })
      expect(/\.pptx/.test(await tid(p, 'file-tpl-error').innerText()), 'no .ppt message')
    })

    await s.check('T3 Pro: upload a dark .pptx in the prompt box: a chip with its name, slide count and the replaced font; it can be removed; the prompt stays', p, async () => {
      await p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
      await tid(p, 'file-tpl-open').click()
      await tid(p, 'file-tpl-input').setInputFiles(DARK)
      await tid(p, 'home-file-template').waitFor({ timeout: 60000 })
      const t = await tid(p, 'home-file-template').innerText()
      expect(/midnight-orbit/.test(t) && /5 slides/.test(t), t)
      expect(/Segoe UI/.test(await tid(p, 'home-file-template-fonts').innerText()), 'no replaced-font note')
      await p.getByLabel('Presentation prompt').fill('keep me')
      await tid(p, 'home-file-template-remove').click()
      expect((await tid(p, 'home-file-template').count()) === 0 && (await p.getByLabel('Presentation prompt').inputValue()) === 'keep me', 'remove broke the prompt or left the chip')
      darkId = (await api.get(G, '/file-templates')).data.templates[0].id
      expect(!!darkId, 'the design was not stored')
    })

    await s.check('T4 the create screen: "Using your template", both modes, the template\'s slide count, Morph greyed with its reason; no analysis step', p, async () => {
      await fromHome(p, { file: LIGHT, prompt: 'A guide to composting for first-time gardeners in a small city flat' })
      lightId = (await api.get(G, '/file-templates')).data.templates[0].id
      const using = await tid(p, 'tpl-using').innerText()
      expect(/citrus-paper/.test(using) && /5 slides/.test(using), using)
      expect((await tid(p, 'tpl-mode-ai').getAttribute('aria-checked')) === 'true', 'AI is not the default')
      expect((await tid(p, 'tpl-count').inputValue()) === '5', 'the slide count is not the template\'s')
      expect(/Not available with your own design/.test(await tid(p, 'tpl-morph-off').innerText()), 'no Morph reason')
      await tid(p, 'tpl-mode-manual').click()
      expect(/Create the slides/.test(await tid(p, 'tpl-start').innerText()), 'manual button')
      await tid(p, 'tpl-mode-ai').click()
    })

    await s.check('T5 AI mode (real model), LIGHT design: the finished deck has the file\'s slides, theme, fonts and colours, new words about the topic, no sample words, nothing overflowing', p, async () => {
      await tid(p, 'tpl-start').click()
      await p.waitForURL(/\/edit\//, { timeout: 240000 })
      lightDeck = deckIdOf(p)
      const doc = await waitWritten(G, lightDeck)
      const t = (await api.get(G, `/file-templates/${lightId}`)).data
      expect(doc.slides.length === 5, `slides ${doc.slides.length}`)
      expect(JSON.stringify(doc.theme) === JSON.stringify(t.theme), 'the theme differs from the file\'s')
      expect(doc.templateId === lightId, 'no template reference on the deck')
      expect(doc.slides.every((x) => x.manual && x.ownLook && !x.writing), 'slides are not the file\'s own looks')
      const words = wordsOf(doc).join(' | ')
      for (const w of SAMPLES) expect(!words.includes(w), `sample words shipped: ${w}`)
      expect(/compost/i.test(words), `the words are not about composting: ${words.slice(0, 300)}`)
      const over = doc.slides.flatMap((x) => x.validation.issues).filter((i) => i.code === 'overflow')
      expect(over.length === 0, `overflow: ${JSON.stringify(over)}`)
      const tplSrc = new Set(t.slides.flatMap((x) => x.elements.filter((e) => e.type === 'image' && e.src).map((e) => e.src)))
      const mine = doc.slides.flatMap((x) => x.elements.filter((e) => e.type === 'image' && e.src).map((e) => e.src))
      expect(!mine.some((u) => tplSrc.has(u)), 'the uploader\'s own picture is in the new deck')
      expect(doc.slides[0].background.value === t.slides[0].background.value, 'cover background differs')
      await tid(p, 'stage').waitFor({ timeout: 20000 }) // the deck opens in the editor
    })

    await s.check('T6 the generated deck opens, draws every slide, text stays inside each box, exports to PPTX, and an edit is saved and survives a reload', p, async () => {
      await p.goto(`${EDITOR}/edit/${lightDeck}`, { waitUntil: 'networkidle' })
      await tid(p, 'stage').waitFor({ timeout: 20000 })
      const clipped = []
      for (let i = 0; i < 5; i++) {
        await tid(p, `thumb-${i}`).click(); await p.waitForTimeout(250)
        const bad = await tid(p, 'stage').evaluate((st) => [...st.querySelectorAll('[data-element-id], [data-testid^="el-"]')].filter((el) => el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0).length)
        if (bad) clipped.push(`${i + 1}:${bad}`)
      }
      expect(clipped.length === 0, `boxes whose text is taller than the box: ${clipped}`)
      const doc0 = (await api.get(G, `/presentations/${lightDeck}`)).data
      const edited = { ...doc0.document, title: 'Edited by hand' }
      const r = await fetchPut(G, lightDeck, doc0.revision, edited)
      expect(r.status === 200, `save ${r.status}`)
      expect((await api.get(G, `/presentations/${lightDeck}`)).data.document.title === 'Edited by hand', 'edit lost')
    })

    await s.check('T7 AI mode (real model), DARK design with a chosen length of 7 slides: cover first, closing last, the file\'s dark look and fonts', p, async () => {
      await fromHome(p, { file: DARK, prompt: 'Why bees matter: a briefing for a village school assembly' })
      darkId = (await api.get(G, '/file-templates')).data.templates[0].id
      await tid(p, 'tpl-count').fill('7')
      await tid(p, 'tpl-start').click()
      await p.waitForURL(/\/edit\//, { timeout: 240000 })
      darkDeck = deckIdOf(p)
      const doc = await waitWritten(G, darkDeck)
      darkTpl = (await api.get(G, `/file-templates/${darkId}`)).data
      expect(doc.slides.length === 7, `slides ${doc.slides.length}`)
      expect(JSON.stringify(doc.theme) === JSON.stringify(darkTpl.theme) && doc.theme.fonts.heading === 'Georgia', 'theme/fonts differ')
      const words = wordsOf(doc).join(' | ')
      for (const w of SAMPLES) expect(!words.includes(w), `sample words shipped: ${w}`)
      expect(/bee/i.test(words), `not about bees: ${words.slice(0, 300)}`)
      const tplEls = (k) => new Set(darkTpl.slides[k].elements.map((e) => e.id))
      const idsOf = (sl) => sl.elements.map((e) => e.id.split(':').slice(1).join(':'))
      expect(idsOf(doc.slides[0]).every((x) => tplEls(0).has(x)), 'the first slide is not the file\'s cover')
      expect(idsOf(doc.slides[6]).every((x) => tplEls(4).has(x)), 'the last slide is not the file\'s closing slide')
      expect(!/@/.test(words), 'a contact detail was invented')
      const over = doc.slides.flatMap((x) => x.validation.issues).filter((i) => i.code === 'overflow')
      expect(over.length === 0, `overflow: ${JSON.stringify(over)}`)
    })

    await s.check('T8 manual mode: no AI, the slides carry "Add ..." placeholders and none of the file\'s words; the editor opens at once', p, async () => {
      await fromHome(p, { file: DARK, prompt: '' }) // an empty prompt prefers manual
      expect((await tid(p, 'tpl-mode-manual').getAttribute('aria-checked')) === 'true', 'empty prompt did not preselect manual')
      await tid(p, 'tpl-start').click()
      await p.waitForURL(/\/edit\//, { timeout: 60000 })
      manualDeck = deckIdOf(p)
      manualTplId = (await api.get(G, '/file-templates')).data.templates[0].id
      const doc = await waitWritten(G, manualDeck)
      const words = wordsOf(doc)
      expect(words.some((w) => /^Add /.test(w)), 'no placeholders')
      for (const w of SAMPLES.filter((x) => x !== 'ORBIT LABS')) expect(!words.join(' | ').includes(w), `sample words in manual deck: ${w}`)
      expect(doc.slides.length === 5, `slides ${doc.slides.length}`)
      expect(doc.slides.flatMap((x) => x.elements).some((e) => e.type === 'image' && !e.src), 'the photo is not a "picture goes here" box')
      await tid(p, 'stage').waitFor({ timeout: 20000 })
    })

    await s.check('T9 the editor\'s New slide menu: "From your template" lists the layouts, inserting one adds a slide with placeholders; a deleted design hides the section and the deck still works', p, async () => {
      await p.goto(`${EDITOR}/edit/${manualDeck}`, { waitUntil: 'networkidle' })
      await tid(p, 'stage').waitFor({ timeout: 20000 })
      await p.getByRole('button', { name: '+ New slide' }).click()
      await tid(p, 'from-your-template').waitFor({ timeout: 10000 })
      expect((await p.locator('[data-testid^="own-layout-"]').count()) === 5, 'not 5 layouts')
      await tid(p, 'own-layout-1').click()
      await p.waitForFunction(() => document.querySelectorAll('[data-testid^="thumb-"]').length === 6, null, { timeout: 8000 })
      let doc
      for (let i = 0; i < 20; i++) { doc = (await api.get(G, `/presentations/${manualDeck}`)).data.document; if (doc.slides.length === 6) break; await p.waitForTimeout(700) }
      expect(doc.slides.length === 6, `saved slides ${doc.slides.length}`)
      expect(doc.templateId === manualTplId, 'templateId lost on save')
      expect(!JSON.stringify(doc.slides[5]).includes('Why the launch window'), 'sample text in the inserted slide')
      // delete the design: the deck keeps working, the section is gone
      expect((await api.del(G, `/file-templates/${manualTplId}`)).status === 200, 'delete')
      await p.reload({ waitUntil: 'networkidle' })
      await tid(p, 'stage').waitFor({ timeout: 20000 })
      await p.getByRole('button', { name: '+ New slide' }).click()
      await p.waitForTimeout(1500)
      expect((await tid(p, 'from-your-template').count()) === 0, 'the section stays after the design is deleted')
      expect((await p.getByRole('menuitem', { name: 'Blank slide' }).count()) === 1, 'the menu broke')
    })

    await s.check('T10 an attached .pptx source offers "Use its design too" in one click; the source flow itself still works', p, async () => {
      await p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
      await p.getByRole('button', { name: /Upload files, or links/ }).click()
      await p.getByRole('dialog').getByLabel('File', { exact: true }).setInputFiles(LIGHT)
      await p.getByRole('dialog').locator('button[type=submit]').click()
      const btn = tid(p, 'use-design-too')
      await btn.waitFor({ timeout: 60000 })
      await btn.click()
      await tid(p, 'home-file-template').waitFor({ timeout: 60000 })
      expect(/citrus-paper/.test(await tid(p, 'home-file-template').innerText()), 'wrong chip')
      expect((await p.locator('[title="citrus-paper.pptx"], [title="citrus-paper"]').count()) >= 1, 'the source chip disappeared')
    })

    await s.check('T11 design list: the second upload shows with a thumbnail, date and delete; deleting removes it; another person never sees it', p, async () => {
      await p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
      await tid(p, 'file-tpl-open').click()
      await tid(p, 'file-tpl-list').waitFor({ timeout: 10000 })
      const n = await p.locator('[data-testid^="file-tpl-item-"]').count()
      expect(n >= 1, 'no designs listed')
      expect((await tid(p, 'file-tpl-list').locator('canvas, svg, [data-testid=slide]').count()) >= 0, '')
      const mine = (await api.get(G, '/file-templates')).data.templates
      const other = (await api.get(S, '/file-templates'))
      expect(other.status === 200 && other.data.templates.length === 0, 'another person sees my designs')
      expect((await api.get(S, `/file-templates/${mine[0].id}`)).status === 404, 'another person reads my design')
      p.once('dialog', (d) => d.accept())
      await tid(p, `file-tpl-delete-${mine[0].id}`).click()
      await p.waitForFunction((n0) => document.querySelectorAll('[data-testid^="file-tpl-item-"]').length < n0, n, { timeout: 8000 })
    })

    await s.check('T12 a text PDF through the prompt box: chip, then an AI deck (real model) in the PDF\'s look with new words', p, async () => {
      await p.waitForTimeout(62000) // uploads are limited to 6 a minute: the earlier checks used them
      await fromHome(p, { file: join(dir, 'orbit-deck.pdf'), prompt: 'Why cheese rinds are worth eating: a short guide for home cooks' })
      const t = await tid(p, 'tpl-using').innerText()
      expect(/orbit-deck/.test(t) && /4 slides/.test(t), t)
      const pdfId = (await api.get(G, '/file-templates')).data.templates[0].id
      const tpl = (await api.get(G, `/file-templates/${pdfId}`)).data
      expect(tpl.theme.colors.background === '#0B1220', 'PDF page colour not the theme background')
      await tid(p, 'tpl-start').click()
      await p.waitForURL(/\/edit\//, { timeout: 240000 })
      const id = deckIdOf(p)
      const doc = await waitWritten(G, id)
      expect(doc.slides.length === 4, `slides ${doc.slides.length}`)
      expect(JSON.stringify(doc.theme) === JSON.stringify(tpl.theme), 'theme differs from the PDF design')
      expect(doc.slides.every((x) => x.manual && x.ownLook), 'not the design\'s own looks')
      expect(doc.slides[0].background.value === '#0B1220', 'cover background differs')
      const words = wordsOf(doc).join(' | ')
      for (const w of ['Mission to Mars', 'launch window', 'Cheese', 'ORBIT LABS', 'crew@orbitlabs']) if (w !== 'Cheese') expect(!words.includes(w), `PDF sample words shipped: ${w}`)
      expect(/chees|rind/i.test(words), `not about cheese rinds: ${words.slice(0, 300)}`)
      expect(!doc.slides.flatMap((x) => x.validation.issues).some((i) => i.code === 'overflow'), 'overflow')
      await shoot(p, G, id, 'pdf-generated', 4)
      await tid(p, 'stage').waitFor({ timeout: 20000 })
      const ref = await referenceDeck(G, pdfId, 'ref pdf'); await shoot(p, G, ref.id, 'pdf-template', ref.count)
    })

    let chartTplId
    await s.check('T13 a design with a chart, manual mode: the chart stays, none of the old labels or numbers, marked as sample data in the editor, still exports as a chart', p, async () => {
      await fromHome(p, { file: join(dir, 'chart-deck.pptx'), prompt: '' })
      chartTplId = (await api.get(G, '/file-templates')).data.templates[0].id
      await tid(p, 'tpl-mode-manual').click()
      await tid(p, 'tpl-start').click()
      await p.waitForURL(/\/edit\//, { timeout: 60000 })
      const id = deckIdOf(p)
      const doc = await waitWritten(G, id)
      const charts = doc.slides.flatMap((x) => x.elements.filter((e) => e.type === 'chart'))
      expect(charts.length === 1, `charts ${charts.length}`)
      const raw = JSON.stringify(doc)
      for (const old of ['Zorblax', '7717', '8828', '9939']) expect(!raw.includes(old), `the old file\'s data is in the deck: ${old}`)
      expect(charts[0].placeholder === true && charts[0].labels.every((l) => /^Item \d+$/.test(l)), JSON.stringify(charts[0]))
      await tid(p, 'stage').waitFor({ timeout: 20000 })
      const si = doc.slides.findIndex((x) => x.elements.some((e) => e.type === 'chart'))
      await tid(p, `thumb-${si}`).click()
      await tid(p, 'chart-sample-cue').waitFor({ timeout: 8000 })
      expect(/Sample data/.test(await tid(p, 'chart-sample-cue').innerText()), 'cue text')
      // the cue is an editor overlay: the slide drawn for thumbnails / Present / export carries no such text
      expect((await p.locator('[data-testid="thumb-' + si + '"]').innerText()).includes('Sample data') === false, 'the cue leaked into the thumbnail')
      await tid(p, 'chart-sample-cue').click()
      await tid(p, 'chart-dialog').waitFor({ timeout: 8000 })
      expect((await tid(p, 'chart-dialog-sample').count()) === 1, 'no sample note in the dialog')
      await p.getByLabel('Series 1 value 1', { exact: true }).fill('11'); await p.getByLabel('Series 1 value 2', { exact: true }).fill('22'); await p.getByLabel('Category 1', { exact: true }).fill('North')
      await tid(p, 'chart-dialog-done').click()
      await p.waitForTimeout(1500)
      expect((await tid(p, 'chart-sample-cue').count()) === 0, 'cue stays after Done')
      // saved: the person\'s own data, no placeholder flag
      let d2
      for (let i = 0; i < 20; i++) { d2 = (await api.get(G, `/presentations/${id}`)).data.document; const c = d2.slides.flatMap((x) => x.elements.filter((e) => e.type === 'chart'))[0]; if (c && !c.placeholder && c.labels[0] === 'North') break; await p.waitForTimeout(700) }
      const c2 = d2.slides.flatMap((x) => x.elements.filter((e) => e.type === 'chart'))[0]
      expect(!c2.placeholder && c2.series[0].values[0] === 11 && c2.series[0].values[1] === 22, JSON.stringify(c2))
    })

    await s.check('T14 a design with a chart, AI mode (real model) with figures in the request: the chart carries ONLY those figures (or sample data if the model gave none), never the old ones', p, async () => {
      await fromHome(p, { file: join(dir, 'chart-deck.pptx'), prompt: 'Quarterly sales of the Brightside bakery: North 120, South 150, East 180 (loaves, in thousands). Explain what the figures show.' })
      await tid(p, 'tpl-start').click()
      await p.waitForURL(/\/edit\//, { timeout: 240000 })
      const doc = await waitWritten(G, deckIdOf(p))
      const charts = doc.slides.flatMap((x) => x.elements.filter((e) => e.type === 'chart'))
      expect(charts.length === 1, `charts ${charts.length}`)
      const raw = JSON.stringify(doc)
      for (const old of ['Zorblax', '7717', '8828', '9939']) expect(!raw.includes(old), `the old file\'s data is in the deck: ${old}`)
      const c = charts[0]
      const vals = c.series.flatMap((x) => x.values)
      if (c.placeholder) console.log('   note: the real model returned no chart figures; sample data was kept (correct fallback)')
      else expect(vals.length > 0 && vals.every((v) => [120, 150, 180].includes(v)), `chart figures not from the request: ${JSON.stringify(c.series)}`)
      console.log('   chart:', JSON.stringify({ labels: c.labels, series: c.series, placeholder: !!c.placeholder }))
    })

    if (SHOTS) {
      await s.check('S1 screenshots: the file\'s own slides and the generated decks, drawn by the editor', p, async () => {
        const dt = await referenceDeck(G, lightId, 'ref light')
        await shoot(p, G, dt.id, 'light-template', dt.count)
        await shoot(p, G, lightDeck, 'light-generated', 5)
        await shoot(p, G, darkDeck, 'dark-generated', 7)
        const r = await referenceDeck(G, darkId, 'ref dark'); await shoot(p, G, r.id, 'dark-template', r.count)
        await shoot(p, G, manualDeck, 'dark-manual', 5)
      })
    }

    await s.check('Z1 no console errors or page errors', p, async () => { expect(errors.length === 0, errors.slice(0, 4).join(' || ')) })
  } finally {
    await b.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return s.done()
}
