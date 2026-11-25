import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { person } from '../kits-lib.mjs'

/**
 * The website header far from the server, in a real browser: the session answer and the next page are HELD BACK on purpose (as a slow, distant connection would),
 * and what the person sees meanwhile is judged. Signed out: "Log In" (a bordered button) and "Create Free Deck" are there at the first paint. Signed in: the account
 * menu is there at once, never a "Log In" flash (the API's readable sd_signed_in marker, read before the paint). A marker without a session corrects itself to
 * "Log In". A click on "Create Free Deck" shows a spinner while its page is on the way. No AI is used.
 */
const HOLD = 4000
const holdSession = (ctx) => ctx.route(`${API}/api/auth/get-session`, async (r) => { await new Promise((ok) => setTimeout(ok, HOLD)); await r.continue() })
const visible = (p, name) => p.locator('header').getByRole('link', { name, exact: true }).first().isVisible()

export default async function () {
  const s = suite('103-header')
  const b = await launch()
  try {
    await s.check('signed out: "Log In" (a bordered button) and "Create Free Deck" show at the first paint, while the session answer is still held back', null, async () => {
      const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage()
      await holdSession(ctx)
      await p.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' })
      await p.waitForTimeout(300) // well before the held session answer
      expect(await visible(p, 'Log In') && await visible(p, 'Create Free Deck'), 'the buttons are not there before the session answers')
      const border = await p.locator('header').getByRole('link', { name: 'Log In', exact: true }).first().evaluate((e) => getComputedStyle(e).borderTopWidth)
      expect(border === '2px', `"Log In" has no button border (${border})`)
      await ctx.close()
    })

    await s.check('signed in: the account menu is there at once (no "Log In" flash), and fills in the email when the session answers', null, async () => {
      const A = await person(b, 'hdr')
      const cookies = (await A.ctx.cookies()).map((c) => c.name)
      expect(cookies.includes('sd_signed_in'), `no marker after sign-in: ${cookies}`)
      await holdSession(A.ctx)
      await A.p.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' })
      await A.p.waitForTimeout(300)
      expect(await A.p.getByTestId('account-menu').isVisible(), 'the account menu is not there at once')
      expect(!(await visible(A.p, 'Log In')), '"Log In" flashed for a signed-in person')
      await A.p.getByTestId('account-menu').click()
      await A.p.getByTestId('signed-in-email').filter({ hasText: A.email }).waitFor({ timeout: HOLD + 8000 })
      await A.ctx.close()
    })

    await s.check('a marker without a session (it expired) corrects itself to "Log In", and the marker is cleared', null, async () => {
      const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage()
      const host = new URL(WEB).hostname
      await ctx.addCookies([{ name: 'sd_signed_in', value: '1', domain: host, path: '/' }])
      await p.goto(`${WEB}/`, { waitUntil: 'networkidle' })
      await p.locator('header').getByRole('link', { name: 'Log In', exact: true }).first().waitFor({ timeout: 10000 })
      expect(!(await p.getByTestId('account-menu').isVisible()), 'the account menu stayed for a visitor with no session')
      expect(!(await ctx.cookies()).some((c) => c.name === 'sd_signed_in' && c.value === '1'), 'the stale marker was not cleared')
      await ctx.close()
    })

    await s.check('a click on "Create Free Deck" shows a spinner at once while its page is on the way', null, async () => {
      const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage()
      await p.goto(`${WEB}/`, { waitUntil: 'networkidle' })
      await ctx.route(/\/signup(\?|$)/, async (r) => { await new Promise((ok) => setTimeout(ok, HOLD)); await r.continue() })
      const cta = p.locator('header').getByRole('link', { name: 'Create Free Deck', exact: true }).first()
      await cta.click()
      await cta.getByTestId('link-busy').waitFor({ timeout: 1500 })
      await p.waitForURL(/\/signup/, { timeout: HOLD + 15000 })
      await ctx.close()
    })

    // sign-out request held back: the "Signing out…" cover must show at once (website header and editor sidebar alike), then the person is really signed out
    const holdSignOut = (ctx) => ctx.route(`${API}/api/auth/sign-out`, async (r) => { await new Promise((ok) => setTimeout(ok, HOLD)); await r.continue() })
    const signedOut = async (ctx) => {
      const r = await ctx.request.get(`${API}/api/auth/get-session`)
      return !((await r.json().catch(() => null))?.user)
    }

    await s.check('website: "Sign out" shows the "Signing out…" cover at once, ignores a second click, and lands signed out on the home page', null, async () => {
      const A = await person(b, 'hdrout')
      await holdSignOut(A.ctx)
      await A.p.goto(`${WEB}/pricing`, { waitUntil: 'networkidle' }) // the menu works once the page is live
      await A.p.getByTestId('account-menu').click()
      const out = A.p.getByRole('menuitem', { name: 'Sign out' })
      await out.click()
      await A.p.getByTestId('signing-out').waitFor({ timeout: 1000 })
      expect(await A.p.getByTestId('signing-out').innerText() === 'Signing out…', 'the cover does not say "Signing out…"')
      expect(await out.isDisabled(), 'the Sign out button can be clicked again while signing out')
      await A.p.waitForURL((u) => u.pathname === '/', { timeout: HOLD + 15000 })
      await A.p.locator('header').getByRole('link', { name: 'Log In', exact: true }).first().waitFor({ timeout: 10000 })
      expect(await signedOut(A.ctx), 'the session is still there after signing out')
      await A.ctx.close()
    })

    await s.check('website, phone menu: "Sign out" shows the same cover', null, async () => {
      const A = await person(b, 'hdroutm')
      await A.p.setViewportSize({ width: 390, height: 844 })
      await holdSignOut(A.ctx)
      await A.p.goto(`${WEB}/`, { waitUntil: 'networkidle' })
      await A.p.getByRole('button', { name: /menu/i }).first().click()
      await A.p.getByRole('button', { name: 'Sign out', exact: true }).last().click()
      await A.p.getByTestId('signing-out').waitFor({ timeout: 1000 })
      // already on "/": done when the new page has replaced the cover (not when the address matches)
      await A.p.getByTestId('signing-out').waitFor({ state: 'detached', timeout: HOLD + 15000 })
      expect(await signedOut(A.ctx), 'the session is still there after signing out')
      await A.ctx.close()
    })

    await s.check('editor: "Log out" shows the "Signing out…" cover at once and ends signed out', null, async () => {
      const A = await person(b, 'edout')
      await holdSignOut(A.ctx)
      await A.p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
      const out = A.p.locator('aside').getByRole('button', { name: 'Log out' })
      await out.waitFor({ timeout: 20000 })
      await out.click()
      await A.p.getByTestId('signing-out').waitFor({ timeout: 1000 })
      expect(await out.isDisabled(), 'the Log out button can be clicked again while signing out')
      await A.p.getByTestId('signing-out').waitFor({ state: 'detached', timeout: HOLD + 20000 })
      expect(await signedOut(A.ctx), 'the session is still there after logging out')
      await A.ctx.close()
    })
  } finally {
    await b.close()
  }
  return s.done()
}
