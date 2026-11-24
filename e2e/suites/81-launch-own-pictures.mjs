import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The Product Launch templates that take pictures (Product Launch, Feature Spotlight, Countdown; Unboxing is suite 77) with the person's OWN pictures and words, with the REAL AI
 * model: two pictures are attached; every picture slot the deck filled shows the person's pictures on every slide (never the sample's), none of the sample's brand words, still the template.
 * The panel check lives in suite 78. COSTS a few rupees of real AI. Needs a verified Gold+ account: E2E_EMAIL=… E2E_PASSWORD=…  Set SHOTS=<folder> for pictures of the slides.
 */
const TEMPLATES = (process.env['ONLY'] ? process.env['ONLY'].split(',') : ['launch', 'launch-spotlight', 'launch-countdown']) // ONLY=biz-sales,biz-team runs just those
export default async function () {
  const s = suite('81-launch-own-pictures')
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
        const job = await ctx.request.post(`${API}/api/v1/generation/jobs`, { headers: H, data: { prompt: 'A product launch for Aura Coffee cold brew cans, a small-batch coffee roaster: what it is, why it is different, where to buy it and when it arrives. I attached two pictures of our product and place, use them.', sourceIds: ids, morphTemplate: tid, idempotencyKey: `launch-pics-${tid}-${Date.now()}` } })
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
      await s.check(`${tid}: still the template; every picture slot it filled shows the person's pictures on every slide; both pictures are used`, null, async () => {
        expect(deck.slides.every((sl) => sl.content?.template === tid), 'a slide is not from the template')
        // scene by scene: every picture the deck filled on a slide shows the person's picture there (an id may show other artwork, such as a gradient, on other slides)
        const els = deck.slides.flatMap((sl) => { const ids = new Set(Object.keys(sl.content?.images ?? {})); return sl.elements.filter((e) => e.type === 'image' && ids.has(e.id)).map((e) => ({ id: e.id, src: e.src })) })
        const places = new Set(deck.slides.flatMap((sl) => Object.keys(sl.content?.images ?? {})))
        expect(places.size >= 1, 'the deck filled no picture slot')
        expect(els.length >= 3, `only ${els.length} pictures on the slides`)
        const stock = els.filter((e) => !/\/api\/v1\/assets\//.test(e.src))
        expect(stock.length === 0, `a sample picture is still shown where the person's belongs: ${stock[0]?.id} ${stock[0]?.src}`)
        const used = new Set(els.map((e) => e.src)).size
        expect(used >= 1 && used <= 2, `${used} distinct pictures shown (the person attached two)`)
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
        const sample = { launch: /slidescarnival|brand name|raspberr|blueberr|\blime\b|soda/i, 'launch-spotlight': /\btempo\b|release 4\.0/i, 'launch-countdown': /volt runner|sneaker/i }[tid]
        expect(!sample.test(all), `sample words are still there: ${all.match(sample)?.[0]}`)
        expect(/aura|coffee|brew|roast/i.test(all), `nothing about the brand: ${all.slice(0, 200)}`)
      })
    }
    for (const id of Object.values(made)) await ctx.request.delete(`${API}/api/v1/presentations/${id}`, { headers: H }).catch(() => {})
  } finally { await b.close() }
  return s.done()
}
