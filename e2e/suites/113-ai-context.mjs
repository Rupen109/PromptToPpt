import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * Context-aware Edit with AI, in a real browser (the scenarios of the owner's list): the panel says what the next message is about and follows the live slide and
 * selection; a selected text box is rewritten ON ITS OWN (the rest of the slide untouched, its place and styling kept); a message that names the whole deck still
 * goes to the deck even with something selected; Ask answers about the selected object and changes nothing. The AI parts use the real model (a few cents).
 */
const textOf = (el) => (el.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text).join('')).join('\n')

export default async function () {
  const s = suite('113-ai-context')
  const b = await launch()
  try {
    const A = await person(b, 'aictx', 'pro')
    const { p } = A
    const id = (await api.post(A, '/presentations', { templateId: 'pitch-launchpad' })).data.id
    const deck = async () => (await api.get(A, `/presentations/${id}`)).data.document
    const ctxLine = () => p.getByTestId('ai-context')
    const log = () => p.getByRole('log', { name: 'Conversation' })
    /** send a message and wait for the NEW answer (never an older one that happens to match) */
    const send = async (text) => {
      const box = p.getByPlaceholder(/make slide/)
      await box.fill(text); await box.press('Enter')
      // the box is disabled while the assistant works: it is enabled again exactly when the answer is in
      await p.waitForFunction(() => document.querySelector('textarea[aria-label="Message to the AI assistant"]')?.disabled === true, null, { timeout: 20000 }).catch(() => {})
      await p.waitForFunction(() => document.querySelector('textarea[aria-label="Message to the AI assistant"]')?.disabled === false, null, { timeout: 180000 })
      await p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent?.trim() ?? '')), null, { timeout: 25000 }).catch(() => {})
      return (await log().innerText()).slice(-600) // (the end of the conversation: the answer just given)
    }
    const answered = async (n = 1) => p.waitForFunction((want) => document.querySelectorAll('[role=log] button, [role=log]').length >= 0 && (document.querySelector('[role=log]')?.querySelectorAll('.bg-slate-50, [data-ai-msg]').length ?? 0) >= want, n, { timeout: 180000 }).catch(() => {})

    await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    await p.getByRole('toolbar', { name: 'Editor toolbar' }).waitFor({ timeout: 20000 })
    await p.getByRole('button', { name: 'Edit with AI' }).click()
    await ctxLine().waitFor({ timeout: 10000 })

    await s.check('the panel says what the next message is about, and follows the slide and the selection live (no stale context)', p, async () => {
      expect(/Working on slide 1/.test(await ctxLine().innerText()), `line: ${await ctxLine().innerText()}`)
      await p.getByRole('button', { name: /^Slide 2\b/ }).first().click()
      await p.waitForTimeout(400)
      expect(/Working on slide 2/.test(await ctxLine().innerText()), `after switching slide: ${await ctxLine().innerText()}`)
      // selecting a text box on the slide
      await p.locator('[data-testid="stage"] [data-testid="el-text"]').first().click({ position: { x: 8, y: 8 }, force: true })
      await p.getByRole('toolbar', { name: 'Element tools' }).waitFor({ timeout: 6000 })
      await p.waitForTimeout(300)
      expect(/on slide 2/.test(await ctxLine().innerText()) && /(text|title)/.test(await ctxLine().innerText()), `with a text box selected: ${await ctxLine().innerText()}`)
      // selecting a picture instead
      const pic = p.locator('[data-testid="stage"] [data-testid="el-image"]').first()
      if (await pic.count()) {
        await pic.click({ position: { x: 8, y: 8 }, force: true }); await p.waitForTimeout(300)
        expect(/picture/.test(await ctxLine().innerText()), `with a picture selected: ${await ctxLine().innerText()}`)
      }
      await p.keyboard.press('Escape'); await p.waitForTimeout(300)
      expect(/Working on slide 2/.test(await ctxLine().innerText()), `after clearing the selection: ${await ctxLine().innerText()}`)
    })

    let target = null
    await s.check('a SELECTED text box: only its words change, its place and size stay, and nothing else on the slide moves', p, async () => {
      const before = await deck()
      const slide = before.slides[1]
      const el = slide.elements.filter((e) => e.type === 'text' && textOf(e).trim().length > 25)[0]
      expect(!!el, 'no text box with enough words on slide 2')
      target = el.id
      await p.locator(`[data-element="${el.id}"]`).click({ position: { x: 8, y: 8 }, force: true })
      await p.getByRole('toolbar', { name: 'Element tools' }).waitFor({ timeout: 6000 })
      const said = await send('rewrite this in a more professional tone')
      expect(/Rewrote the words|Done/i.test(said), `the assistant said: ${said.slice(0, 200)}`)
      const after = await deck()
      const was = slide.elements.find((e) => e.id === el.id), now = after.slides[1].elements.find((e) => e.id === el.id)
      expect(!!now, 'the text box is gone: the whole slide was rewritten instead of the one box')
      expect(textOf(now) !== textOf(was), `the words did not change: ${textOf(now).slice(0, 120)}`)
      expect(now.x === was.x && now.y === was.y && now.width === was.width && now.height === was.height && now.fontSize === was.fontSize, 'the box moved or changed size')
      const others = (d, i) => JSON.stringify(d.slides[i].elements.filter((e) => e.id !== el.id))
      expect(others(after, 1) === others(before, 1), 'another object on the slide changed')
      expect(JSON.stringify(after.slides.filter((_, i) => i !== 1)) === JSON.stringify(before.slides.filter((_, i) => i !== 1)), 'another slide changed')
    })

    await s.check('Ctrl+Z puts that one rewrite back', p, async () => {
      const before = await deck()
      await p.locator('[data-testid="stage"]').click({ position: { x: 4, y: 4 } }).catch(() => {})
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
      await p.waitForTimeout(3000)
      const after = await deck()
      const t = (d) => textOf(d.slides[1].elements.find((e) => e.id === target))
      expect(t(after) !== t(before), 'undo did not put the words back')
    })

    await s.check('with a text box selected, "change the background of this slide" still changes the SLIDE (the explicit scope wins)', p, async () => {
      const before = await deck()
      await p.locator(`[data-element="${target}"]`).click({ position: { x: 8, y: 8 }, force: true })
      await p.getByRole('toolbar', { name: 'Element tools' }).waitFor({ timeout: 6000 })
      const said = await send('change the background of this slide to navy')
      const after = await deck()
      const bg = (d) => JSON.stringify(d.slides[1].background ?? null)
      expect(bg(after) !== bg(before), `the slide background did not change (${bg(after)}); the assistant said: ${said}`)
      const box = (d) => JSON.stringify(d.slides[1].elements.find((e) => e.id === target))
      expect(box(after) === box(before), 'the selected text box was changed instead of the slide background')
    })

    await s.check('Ask mode answers about the selected object and changes nothing', p, async () => {
      await p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent?.trim() ?? '')), null, { timeout: 20000 }).catch(() => {})
      const before = JSON.stringify(await deck())
      await p.getByRole('tab', { name: 'Ask' }).click()
      const box = p.getByPlaceholder(/What does slide/i).first()
      await box.fill('What does this text say, in a few words?')
      await box.press('Enter')
      await p.waitForFunction(() => (document.querySelector('[aria-label="Questions and answers"]')?.textContent ?? '').length > 120, null, { timeout: 180000 })
      const log = await p.getByRole('log', { name: 'Questions and answers' }).innerText()
      expect(!/does not say/i.test(log.slice(-400)), `Ask did not use the selection: ${log.slice(-300)}`)
      expect(JSON.stringify(await deck()) === before, 'Ask changed the deck')
    })
    await A.ctx.close()
  } finally { await b.close() }
  return s.done()
}
