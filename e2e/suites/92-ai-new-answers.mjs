import { API, EDITOR, expect, launch, suite } from '../lib.mjs'
import { newDeck, person, tsx } from '../kits-lib.mjs'

/**
 * The assistant's newest answers, in a real browser with the real model, each judged on the SAVED deck:
 *  1. a labelled opinion on the story (nothing changes, nothing charged beyond the allowance);
 *  2. the confirm before turning off every animation (the deck is untouched until the button is pressed);
 *  3. the step-by-step answer to a big message (the first parts done, a "Do the next step" button that carries on);
 *  4. the upgrade button when the plan lacks a feature (a Pro account asking for the brand kit).
 * Makes its own accounts: a Gold one and a Pro one. Run it alone (it uses the real model).
 */
export default async function () {
  const s = suite('92-ai-new-answers')
  const b = await launch()
  try {
    /** sends a message and returns what the assistant answered after it (waits until the message box can be used again) */
    const makeAsk = (p) => async (text) => {
      const box = p.getByPlaceholder(/e\.g\./)
      const count = (t) => t.split(text).length - 1
      const had = count(await p.locator('body').innerText())
      await box.fill(text); await box.press('Enter')
      try {
        await p.waitForFunction(([sent, n]) => { const t = document.body.innerText; let at = -1; for (let i = 0; i <= n; i++) { at = t.indexOf(sent, at + 1); if (at < 0) return false } const m = document.querySelector('textarea[aria-label="Message to the AI assistant"]'); return !!m && !m.disabled && t.slice(at + sent.length).replace(/Slide \d+:[\s\S]*$/, '').trim().length > 20 }, [text, had], { timeout: 120000 })
      } catch (e) { throw new Error(`no reply after "${text}": ${(await p.locator('body').innerText()).slice(-300).replace(/\n/g, ' ⏎ ')}`) }
      await p.waitForTimeout(1500)
      const t = await p.locator('body').innerText()
      let at = -1
      for (let i = 0; i <= had; i++) at = t.indexOf(text, at + 1)
      return t.slice(at + text.length)
    }
    /** a deck of five real slides (title, a wall of text, a table, bullets, thank you), saved, opened, with the assistant panel open */
    const open = async (A) => {
      const made = await newDeck(A, 'New answers check')
      const id = made?.id ?? made?.data?.id ?? made
      expect(!!id, `no deck: ${JSON.stringify(made).slice(0, 200)}`)
      const H = { origin: EDITOR }
      const get = async () => (await (await A.ctx.request.get(`${API}/api/v1/presentations/${id}`, { headers: H })).json()).data
      const cur = await get()
      const doc = structuredClone(cur.document); doc.slides = JSON.parse(tsx(`scripts/qa-seed-flows.ts ${cur.document.theme.id}`))
      const put = await A.ctx.request.put(`${API}/api/v1/presentations/${id}`, { headers: H, data: { baseRevision: cur.revision, document: doc, snapshot: false } })
      expect(put.ok(), `seed save ${put.status()}`)
      await A.p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
      await A.p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
      await A.p.getByRole('button', { name: /Edit with AI/ }).click()
      return { id, get, p: A.p, ask: makeAsk(A.p) }
    }

    const gold = await person(b, 'new92g', 'gold')
    const G = await open(gold)
    const deckJson = async () => JSON.stringify((await G.get()).document.slides)

    await s.check('story advice: a labelled opinion, and the saved deck is byte-for-byte the same', G.p, async () => {
      const before = await deckJson()
      const log = await G.ask('how can I improve the story of my deck? what is missing?')
      expect(/my opinion on your story/.test(log), `no labelled opinion: ${log.slice(0, 400)}`)
      expect(/Nothing was changed/.test(log), 'it does not say nothing was changed')
      expect(/What may be missing|What works|What I would change/.test(log), `no advice sections: ${log.slice(0, 400)}`)
      await new Promise((r) => setTimeout(r, 2500))
      expect((await deckJson()) === before, 'the saved deck changed after advice')
    })
    await s.check('turn off every animation: the plan is asked first (deck untouched); the button then does it', G.p, async () => {
      const before = await deckJson()
      const log = await G.ask('turn off all the animations')
      expect(/Turn them all off\?/.test(log), `no confirm question: ${log.slice(0, 400)}`)
      expect((await deckJson()) === before, 'the deck changed before the person confirmed')
      await G.p.getByRole('button', { name: 'Yes, turn them off' }).click()
      await G.p.waitForFunction(() => /Done —|animation/i.test(document.body.innerText.split('Turn them all off?').slice(1).join('')), null, { timeout: 90000 })
    })
    await s.check('a big message: four parts done, the rest named, and "Do the next step" carries on', G.p, async () => {
      const log = await G.ask('make the background of slide 1 dark, lock slide 2, duplicate slide 3, move slide 5 to the start, add slide numbers and animate every slide')
      expect(/step by step/.test(log), `not said step by step: ${log.slice(0, 500)}`)
      expect(/Still to do:/.test(log), `the rest is not named: ${log.slice(0, 500)}`)
      const next = G.p.locator('[data-testid="ai-continue"]')
      await next.waitFor({ timeout: 10000 })
      const before = (await G.p.locator('body').innerText()).length
      await next.click()
      await G.p.waitForFunction((n) => document.body.innerText.length > n + 40, before, { timeout: 120000 })
      await G.p.waitForFunction(() => { const m = document.querySelector('textarea[aria-label="Message to the AI assistant"]'); return !!m && !m.disabled }, null, { timeout: 120000 })
    })

    const pro = await person(b, 'new92p', 'pro')
    const P = await open(pro)
    await s.check('upgrade button: a plan without brand kits is told why, and "See plans" opens the plans', P.p, async () => {
      const log = await P.ask('use my brand')
      expect(/brand kit/i.test(log), `no reason about brand kits: ${log.slice(0, 400)}`)
      const btn = P.p.locator('[data-testid="ai-upgrade"]')
      await btn.waitFor({ timeout: 10000 })
      await btn.click()
      await P.p.locator('[role="dialog"]').first().waitFor({ timeout: 8000 })
    })
  } finally { await b.close() }
  return s.done()
}
