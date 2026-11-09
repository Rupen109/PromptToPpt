import { WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The public Morph template pages, in a real browser against the real web server (no AI, no sign-in): the hub and the six family pages.
 *   - every page loads with one h1, a canonical URL, valid JSON-LD (BreadcrumbList, CollectionPage with an ItemList; FAQPage whose questions are exactly the visible ones)
 *   - the hub lists every family, and each family page lists its templates with a live preview that is a real carousel (labelled, with play, previous, next and full screen)
 *   - the sitemap and llms.txt name the pages
 *   - no horizontal scroll at phone width, no page errors, and a preview actually plays (its scene counter moves)
 */
const FAMILIES = ['business-strategy', 'pitch-investor', 'marketing-campaigns', 'product-launch', 'technology', 'education']
const HUB = '/morph-animation-templates'

export default async function () {
  const s = suite('61-morph-templates-page')
  const b = await launch()
  const errors = []
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })

  /** the page's JSON-LD blocks, parsed */
  const ld = () => p.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map((e) => JSON.parse(e.textContent)))
  const flat = (blocks) => blocks.flatMap((x) => (x['@graph'] ? x['@graph'] : [x]))

  try {
    await s.check('P1 the hub loads: one h1, a canonical, six family cards linking to their pages, an ItemList of templates', p, async () => {
      await p.goto(WEB + HUB, { waitUntil: 'networkidle' })
      expect((await p.locator('h1').count()) === 1, 'not exactly one h1')
      expect((await p.locator('link[rel=canonical]').getAttribute('href')).endsWith(HUB), 'wrong canonical')
      for (const f of FAMILIES) expect((await p.locator(`a[href="${HUB}/${f}"]`).count()) >= 1, `the hub does not link to ${f}`)
      const blocks = flat(await ld())
      const list = blocks.find((x) => x['@type'] === 'CollectionPage')?.mainEntity
      expect(list?.itemListElement?.length >= 18, `the ItemList has ${list?.itemListElement?.length} templates`)
      expect(blocks.some((x) => x['@type'] === 'BreadcrumbList'), 'no BreadcrumbList')
    })

    for (const f of FAMILIES) {
      await s.check(`P2 ${f}: h1, canonical, JSON-LD, a live preview for every template, FAQPage = the visible questions`, p, async () => {
        await p.goto(`${WEB}${HUB}/${f}`, { waitUntil: 'networkidle' })
        expect((await p.locator('h1').count()) === 1, 'not exactly one h1')
        expect((await p.locator('link[rel=canonical]').getAttribute('href')).endsWith(`${HUB}/${f}`), 'wrong canonical')
        const carousels = await p.locator('[role=group][aria-roledescription=carousel]').count()
        expect(carousels >= 3, `only ${carousels} live previews`)
        const blocks = flat(await ld())
        const items = blocks.find((x) => x['@type'] === 'CollectionPage')?.mainEntity?.itemListElement ?? []
        expect(items.length === carousels, `the ItemList names ${items.length} templates but ${carousels} previews are shown`)
        const faq = blocks.find((x) => x['@type'] === 'FAQPage')
        expect(faq, 'no FAQPage JSON-LD')
        const visible = await p.locator('[id^="faq-q-"]').allInnerTexts()
        expect(visible.length === faq.mainEntity.length, `FAQ: ${faq.mainEntity.length} in JSON-LD, ${visible.length} visible`)
        for (const name of ['Play|Pause', 'Previous scene', 'Next scene', 'full screen']) expect((await p.getByRole('button', { name: new RegExp(name, 'i') }).count()) >= carousels, `a preview lacks its ${name} button`)
      })
    }

    await s.check('P3 a preview plays: scrolled into view, its scene counter moves without a click', p, async () => {
      await p.goto(`${WEB}${HUB}/pitch-investor`, { waitUntil: 'networkidle' })
      const box = p.locator('[role=group][aria-roledescription=carousel]').first()
      await box.scrollIntoViewIfNeeded()
      const counter = () => box.locator('xpath=following-sibling::div//p[@aria-live]').innerText()
      const first = await counter()
      await p.waitForFunction(async (t) => (document.querySelector('[aria-live=polite]')?.textContent ?? '') !== t, first, { timeout: 12000 })
    })

    await s.check('P4 the sitemap and llms.txt name the hub and every family page; an unknown family is a 404', p, async () => {
      const sm = await (await ctx.request.get(WEB + '/sitemap.xml')).text()
      for (const u of [HUB, ...FAMILIES.map((f) => `${HUB}/${f}`)]) expect(sm.includes(u), `the sitemap lacks ${u}`)
      const llms = await (await ctx.request.get(WEB + '/llms.txt')).text()
      expect(llms.includes('morph-animation-templates'), 'llms.txt does not name the Morph pages')
      expect((await ctx.request.get(`${WEB}${HUB}/not-a-family`)).status() === 404, 'an unknown family is not a 404')
    })

    await s.check('P5 phone width: no horizontal scroll on the hub or any family page', p, async () => {
      const m = await b.newContext({ viewport: { width: 390, height: 800 } })
      const q = await m.newPage()
      for (const path of [HUB, ...FAMILIES.map((f) => `${HUB}/${f}`)]) {
        await q.goto(WEB + path, { waitUntil: 'networkidle' })
        expect(!(await q.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), `${path} scrolls sideways at 390 px`)
      }
      await m.close()
    })

    await s.check('P6 no page errors anywhere', p, async () => { expect(errors.length === 0, `page errors: ${errors.slice(0, 3).join(' | ')}`) })
  } finally { await b.close() }
  return s.done()
}
