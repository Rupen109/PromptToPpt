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
    await s.check('signed in: no My decks button in the header; one account menu that shows the e-mail and holds My decks, Plan & billing and Sign out', p, async () => {
      await goHome()
      const acct = p.getByTestId('account-menu'); await acct.waitFor({ timeout: 8000 })
      expect(await header().getByRole('link', { name: 'Log In' }).count() === 0, '"Log In" is still shown')
      expect(await header().getByRole('link', { name: /Create Free Deck/ }).count() === 0, '"Create Free Deck" is still shown')
      expect(await header().getByRole('link', { name: /My decks/ }).count() === 0, 'there is still a My decks button in the header')
      expect(await p.getByTestId('signed-in-email').count() === 0, 'the e-mail is shown outside the menu')
      expect(await header().innerText().then((t) => !t.includes(A.email)), 'the e-mail clutters the header')
      await acct.click()
      expect((await p.getByTestId('signed-in-email').innerText()).trim() === A.email, 'the menu does not show the e-mail')
      expect((await p.getByRole('menuitem', { name: /My decks/ }).getAttribute('href')).startsWith(EDITOR), 'My decks in the menu does not lead to the editor')
      expect(await p.getByRole('menuitem', { name: /Plan & billing/ }).getAttribute('href').then((h) => h.startsWith(EDITOR) && h.endsWith('/billing')), 'billing link')
      await p.getByRole('menuitem', { name: 'Sign out' }).waitFor()
      await p.screenshot({ path: join(RESULTS, '30-landing-signed-in.png'), clip: { x: 0, y: 0, width: 1500, height: 330 } })
      await p.keyboard.press('Escape'); expect(await p.getByRole('menu').count() === 0, 'Escape does not close the menu')
    })

    await s.check('at every desktop width from 1280 px up the signed-in header stays inside its container and the page does not scroll sideways', p, async () => {
      for (const w of [1280, 1366, 1440, 1920]) {
        await p.setViewportSize({ width: w, height: 800 }); await goHome(); await p.getByTestId('account-menu').waitFor()
        const r = await p.evaluate(() => { const row = document.querySelector('header > div')?.getBoundingClientRect(); const acct = document.querySelector('[data-testid="account-menu"]')?.getBoundingClientRect(); return { rowRight: row.right, acctRight: acct.right, scroll: document.documentElement.scrollWidth - window.innerWidth } })
        expect(r.acctRight <= r.rowRight + 1, `${w}px: the account button ends at ${Math.round(r.acctRight)}px but the header row ends at ${Math.round(r.rowRight)}px`); expect(r.scroll <= 1, `${w}px: the page scrolls sideways`)
      }
      await p.setViewportSize({ width: 1500, height: 950 })
    })

    await s.check('the header has no "Ingest Modes" and no "Free Tools" link; Interactive Studio, Templates, Pricing, Resources and Support remain', p, async () => {
      await goHome()
      const nav = await header().locator('nav').first().innerText()
      expect(!/Ingest Modes/i.test(nav), `nav: ${nav.replace(/\n/g, ' | ')}`)
      for (const l of ['Interactive Studio', 'Templates', 'Pricing', 'Resources', 'Support']) expect(nav.includes(l), `${l} missing`)
      expect(!/Free Tools/i.test(nav), 'Free Tools is still in the header')
    })

    await s.check('Sign out in the menu ends the session and the header goes back to "Log In" + "Create Free Deck"', p, async () => {
      await goHome(); await p.getByTestId('account-menu').click(); await p.getByRole('menuitem', { name: 'Sign out' }).click()
      await header().getByRole('link', { name: 'Log In' }).waitFor({ timeout: 10000 })
      expect(await p.getByTestId('account-menu').count() === 0, 'still shows the account menu')
      // sign back in for the checks below
      const si = await A.ctx.request.post(`${API}/api/auth/sign-in/email`, { headers: JSON_HEADERS, data: { email: A.email, password: 'Passw0rd!qa-test' } }); expect(si.ok(), `sign-in ${si.status()}`)
    })

    await s.check('phone: the mobile menu shows "Signed in as <e-mail>" and a My decks button and Sign out, not Log In / Create Free Deck', p, async () => {
      await p.setViewportSize({ width: 390, height: 800 }); await goHome()
      await p.getByRole('button', { name: 'Open menu' }).click()
      const nav = p.locator('#mobile-nav'); await nav.getByTestId('signed-in-email-mobile').waitFor({ timeout: 6000 })
      expect((await nav.innerText()).includes(A.email), 'the e-mail is missing'); await nav.getByRole('button', { name: 'Sign out' }).waitFor(); expect(await nav.getByRole('link', { name: 'Log In' }).count() === 0, 'Log In is still in the menu')
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
