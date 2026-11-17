import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RESULTS, WEB, expect, launch, suite } from '../lib.mjs'

const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

/** Legal pages (docs/LEGAL_PAGES.md): each page loads with its heading, is linked from the footer and the sign-up form, is indexable, passes axe, has a clean console and no sideways scroll on a phone; the owner placeholders are visibly marked in development; no analytics loads without consent. */
const PAGES = [
  ['/terms', 'Terms of Service', 'Terms of Service'],
  ['/privacy', 'Privacy Policy', 'Privacy Policy'],
  ['/cookies', 'Cookie notice', 'Cookie notice'],
  ['/refunds', 'Cancellation and refund policy', 'Cancellation & refunds'],
]

export default async function () {
  const s = suite('71-legal-pages')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  const shot = process.env.LEGAL_SHOTS === '1'

  try {
    for (const [path, h1, footerLabel] of [...PAGES, ['/legal', 'Legal', null]]) {
      await s.check(`${path}: loads with its heading, sections, canonical, no noindex, clean console`, p, async () => {
        const errs = []; const on = (m) => { if (m.type() === 'error' && !/favicon|translate/i.test(m.text())) errs.push(m.text().slice(0, 160)) }; p.on('console', on)
        const res = await p.goto(WEB + path, { waitUntil: 'networkidle' }); p.off('console', on)
        expect(res.status() === 200, `status ${res.status()}`)
        expect((await p.getByRole('heading', { level: 1 }).innerText()).trim() === h1, `h1 is not "${h1}"`)
        expect(await p.locator('main h2').count() >= (path === '/legal' ? 2 : 4), 'too few sections')
        expect((await p.locator('link[rel=canonical]').getAttribute('href')).endsWith(path), 'canonical')
        expect(await p.locator('meta[name=robots][content*=noindex]').count() === 0, 'noindex is set')
        expect(await p.locator('main').innerText().then((t) => !/\bTODO\b/.test(t)), 'a raw TODO is on the page (owner fields must read "[Owner to add: …]")')
        expect(errs.length === 0, errs.join(' | '))
        if (shot) await p.screenshot({ path: join(RESULTS, `71${path.replace('/', '-')}-desktop.png`), fullPage: false })
      })
      await s.check(`${path}: axe (WCAG A/AA, serious and critical)`, p, async () => {
        await p.goto(WEB + path, { waitUntil: 'networkidle' })
        await p.addScriptTag({ content: axeSrc })
        const res = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] }))
        const bad = res.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
        expect(!bad.length, bad.map((v) => `${v.id}(${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 90).replace(/\s+/g, ' ')}`).join(' | '))
      })
      await s.check(`${path}: phone width (390 px) has no sideways scroll and the text is readable`, p, async () => {
        await p.setViewportSize({ width: 390, height: 800 }); await p.goto(WEB + path, { waitUntil: 'networkidle' })
        const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, h1: document.querySelector('h1').getBoundingClientRect().right }))
        if (shot) await p.screenshot({ path: join(RESULTS, `71${path.replace('/', '-')}-phone.png`) })
        await p.setViewportSize({ width: 1440, height: 900 })
        expect(r.over <= 1, `page is ${r.over}px wider than the screen`); expect(r.h1 <= 391, 'heading overflows')
      })
      if (footerLabel) {
        await s.check(`${path}: linked from the footer (Trust & Privacy) and the link works`, p, async () => {
          await p.goto(WEB + '/pricing', { waitUntil: 'networkidle' })
          const link = p.locator('footer').getByRole('link', { name: footerLabel, exact: true })
          expect(await link.count() === 1, 'footer link missing'); expect(await link.getAttribute('href') === path, 'wrong href')
          await link.click(); await p.waitForURL(`**${path}`)
        })
      }
    }

    await s.check('sign-up form: consent line links to Terms and Privacy Policy; the login form has none', p, async () => {
      await p.goto(WEB + '/signup', { waitUntil: 'networkidle' })
      const c = p.getByTestId('signup-consent'); await c.waitFor()
      expect((await c.innerText()).includes('By creating an account you agree to the Terms and Privacy Policy'), await c.innerText())
      expect(await c.getByRole('link', { name: 'Terms' }).getAttribute('href') === '/terms', 'Terms link'); expect(await c.getByRole('link', { name: 'Privacy Policy' }).getAttribute('href') === '/privacy', 'Privacy link')
      await p.goto(WEB + '/login', { waitUntil: 'networkidle' }); expect(await p.getByTestId('signup-consent').count() === 0, 'consent shown on login')
    })

    await s.check('pricing page: renewal and refund note links to /refunds and /terms', p, async () => {
      await p.goto(WEB + '/pricing', { waitUntil: 'networkidle' })
      const note = p.locator('main').getByText(/renew automatically until you cancel/)
      expect(await note.count() === 1, 'note missing'); expect(await note.getByRole('link', { name: /refund policy/ }).getAttribute('href') === '/refunds', 'refunds link')
    })

    await s.check('sitemap.xml and llms.txt list the legal pages', p, async () => {
      const sm = await (await p.request.get(WEB + '/sitemap.xml')).text(); const ll = await (await p.request.get(WEB + '/llms.txt')).text()
      for (const x of ['/terms', '/privacy', '/cookies', '/refunds', '/legal']) { expect(sm.includes(`${x}</loc>`), `sitemap lacks ${x}`) }
      for (const x of ['/terms', '/privacy', '/cookies', '/refunds']) expect(ll.includes(x), `llms.txt lacks ${x}`)
    })

    await s.check('owner fields are visibly marked in development (terms, privacy, refunds) so nobody mistakes them for final text', p, async () => {
      for (const path of ['/terms', '/privacy', '/refunds']) {
        await p.goto(WEB + path, { waitUntil: 'networkidle' })
        const n = await p.locator('mark[data-owner-todo]').count()
        const text = await p.locator('main').innerText()
        // either still TODO (marked) or the owner has filled everything in
        expect(n > 0 ? /\[Owner to add: [^\]]+\]/.test(text) : !/\[Owner to add/.test(text), `${path}: ${n} marks but text does not match`)
      }
    })

    await s.check('no analytics without consent: no Google tag request, no _ga cookie, no gtag script on any legal page', p, async () => {
      const hits = []; const on = (r) => /googletagmanager|google-analytics/.test(r.url()) && hits.push(r.url()); p.on('request', on)
      for (const [path] of PAGES) await p.goto(WEB + path, { waitUntil: 'networkidle' })
      p.off('request', on)
      expect(hits.length === 0, hits.join(' | '))
      expect((await ctx.cookies()).filter((c) => c.name.startsWith('_ga')).length === 0, '_ga cookie set')
      expect(await p.locator('script[src*=googletagmanager]').count() === 0, 'gtag script in the page')
    })
  } finally { await b.close() }
  return s.done()
}
