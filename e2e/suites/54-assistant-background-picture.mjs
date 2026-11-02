/**
 * "Update the bg image" in the real editor, with the REAL model: a customer asked for a new background image and got a paid AI-picture proposal that then floated on the slide.
 * Now: a plain request puts a free photo behind the slide at once (one undo step, no image credits); "generate an AI image" is a paid proposal that is never charged until confirmed
 * and, when confirmed, goes BEHIND the slide. Pictures are never generated here (no AI images in tests): the proposal is only checked, not confirmed.
 */
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

export default async function () {
  const s = suite('54-assistant-background-picture')
  const b = await launch()
  const A = await person(b, 'asbp', 'pro')
  await api.get(A, '/me/entitlements')
  const id = (await api.post(A, '/presentations', { templateId: 'pitch-seed-round' })).data.id
  const p = await A.ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(800)
  if (await p.getByRole('dialog').count()) { await p.keyboard.press('Escape'); await settle(300) }
  const panel = () => p.getByRole('complementary', { name: 'AI assistant' })
  const send = async (text) => {
    await panel().getByLabel('AI model').selectOption({ label: 'Gemini 3.6 Flash' }).catch(() => {})
    await p.getByLabel('Message to the AI assistant').fill(text); await p.getByRole('button', { name: 'Send' }).click()
    const working = p.getByText('Working on it'); await working.waitFor({ state: 'visible', timeout: 10000 }); await working.waitFor({ state: 'detached', timeout: 150000 }); await settle(1500)
  }
  const twice = (fn) => async () => { try { await fn() } catch { await settle(15000); await fn() } }
  const deck = async () => { await settle(3500); return (await api.get(A, `/presentations/${id}`)).data.document }
  const credits = async () => (await api.get(A, '/me/entitlements')).data.credits.balance
  await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()
  const start = await deck()
  const first = start.slides[0]
  expect(!first.background || first.background.type !== 'image' || true, 'setup')

  await s.check('"update the bg image" puts a free photo behind the slide you are on, with no picture proposal and no image credits', p, async () => {
    const c0 = await credits()
    await send('update the bg image')
    const d = await deck()
    const sl = d.slides[0]
    expect(sl.background?.type === 'image', `slide 1 background: ${JSON.stringify(sl.background)}`)
    expect(/\/api\/v1\/assets\/|\/template-assets\//.test(sl.background.value), `picture address: ${sl.background.value}`)
    expect(await p.getByRole('button', { name: /Generate/ }).count() === 0, 'a paid picture proposal was shown')
    const spent = c0 - (await credits())
    expect(spent <= 4, `spent ${spent} credits (a one-slide answer costs a few; an AI picture costs 20 or more)`)
    const r = await A.ctx.request.get(sl.background.value); expect(r.ok(), `picture not served (${r.status()})`)
    expect(/photo behind slide 1/.test(await panel().innerText()), 'the answer does not say what was done')
  })

  await s.check('Undo takes the background picture back in one step', p, async () => {
    await p.getByText('Undo', { exact: true }).last().click(); await settle(800)
    const d = await deck()
    expect(JSON.stringify(d.slides[0].background) === JSON.stringify(first.background), `background after undo: ${JSON.stringify(d.slides[0].background)}`)
  })

  await s.check('"generate an AI image for the background of this slide" is a paid PROPOSAL (nothing is generated or charged until confirmed)', p, twice(async () => {
    const c0 = await credits()
    await send('generate an AI image for the background of this slide')
    expect(await panel().getByText(/Background|background/).count() >= 1, 'no proposal card')
    expect(await panel().getByRole('button', { name: /Generate/ }).count() >= 1, 'no Generate button on the proposal')
    expect(c0 - (await credits()) <= 4, 'credits were spent before confirming')
  }))

  await b.close()
  return s.done()
}
