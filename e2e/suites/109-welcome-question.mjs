import { API, EDITOR, expect, launch, signUpAndEnter, suite, uniqueEmail } from '../lib.mjs'

/**
 * "What do you make presentations for?" (apps/editor components/WelcomeGate.tsx): a new account is asked once, before the home page; Continue waits for a choice;
 * the answer is saved on the account (GET /me), the page carries on, and the question never comes back (a reload, a deep link). Phone width fits. No AI is called.
 */
export default async function () {
  const s = suite('109-welcome-question')
  const b = await launch({ welcome: 'ask' })
  try {
    for (const [label, width] of [['desktop', 1400], ['phone', 390]]) {
      const ctx = await b.newContext({ viewport: { width, height: 900 } })
      const p = await ctx.newPage()
      const heading = p.getByRole('heading', { name: 'What do you make presentations for?' })
      const me = async () => (await (await ctx.request.get(`${API}/api/v1/me`)).json()).data
      await signUpAndEnter(p, { name: 'Asha Patel', email: uniqueEmail('welcome') })
      await s.check(`${label}: a new account is asked first, by first name, with the eight answers and Continue waiting for a choice`, p, async () => {
        await heading.waitFor({ timeout: 20000 })
        expect(await p.getByText('Welcome, Asha', { exact: false }).count() === 1, 'no welcome by first name')
        expect(await p.getByRole('radio').count() === 8, `answers: ${await p.getByRole('radio').count()}`)
        expect(await p.getByRole('button', { name: 'Continue' }).isDisabled(), 'Continue works before a choice')
        expect((await me()).persona === null, 'an answer is saved before the person chose one')
      })
      await s.check(`${label}: choosing one marks it, Continue saves it on the account and opens the page`, p, async () => {
        await p.getByRole('radio', { name: /Business owner or founder/ }).click()
        expect((await p.getByRole('radio', { name: /Business owner or founder/ }).getAttribute('aria-checked')) === 'true', 'the choice is not marked')
        expect(await p.getByRole('radio', { checked: true }).count() === 1, 'more than one is marked')
        await p.getByRole('button', { name: 'Continue' }).click()
        await heading.waitFor({ state: 'detached', timeout: 15000 })
        expect((await me()).persona === 'business', `saved: ${(await me()).persona}`)
      })
      await s.check(`${label}: never asked again (reload, another page)`, p, async () => {
        await p.reload({ waitUntil: 'networkidle' })
        await p.waitForTimeout(800)
        expect(await heading.count() === 0, 'asked again after a reload')
        await p.goto(EDITOR + '/templates', { waitUntil: 'networkidle' })
        await p.waitForTimeout(800)
        expect(await heading.count() === 0, 'asked again on another page')
      })
      if (width < 500) await s.check('phone: the cards fit, no sideways scroll', p, async () => {
        const p2 = await ctx.newPage() // a second account on the same phone viewport, to see the question itself
        await p2.context().clearCookies()
        await signUpAndEnter(p2, { email: uniqueEmail('welcome-phone') })
        await p2.getByRole('heading', { name: 'What do you make presentations for?' }).waitFor({ timeout: 20000 })
        expect(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page scrolls sideways')
      })
      await ctx.close()
    }
  } finally { await b.close() }
  return s.done()
}
