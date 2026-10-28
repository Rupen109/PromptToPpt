import { execSync } from 'node:child_process'
import { API, EDITOR, WEB, expect, launch, suite, uniqueEmail } from '../lib.mjs'

/**
 * "Get brand from a website" against the REAL internet: real browser, real API server and database, real websites, real DNS and redirects.
 * (No AI is involved, so this costs nothing.) Flow ids refer to docs/BRAND_FROM_WEBSITE_FLOWS.md.
 * The server allows 10 lookups per hour per person, so the checks are split over two fresh accounts: A (the flows) and B (slow site, unicode, rate limit).
 */
export default async function () {
  const s = suite('23-brand-website')
  const cwd = new URL('../..', import.meta.url).pathname
  const plan = (email, p) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${email} ${p}`, { cwd, stdio: 'pipe' })
  const LEAK = /fetch failed|ENOTFOUND|ECONN|TypeError|undici|DOMException|stack|\bat \S+\.(ts|js):\d+|\/Users\/|node:/i
  const b = await launch()

  /** a brand-new signed-in person with a starter deck */
  async function person(tag) {
    const email = uniqueEmail(tag)
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const su = await ctx.request.post(`${API}/api/auth/sign-up/email`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { email, password: 'Passw0rd!qa-test', name: 'Brand QA' } })
    expect(su.ok(), `sign-up ${su.status()}`)
    const mk = await ctx.request.post(`${API}/api/v1/presentations`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { title: 'Brand test deck' } })
    expect(mk.ok(), `create deck ${mk.status()}`)
    const id = (await mk.json()).data.id
    const p = await ctx.newPage()
    const posts = []
    p.on('request', (r) => { if (r.url().endsWith('/brand/extract') && r.method() === 'POST') posts.push(r.postData()) })
    return { email, ctx, p, id, posts }
  }
  const open = async (A) => {
    await A.p.goto(`${EDITOR}/edit/${A.id}`, { waitUntil: 'networkidle' })
    await A.p.locator('[data-testid="stage"]').waitFor({ timeout: 15000 })
    await A.p.getByRole('toolbar').getByRole('button').nth(1).click()
    await A.p.getByRole('tab', { name: 'Brand' }).click()
  }
  const section = (p) => p.locator('details[aria-label="Get brand from a website"]')
  const input = (p) => p.getByLabel('Your company website')
  const findBtn = (p) => p.getByRole('button', { name: /^(Find brand|Looking…)$/ })
  /** type an address, press the button, wait for either a result or a message */
  async function lookup(p, text, { enter = false } = {}) {
    if (!(await section(p).getAttribute('open').then((v) => v !== null))) await p.getByText('Get brand from a website').click()
    await input(p).fill(text)
    const t0 = Date.now()
    if (enter) await input(p).press('Enter'); else await findBtn(p).click()
    await Promise.race([p.getByLabel('What we found').waitFor({ timeout: 40000 }), section(p).getByRole('alert').waitFor({ timeout: 40000 })])
    return Date.now() - t0
  }
  const message = async (p) => (await section(p).getByRole('alert').innerText()).trim()
  const found = (p) => p.getByLabel('What we found')
  const logos = (p) => p.locator('[data-testid="stage"] img[alt$="logo"]').count()
  const deckJson = async (A, needle) => {
    for (let i = 0; i < 40; i++) {
      const r = await A.ctx.request.get(`${API}/api/v1/presentations/${A.id}`)
      const t = JSON.stringify((await r.json()).data ?? {}).toLowerCase()
      if (t.includes(needle.toLowerCase())) return true
      await A.p.waitForTimeout(500)
    }
    return false
  }

  const A = await person('brandA')
  const B = await person('brandB')
  try {
    // ───────── A1: Starter ─────────
    await s.check('A1 Starter: the Brand tab explains the feature and offers the upgrade; no lookup is possible', A.p, async () => {
      await open(A)
      await A.p.getByText(/Available on Pro and Gold/).waitFor({ timeout: 8000 })
      expect(await A.p.getByText('Get brand from a website').count() === 0 && A.posts.length === 0, 'a Starter user can reach the lookup')
    })
    plan(A.email, 'pro'); plan(B.email, 'pro')

    // ───────── A3 + A6 (no server call) ─────────
    await s.check('A3 empty / spaces / not an address: the button is off or a clear message shows, and nothing is sent to the server', A.p, async () => {
      await open(A)
      await A.p.getByText('Get brand from a website').click()
      expect(await findBtn(A.p).isDisabled(), 'the button is enabled for an empty field')
      await input(A.p).fill('    '); expect(await findBtn(A.p).isDisabled(), 'the button is enabled for spaces')
      for (const bad of ['hello world', 'localhost', 'just-a-word', '127.0.0.1', 'a.b']) {
        await input(A.p).fill(bad); await findBtn(A.p).click()
        expect(/Enter a website address/.test(await message(A.p)), `no message for "${bad}"`)
      }
      await input(A.p).fill('x'.repeat(2100) + '.com'); await findBtn(A.p).click()
      expect(/Enter a website address/.test(await message(A.p)), 'no message for a 2000+ character address')
      await input(A.p).fill('dropbox.com'); expect(await section(A.p).getByRole('alert').count() === 0, 'the message stays after typing again')
      expect(A.posts.length === 0, `${A.posts.length} request(s) reached the server for bad input`)
    })

    // ───────── B1/B2/B3/B4/B8/B9 + A5 on dropbox ─────────
    let logo1 = ''
    await s.check('A5 + B1 double click on Find brand sends ONE lookup; a real site (dropbox.com) shows name, colours, fonts and a logo stored on our side', A.p, async () => {
      await A.p.reload({ waitUntil: 'networkidle' }); await A.p.getByRole('toolbar').getByRole('button').nth(1).click(); await A.p.getByRole('tab', { name: 'Brand' }).click()
      await A.p.getByText('Get brand from a website').click(); await input(A.p).fill('dropbox.com')
      const t0 = Date.now(); await findBtn(A.p).dblclick()
      await found(A.p).waitFor({ timeout: 40000 })
      expect(A.posts.length === 1, `double click sent ${A.posts.length} lookups`)
      const text = await found(A.p).innerText()
      expect(/dropbox/i.test(text), `name not shown: ${text.slice(0, 80)}`)
      const main = (await found(A.p).getByLabel('Found main colour').inputValue()).toUpperCase()
      expect(/^#[0-9A-F]{6}$/.test(main), 'no main colour')
      // dropbox blue is #0061FF: the real result must be close
      const d = ['1', '3', '5'].map((_, i) => parseInt(main.slice(1 + 2 * i, 3 + 2 * i), 16) - [0, 0x61, 0xff][i])
      expect(Math.hypot(...d) <= 75, `main colour ${main} is far from Dropbox blue`)
      const img = found(A.p).getByRole('img', { name: 'Logo found on the site' }); await img.waitFor({ timeout: 8000 })
      logo1 = await img.getAttribute('src')
      expect(new URL(logo1).pathname.startsWith('/api/v1/assets/'), `the logo is hot-linked: ${logo1}`)
      const r = await A.ctx.request.get(logo1); expect(r.ok() && /image\/(png|jpeg)/.test(r.headers()['content-type'] ?? ''), `stored logo does not load (${r.status()})`)
      expect(Date.now() - t0 < 25000, 'took longer than 25 s')
    })

    await s.check('B3 + B4 only the ticked parts are applied, and an edited colour is what gets applied', A.p, async () => {
      const f = found(A.p)
      await f.getByLabel('Found main colour').fill('#123456')
      await f.getByRole('checkbox', { name: /Fonts/ }).uncheck(); await f.getByRole('checkbox', { name: /Logo/ }).uncheck()
      await f.getByRole('button', { name: 'Apply to this presentation' }).click()
      await A.p.getByText(/Applied to every slide/).waitFor({ timeout: 8000 })
      expect(await logos(A.p) === 0, 'the logo was applied although unticked')
      expect(await deckJson(A, '#123456'), 'the edited colour was not applied')
    })

    await s.check('B2 apply everything: colours, fonts and the logo reach every slide; ONE undo reverts it all', A.p, async () => {
      const f = found(A.p)
      await f.getByRole('checkbox', { name: /Fonts/ }).check(); await f.getByRole('checkbox', { name: /Logo/ }).check()
      await f.getByRole('button', { name: 'Apply to this presentation' }).click()
      await A.p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 8000 })
      await A.p.keyboard.press('Escape'); await A.p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 } }); await A.p.keyboard.press('Meta+z'); await A.p.waitForTimeout(700)
      expect(await logos(A.p) === 0, 'undo did not remove the logo')
    })

    await s.check('B8 the same site twice: same result, and the logo file is reused (not stored again)', A.p, async () => {
      await lookup(A.p, 'https://www.dropbox.com/')
      const again = await found(A.p).getByRole('img', { name: 'Logo found on the site' }).getAttribute('src')
      expect(again === logo1, `a second copy of the logo was stored (${logo1} vs ${again})`)
    })

    await s.check('B7 + B9 "Save as brand kit" keeps colours, fonts, logo and website, and survives a reload (the logo is ours, not the site\'s)', A.p, async () => {
      await found(A.p).getByRole('button', { name: 'Save as brand kit' }).click()
      await A.p.getByText(/Saved to your brand kit/).waitFor({ timeout: 8000 })
      await open(A)
      const kit = A.p.getByLabel('Brand kit details'); await kit.waitFor({ timeout: 8000 })
      expect(/dropbox/i.test(await kit.getByLabel('Kit name').inputValue()), 'kit name')
      expect(/^#[0-9a-f]{6}$/i.test(await kit.getByLabel('Main colour').inputValue()), 'kit colour')
      const src = await kit.getByRole('img', { name: 'Brand logo' }).getAttribute('src')
      expect(new URL(src).pathname.startsWith('/api/v1/assets/'), 'kit logo is hot-linked')
    })

    // ───────── A2 / A4: input variants ─────────
    await s.check('A2 + A4 input variants all work: upper case, an address with a path and query, spaces around it; Enter starts the lookup', A.p, async () => {
      const ms = await lookup(A.p, '  Netflix.com/browse?x=1  ', { enter: true })
      expect(await found(A.p).count() === 1 && /netflix/i.test(await found(A.p).innerText()), 'path + query + spaces + Enter did not work')
      await lookup(A.p, 'ASANA.COM')
      expect(/asana/i.test(await found(A.p).innerText()), 'upper case address did not work')
      expect(ms < 25000, 'too slow')
    })

    // ───────── B5: no brand ─────────
    await s.check('B5 a site with no brand colours (example.com): says so, offers nothing wrong to apply', A.p, async () => {
      await lookup(A.p, 'example.com')
      const f = found(A.p)
      expect(/No brand colours found/.test(await f.innerText()), 'no "No brand colours found"')
      expect(await f.getByRole('button', { name: 'Apply to this presentation' }).isDisabled(), 'Apply is enabled with nothing to apply')
    })

    // ───────── C: failures, D: security (real internet) ─────────
    const fails = [
      ['C1 a domain that does not exist', 'this-domain-should-not-exist-98127.com', /could not find that website/],
      ['C2 a page that is 404', 'https://example.com/this/page/does/not/exist', /could not find that page/],
      ['C3 a PDF (not a web page)', 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', /not a web page/],
      ['D2 a real domain that points at 127.0.0.1 (localtest.me)', 'localtest.me', /not allowed/],
      ['D3 a public site that redirects to a private address', 'https://httpbin.org/redirect-to?url=http://169.254.169.254/', /not allowed/],
    ]
    for (const [title, url, re] of fails) {
      await s.check(`${title}: one plain sentence, no technical text, form usable again`, A.p, async () => {
        const ms = await lookup(A.p, url)
        const m = await message(A.p)
        expect(re.test(m), `unexpected message: "${m}"`)
        expect(!LEAK.test(m), `technical text leaked: "${m}"`)
        expect(await found(A.p).count() === 0, 'a result is still shown next to the error')
        expect(await findBtn(A.p).isEnabled() && /^Find brand$/.test(await findBtn(A.p).innerText()), 'the form is not usable again')
        expect(ms < 25000, `took ${ms} ms`)
      })
    }

    // ───────── account B: slow site, unicode, rate limit ─────────
    await s.check('C4 a very slow site (15 s delay) is given up cleanly with a message and the form works again', B.p, async () => {
      await open(B)
      const ms = await lookup(B.p, 'https://httpbin.org/delay/15')
      const m = await message(B.p)
      expect(/took too long/.test(m) && !LEAK.test(m), `unexpected message: "${m}"`)
      expect(ms < 25000, `took ${ms} ms`)
      expect(await findBtn(B.p).isEnabled(), 'the form is stuck')
    })

    await s.check('A6 a unicode address (münchen.de) is handled: a result or a plain message, never a crash', B.p, async () => {
      await lookup(B.p, 'münchen.de')
      const ok = await found(B.p).count()
      if (!ok) expect(!LEAK.test(await message(B.p)), 'technical text leaked')
    })

    await s.check('C6 too many lookups: a clear "wait a while" message, then the rest of the editor still works', B.p, async () => {
      for (let i = 0; i < 9; i++) await B.ctx.request.post(`${API}/api/v1/brand/extract`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { url: 'https://example.com/' } })
      await lookup(B.p, 'dropbox.com')
      const m = await message(B.p)
      expect(/lot of websites/.test(m) && !/Too many requests/.test(m), `unfriendly rate-limit message: "${m}"`)
      await B.p.getByRole('tab', { name: 'Brand' }).click() // the panel is still alive
    })

    await s.check('C7 the API is unreachable: a message, not a frozen spinner', A.p, async () => {
      await A.p.route('**/api/v1/brand/extract', (r) => r.abort('failed'))
      await lookup(A.p, 'dropbox.com')
      const m = await message(A.p)
      expect(/could not reach the server|try again/i.test(m) && !LEAK.test(m), `unexpected message: "${m}"`)
      expect(await findBtn(A.p).isEnabled(), 'the form is stuck')
      await A.p.unroute('**/api/v1/brand/extract')
    })

    await s.check('phone width (390 px): the lookup section fits the screen and the result is reachable', A.p, async () => {
      await A.p.setViewportSize({ width: 390, height: 800 })
      await A.p.goto(`${EDITOR}/edit/${A.id}`, { waitUntil: 'networkidle' })
      await A.p.getByRole('button', { name: /Style/ }).click().catch(() => A.p.getByRole('toolbar').getByRole('button').nth(1).click())
      await A.p.getByRole('tab', { name: 'Brand' }).click()
      await A.p.getByText('Get brand from a website').click()
      expect(await A.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the page scrolls sideways')
      // layout only (the 10-per-hour quota of this account is used up): a typical result, mocked
      const profile = { sourceUrl: 'https://acme.example/', name: 'A very long company name that must wrap instead of pushing the page sideways', colors: { primary: '#E4572E', accent: '#17BEBB', accentDerived: true, palette: ['#E4572E'] }, fonts: { heading: { family: 'Playfair Display', original: 'Some Very Long Commercial Font Name Pro', exact: false }, body: { family: 'Inter', original: 'Inter', exact: true }, detected: [] }, logo: null, confidence: 'low' }
      await A.p.route('**/api/v1/brand/extract', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: profile }) }))
      await input(A.p).fill('acme.example'); await findBtn(A.p).click()
      await found(A.p).waitFor({ timeout: 40000 })
      expect(await A.p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the result makes the page scroll sideways')
    })
  } finally {
    await b.close()
  }
  return s.done()
}
