import { join } from 'node:path'
import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'

/** Header menus (Templates, Resources), the language picker's visible effect on the landing page, and the Google sign-in button. No AI is called. */
const SHOTS = new URL('../results/', import.meta.url).pathname

export default async function () {
  const s = suite('42-nav-and-signin')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  const header = () => p.locator('header')
  const bg = (loc) => loc.evaluate((e) => getComputedStyle(e).backgroundColor)

  try {
    await s.check('A1 Resources: hovering opens Blog, Tech news and Guides; each link leads to its page; Escape closes it', p, async () => {
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      await header().getByRole('link', { name: 'Resources' }).hover()
      const panel = p.getByRole('region', { name: 'Resources links' }); await panel.waitFor({ timeout: 4000 })
      for (const [name, path] of [['Blog', '/blog'], ['Tech news', '/news'], ['Guides', '/guides']]) expect((await panel.getByRole('link', { name }).getAttribute('href')) === path, `${name} link`)
      await p.screenshot({ path: join(SHOTS, '42-resources.png'), clip: { x: 0, y: 0, width: 1440, height: 330 } })
      await p.keyboard.press('Escape'); expect(await p.getByRole('region', { name: 'Resources links' }).count() === 0, 'Escape did not close it')
      await p.mouse.move(700, 600); await p.waitForTimeout(300)
      await header().getByRole('link', { name: 'Resources' }).hover(); await p.getByRole('region', { name: 'Resources links' }).getByRole('link', { name: 'Guides' }).click()
      await p.waitForURL(/\/guides$/, { timeout: 10000 })
    })

    await s.check('A2 Templates: hovering highlights the item and opens the collections with a clear "View all templates" button that goes to /templates', p, async () => {
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      const trigger = header().getByRole('link', { name: 'Templates', exact: true }).locator('xpath=..')
      const before = await bg(trigger)
      await header().getByRole('link', { name: 'Templates', exact: true }).hover()
      const panel = p.getByRole('region', { name: 'Templates links' }); await panel.waitFor({ timeout: 4000 })
      await p.waitForTimeout(400) // the highlight fades in
      const after = await bg(trigger); expect(before !== after, `no visible highlight on hover (${before} → ${after})`)
      expect(await panel.getByRole('link').count() >= 10, 'collections not listed')
      expect((await panel.getByRole('link', { name: 'Pitch Deck templates' }).getAttribute('href')) === '/free-templates/pitch-deck-templates', 'pitch deck collection link')
      const cta = panel.getByRole('link', { name: /View all templates/ }); expect(await cta.isVisible(), 'no View all templates button')
      expect((await bg(cta)) !== 'rgba(0, 0, 0, 0)', 'the button has no fill')
      await p.screenshot({ path: join(SHOTS, '42-templates.png'), clip: { x: 0, y: 0, width: 1440, height: 420 } })
      await p.mouse.move(700, 600); await p.waitForTimeout(400)
      expect(await p.getByRole('region', { name: 'Templates links' }).count() === 0, 'the panel stays open when the mouse leaves')
      await header().getByRole('link', { name: 'Templates', exact: true }).hover(); await cta.click()
      await p.waitForURL(/\/templates$/, { timeout: 10000 })
    })

    await s.check('A3 Keyboard: Tab reaches the menu button, Enter opens it and the links can be tabbed; the label itself still links to its page; plain links get the same hover highlight', p, async () => {
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      await header().getByRole('button', { name: 'Resources menu' }).focus(); await p.keyboard.press('Enter')
      await p.getByRole('region', { name: 'Resources links' }).waitFor({ timeout: 4000 })
      await p.keyboard.press('Tab'); expect(await p.evaluate(() => document.activeElement?.textContent?.includes('Blog')), 'Tab does not move into the panel')
      expect((await header().getByRole('link', { name: 'Templates', exact: true }).getAttribute('href')) === '/templates', 'label link')
      const plain = header().getByRole('link', { name: 'Pricing' }); const b0 = await bg(plain); await plain.hover(); await p.waitForTimeout(250)
      expect((await bg(plain)) !== b0, 'Pricing has no hover highlight')
    })

    await s.check('A4 Phone menu lists Templates, Blog, Tech news and Guides as plain links', p, async () => {
      await p.setViewportSize({ width: 390, height: 800 }); await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      await p.getByRole('button', { name: 'Open menu' }).click()
      const nav = p.locator('#mobile-nav')
      for (const l of ['Templates', 'Blog', 'Tech news', 'Guides']) expect(await nav.getByRole('link', { name: l }).count() === 1, `${l} missing in the phone menu`)
      await p.setViewportSize({ width: 1440, height: 900 })
    })

    await s.check('B1 Language: only the 13 offered languages, English first and by default; the choice shows in the header AND the prompt box, stays in sync, and the editor hand-off carries it', p, async () => {
      const send = async (text) => { await p.locator('main textarea').first().fill(text); await p.locator('main button:has(svg.lucide-send)').click(); await p.waitForTimeout(3000) } // (labels may be translated)
      const English = () => p.waitForFunction(() => /Turn Messy Documents/.test(document.querySelector('h1')?.innerText ?? ''), null, { timeout: 25000 })
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      const chip = p.locator('main label', { hasText: 'Language:' }).first(); await chip.waitFor({ timeout: 8000 })
      expect((await chip.innerText()).includes('English'), `the default is not English: ${await chip.innerText()}`)
      expect((await header().innerText()).includes('EN'), 'the header does not show English by default')
      const opts = await chip.getByLabel('Presentation language').locator('option').allInnerTexts()
      expect(opts.join('|') === 'English|Deutsch|Español|Français|हिन्दी|Bahasa Indonesia|Italiano|中文|Polski|Português|Tiếng Việt|Magyar|Svenska', `languages offered: ${opts.join('|')}`)
      expect(!opts.some((o) => /auto/i.test(o)), 'Auto-detect is still offered')
      await chip.getByLabel('Presentation language').selectOption('hi'); await p.waitForTimeout(300)
      expect((await chip.innerText()).includes('हिन्दी'), `prompt box does not show Hindi: ${await chip.innerText()}`)
      expect((await header().innerText()).includes('HI'), 'the header does not show the language')
      await header().getByLabel('Presentation language').selectOption('de'); await p.waitForTimeout(300)
      expect((await chip.innerText()).includes('Deutsch'), 'prompt box did not follow the header')
      await p.screenshot({ path: join(SHOTS, '42-language.png') })
      let target = null
      await p.route(/\/start\?draft=/, (r) => { target = r.request().url(); void r.abort() })
      await send('A deck about solar energy')
      expect(target && /[?&]lang=de\b/.test(target), `hand-off: ${target}`)
      // back to English: nothing is stored, the page returns to the original text, and the hand-off says English
      await p.unroute(/\/start\?draft=/); await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      await header().getByLabel('Presentation language').selectOption('en'); await English()
      expect(await p.evaluate(() => localStorage.getItem('slidesdone:deck-language')) === null, 'English should not need to be stored')
      let en = null; await p.route(/\/start\?draft=/, (r) => { en = r.request().url(); void r.abort() })
      await send('A deck about hydro energy')
      expect(en && /[?&]lang=en\b/.test(en), `default hand-off should say English: ${en}`)
      // a language saved earlier that is no longer offered falls back to English
      await p.unroute(/\/start\?draft=/); await p.goto(WEB + '/', { waitUntil: 'networkidle' }); await p.evaluate(() => localStorage.setItem('slidesdone:deck-language', 'ta')); await p.reload({ waitUntil: 'networkidle' })
      expect(await header().getByLabel('Presentation language').inputValue() === 'en', 'an old, no longer offered language was kept')
      await p.evaluate(() => localStorage.removeItem('slidesdone:deck-language'))
    })

    await s.check('B2 Editor home: the deck language starts on English too', p, async () => {
      const q = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
      const email = `lang${Date.now()}@example.com`
      const su = await q.context().request.post(`${API}/api/auth/sign-up/email`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { email, password: 'Passw0rd!qa-test', name: 'Lang QA' } }); expect(su.ok(), `sign-up ${su.status()}`)
      await q.goto(EDITOR + '/', { waitUntil: 'load' }); await q.getByLabel('Deck language').waitFor({ timeout: 15000 })
      expect(await q.getByLabel('Deck language').inputValue() === 'en', `editor default is "${await q.getByLabel('Deck language').inputValue()}"`)
      await q.close()
    })

    await s.check('C1 Login page: "Continue with Google" is a real button (border, shadow, Google logo, full width) and "OR" has divider lines', p, async () => {
      await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
      const g = p.getByRole('button', { name: /Continue with Google/ }); await g.waitFor()
      const st = await g.evaluate((e) => { const c = getComputedStyle(e); return { border: c.borderTopWidth, shadow: c.boxShadow, bg: c.backgroundColor, w: e.getBoundingClientRect().width, svg: e.querySelectorAll('svg').length, h: e.getBoundingClientRect().height } })
      expect(parseFloat(st.border) >= 2, `no border: ${JSON.stringify(st)}`); expect(st.shadow !== 'none', 'no shadow'); expect(st.svg === 1, 'no Google logo'); expect(st.h >= 44, `too small: ${st.h}`)
      await p.screenshot({ path: join(SHOTS, '42-login.png') })
    })

    await s.check('C2 Google sign-in starts: the click asks the API and the browser is sent to Google with our client id and the right return address', p, async () => {
      let google = null
      await p.route(/accounts\.google\.com/, (r) => { google = r.request().url(); void r.fulfill({ status: 200, contentType: 'text/html', body: 'google' }) })
      await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
      await p.getByRole('button', { name: /Continue with Google/ }).click()
      await p.waitForURL(/accounts\.google\.com/, { timeout: 15000 })
      expect(google && /client_id=/.test(google) && /redirect_uri=http(s)?%3A%2F%2F[^&]*%2Fapi%2Fauth%2Fcallback%2Fgoogle/.test(google), `google url: ${google}`)
      await p.unroute(/accounts\.google\.com/)
    })

    await s.check('C3 When the sign-in service cannot be reached, or Google sends the person back with an error, a plain message is shown (no crash, no stuck button)', p, async () => {
      await p.goto(WEB + '/login', { waitUntil: 'networkidle' })
      await p.route(/\/api\/auth\/sign-in\/social/, (r) => void r.abort('failed'))
      await p.getByRole('button', { name: /Continue with Google/ }).click()
      await p.getByRole('alert').filter({ hasText: /could not reach the sign-in service/ }).waitFor({ timeout: 10000 })
      expect(await p.getByRole('button', { name: /Continue with Google/ }).isEnabled(), 'button stays disabled'); await p.unroute(/\/api\/auth\/sign-in\/social/)
      await p.goto(WEB + '/login?error=google', { waitUntil: 'networkidle' })
      await p.getByRole('alert').filter({ hasText: /Google sign-in did not finish/ }).waitFor({ timeout: 8000 })
      await p.goto(WEB + '/signup?error=google', { waitUntil: 'networkidle' }); await p.getByRole('alert').filter({ hasText: /did not finish/ }).waitFor({ timeout: 8000 })
    })

    await s.check('D1 Landing prompt box: the empty box types example prompts; it stops when the person writes and starts again when cleared; reduced motion keeps the plain text', p, async () => {
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      const box = p.getByLabel('Presentation prompt')
      const ph = () => box.getAttribute('placeholder')
      await p.waitForFunction(() => /\|$/.test(document.querySelector('textarea[aria-label="Presentation prompt"]')?.getAttribute('placeholder') ?? ''), null, { timeout: 8000 })
      const a = await ph(); await p.waitForTimeout(700); const c = await ph()
      expect(a !== c && c.endsWith('|'), `the placeholder is not moving: "${a}" → "${c}"`)
      await box.fill('My own prompt'); await p.waitForTimeout(500)
      const frozen = await ph(); await p.waitForTimeout(600)
      expect((await ph()) === frozen, 'still typing while the person has written something')
      expect(await box.inputValue() === 'My own prompt', 'the typed examples touched the real text')
      await box.fill(''); await box.blur(); await p.waitForTimeout(1800)
      expect((await ph()).endsWith('|'), 'does not start again when the box is cleared and left')
      await p.screenshot({ path: join(SHOTS, '42-typing.png'), clip: { x: 200, y: 380, width: 1040, height: 420 } })
      const calm = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const q = await calm.newPage()
      await q.goto(WEB + '/', { waitUntil: 'networkidle' }); await q.waitForTimeout(2500)
      expect(/^Describe your presentation/.test(await q.getByLabel('Presentation prompt').getAttribute('placeholder')), 'reduced motion still animates'); await calm.close()
    })

    await s.check('D2 One cursor: clicking into the box stops the typed example (no second "|"); leaving the empty box starts it again', p, async () => {
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      const box = p.getByLabel('Presentation prompt'); const ph = () => box.getAttribute('placeholder')
      await p.waitForFunction(() => /\|$/.test(document.querySelector('textarea[aria-label="Presentation prompt"]')?.getAttribute('placeholder') ?? ''), null, { timeout: 8000 })
      await box.click(); await p.waitForTimeout(500)
      const a = await ph(); await p.waitForTimeout(500)
      expect(!a.includes('|') && a === await ph(), `a cursor is still drawn in the placeholder while focused: "${a}"`)
      await p.getByLabel('Presentation prompt').blur(); await p.waitForTimeout(1500)
      expect((await ph()).endsWith('|'), 'does not start again after leaving the empty box')
    })

    await s.check('D3 The "Reference website" tab is gone (Add website link does that job once); the ways-to-start row keeps Prompt to deck and PDF, PPT & TXT files', p, async () => {
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      const row = p.getByRole('group', { name: 'Ways to start' })
      expect(await row.getByRole('button', { name: /Reference website/ }).count() === 0, 'Reference website tab is still there')
      expect(await p.getByRole('button', { name: /Add website link/ }).count() === 1, 'Add website link missing')
      expect(await row.getByRole('button').count() === 2, `unexpected tabs: ${await row.innerText()}`)
    })

    await s.check('D4 Generate is one round icon button (no text) with an accessible name and a tooltip; it still starts the hand-off', p, async () => {
      await p.goto(WEB + '/', { waitUntil: 'networkidle' })
      const g = p.getByRole('button', { name: 'Generate Presentation' })
      expect((await g.innerText()).trim() === '', `the button shows text: "${await g.innerText()}"`)
      const r = await g.evaluate((e) => { const c = getComputedStyle(e); const b = e.getBoundingClientRect(); return { w: b.width, h: b.height, radius: c.borderTopLeftRadius, bg: c.backgroundColor, shadow: c.boxShadow, svg: e.querySelectorAll('svg').length } })
      expect(r.w === r.h && r.w >= 44 && parseFloat(r.radius) >= r.w / 2 - 1 && r.svg === 1, `not a round icon button: ${JSON.stringify(r)}`)
      expect(!r.shadow.includes(r.bg), `the button and its shadow are the same colour: ${r.bg} / ${r.shadow}`)
      expect((await g.getAttribute('title')) === 'Generate presentation', 'no tooltip')
      await p.screenshot({ path: join(SHOTS, '42-send.png') })
      let target = null; await p.route(/\/start\?draft=/, (rt) => { target = rt.request().url(); void rt.abort() })
      await p.getByLabel('Presentation prompt').fill('A deck about tidal energy'); await g.click(); await p.waitForTimeout(3000)
      expect(target && /\/start\?draft=/.test(target), 'the button did not start the hand-off'); await p.unroute(/\/start\?draft=/)
    })
  } finally { await b.close() }
  return s.done()
}
