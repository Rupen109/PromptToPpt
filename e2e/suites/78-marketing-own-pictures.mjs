import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The four Marketing templates with the person's OWN pictures and words, with the REAL AI model: Cool Morph, Billboard Campaign, Social Feed and Brand Moodboard. Two pictures are attached
 * to the request; each deck must show them where the template had its photos (the phone's cards, the moodboard tiles, the billboard's products, Cool's photographs), none of the sample deck's
 * own pictures there, none of its words, and still be the template. Then, in a real browser, the "Template pictures" panel replaces one picture on every slide at once and the change
 * survives a reload. COSTS a few rupees of real AI. Needs a verified Gold+ account: E2E_EMAIL=… E2E_PASSWORD=…  Set SHOTS=<folder> for pictures of the slides.
 */
const TEMPLATES = (process.env['ONLY'] ? process.env['ONLY'].split(',') : ['cool', 'mkt-billboard', 'mkt-feed', 'mkt-moodboard']) // ONLY=biz-sales,biz-team runs just those
export default async function () {
  const s = suite('78-marketing-own-pictures')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified Gold+ account; this suite spends real AI credits)'); return s.done() }
  const b = await launch()
  const made = {}
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const assets = join(import.meta.dirname, '../../apps/web/public/template-assets')
    const ids = []
    await s.check('two pictures are attached and kept', null, async () => {
      for (const f of ['product-1.jpg', 'marketing-1.jpg']) {
        const up = await ctx.request.post(`${API}/api/v1/sources/image`, { headers: H, multipart: { file: { name: f, mimeType: 'image/jpeg', buffer: readFileSync(join(assets, f)) } } })
        expect(up.status() === 201, `upload ${f}: ${up.status()} ${(await up.text()).slice(0, 160)}`)
        ids.push((await up.json()).data.id)
      }
    })
    const textOf = (sl) => sl.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((p) => p.runs.map((x) => x.text).join('')).join(' ')).join(' | ')
    for (const tid of TEMPLATES) {
      let deck = null, deckId = null
      await s.check(`${tid}: a deck about a coffee brand is made from the template with the person's pictures (real model)`, null, async () => {
        const job = await ctx.request.post(`${API}/api/v1/generation/jobs`, { headers: H, data: { prompt: 'A social campaign for Aura Coffee, a small-batch coffee roaster launching cold brew cans this summer. I attached two pictures of our product, use them.', sourceIds: ids, morphTemplate: tid, idempotencyKey: `own-pics-${tid}-${Date.now()}` } })
        expect(job.status() === 201 || job.status() === 200, `job ${job.status()} ${(await job.text()).slice(0, 300)}`)
        const j = (await job.json()).data
        deckId = j.presentationId
        let status = j.status
        for (let i = 0; i < 120 && !['completed', 'failed', 'cancelled'].includes(status); i++) {
          await new Promise((res) => setTimeout(res, 3000))
          status = (await (await ctx.request.get(`${API}/api/v1/generation/jobs/${j.id}`, { headers: H })).json()).data.status
        }
        expect(status === 'completed', `job ended ${status}`)
        deck = (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data.document
        made[tid] = deckId
      })
      if (!deck) continue
      await s.check(`${tid}: still the template, the person's pictures are on its photo slots, none of its stock photos are`, null, async () => {
        expect(deck.slides.every((sl) => sl.content?.template === tid), 'a slide is not from the template')
        const imgs = deck.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'image' && (e.opacity ?? 1) >= 0.5).map((e) => ({ id: e.id, src: e.src })))
        const mine = imgs.filter((i) => /\/api\/v1\/assets\//.test(i.src))
        expect(mine.length >= 3, `only ${mine.length} of the person's pictures on the slides`)
        expect(new Set(mine.map((m) => m.src)).size === 2, 'both attached pictures should be used')
        const stock = { 'mkt-feed': /feed-(coffee|smoothie|sneaker|desk|plant|tote|shades|phone)\.webp/, 'mkt-moodboard': /mood-(candle|cafe|ceramics|coffee|flowers|fruit|textile|notebook|plant|shelf)\.webp/, 'mkt-billboard': /bill-(can|can2|bottle|cup)\.webp/, cool: /cool-(woman|interior|cocktail|motion-face)\.webp/ }[tid]
        expect(!imgs.some((i) => stock.test(i.src)), `a stock photo of the sample deck is still shown: ${imgs.find((i) => stock.test(i.src))?.src}`)
      })
      if (process.env['SHOTS']) {
        const pg = await ctx.newPage()
        await pg.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
        await pg.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
        for (const n of [0, 2, 4, 7]) { await pg.locator(`[data-testid="thumb-${n}"]`).click().catch(() => {}); await pg.waitForTimeout(1800); await pg.screenshot({ path: join(process.env['SHOTS'], `${tid}-${n + 1}.png`) }) }
        await pg.close()
      }
      await s.check(`${tid}: none of the sample deck's words are left`, null, async () => {
        const all = deck.slides.map(textOf).join(' | ')
        const sample = { 'mkt-feed': /sunday co|sample deck/i, 'mkt-billboard': /fizzle|summer pop/i, 'mkt-moodboard': /hearth|clay|sample deck/i, cool: /slidescarnival|morph slides/i }[tid]
        expect(!sample.test(all), `sample words are still there: ${all.match(sample)?.[0]}`)
        expect(/aura|coffee|brew|roast/i.test(all), `nothing about the brand: ${all.slice(0, 200)}`)
      })
    }
    // the editor panel, on the Social Feed deck
    const fid = made['mkt-feed']
    if (fid) {
      const p = await ctx.newPage()
      let swapped = null
      await s.check('mkt-feed: the "Template pictures" panel lists the photo cards and replaces one on EVERY slide at once; it survives a reload', p, async () => {
        await p.goto(`${EDITOR}/edit/${fid}`, { waitUntil: 'networkidle' })
        await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
        await p.getByTestId('tb-media').click()
        await p.getByTestId('media-template-pictures').click()
        await p.getByRole('dialog', { name: 'Template pictures' }).waitFor({ timeout: 5000 })
        const rows = await p.locator('[data-testid^="tpl-pic-"]:not([data-testid^="tpl-pic-upload"]):not([data-testid^="tpl-pic-library"])').count()
        expect(rows >= 6, `only ${rows} pictures listed`)
        const slot = 'feed-smoothie.webp', slotId = 'p2' // the smoothie card of the phone (one picture, wherever it is used)
        await p.getByTestId(`tpl-pic-upload-${slot}`).setInputFiles({ name: 'new-cup.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(assets, 'pitch-15.jpg')) })
        await p.waitForFunction((id) => [...document.querySelectorAll('[data-testid^="tpl-pic-"] img')].find((i) => i.closest('li')?.getAttribute('data-testid') === `tpl-pic-${id}`)?.getAttribute('src')?.includes('/api/v1/assets/'), slot, { timeout: 20000 })
        await p.getByRole('button', { name: 'Close' }).first().click()
        await p.waitForTimeout(2500) // autosave
        await p.reload({ waitUntil: 'networkidle' })
        await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
        const doc = (await (await ctx.request.get(`${API}/api/v1/presentations/${fid}`, { headers: H })).json()).data.document
        swapped = doc
        const srcs = doc.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'image' && e.id === slotId).map((e) => e.src))
        expect(srcs.length >= 3, `the picture is on ${srcs.length} slides`)
        expect(new Set(srcs).size === 1, `the picture differs between slides: ${[...new Set(srcs)].join(' ; ')}`)
        expect(/\/api\/v1\/assets\//.test(srcs[0]), 'not the new picture')
        if (process.env['SHOTS']) { await p.screenshot({ path: join(process.env['SHOTS'], 'feed-1.png') }); await p.locator('[data-testid="thumb-3"]').click(); await p.waitForTimeout(1500); await p.screenshot({ path: join(process.env['SHOTS'], 'feed-4.png') }) }
      })
      void swapped
    }
    for (const id of Object.values(made)) await ctx.request.delete(`${API}/api/v1/presentations/${id}`, { headers: H }).catch(() => {})
  } finally { await b.close() }
  return s.done()
}
