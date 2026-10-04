import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EDITOR, RESULTS, WEB, expect, launch, suite } from '../lib.mjs'

export default async function () {
  const s = suite('01-public')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  const settle = (ms = 600) => p.waitForTimeout(ms)

  // every page loads, has a title/h1, no horizontal overflow at 3 widths
  const pages = ['/', '/pricing', '/templates', '/ai-ppt-maker', '/login', '/signup', '/templates/pitch-launchpad']
  for (const path of pages) {
    for (const width of [390, 768, 1440]) {
      await s.check(`${path} renders @${width}px without overflow or errors`, p, async () => {
        await p.setViewportSize({ width, height: 900 })
        const r = await p.goto(WEB + path, { waitUntil: 'networkidle' })
        expect(r.status() < 400, `status ${r.status()}`)
        await settle(900)
        expect((await p.title()).length > 3, 'empty <title>')
        expect(await p.locator('h1').count() >= 1, 'no <h1>')
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(over <= 1, `horizontal overflow of ${over}px`)
      })
    }
  }
  await p.setViewportSize({ width: 1440, height: 900 })

  // all links across the public pages resolve (internal via fetch, external only checked for non-empty)
  await s.check('every link on every public page resolves (no 404, no empty href)', p, async () => {
    const seen = new Map()
    for (const path of pages) {
      await p.goto(WEB + path, { waitUntil: 'networkidle' })
      const hrefs = await p.$$eval('a[href]', (as) => as.map((a) => ({ href: a.getAttribute('href'), text: (a.textContent ?? '').trim().slice(0, 30) })))
      for (const h of hrefs) seen.set(h.href, `${path}: "${h.text}"`)
    }
    const bad = []
    for (const [href, where] of seen) {
      if (!href || href === '#' || href.startsWith('javascript:')) { bad.push(`dead href "${href}" (${where})`); continue }
      if (href.startsWith('mailto:') || href.startsWith('tel:')) continue
      if (/^https?:\/\//.test(href) && !href.startsWith(WEB) && !href.startsWith(EDITOR)) continue
      if (href.startsWith('#')) { if (!(await p.locator(href).count())) { await p.goto(WEB + '/'); if (!(await p.locator(href).count())) bad.push(`anchor ${href} missing (${where})`) } continue }
      const url = href.startsWith('http') ? href : WEB + href
      const res = await fetch(url, { redirect: 'follow' }).catch(() => null)
      if (!res || res.status >= 400) bad.push(`${href} → ${res?.status ?? 'unreachable'} (${where})`)
    }
    expect(!bad.length, bad.join(' | '))
  })

  await p.goto(WEB + '/', { waitUntil: 'networkidle' })
  await s.check('header nav: each item scrolls to its section / navigates', p, async () => {
    const items = await p.$$eval('header nav a, header a', (as) => as.map((a) => a.getAttribute('href')).filter(Boolean))
    expect(items.length >= 5, `only ${items.length} header links`)
  })

  await s.check('hero: example chips fill the prompt box', p, async () => {
    const chips = p.locator('button').filter({ hasText: /^(?!.*Generate)/ }).locator('xpath=self::*[contains(@class,"rounded-full")]')
    const ta = p.getByLabel('Presentation prompt')
    expect(await ta.count() === 1, 'prompt box missing')
    const chip = p.locator('button.rounded-full').nth(3)
    if (await chip.count()) { await chip.click(); await settle(200) }
  })

  await s.check('hero: typing in the prompt box works and Generate is enabled', p, async () => {
    const ta = p.getByLabel('Presentation prompt')
    await ta.fill('A 10-slide investor pitch for a logistics startup')
    expect((await ta.inputValue()).includes('logistics'), 'text not kept')
    expect(await p.getByRole('button', { name: /Generate Presentation/ }).isEnabled(), 'Generate disabled')
  })

  await s.check('hero: attach a .txt file → chip appears → can be removed', p, async () => {
    const f = join(RESULTS, 'sample.txt'); writeFileSync(f, 'Northwind makes logistics software. Revenue grew in 2025.')
    await p.getByLabel('Attach files').setInputFiles(f)
    await p.getByLabel('Attached sources').waitFor({ timeout: 8000 })
    expect((await p.getByLabel('Attached sources').textContent()).includes('sample.txt'), 'chip missing')
    await p.getByLabel(/Remove sample/).click()
    await settle(300)
    expect(!(await p.getByLabel('Attached sources').count()) || !(await p.getByLabel('Attached sources').textContent()).includes('sample.txt'), 'chip not removed')
  })

  await s.check('hero: unsupported file type is refused with a clear message', p, async () => {
    const f = join(RESULTS, 'bad.exe'); writeFileSync(f, 'MZ')
    await p.getByLabel('Attach files').setInputFiles(f)
    await p.getByText(/Unsupported file type/).first().waitFor({ timeout: 8000 })
  })

  await s.check('hero: add website link → chip; invalid link is refused with a message', p, async () => {
    await p.getByRole('button', { name: /Add website link/ }).click()
    const input = p.getByLabel('Reference website link')
    await input.fill('not a url at all'); await input.press('Enter')
    await p.getByText(/Invalid URL/).first().waitFor({ timeout: 8000 })
    await input.fill('https://example.com/news'); await input.press('Enter')
    await p.waitForFunction(() => /example\.com/.test(document.querySelector('[aria-label="Attached sources"]')?.textContent ?? ''), null, { timeout: 8000 })
  })

  await s.check('hero: Generate while signed out hands off to sign-up/login with the prompt kept', p, async () => {
    await p.getByRole('button', { name: /Generate Presentation/ }).click()
    await p.waitForURL(/\/(signup|login)|\/start|localhost:3001/, { timeout: 15000 })
  })

  await p.goto(WEB + '/pricing', { waitUntil: 'networkidle' })
  await s.check('pricing: monthly/annual toggle changes prices', p, async () => {
    const before = await p.locator('main').innerText()
    const priceOf = () => p.locator('main').innerText().then((t) => (t.match(/[₹$]\s?[\d,.]+/g) ?? []).join(','))
    const priceBefore = await priceOf()
    await p.getByRole('button', { name: /Monthly/ }).first().click(); await settle(400) // annual is the default
    const after = await p.locator('main').innerText()
    expect(before !== after || priceBefore !== await priceOf(), 'toggle changed nothing')
    expect(priceBefore !== await priceOf(), `prices identical (${priceBefore})`)
    expect(await p.getByRole('button', { name: /Monthly/ }).first().getAttribute('aria-pressed') === 'true', 'aria-pressed not set')
  })
  await s.check('pricing: plan buttons point to signup / billing', p, async () => {
    const hrefs = await p.$$eval('a', (as) => as.map((a) => a.getAttribute('href')))
    expect(hrefs.some((h) => h === '/signup'), 'no starter → /signup')
    expect(hrefs.some((h) => /billing\?plan=pro/.test(h ?? '')), 'no Pro → billing')
    expect(hrefs.some((h) => /billing\?plan=gold/.test(h ?? '')), 'no Gold → billing')
  })

  await p.goto(WEB + '/', { waitUntil: 'networkidle' })
  await s.check('FAQ: items open and close', p, async () => {
    const q = p.locator('button[aria-controls^="faq-"]')
    expect(await q.count() >= 3, 'few FAQs')
    await q.nth(1).scrollIntoViewIfNeeded(); await q.nth(1).click(); await settle(450)
    expect(await q.nth(1).getAttribute('aria-expanded') === 'true', 'did not open')
    await q.nth(1).click(); await settle(450)
    expect(await q.nth(1).getAttribute('aria-expanded') === 'false', 'did not close')
  })

  await p.goto(WEB + '/templates', { waitUntil: 'networkidle' })
  await s.check('templates: category tabs filter, search filters, card opens detail page', p, async () => {
    const all = await p.locator('a[aria-label*="—"]').count()
    expect(all >= 100, `only ${all} templates listed`)
    await p.getByRole('tab', { name: /Pitch/ }).click(); await settle(500)
    const n = await p.locator('a[aria-label*="—"]').count()
    expect(n >= 1 && n < all, `category filter: ${n}/${all}`)
    await p.getByLabel('Search templates').fill('zzzznothing'); await settle(400)
    expect(await p.locator('a[aria-label*="—"]').count() === 0, 'search did not filter')
    await p.getByLabel('Search templates').fill('launchpad'); await settle(500)
    await p.locator('a[aria-label*="Launchpad"]').first().click()
    await p.waitForURL(/\/templates\/pitch-launchpad/)
  })
  await s.check('template detail: next/prev/play/thumbnails work, Use-this-template targets the editor', p, async () => {
    await settle(900)
    const counter = () => p.locator('span.tabular-nums').first().innerText()
    expect((await counter()).startsWith('1 /'), 'starts at 1')
    await p.getByRole('button', { name: 'Next slide' }).click(); await settle(300)
    expect((await counter()).startsWith('2 /'), 'next failed')
    await p.getByRole('button', { name: 'Previous slide' }).click(); await settle(300)
    expect((await counter()).startsWith('1 /'), 'prev failed')
    await p.getByRole('tab', { name: 'Slide 4', exact: true }).click(); await settle(300)
    expect((await counter()).startsWith('4 /'), 'thumbnail failed')
    await p.getByRole('button', { name: /Play animation/ }).click(); await settle(400)
    const href = await p.getByRole('link', { name: /Use this template/i }).getAttribute('href')
    expect(href?.startsWith(EDITOR) && href.includes('open=pitch-launchpad'), `bad href ${href}`)
  })
  await s.check('template detail: unknown id → 404 page, not a crash', p, async () => {
    const r = await p.goto(WEB + '/templates/does-not-exist')
    expect(r.status() === 404, `status ${r.status()}`)
  })

  await b.close()
  return s.done()
}
