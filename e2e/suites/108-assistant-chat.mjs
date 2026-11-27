import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, person, tsx } from '../kits-lib.mjs'

/**
 * The AI assistant chat, as a person uses it, with the REAL model:
 *  - a long change line from an earlier answer can never break the next message (the bug: `[ { "code": "too_big", … "path": ["recent",0,"summary",0] } ]`);
 *  - a refused request reads in plain words, never as raw validation output;
 *  - a long message: a counter near the limit, and pasted text longer than a message is offered as a source (read in full), never cut off silently;
 *  - a bulk rewrite of 14 slides: the stages show while it works ("Rewriting 14 slides (1 of 2 done)") and the groups are written at the same time;
 *  - the editor shows who is signed in.
 * A few real model calls (fast model for understanding, the chosen model for writing). No AI pictures.
 */
const LONG_LINE = 'Added the "Fade In" animation to the picture, the shape, the title, the subtitle, a number, a heading, the body text and a caption (126 items) on slides 1, 2, 3, 4, 5, 6, 7, 8, 9 and 10'

export default async function () {
  const s = suite('108-assistant-chat')
  const b = await launch()
  try {
    const A = await person(b, 'assist', 'pro'); await api.get(A, '/me/entitlements')
    const deckId = tsx(`scripts/qa-make-deck.ts ${A.email} 14`)
    // a correctness check, not a speed one: room for the gateway to move to a backup model when the provider is busy
    const assist = (body) => A.ctx.request.post(`${API}/api/v1/presentations/${deckId}/ai-assist`, { timeout: 150_000, headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { requestId: `r-${Math.random().toString(36).slice(2, 12)}`, ...body } })

    await s.check('an earlier answer\'s long change line, sent back as context, never breaks the next message', null, async () => {
      expect(LONG_LINE.length > 160, 'the test line is not long enough')
      const r = await assist({ instruction: 'hello, what can you do?', recent: [{ theme: false, slideIds: [], summary: [LONG_LINE] }], conversation: [{ role: 'assistant', text: 'x'.repeat(3000) }] })
      const body = await r.json()
      expect(r.status() === 200 && body.success, `status ${r.status()}: ${JSON.stringify(body).slice(0, 200)}`)
    })

    await s.check('a refused request reads in plain words (no raw validation output)', null, async () => {
      const r = await assist({ instruction: 'x' })
      const body = await r.json()
      expect(r.status() === 400 && body.error?.code === 'INVALID_REQUEST', `status ${r.status()} ${body.error?.code}`)
      expect(!/too_small|too_big|\[|\{|"path"/.test(body.error.message), `message: ${body.error.message}`)
      expect(body.error.message === 'Type a little more: what should change?', `message: ${body.error.message}`)
    })

    const p = await A.ctx.newPage()
    const errors = []; p.on('pageerror', (e) => errors.push(String(e)))
    await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor({ timeout: 20000 })

    await s.check('the editor shows who is signed in: initials in the top bar, the email and plan in its menu', p, async () => {
      const btn = p.getByTestId('editor-account')
      expect((await btn.getAttribute('title'))?.includes(A.email), 'the email is not in the button\'s tip')
      await btn.click()
      expect((await p.getByTestId('editor-account-email').innerText()) === A.email, 'the menu does not show the email')
      expect(/Pro plan/.test(await p.getByRole('menu', { name: 'Account' }).innerText()), 'the menu does not show the plan')
      for (const name of ['My presentations', 'Plan & billing', 'Sign out']) expect(await p.getByRole('menuitem', { name }).isVisible(), `no "${name}" in the menu`)
      await p.keyboard.press('Escape')
    })

    const panel = () => p.getByRole('complementary', { name: 'AI assistant' })
    await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()
    const box = p.getByLabel('Message to the AI assistant')

    await s.check('a long message: up to 4,000 characters with a counter; a longer paste is offered as a source and attached', p, async () => {
      await box.fill('Rewrite this deck for investors. '.repeat(100)) // 3,300 characters
      expect(await p.getByText(/3,300 \/ 4,000 characters/).isVisible(), 'no counter near the limit')
      await box.fill('')
      const long = 'Quarterly results\n' + 'Revenue grew in every region, led by the new enterprise plan. '.repeat(120)
      await box.focus()
      await p.evaluate((t) => { const el = document.querySelector('[aria-label="Message to the AI assistant"]'); const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }, long)
      await p.getByTestId('long-paste').waitFor({ timeout: 5000 })
      expect((await box.inputValue()) === '', 'the long text was pasted into the box (it would be cut off)')
      await p.getByRole('button', { name: 'Attach it as a source' }).click()
      await p.getByRole('list', { name: 'Attached to this message' }).getByText('Quarterly results').waitFor({ timeout: 15000 })
      expect((await box.inputValue()).startsWith('Use the attached text to'), 'no starting instruction after attaching')
      await p.getByRole('button', { name: 'Remove Quarterly results' }).click()
      await box.fill('')
    })

    await s.check('a bulk rewrite of 14 slides: the stages show while it works, both groups are written, and it finishes', p, async () => {
      await box.fill('make the text of every slide shorter'); await p.getByRole('button', { name: 'Send' }).click()
      // more than half the deck: it is confirmed first (nothing is written or charged before "Yes")
      const yes = panel().getByRole('button', { name: /^Yes/ }).last()
      await yes.waitFor({ timeout: 90000 })
      const t0 = Date.now()
      await yes.click()
      const seen = new Set()
      const working = p.getByTestId('assist-working')
      await working.waitFor({ timeout: 10000 })
      while (await working.count()) {
        const st = p.getByTestId('assist-stage')
        if (await st.count()) seen.add((await st.innerText().catch(() => '')).trim())
        await p.waitForTimeout(250)
        if (Date.now() - t0 > 240000) break
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(1)
      console.log(`      bulk rewrite of 14 slides: ${secs} s; stages seen: ${[...seen].filter(Boolean).join(' → ')}`)
      expect([...seen].some((t) => /^Rewriting 14 slides/.test(t)), `no "Rewriting 14 slides" stage: ${[...seen].join(' | ')}`)
      expect([...seen].some((t) => /of 2 done/.test(t)), `no group progress: ${[...seen].join(' | ')}`)
      const last = panel().locator('div.mr-4').last()
      expect(/Done|changes applied|shortened|shorter/i.test(await last.innerText()), `the answer: ${(await last.innerText()).slice(0, 200)}`)
      expect(!(await panel().getByRole('alert').count()), `an error: ${await panel().getByRole('alert').first().innerText().catch(() => '')}`)
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`)
    })
  } finally {
    await b.close()
  }
  return s.done()
}
