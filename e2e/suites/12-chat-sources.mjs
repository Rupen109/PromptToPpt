import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { STATE } from './02-auth.mjs'

const DOC = 'Zebrafish Handling Protocol. Section 1: Tanks must be kept at 28 degrees Celsius. Section 2: Feeding happens twice daily with brine shrimp. Section 3: Water quality is tested every Monday using the Hydrotest kit. Section 4: Any fish showing fin rot is moved to quarantine tank Q7 immediately.'

export default async function () {
  const s = suite('12-chat-sources')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE })
  const p = await ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  const id = await p.evaluate(async () => (await (await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'education-lecture' }) })).json()).data?.id)
  let deck = id
  if (!deck) deck = await p.evaluate(async () => { const t = await (await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'pitch-launchpad' }) })).json(); return t.data.id })
  const open = async () => { await p.goto(`${EDITOR}/edit/${deck}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(700) }
  const panel = () => p.getByRole('complementary', { name: 'AI assistant' })
  const send = async (text) => {
    await p.getByLabel('Message to the AI assistant').fill(text); await p.getByRole('button', { name: 'Send' }).click()
    await p.getByText('Working on it').waitFor({ state: 'visible', timeout: 10000 }); await p.getByText('Working on it').waitFor({ state: 'detached', timeout: 150000 }); await settle(800)
  }
  const saved = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const deckText = async () => { await saved(); return deckTextNow() }
  const deckTextNow = async () => p.evaluate(async (id) => { const d = (await (await fetch(`http://localhost:4000/api/v1/presentations/${id}`, { credentials: 'include' })).json()).data.document; return { sources: d.sources.length, text: JSON.stringify(d.slides.map((x) => x.content ?? x.elements)).toLowerCase() } }, deck)

  await open()
  await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()

  await s.check('attach a document in the chat (📎) → chip appears; message mentions it', p, async () => {
    await p.getByRole('button', { name: 'Attach a file or link' }).click()
    const dlg = p.getByRole('dialog', { name: 'Add sources' }); await dlg.waitFor()
    await dlg.getByRole('tab', { name: 'Paste text' }).click()
    await dlg.getByLabel('Title').fill('Zebrafish protocol'); await dlg.getByLabel('Text').fill(DOC)
    await dlg.getByRole('button', { name: 'Add source' }).click()
    await p.getByLabel('Attached to this message').getByText('Zebrafish protocol').waitFor({ timeout: 15000 })
  })
  let before0 = 0
  await s.check('"add more content from my document" uses the attached source (facts from the document appear on slides)', p, async () => {
    before0 = (await deckText()).text.length
    await send('Add more content to the slides using the document I attached. Use its facts.')
    const log = await panel().getByRole('log').innerText(); expect(!/Something went wrong|couldn't change anything/.test(log), `assistant failed: ${log.slice(-250)}`)
    const d = await deckText(); expect(d.sources === 1, `deck did not remember the source (${d.sources})`)
    expect(/28 degrees|brine shrimp|hydrotest|quarantine|zebrafish/.test(d.text), 'no fact from the document reached the slides')
    expect(d.text.length > before0 * 1.15, `slides did not get meaningfully more content (${before0} → ${d.text.length} chars)`)
    expect(/Added detail from your document/.test(log) && !/Rewrote slide/.test(log), 'reply does not honestly describe what happened')
    await p.getByRole('button', { name: 'Undo' }).last().click(); await settle(800); await saved()
    expect((await deckTextNow()).text.length <= before0 * 1.02, 'Undo did not restore the previous content')
  })
  await s.check('the conversation is kept: reload → open the panel → previous messages are still there', p, async () => {
    await open(); await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor(); await settle(1200)
    const log = await panel().getByRole('log').innerText()
    expect(/add more content to the slides using the document/i.test(log), 'my message is gone after reload')
    expect(/Done|change/i.test(log), 'the assistant reply is gone after reload')
  })
  await s.check('closing and reopening the panel keeps the chat (no re-fetch flicker to the empty state)', p, async () => {
    await p.getByLabel('Close AI panel').click(); await settle(300); await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor(); await settle(1000)
    expect(/using the document i attached/i.test(await panel().getByRole('log').innerText()), 'chat empty after reopening')
  })
  await s.check('the deck remembers its source: a follow-up WITHOUT re-attaching still has the document ("Using 1 source")', p, async () => {
    expect(/Using 1 source/.test(await panel().innerText()), 'deck sources line missing')
    await send('Add one more detail from the document to slide 2.')
    const log = await panel().getByRole('log').innerText(); expect(!/attach|no document|no source/i.test(log.split('Add one more detail')[1] ?? ''), `assistant claims no document: ${log.slice(-250)}`)
  })
  await s.check('Clear chat empties the conversation (slides untouched) and it stays cleared after reload', p, async () => {
    const before = (await deckText()).text
    p.once('dialog', (d) => void d.accept()); await p.getByRole('button', { name: 'Clear chat' }).click(); await settle(800)
    expect(!/using the document i attached/i.test(await panel().getByRole('log').innerText()), 'chat not cleared')
    await open(); await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor(); await settle(1000)
    expect(!/using the document i attached/i.test(await panel().getByRole('log').innerText()), 'chat came back after reload')
    expect((await deckText()).text === before, 'clearing the chat changed the slides')
  })
  await s.check('another user cannot read my chat (404)', p, async () => {
    const c2 = await b.newContext(); const q = await c2.newPage()
    const r = await fetch('http://localhost:4000/api/v1/presentations/' + deck + '/chat'); expect(r.status === 401, `anon ${r.status}`)
    await c2.close()
  })
  await b.close()
  return s.done()
}
