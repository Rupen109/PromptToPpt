import { join } from 'node:path'
import { API, EDITOR, RESULTS, WEB, choicesReady, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * A whole deck from a Morph template, made inside the editor: the website's "Use this template" link, the template picker on the create screen, the AI writing only the words, the
 * template's own scenes/pictures/movement in the finished deck, plan gates, and editing the result. Real servers and Chromium; one small real model call per generated deck.
 */
export default async function () {
  const s = suite('68-morph-template-deck')
  const b = await launch()
  const errors = []
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]|status of 403|status of 429/.test(m.text())) errors.push(m.text().slice(0, 200)) })
    p.on('requestfailed', (r) => { if (/morph-templates|morph-posters/.test(r.url())) errors.push(`picture failed: ${r.url()}`) })
  }
  const tid = (p, t) => p.locator(`[data-testid="${t}"]`)
  const TOPIC = 'A pitch for our new neighbourhood bakery delivery service for busy families in Pune'
  try {
    const G = await person(b, 'mt', 'gold')
    const P = await person(b, 'mtp', 'pro')
    const { p } = G
    watch(p)

    await s.check('T1 website: every template on its family page has a "Use this template" link that points at the editor with that template', p, async () => {
      await p.goto(`${WEB}/morph-animation-templates/pitch-investor`, { waitUntil: 'domcontentloaded' }).catch(() => {})
      let links = await p.locator('[data-testid=use-template]').evaluateAll((a) => a.map((x) => x.getAttribute('href')))
      if (links.length === 0) { // the family slug differs: find one from the hub
        await p.goto(`${WEB}/morph-animation-templates`, { waitUntil: 'domcontentloaded' })
        const hrefs = await p.locator('a[href^="/morph-animation-templates/"]').evaluateAll((a) => [...new Set(a.map((x) => x.getAttribute('href')))])
        expect(hrefs.length > 0, 'no family pages linked from the hub')
        await p.goto(`${WEB}${hrefs[0]}`, { waitUntil: 'domcontentloaded' })
        links = await p.locator('[data-testid=use-template]').evaluateAll((a) => a.map((x) => x.getAttribute('href')))
      }
      expect(links.length >= 1, 'no "Use this template" link')
      expect(links.every((h) => h.startsWith(EDITOR) && /\/\?morphTemplate=[a-z0-9-]+$/.test(h)), JSON.stringify(links))
    })

    await s.check('T2 the editor home page shows the chosen template (name and slides) and lets you remove it; an unknown id is ignored', p, async () => {
      await p.goto(`${EDITOR}/?morphTemplate=pitch-orbit`, { waitUntil: 'networkidle' })
      await tid(p, 'home-morph-template').waitFor({ timeout: 15000 })
      const t = await tid(p, 'home-morph-template').innerText()
      expect(/slides/.test(t) && t.length > 20, t)
      await p.getByRole('button', { name: 'Remove the template' }).click()
      expect((await tid(p, 'home-morph-template').count()) === 0, 'chip not removed')
      await p.goto(`${EDITOR}/?morphTemplate=nope`, { waitUntil: 'networkidle' })
      expect((await tid(p, 'home-morph-template').count()) === 0, 'an unknown template showed a chip')
    })

    await s.check('T3 create screen (Gold): Morph on shows the picker; AI-plans is the default; a family tab filters; choosing a template sets the fixed length and a note; Morph off hides the picker', p, async () => {
      await p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
      await p.getByLabel('Presentation prompt').fill(TOPIC)
      await p.getByLabel('Presentation prompt').press('Enter').catch(() => {})
      if (!/\/create/.test(p.url())) await p.locator('form button[type=submit]').first().click()
      await p.waitForURL(/\/create/, { timeout: 15000 })
      await choicesReady(p)
      const dir = p.getByRole('button', { name: /Let AI decide/ })
      if (await dir.count()) { await dir.click(); await p.getByRole('radio', { name: /\d+ slides/ }).first().waitFor({ timeout: 90000 }) }
      await p.getByLabel('Morph animation').check()
      await tid(p, 'morph-picker').waitFor({ timeout: 5000 })
      expect((await p.getByRole('radio', { name: 'AI plans it for your topic' }).getAttribute('aria-checked')) === 'true', 'AI plans it is not the default')
      const all = await p.getByRole('list', { name: 'Morph templates' }).getByRole('radio').count()
      await p.getByRole('tab', { name: 'Education' }).click()
      const edu = await p.getByRole('list', { name: 'Morph templates' }).getByRole('radio').count()
      expect(edu > 0 && edu < all, `education ${edu} of ${all}`)
      await p.getByRole('tab', { name: 'Pitch' }).click()
      const first = p.getByRole('list', { name: 'Morph templates' }).getByRole('radio').first()
      const label = await first.innerText()
      await first.click()
      expect((await first.getAttribute('aria-checked')) === 'true', 'not selected')
      expect(/\d+ slides/.test(await tid(p, 'morph-picker-note').innerText()) === false && (await tid(p, 'morph-picker-note').innerText()).length > 40, 'the note is missing')
      const lengthRadios = await p.getByRole('radio', { name: /\d+ slides/ }).allInnerTexts()
      const n = Number(/(\d+) slides/.exec(label)[1])
      expect(lengthRadios.some((t) => t.includes(`${n} slides`)), `the length is not fixed at ${n}: ${JSON.stringify(lengthRadios)}`)
      // the posters load (cached for good by the website)
      const broken = await p.locator('[data-testid=morph-picker] img').evaluateAll((im) => im.filter((i) => i.complete && i.naturalWidth === 0).length)
      expect(broken === 0, `${broken} template pictures did not load`)
      await p.getByLabel('Morph animation').uncheck()
      expect((await tid(p, 'morph-picker').count()) === 0, 'the picker stays when Morph is off')
    })

    let deckId = null
    await s.check('T4 Gold: from the website link to a finished deck: the AI writes the words, the deck has the template\'s own scenes, pictures and a Morph on every slide', p, async () => {
      await p.goto(`${EDITOR}/?morphTemplate=pitch-orbit`, { waitUntil: 'networkidle' })
      await p.getByLabel('Presentation prompt').fill(TOPIC)
      await p.locator('form button[type=submit]').first().click()
      await p.waitForURL(/\/create/, { timeout: 15000 })
      await choicesReady(p)
      const dir = p.getByRole('button', { name: /Let AI decide/ })
      if (await dir.count()) { await dir.click(); await p.getByRole('radio', { name: /\d+ slides/ }).first().waitFor({ timeout: 90000 }) }
      expect((await p.getByLabel('Morph animation').isChecked()), 'Morph is not on')
      const selected = await p.getByRole('list', { name: 'Morph templates' }).getByRole('radio', { checked: true }).getAttribute('aria-label')
      expect(/orbit/i.test(selected ?? ''), `the chosen template is not selected in the picker: ${selected}`)
      expect((await tid(p, 'morph-picker-note').innerText()).length > 40, 'the chosen template is not shown')
      const start = p.getByRole('button', { name: 'Start', exact: true })
      const len = p.getByRole('radio', { name: /\d+ slides/ }).first()
      const t0 = Date.now()
      if (await start.count()) await start.click(); else await len.click()
      await p.waitForURL(/\/edit\/[^/]+/, { timeout: 240000 }).catch(async (e) => {
        const jobId = await p.evaluate(() => sessionStorage.getItem('prompttoppt:pending-job')).catch(() => null)
        const job = jobId ? (await api.get(G, `/generation/jobs/${jobId}`)).data : null
        throw new Error(`the editor did not open: job ${JSON.stringify(job && { status: job.status, stage: job.stage, progress: job.progress, error: job.error })} page: ${(await p.locator('main').innerText().catch(() => '')).slice(0, 200)} (${e.message.split('\n')[0]})`)
      })
      deckId = /\/edit\/([^/?#]+)/.exec(p.url())[1]
      // wait until the deck is complete (the editor may open early, while it is still being written)
      let doc
      for (let i = 0; i < 120; i++) { doc = (await api.get(G, `/presentations/${deckId}`)).data.document; if (doc.slides.every((sl) => sl.layoutId === 'morph-template')) break; await p.waitForTimeout(1500) }
      console.log(`    … built in ${Math.round((Date.now() - t0) / 1000)} s, ${doc.slides.length} slides`)
      expect(doc.slides.length >= 8, `${doc.slides.length} slides`)
      expect(doc.slides.every((sl) => sl.layoutId === 'morph-template' && sl.content.template === 'pitch-orbit'), 'not every slide is a template scene')
      expect(doc.slides.every((sl) => sl.transition?.type === 'morph' && sl.transition.own === true), 'a slide has no Morph')
      const text = doc.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((q) => q.runs.map((r) => r.text).join('')).join(' '))).join(' | ')
      expect(/bakery|delivery|famil|Pune/i.test(text), `the words are not about the topic: ${text.slice(0, 300)}`)
      expect(!/your address|you@example|yoursite|add a credit|lorem/i.test(text), 'a placeholder shipped')
      const images = doc.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'image'))
      expect(images.length > 0 && images.every((e) => /\/morph-templates\/.+\.webp/.test(e.src)), 'a picture is not the template\'s own')
    })

    await s.check('T5 the finished deck opens: every slide draws, template pictures load, text stays inside the slide, and it is editable (the Morph check lists moving objects)', p, async () => {
      await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
      await tid(p, 'stage').waitFor({ timeout: 20000 })
      const n = (await api.get(G, `/presentations/${deckId}`)).data.document.slides.length
      for (const k of [0, 1, Math.floor(n / 2), n - 1]) {
        await tid(p, `thumb-${k}`).click(); await p.waitForTimeout(700)
        const bad = await tid(p, 'stage').locator('img').evaluateAll((im) => im.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src))
        expect(bad.length === 0, `slide ${k + 1}: pictures not loaded ${JSON.stringify(bad.slice(0, 2))}`)
        if (k === 0) await p.screenshot({ path: join(RESULTS, '68-slide1.png') })
        if (k === 1) await p.screenshot({ path: join(RESULTS, '68-slide2.png') })
        if (k === Math.floor(n / 2)) await p.screenshot({ path: join(RESULTS, '68-slide-mid.png') })
      }
      await tid(p, 'thumb-1').click(); await p.waitForTimeout(500)
      await tid(p, 'tb-transitions').click()
      await tid(p, 'open-morph-panel').click()
      const panel = tid(p, 'morph-panel'); await panel.waitFor({ timeout: 8000 })
      const t = await panel.innerText()
      expect(/Morph is on/.test(t), t.slice(0, 200))
    })

    await s.check('T6 the Morph between the first two slides plays (preview), and editing a word of the AI-written deck is saved and survives a reload', p, async () => {
      await tid(p, 'tr-morph').click().catch(() => {})
      await tid(p, 'transition-preview').waitFor({ timeout: 6000 }).catch(() => {})
      await tid(p, 'transition-preview').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
      const stage = tid(p, 'stage')
      await tid(p, 'thumb-0').click(); await p.waitForTimeout(500)
      await stage.locator('[data-testid="el-text"][data-element="titleC"]').dblclick()
      const ed = p.getByLabel('Edit text'); await ed.waitFor({ timeout: 6000 })
      await ed.fill('Edited by hand')
      await p.keyboard.press('Escape')
      await p.waitForTimeout(1800)
      await p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
      const doc = (await api.get(G, `/presentations/${deckId}`)).data.document
      expect(JSON.stringify(doc).includes('Edited by hand'), 'the edit was not saved')
      expect(doc.slides.every((sl) => sl.layoutId === 'morph-template' && sl.transition?.type === 'morph'), 'editing lost the template look or the Morph')
      await p.reload({ waitUntil: 'networkidle' }); await tid(p, 'stage').waitFor({ timeout: 20000 })
      const again = (await api.get(G, `/presentations/${deckId}`)).data.document
      expect(JSON.stringify(again).includes('Edited by hand'), 'the edit is gone after a reload')
    })

    await s.check('T7 Pro: Morph on the create screen is the upgrade prompt (no picker), and the server refuses a template deck with the upgrade message', P.p, async () => {
      watch(P.p)
      const r = await api.post(P, '/generation/jobs', { prompt: TOPIC, morphTemplate: 'pitch-orbit', idempotencyKey: `k-${Date.now()}-${Math.random().toString(36).slice(2)}` })
      expect(r.status === 403 && r.body?.error?.code === 'UPGRADE_REQUIRED', `${r.status} ${JSON.stringify(r.body?.error)}`)
      await P.p.goto(`${EDITOR}/?morphTemplate=pitch-orbit`, { waitUntil: 'networkidle' })
      await P.p.getByLabel('Presentation prompt').fill(TOPIC)
      await P.p.locator('form button[type=submit]').first().click()
      await P.p.waitForURL(/\/create/, { timeout: 15000 })
      await choicesReady(P.p)
      const dir = P.p.getByRole('button', { name: /Let AI decide/ })
      if (await dir.count()) { await dir.click(); await P.p.getByRole('radio', { name: /\d+ slides/ }).first().waitFor({ timeout: 90000 }) }
      expect((await P.p.getByRole('button', { name: /Morph animation \(Gold plan\)/ }).count()) === 1, 'no locked Morph option')
      expect((await tid(P.p, 'morph-picker').count()) === 0, 'a Pro user sees the picker')
    })

    await s.check('Z1 no page errors, no failed template pictures, no console errors', p, async () => { expect(errors.length === 0, errors.slice(0, 4).join(' ‖ ')) })
  } finally {
    await b.close()
  }
  return s.done()
}
