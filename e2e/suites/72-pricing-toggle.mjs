import { WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The website's pricing cards: they open on Monthly, the Annual tab does not advertise a "Save …%" (neither on the tab nor on a card), Annual shows 20% under twelve monthly payments as the
 * per-month equivalent with the yearly total, the checkout links carry the chosen interval, and both tabs work at phone width. No AI is called.
 */
export default async function () {
  const s = suite('72-pricing-toggle')
  const b = await launch()
  try {
    for (const [label, width] of [['desktop', 1400], ['phone', 390]]) {
      const ctx = await b.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: { 'x-debug-country': 'IN' } })
      const p = await ctx.newPage()
      await p.goto(WEB + '/pricing', { waitUntil: 'networkidle' }).catch(() => p.goto(WEB + '/#pricing', { waitUntil: 'networkidle' }))
      await p.addStyleTag({ content: '[data-reveal]{opacity:1!important;transform:none!important;transition:none!important}' })
      const grp = p.getByRole('group', { name: 'Billing period' })
      await grp.waitFor({ timeout: 15000 })
      const section = () => p.locator('section').filter({ has: grp }).first()
      const nums = async () => (await section().innerText()).match(/₹\s?[\d,]+/g) ?? []
      await s.check(`${label}: opens on Monthly and the cards show the monthly prices`, p, async () => {
        expect((await grp.getByRole('button', { name: 'Monthly' }).getAttribute('aria-pressed')) === 'true', 'Monthly is not selected by default')
        expect((await grp.getByRole('button', { name: /^Annual/ }).getAttribute('aria-pressed')) === 'false', 'Annual is selected by default')
        const t = await section().innerText()
        expect(/Billed monthly/.test(t) && !/Billed annually/.test(t), 'the cards are not on the monthly view')
        for (const price of ['₹300', '₹650', '₹1,200']) expect((await nums()).map((x) => x.replace(/\s/g, '')).includes(price), `${price} missing: ${(await nums()).join(' ')}`)
      })
      await s.check(`${label}: no "Save …%" anywhere on either tab`, p, async () => {
        expect(!/save\s*\d+\s*%/i.test(await section().innerText()), 'a saving is advertised on the Monthly tab')
        expect((await grp.getByRole('button', { name: /^Annual$/ }).count()) === 1, `the Annual tab label is "${await grp.innerText()}"`)
        await grp.getByRole('button', { name: /^Annual$/ }).click()
        const t = await section().innerText()
        expect(!/save\s*\d+\s*%/i.test(t) && !/\b20\s*%/.test(t), 'a saving is advertised on the Annual tab')
      })
      await s.check(`${label}: Annual shows 20% under twelve payments as a per-month price with the yearly total; checkout links carry the interval`, p, async () => {
        const t = await section().innerText()
        expect(/Billed annually/.test(t) && !/Billed monthly/.test(t), 'not on the annual view')
        const got = (await nums()).map((x) => x.replace(/\s/g, ''))
        for (const [month, year] of [['₹240', '₹2,880'], ['₹520', '₹6,240'], ['₹960', '₹11,520']]) expect(got.includes(month) && got.includes(year), `${month} / ${year} missing: ${got.join(' ')}`)
        const hrefs = await section().locator('a[href*="/billing?plan="]').evaluateAll((a) => a.map((x) => x.getAttribute('href')))
        expect(hrefs.length >= 3 && hrefs.every((h) => /interval=year$/.test(h)), JSON.stringify(hrefs))
        await grp.getByRole('button', { name: 'Monthly' }).click()
        const hm = await section().locator('a[href*="/billing?plan="]').evaluateAll((a) => a.map((x) => x.getAttribute('href')))
        expect(hm.length >= 3 && hm.every((h) => /interval=month$/.test(h)), JSON.stringify(hm))
      })
      await s.check(`${label}: no sideways scroll`, p, async () => { expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page scrolls sideways') })
      await ctx.close()
    }
  } finally { await b.close() }
  return s.done()
}
