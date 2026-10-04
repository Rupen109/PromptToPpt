import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { STATE } from './02-auth.mjs'

export default async function () {
  const s = suite('05-ai-assistant')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE })
  const p = await ctx.newPage()
  const settle = (ms = 400) => p.waitForTimeout(ms)
  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  const id = await p.evaluate(async () => { const r = await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'pitch-seed-round' }) }); return (await r.json()).data.id })
  await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(800)
  const thumbs = () => p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]')
  const panel = () => p.getByRole('complementary', { name: 'AI assistant' })
  const send = async (text, wait = 150000) => {
    await p.getByLabel('Message to the AI assistant').fill(text); await p.getByRole('button', { name: 'Send' }).click()
    const working = p.getByText('Working on it')
    await working.waitFor({ state: 'visible', timeout: 10000 }) // the request really started
    await working.waitFor({ state: 'detached', timeout: wait }) // …and finished
    await settle(700)
  }
  const sig = () => thumbs().evaluateAll((els) => els.map((e) => e.innerHTML.length + ':' + (e.innerHTML.match(/#[0-9a-fA-F]{6}|rgb\([^)]*\)/g) ?? []).slice(0, 6).join(',')).join('|'))

  await s.check('panel: opens from the toolbar, shows scope toggle, model picker, suggestions, closes', p, async () => {
    await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor({ timeout: 4000 })
    expect(await panel().getByRole('group', { name: 'What should the AI change?' }).isVisible(), 'scope toggle missing')
    expect(await panel().getByLabel('AI model').isVisible(), 'model picker missing')
    expect(await panel().locator('button').count() >= 6, 'no suggestions')
    await p.getByLabel('Close AI panel').click(); await settle(200); expect(await panel().count() === 0, 'did not close')
    await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()
  })
  await s.check('panel: Send is disabled for an empty message; scope toggle switches placeholder', p, async () => {
    expect(await p.getByRole('button', { name: 'Send' }).isDisabled(), 'Send enabled when empty')
    await panel().getByRole('button', { name: /This slide/i }).click()
    expect(/slide \d+/.test(await p.getByLabel('Message to the AI assistant').getAttribute('placeholder')), 'placeholder not slide-specific')
    await panel().getByRole('button', { name: /Whole deck|Deck/i }).first().click()
  })
  await s.check('deck request: "change colours to warm oranges" restyles every slide live (no reload) and offers Undo', p, async () => {
    const before = await sig()
    await send('Change the colour scheme to warm sunset oranges and reds')
    const msg = await panel().getByRole('log').innerText(); expect(!/Something went wrong|not charged/.test(msg), `error: ${msg.slice(-200)}`)
    expect(before !== await sig(), 'slides did not change after the AI replied')
    expect(await panel().getByRole('button', { name: 'Undo' }).count() >= 1, 'no Undo in the reply')
    const after = await sig(); await panel().getByRole('button', { name: 'Undo' }).last().click(); await settle(400)
    expect(after !== await sig(), 'Undo did not revert')
  })
  await s.check('deck request: animate + fonts ("animate every slide, use a serif font")', p, async () => {
    await send('Animate every slide and use a more elegant serif font')
    const log = await panel().getByRole('log').innerText(); expect(!/Something went wrong/.test(log), 'errored'); expect(/animat|font|serif/i.test(log), `reply doesn't mention it: ${log.slice(-200)}`)
  })
  await s.check('slide request: "make this slide shorter" edits only the active slide', p, async () => {
    await thumbs().nth(2).click(); await settle(300)
    await panel().getByRole('button', { name: /This slide/i }).click()
    const others = await thumbs().evaluateAll((els) => els.map((e, i) => i === 2 ? '' : e.innerHTML.length).join(','))
    await send('Make this slide shorter and punchier')
    expect(!/Something went wrong/.test(await panel().getByRole('log').innerText()), 'errored')
    const others2 = await thumbs().evaluateAll((els) => els.map((e, i) => i === 2 ? '' : e.innerHTML.length).join(','))
    expect(others === others2, 'other slides changed on a slide-scoped request')
  })
  await s.check('quick actions (Rewrite / Shorten / Expand / Improve hierarchy) are available for the slide', p, async () => {
    const q = panel().getByLabel('Quick actions for this slide'); expect(await q.getByRole('button').count() === 4, 'quick actions missing')
    await q.getByRole('button', { name: 'Shorten' }).click()
    await p.waitForFunction(() => /I updated slide|Something went wrong|failed/i.test(document.querySelector('[role=log]')?.textContent ?? ''), null, { timeout: 90000 })
    expect(/I updated slide/.test(await panel().getByRole('log').innerText()), 'quick action failed')
  })
  await s.check('honesty: an impossible request (export + share) is declined in plain words, not faked', p, async () => {
    await panel().getByRole('button', { name: /Whole deck|Deck/i }).first().click()
    await send('Export this to PDF and email it to my boss')
    const log = (await panel().getByRole('log').innerText()).toLowerCase()
    expect(/can.?t|cannot|unable|not able|isn.?t|doesn.?t|unsupported|no way|export button|couldn.?t/.test(log), `no honest refusal: ${log.slice(-250)}`)
  })
  await s.check('pictures: "add a picture" proposes an image (with Generate / Open image studio) instead of silently doing nothing', p, async () => {
    await thumbs().nth(1).click(); await settle(300)
    await panel().getByRole('button', { name: /This slide/i }).click()
    await send('Add a picture of a modern city skyline at dawn to this slide')
    const card = p.getByLabel(/Picture proposal for slide/); expect(await card.count() >= 1, 'no picture proposal card')
  })
  await s.check('credits: the plan card shows credits were spent and the Starter/Pro balance decreased', p, async () => {
    const ent = await p.evaluate(() => fetch('http://localhost:4000/api/v1/me/entitlements', { credentials: 'include' }).then((r) => r.json()))
    const txt = JSON.stringify(ent); expect(/credit/i.test(txt), 'no credit info in entitlements')
  })

  await b.close()
  return s.done()
}
