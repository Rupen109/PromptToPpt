import { join } from 'node:path'
import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, person, png, tsx } from '../kits-lib.mjs'

/**
 * The Support page (form → owner's dashboard inbox) and the header language button translating the website itself with Google's translate widget
 * (real internet). No AI is called. Flow ids: docs/CONTENT_FUNCTIONAL_FLOWS.md.
 */
const SHOTS = new URL('../results/', import.meta.url).pathname
const run = Date.now().toString(36)
const DEVANAGARI = /[ऀ-ॿ]/

export default async function () {
  const s = suite('43-support-and-translate')
  const b = await launch({ google: true }) // this suite tests the real Google widget
  const O = await person(b, 'supowner'); tsx(`scripts/qa-set-role.ts ${O.email} admin`)
  const U = await person(b, 'supuser')
  const v = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const o = O.p

  try {
    await s.check('A1 Navbar has Support (desktop and phone menu) and it opens a page like the reference: heading, 24–48 hours note, e-mail chip, form with required fields, screenshot box, Submit', v, async () => {
      await v.goto(WEB + '/', { waitUntil: 'networkidle' })
      await v.locator('header').getByRole('link', { name: 'Support', exact: true }).click()
      await v.waitForURL(/\/support$/, { timeout: 10000 })
      await v.getByRole('heading', { level: 1, name: 'Contact us' }).waitFor()
      expect(await v.getByText(/within 24–48 hours/).count() >= 1, 'no 24–48 hours note')
      expect((await v.getByRole('link', { name: /@/ }).first().getAttribute('href')).startsWith('mailto:'), 'e-mail chip is not a mailto link')
      for (const l of [/Email \(so we can follow up\)/, /How can we help\?/]) expect(await v.getByLabel(l).count() === 1, `${l} field missing`)
      expect(await v.getByText(/attach screenshots \(optional\)/).count() === 1, 'no screenshot box')
      expect(await v.getByRole('button', { name: /Submit/ }).isDisabled(), 'Submit should wait for a valid form')
      await v.screenshot({ path: join(SHOTS, '43-support.png'), fullPage: true })
      await v.setViewportSize({ width: 390, height: 800 }); await v.goto(WEB + '/support', { waitUntil: 'networkidle' })
      expect(await v.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'phone: scrolls sideways')
      await v.getByRole('button', { name: 'Open menu' }).click(); expect(await v.locator('#mobile-nav').getByRole('link', { name: 'Support' }).count() === 1, 'phone menu lacks Support')
      await v.setViewportSize({ width: 1440, height: 900 })
    })

    await s.check('A2 Sending: e-mail + message + a screenshot → "Thanks, we got your message" with a reference', v, async () => {
      await v.goto(WEB + '/support', { waitUntil: 'networkidle' })
      const email = `visitor.${run}@example.com`
      for (let i = 0; i < 8 && !(await v.getByLabel(/Email \(so we can follow up\)/).inputValue()); i++) { await v.getByLabel(/Email \(so we can follow up\)/).fill(email); await v.waitForTimeout(250) }
      await v.getByLabel(/How can we help\?/).fill(`The export button does nothing on my Mac (${run}). Screenshot attached.`)
      await v.getByLabel('Choose screenshots').setInputFiles({ name: 'export-bug.png', mimeType: 'image/png', buffer: png(320, 200) })
      await v.getByText('export-bug.png').waitFor()
      await v.getByRole('button', { name: /Submit/ }).click()
      await v.getByRole('heading', { name: /Thanks, we got your message/ }).waitFor({ timeout: 15000 })
      expect(await v.getByText(email).count() >= 1, 'the address is not repeated back')
      await v.screenshot({ path: join(SHOTS, '43-support-sent.png') })
    })

    await s.check('A3 The owner sees it in Control → Support: e-mail, text, a screenshot that loads, Reply by e-mail; marking resolved moves it; delete removes it', o, async () => {
      await o.goto(EDITOR + '/admin/support', { waitUntil: 'load' })
      const card = o.locator('li', { hasText: `(${run})` }).first(); await card.waitFor({ timeout: 15000 })
      expect((await card.innerText()).includes(`visitor.${run}@example.com`), 'sender missing')
      const img = card.locator('img').first(); await img.waitFor()
      await o.waitForFunction((el) => el.complete && el.naturalWidth > 0, await img.elementHandle(), { timeout: 10000 })
      expect((await card.getByRole('link', { name: /Reply by e-mail/ }).getAttribute('href')).startsWith(`mailto:visitor.${run}@example.com`), 'reply link')
      await o.screenshot({ path: join(SHOTS, '43-support-inbox.png') })
      await card.getByRole('button', { name: /Mark resolved/ }).click()
      await o.waitForFunction((t) => !document.body.innerText.includes(t), `(${run})`, { timeout: 8000 })
      await o.getByRole('tab', { name: /resolved/ }).click()
      const done = o.locator('li', { hasText: `(${run})` }).first(); await done.waitFor({ timeout: 8000 })
      o.once('dialog', (d) => d.accept()); await done.getByRole('button', { name: /Delete/ }).click()
      await o.waitForFunction((t) => !document.body.innerText.includes(t), `(${run})`, { timeout: 8000 })
    })

    await s.check('A4 Plain refusals on the page: not a picture, too big, more than 3, short message; and a customer cannot open the support inbox', v, async () => {
      await v.goto(WEB + '/support', { waitUntil: 'networkidle' })
      await v.getByLabel('Choose screenshots').setInputFiles({ name: 'run.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ not a picture') })
      await v.getByRole('alert').filter({ hasText: /not a PNG, JPG or WebP/ }).waitFor()
      await v.getByLabel('Choose screenshots').setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024, 1) })
      await v.getByRole('alert').filter({ hasText: /larger than 5 MB/ }).waitFor()
      await v.getByLabel('Choose screenshots').setInputFiles([1, 2, 3, 4].map((n) => ({ name: `p${n}.png`, mimeType: 'image/png', buffer: png(8, 8) })))
      await v.getByRole('alert').filter({ hasText: /up to 3 pictures/ }).waitFor()
      expect(await v.getByRole('button', { name: /Remove p3.png/ }).count() === 1 && await v.getByRole('button', { name: /Remove p4.png/ }).count() === 0, 'extra pictures were kept')
      await v.getByLabel(/Email \(so we can follow up\)/).fill('a@b.co'); await v.getByLabel(/How can we help\?/).fill('short')
      expect(await v.getByRole('button', { name: /Submit/ }).isDisabled(), 'a too-short message can be submitted')
      expect((await api.get(U, '/admin/support')).status === 403, 'a customer can read the inbox')
    })

    await s.check('A5 A signed-in visitor has their e-mail filled in', U.p, async () => {
      await U.p.goto(WEB + '/support', { waitUntil: 'networkidle' })
      await U.p.waitForFunction((e) => document.querySelector('#support-email')?.value === e, U.email, { timeout: 10000 })
    })

    await s.check('B1 Header language: choosing Hindi translates the website itself (Google widget): Devanagari text, no Google toolbar, brand name untouched, menus and typing still work, survives a reload', v, async () => {
      await v.goto(WEB + '/', { waitUntil: 'networkidle' })
      await v.locator('header').getByLabel('Presentation language').selectOption('hi')
      await v.waitForFunction(() => /[ऀ-ॿ]/.test(document.querySelector('h1')?.innerText ?? ''), null, { timeout: 30000 })
      expect(DEVANAGARI.test(await v.locator('main h1').innerText()) && DEVANAGARI.test(await v.locator('main p').first().innerText()), 'the page text is not Hindi')
      expect(await v.evaluate(() => getComputedStyle(document.body).top === '0px'), 'the page is pushed down by Google\'s toolbar')
      expect(await v.locator('iframe.goog-te-banner-frame:visible').count() === 0, 'Google toolbar visible')
      expect((await v.locator('header a[aria-label="SlidesDone home"]').innerText()).includes('SlidesDone') || await v.locator('header svg').count() > 0, 'brand name changed')
      await v.screenshot({ path: join(SHOTS, '43-hindi.png') })
      // the page keeps working while translated
      await v.locator('header').getByRole('link', { name: /Resources|संसाधन|रिसोर्स/ }).first().hover()
      await v.waitForTimeout(500)
      await v.locator('main textarea').first().fill('सौर ऊर्जा पर प्रस्तुति'); expect(await v.locator('main textarea').first().inputValue() === 'सौर ऊर्जा पर प्रस्तुति', 'typing broke')
      await v.reload({ waitUntil: 'networkidle' })
      await v.waitForFunction(() => /[ऀ-ॿ]/.test(document.querySelector('h1')?.innerText ?? ''), null, { timeout: 30000 })
      // the hand-off to the editor still carries the language code
      let target = null; await v.route(/\/start\?draft=/, (r) => { target = r.request().url(); void r.abort() })
      await v.locator('main textarea').first().fill('A deck about solar energy'); await v.locator('main button:has(svg.lucide-send)').click(); await v.waitForTimeout(3000)
      expect(target && /[?&]lang=hi\b/.test(target), `hand-off: ${target}`); await v.unroute(/\/start\?draft=/)
    })

    await s.check('B2 Choosing English again brings the original text back: no translation cookie, nothing translated (the script may still sit loaded in the background)', v, async () => {
      await v.goto(WEB + '/', { waitUntil: 'networkidle' })
      await v.locator('header').getByLabel('Presentation language').selectOption('en')
      await v.waitForFunction(() => /Turn Messy Documents/.test(document.querySelector('h1')?.innerText ?? ''), null, { timeout: 20000 })
      expect(!DEVANAGARI.test(await v.locator('main h1').innerText()) && !DEVANAGARI.test(await v.locator('main p').first().innerText()), 'still Hindi') // (the language list itself shows native names, so only the headings and text are checked)
      expect(await v.evaluate(() => !document.cookie.includes('googtrans=/en/')), 'the translate cookie is still set')
      await v.reload({ waitUntil: 'networkidle' }); await v.waitForTimeout(2500)
      expect(await v.evaluate(() => !/translated-(ltr|rtl)/.test(document.documentElement.className)), 'the page is marked as translated')
      expect(!DEVANAGARI.test(await v.locator('main h1').innerText()), 'the heading changed on its own')
    })

    await s.check('B3 Every offered language translates the website (a sample of the 13 is checked against English) and a language saved earlier that is no longer offered leaves the site in English', v, async () => {
      await v.goto(WEB + '/', { waitUntil: 'networkidle' })
      const english = await v.locator('main h1').innerText()
      for (const code of ['de', 'zh']) {
        await v.locator('header').getByLabel('Presentation language').selectOption(code)
        await v.waitForFunction((e) => (document.querySelector('main h1')?.innerText ?? e) !== e, english, { timeout: 30000 })
        expect((await v.locator('main h1').innerText()) !== english, `${code}: not translated`)
        await v.locator('header').getByLabel('Presentation language').selectOption('en')
        await v.waitForFunction((e) => document.querySelector('main h1')?.innerText === e, english, { timeout: 25000 })
      }
      await v.evaluate(() => localStorage.setItem('slidesdone:deck-language', 'ta')); await v.reload({ waitUntil: 'networkidle' }); await v.waitForTimeout(2000)
      expect((await v.locator('main h1').innerText()) === english, 'a language that is no longer offered translated the site')
      await v.evaluate(() => localStorage.removeItem('slidesdone:deck-language'))
    })

    await s.check('B4 Not laggy: the script loads quietly once the header is visible (no click needed), so choosing a language applies fast even on a slow connection; a spinner shows while translating; an English visitor sees no translation', v, async () => {
      const slowPage = async () => {
        const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
        await pg.route(/translate\.google|translate\.googleapis|translate-pa\.googleapis|www\.gstatic/, (r) => { setTimeout(() => void r.continue().catch(() => undefined), 700) }) // every Google file takes 0.7 s more
        return pg
      }
      const pg = await slowPage()
      const google = []; pg.on('request', (r) => { if (/translate\.google\.com\/translate_a\/element\.js/.test(r.url())) google.push(r.url()) })
      await pg.goto(WEB + '/', { waitUntil: 'networkidle' })
      const english = await pg.locator('main h1').innerText()
      await pg.waitForTimeout(5000) // the visitor reads the page; nothing is clicked
      expect(google.length === 1, `the script should load once by itself while the header is visible, loaded ${google.length} times`)
      expect(await pg.evaluate(() => !/translated-(ltr|rtl)/.test(document.documentElement.className) && !document.cookie.includes('googtrans')), 'English visitors must not get a translated page')
      expect((await pg.locator('main h1').innerText()) === english, 'the page changed without a choice')
      const t0 = Date.now()
      await pg.locator('header').getByLabel('Presentation language').selectOption('de')
      await pg.locator('header label[aria-busy="true"] svg.animate-spin').waitFor({ timeout: 3000 })
      await pg.waitForFunction((e) => (document.querySelector('main h1')?.innerText ?? e) !== e, english, { timeout: 15000 })
      const took = Date.now() - t0
      expect(took < 2500, `choosing is still slow although the script was already loaded: ${took} ms`)
      await pg.waitForFunction(() => document.querySelector('header label')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 })
    })
  } finally { await b.close() }
  return s.done()
}
