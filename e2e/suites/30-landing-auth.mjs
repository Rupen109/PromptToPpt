import { join } from 'node:path'
import { API, EDITOR, RESULTS, WEB, expect, launch, suite } from '../lib.mjs'
import { JSON_HEADERS, person } from '../kits-lib.mjs'

/** The landing header: a signed-in visitor sees their e-mail (and "My presentations") instead of "Log In" / "Create Free Deck"; a visitor who is not signed in sees the same buttons as before. Real browser, shared login cookie. */
export default async function () {
  const s = suite('30-landing-auth')
  const b = await launch()
  const A = await person(b, 'lndg')
  const p = A.p
  const header = () => p.locator('header')
  const goHome = async () => { await p.goto(`${WEB}/`, { waitUntil: 'networkidle' }); await header().waitFor({ timeout: 10000 }) }

  try {
    await s.check('signed in: the header shows the e-mail instead of "Log In", and "My decks" instead of "Create Free Deck"', p, async () => {
      await goHome()
      const chip = p.getByTestId('signed-in-email'); await chip.waitFor({ timeout: 8000 })
      const shown = (await chip.locator('span').last().innerText()).trim(); expect(shown === A.email, `shows "${shown}" instead of ${A.email}`)
      expect(await header().getByRole('link', { name: 'Log In' }).count() === 0, '"Log In" is still shown')
      expect(await header().getByRole('link', { name: /Create Free Deck/ }).count() === 0, '"Create Free Deck" is still shown')
      expect((await header().getByRole('link', { name: /My decks/ }).getAttribute('href')).startsWith(EDITOR), 'the button does not lead to the editor')
      await p.screenshot({ path: join(RESULTS, '30-landing-signed-in.png'), clip: { x: 0, y: 0, width: 1280, height: 120 } })
    })

    await s.check('at every desktop width from 1280 px up the signed-in header stays inside its container (nothing pushed past the right edge) and the e-mail is shortened, never the button', p, async () => {
      for (const w of [1280, 1366, 1440, 1920]) {
        await p.setViewportSize({ width: w, height: 800 }); await goHome(); await p.getByTestId('signed-in-email').waitFor()
        const r = await p.evaluate(() => { const row = document.querySelector('header > div')?.getBoundingClientRect(); const btn = [...document.querySelectorAll('header a')].find((a) => /My decks/.test(a.textContent ?? ''))?.getBoundingClientRect(); return { rowRight: row?.right ?? 0, btnRight: btn?.right ?? 9999, scroll: document.documentElement.scrollWidth - window.innerWidth } })
        expect(r.btnRight <= r.rowRight + 1, `${w}px: the button ends at ${Math.round(r.btnRight)}px but the header row ends at ${Math.round(r.rowRight)}px`); expect(r.scroll <= 1, `${w}px: the page scrolls sideways`)
        if (w === 1280) await p.screenshot({ path: join(RESULTS, '30-landing-signed-in-1280.png'), clip: { x: 0, y: 0, width: 1280, height: 130 } })
      }
      await p.setViewportSize({ width: 1500, height: 950 })
    })

    await s.check('the e-mail is a link to the editor, and a very long address is shortened instead of breaking the header', p, async () => {
      const chip = p.getByTestId('signed-in-email'); expect((await chip.getAttribute('href')).startsWith(EDITOR), 'not a link to the editor')
      const w = (await chip.boundingBox()).width; expect(w <= 195, `the chip is ${w}px wide`)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the page scrolls sideways')
    })

    await s.check('phone: the mobile menu shows "Signed in as <e-mail>" and a button to the editor, not Log In / Create Free Deck', p, async () => {
      await p.setViewportSize({ width: 390, height: 800 }); await goHome()
      await p.getByRole('button', { name: 'Open menu' }).click()
      const nav = p.locator('#mobile-nav'); await nav.getByTestId('signed-in-email-mobile').waitFor({ timeout: 6000 })
      expect((await nav.innerText()).includes(A.email), 'the e-mail is missing'); expect(await nav.getByRole('link', { name: 'Log In' }).count() === 0, 'Log In is still in the menu')
      await p.screenshot({ path: join(RESULTS, '30-landing-signed-in-phone.png') }); await p.setViewportSize({ width: 1500, height: 950 })
    })

    await s.check('signed out (after signing out) and for a brand-new visitor: "Log In" and "Create Free Deck" are shown exactly as before, with no e-mail', p, async () => {
      const out = await A.ctx.request.post(`${API}/api/auth/sign-out`, { headers: JSON_HEADERS, data: {} }); expect(out.ok(), `sign-out ${out.status()}`)
      await goHome(); await header().getByRole('link', { name: 'Log In' }).waitFor({ timeout: 8000 })
      expect(await header().getByRole('link', { name: /Create Free Deck/ }).isVisible(), 'Create Free Deck is missing'); expect(await p.getByTestId('signed-in-email').count() === 0, 'an e-mail is shown while signed out')
      const v = await b.newContext({ viewport: { width: 1500, height: 950 } }); const vp = await v.newPage(); await vp.goto(`${WEB}/`, { waitUntil: 'networkidle' })
      await vp.locator('header').getByRole('link', { name: 'Log In' }).waitFor({ timeout: 8000 }); expect(await vp.getByTestId('signed-in-email').count() === 0, 'a new visitor sees an e-mail'); await v.close()
    })

    await s.check('a signed-out visitor gets no error in the browser console from the sign-in check', p, async () => {
      const v = await b.newContext({ viewport: { width: 1500, height: 950 } }); const vp = await v.newPage(); const bad = []
      vp.on('console', (m) => { if (m.type() === 'error') bad.push(m.text()) }); vp.on('response', (r) => { if (r.status() >= 400 && /get-session|\/me$/.test(r.url())) bad.push(`${r.status()} ${r.url()}`) })
      await vp.goto(`${WEB}/`, { waitUntil: 'networkidle' }); await vp.locator('header').getByRole('link', { name: 'Log In' }).waitFor({ timeout: 8000 }); expect(bad.length === 0, `errors: ${bad.join(' | ')}`); await v.close()
    })

    await s.check('the API being unreachable leaves a normal signed-out header (no error, no empty gap)', p, async () => {
      const v = await b.newContext({ viewport: { width: 1500, height: 950 } }); const vp = await v.newPage()
      await vp.route('**/api/auth/get-session', (r) => r.abort('failed')); await vp.goto(`${WEB}/`, { waitUntil: 'networkidle' })
      await vp.locator('header').getByRole('link', { name: 'Log In' }).waitFor({ timeout: 8000 }); expect(await vp.locator('header').getByRole('link', { name: /Create Free Deck/ }).isVisible(), 'the button is missing'); await v.close()
    })
  } finally { await b.close() }
  return s.done()
}
