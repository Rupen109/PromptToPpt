import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * "That is too big": what happens when someone types or pastes far more than one request can hold.
 *  · The new-deck box counts down near its limit and NEVER cuts a long paste off: the text becomes a source, read in full.
 *  · The AI chat says, before a credit is spent, that a message asking for dozens of changes is done ten at a time.
 *  · The server refuses an over-long prompt with words that say what to do instead.
 * No AI is called.
 */
export default async function () {
  const s = suite('116-long-prompt')
  const b = await launch()
  try {
    const A = await person(b, 'longprompt', 'pro')
    const { p } = A
    const box = p.getByLabel('Presentation prompt')
    await p.goto(`${EDITOR}/`, { waitUntil: 'networkidle' })
    await box.waitFor({ timeout: 20000 })

    await s.check('the new-deck box counts down once the limit is near', p, async () => {
      await box.fill('a'.repeat(3300))
      await p.getByTestId('prompt-count').waitFor({ timeout: 5000 })
      const t = await p.getByTestId('prompt-count').innerText()
      expect(/3,300 \/ 4,000 characters/.test(t), `counter: ${t}`)
      expect(/source/i.test(t), 'the counter does not say where long text belongs')
      await box.fill('')
    })

    await s.check('a paste that does not fit is NOT cut off: it is attached as a source, and the box says so', p, async () => {
      const long = 'Our quarterly results, in detail. '.repeat(300) // ~10,000 characters
      await p.evaluate(async (text) => { await navigator.clipboard.writeText(text) }, long).catch(() => {})
      await box.click()
      let pasted = false
      try {
        await p.evaluate(async () => { await navigator.clipboard.readText() })
        await p.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v')
        pasted = true
      } catch { /* no clipboard permission in this browser: paste the same event by hand */ }
      if (!pasted) {
        await p.evaluate((text) => {
          const el = document.querySelector('textarea[aria-label="Presentation prompt"]')
          const dt = new DataTransfer()
          dt.setData('text/plain', text)
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        }, long)
      }
      await p.getByTestId('paste-note').waitFor({ timeout: 10000 })
      const note = await p.getByTestId('paste-note').innerText()
      expect(/10,200 characters|longer than one prompt can be/.test(note), `note: ${note}`)
      expect(/read in full/.test(note), 'the note does not say the source is read in full')
      expect((await box.inputValue()).length === 0, 'the long text was put in the box anyway')
      // the chip is there: the text was really stored as a source on the server (the chip only appears once the server answered)
      await p.getByText('Pasted text', { exact: false }).first().waitFor({ timeout: 20000 })
    })

    await s.check('the server refuses an over-long new-deck prompt and says what to do instead', p, async () => {
      const r = await api.post(A, '/generation/analyze', { prompt: 'x'.repeat(4100), sourceIds: [] })
      expect(r.status === 400, `status ${r.status}`)
      const message = JSON.stringify(r.body)
      expect(/4,000 characters/.test(message) && /source/i.test(message), `message: ${message.slice(0, 300)}`)
    })

    await s.check('the AI chat warns, before sending, that a message asking for dozens of changes is done ten at a time', p, async () => {
      const id = (await api.post(A, '/presentations', { templateId: 'pitch-launchpad' })).data.id
      await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
      await p.getByRole('button', { name: 'Edit with AI' }).click()
      const field = p.getByLabel('Message to the AI assistant')
      await field.waitFor({ timeout: 20000 })
      await field.fill(Array.from({ length: 14 }, (_, i) => `${i + 1}. change something about slide ${i + 1}`).join('\n'))
      await p.getByTestId('many-changes').waitFor({ timeout: 5000 })
      const t = await p.getByTestId('many-changes').innerText()
      expect(/14 changes/.test(t) && /10 per message/.test(t), `warning: ${t}`)
      // a normal message says nothing
      await field.fill('make slide 2 shorter')
      await p.waitForTimeout(200)
      expect(await p.getByTestId('many-changes').count() === 0, 'the warning is shown for a normal message')
    })

    await s.check('the chat refuses a message longer than it can hold, and offers to attach it as a source', p, async () => {
      const field = p.getByLabel('Message to the AI assistant')
      await field.fill('')
      await p.evaluate(() => {
        const el = document.querySelector('textarea[aria-label="Message to the AI assistant"]')
        const dt = new DataTransfer()
        dt.setData('text/plain', 'The full transcript of the meeting. '.repeat(200))
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      })
      await p.getByTestId('long-paste').waitFor({ timeout: 10000 })
      expect(/Attach it as a source/.test(await p.getByTestId('long-paste').innerText()), 'no offer to attach it')
      expect((await field.inputValue()).length === 0, 'the long text was put in the message anyway')
    })
    await A.ctx.close()
  } finally { await b.close() }
  return s.done()
}
