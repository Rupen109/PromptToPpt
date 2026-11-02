/**
 * A real chat (2026-11-01): "update layout of slide 7, 8, 9 and 10, currently all are in the same layout" was answered with
 * "Changing the layout of existing slides is not supported", then a rewrite of the TEXT, then "which layout do you want?".
 * Now the assistant changes each slide to a different layout (keeping the slide's own words) in one undoable step, and does not ask.
 * Real model; no pictures are generated.
 */
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

export default async function () {
  const s = suite('55-assistant-change-layout')
  const b = await launch()
  const A = await person(b, 'aslay', 'pro')
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
  await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()
  const start = await deck()
  const ids = start.slides.slice(6, 10).map((x) => x.id)
  expect(ids.length === 4, 'the template deck needs at least 10 slides')
  const was = ids.map((i) => start.slides.find((x) => x.id === i).layoutId)

  await s.check('"update layout of slide no : 7,8,9 and 10 …" gives each of the four slides another layout (not all the same), with no refusal and no question', p, twice(async () => {
    await send('what the fuck man i said update layout of slide no : 7,8,9 and 10, currently all are in same layouts, update that')
    const d = await deck()
    const now = ids.map((i) => d.slides.find((x) => x.id === i).layoutId)
    const moved = now.filter((l, i) => l !== was[i]).length
    expect(moved >= 3, `layouts before ${was} after ${now}`)
    expect(new Set(now).size >= 2, `all four got the same layout: ${now}`)
    const tail = await panel().innerText()
    expect(!/not supported|Which (format|layout)/i.test(tail.slice(-500)), `reply: ${tail.slice(-400)}`)
    expect(d.slides.length === start.slides.length, 'slide count changed')
    for (const i of ids) { const sl = d.slides.find((x) => x.id === i); expect(sl.elements.length > 0 && !!sl.content, `slide ${i} came out empty`) }
  }))

  await s.check('Undo puts all four slides back in their old layouts', p, async () => {
    await p.getByText('Undo', { exact: true }).last().click(); await settle(1000)
    const d = await deck()
    expect(JSON.stringify(ids.map((i) => d.slides.find((x) => x.id === i).layoutId)) === JSON.stringify(was), `after undo: ${ids.map((i) => d.slides.find((x) => x.id === i).layoutId)} wanted ${was}`)
  })

  await s.check('a follow-up "you create new layout based on our theme of slides" never makes it ask which layout; the four slides end up in new layouts', p, twice(async () => {
    await send('change the layout of slides 7, 8, 9 and 10, give each one a new look')
    await send('you create new layout based on our theme of slides')
    expect(!/Which (format|layout)/i.test((await panel().innerText()).slice(-400)), 'it asked which layout instead of choosing')
    const d = await deck()
    const now = ids.map((i) => d.slides.find((x) => x.id === i).layoutId)
    expect(now.filter((l, i) => l !== was[i]).length >= 3, `layouts before ${was} after ${now}`)
  }))

  await b.close()
  return s.done()
}
