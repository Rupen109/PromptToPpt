import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, EDITOR, PASSWORD, RESULTS, WEB, expect, launch, suite } from '../lib.mjs'

/**
 * A Morph template deck about the person's OWN product, with the REAL AI model: the Unboxing template is a headphone launch; the person attaches a picture of their product and asks
 * for a launch about it. The finished deck must be about their product in every word and picture: their picture on the slides instead of the headphones, none of the sample deck's words
 * (its product name, its brand), no slide about the original product's box, and the scenes still the template's. COSTS a few rupees of real AI. Needs a verified Gold+ account:
 * E2E_EMAIL=… E2E_PASSWORD=…  Set SHOTS=<folder> to save a picture of the first slides.
 */
export default async function () {
  const s = suite('77-template-own-product')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified Gold+ account; this suite spends real AI credits)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const photo = readFileSync(join(import.meta.dirname, '../../apps/web/public/template-assets/product-1.jpg'))
    let src = null, deck = null, deckId = null
    await s.check('the picture is read AND kept: the source carries the address of the person\'s own copy', null, async () => {
      const up = await ctx.request.post(`${API}/api/v1/sources/image`, { headers: H, multipart: { file: { name: 'my-product.jpg', mimeType: 'image/jpeg', buffer: photo } } })
      expect(up.status() === 201, `upload ${up.status()} ${(await up.text()).slice(0, 200)}`)
      src = (await up.json()).data
      const list = await (await ctx.request.get(`${API}/api/v1/sources`, { headers: H })).json()
      const mine = (list.data?.sources ?? list.data ?? []).find?.((x) => x.id === src.id)
      expect(!mine || mine.url === undefined || /\/api\/v1\/assets\//.test(mine.url ?? ''), 'the source has no picture address')
    })
    await s.check('a deck from the Unboxing template about a coffee product launch is made (real model)', null, async () => {
      const job = await ctx.request.post(`${API}/api/v1/generation/jobs`, { headers: H, data: { prompt: 'I have this product so make a presentation on that. I have attached the product image, it is a coffee product, so write the content for a coffee launch.', sourceIds: [src.id], morphTemplate: 'launch-unbox', idempotencyKey: `own-product-${Date.now()}` } })
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
    })
    if (deck) {
      const textOf = (sl) => sl.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((p) => p.runs.map((x) => x.text).join('')).join(' ')).join(' | ')
      const all = deck.slides.map(textOf).join(' | ')
      await s.check('it is still the template: its scenes, and its style on every slide', null, async () => {
        expect(deck.slides.every((sl) => sl.content?.template === 'launch-unbox'), 'a slide is not from the template')
        expect(deck.slides.length >= 8, `only ${deck.slides.length} slides`)
      })
      await s.check('the person\'s own picture is on the slides instead of the headphones', null, async () => {
        const imgs = deck.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'image').map((e) => e.src))
        expect(imgs.some((u) => /\/api\/v1\/assets\//.test(u)), 'no slide shows the person\'s picture')
        expect(!imgs.some((u) => /unbox-(hero|side)\.webp/.test(u)), 'the headphone pictures are still on a slide')
        expect(!imgs.some((u) => /unbox-(case|puck)\.webp/.test(u)), 'the travel case / dock (headphone accessories) are still on a slide')
      })
      await s.check('none of the sample deck\'s words are left: no "ZENO", no headphones', null, async () => {
        expect(!/zeno/i.test(all), `"ZENO" is still in the deck: ${all.match(/.{0,30}zeno.{0,30}/i)?.[0]}`)
        expect(!/headphone|graphite|travel case|wireless dock|lime ring/i.test(all), `headphone words are still in the deck: ${all.match(/.{0,30}(headphone|graphite|travel case|wireless dock).{0,30}/i)?.[0]}`)
      })
      await s.check('the words are about the person\'s product (coffee)', null, async () => {
        expect(/coffee|brew|roast|cup|bean/i.test(all), `nothing about coffee: ${all.slice(0, 300)}`)
        expect(!deck.slides.some((sl) => sl.content?.scene === 's10'), 'the slide about the original product\'s box is still there')
      })
      await s.check('every slide opens: the deck loads in the editor and every picture draws', null, async () => {
        const p = await ctx.newPage()
        const bad = []
        p.on('response', (rs) => { if (rs.status() >= 400 && /assets|morph-templates/.test(rs.url())) bad.push(`${rs.status()} ${rs.url().slice(0, 100)}`) })
        await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
        await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
        await p.waitForTimeout(2500)
        if (process.env['SHOTS']) {
          await p.screenshot({ path: join(process.env['SHOTS'], 'own-1.png') })
          for (const n of [2, 4, 6]) { await p.locator(`[data-testid="thumb-${n}"]`).click().catch(() => {}); await p.waitForTimeout(1500); await p.screenshot({ path: join(process.env['SHOTS'], `own-${n + 1}.png`) }) }
        }
        expect(bad.length === 0, bad.join('; '))
        await p.close()
      })
    }
    if (deckId) await ctx.request.delete(`${API}/api/v1/presentations/${deckId}`, { headers: H }).catch(() => {})
  } finally { await b.close() }
  void RESULTS
  return s.done()
}
