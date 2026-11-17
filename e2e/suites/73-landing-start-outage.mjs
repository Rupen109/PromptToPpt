import { WEB, EDITOR, API, PASSWORD, expect, launch, suite, uniqueEmail } from '../lib.mjs'

/**
 * Landing prompt box -> Create, while the server is briefly unreachable. The editor must not strand the person on a dead-end page: a short outage is retried quietly and the deck
 * starts; a long one shows a clear message that keeps trying by itself and recovers without a reload. No AI is called (the start page only shows the understood request).
 */
export default async function () {
  const s = suite('73-landing-start-outage')
  const b = await launch()
  try {
    const signedIn = async () => {
      const ctx = await b.newContext()
      const r = await ctx.request.post(API + '/api/auth/sign-up/email', { headers: { origin: WEB }, data: { name: 'QA', email: uniqueEmail('outage'), password: PASSWORD } })
      expect(r.ok(), `sign-up ${r.status()}`)
      return ctx
    }
    const create = async (p) => {
      await p.goto(WEB + '/')
      await p.locator('textarea').first().fill('A 10-slide pitch deck for my startup')
      await p.getByRole('button', { name: /create|generate/i }).first().click()
    }
    {
      const ctx = await signedIn(); const p = await ctx.newPage()
      let blocked = 0
      await ctx.route('**/api/v1/me', (r) => (blocked++ < 2 ? r.abort('connectionrefused') : r.continue()))
      await s.check('a short outage (two failed checks) is retried and the deck starts', p, async () => {
        await create(p)
        await p.waitForURL(/\/create/, { timeout: 20000 })
        expect(await p.getByText('A 10-slide pitch deck for my startup').first().isVisible(), 'prompt not shown')
        expect(blocked >= 3, `only ${blocked} attempts`)
      })
      await ctx.close()
    }
    {
      const ctx = await signedIn(); const p = await ctx.newPage()
      let down = true
      await ctx.route('**/api/v1/me', (r) => (down ? r.abort('connectionrefused') : r.continue()))
      await s.check('a long outage shows a clear message, and the page recovers by itself when the server is back', p, async () => {
        await create(p)
        await p.getByText("We couldn't reach the server.").waitFor({ timeout: 30000 })
        expect(await p.getByText(/prompt is safe/i).isVisible(), 'no reassurance shown')
        expect(p.url().startsWith(EDITOR + '/start?draft='), p.url())
        down = false
        await p.getByRole('button', { name: 'Retry' }).click()
        await p.waitForURL(/\/create/, { timeout: 20000 })
      })
      await ctx.close()
    }
  } finally { await b.close() }
  return s.done()
}
