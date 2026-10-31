/**
 * "add 2 more bullet points" with the REAL model, in the real editor. A customer asked three times for more points on a comparison slide (4 per side) and each time got
 * "Done — Rewrote slide 12" with nothing added: the layout only allowed 4 per side and nobody said so. Now the lists must really grow (up to 6), and when they cannot,
 * the chat says why instead of a bare "Done".
 */
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

export default async function () {
  const s = suite('50-assistant-more-points')
  const b = await launch()
  const A = await person(b, 'morep', 'pro')
  await api.get(A, '/me/entitlements')
  let id, doc
  for (const t of ['strategy-boardroom', 'sales-closer', 'pitch-seed-round', 'education-lecture-notes', 'reports-quarterly-results']) {
    const r = await api.post(A, '/presentations', { templateId: t }); id = r.data.id
    doc = (await api.get(A, `/presentations/${id}`)).data.document
    if (doc.slides.some((x) => x.layoutId === 'comparison') && doc.slides.some((x) => x.layoutId === 'title-body' && (x.content?.bullets?.length ?? 9) <= 4)) break
  }
  const p = await A.ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(800)
  const panel = () => p.getByRole('complementary', { name: 'AI assistant' })
  const send = async (text) => {
    await panel().getByLabel('AI model').selectOption({ label: 'Gemini 3.6 Flash' }).catch(() => {})
    await p.getByLabel('Message to the AI assistant').fill(text); await p.getByRole('button', { name: 'Send' }).click()
    const w = p.getByText('Working on it'); await w.waitFor({ state: 'visible', timeout: 10000 }); await w.waitFor({ state: 'detached', timeout: 150000 }); await settle(1500)
  }
  const twice = (fn) => async () => { try { await fn() } catch { await settle(15000); await fn() } }
  const fresh = async () => { await settle(3500); return (await api.get(A, `/presentations/${id}`)).data.document }
  const select = async (index) => { await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').nth(index).click(); await settle(500) }
  await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()

  await s.check('comparison slide, 4 points per side: "currently its 4 bullet points, please add 2 more in both side" gives 6 on BOTH sides', p, twice(async () => {
    const d0 = await fresh(); const i = d0.slides.findIndex((x) => x.layoutId === 'comparison'); const before = d0.slides[i]
    await select(i)
    await send('currently its 4 bullet points, please add 2 more in both side')
    const d = await fresh(); const now = d.slides[i].content
    expect(now.left.bullets.length === before.content.left.bullets.length + 2, `left ${before.content.left.bullets.length} → ${now.left.bullets.length}; reply: ${(await panel().getByRole('log').innerText()).slice(-200)}`)
    expect(now.right.bullets.length === before.content.right.bullets.length + 2, `right ${before.content.right.bullets.length} → ${now.right.bullets.length}`)
    expect(d.slides.every((x, k) => k === i || JSON.stringify(x.content) === JSON.stringify(d0.slides[k].content)), 'another slide changed')
  }))

  await s.check('the longer comparison slide is laid out without overflowing its boxes', p, async () => {
    const d = await fresh(); const sl = d.slides.find((x) => x.layoutId === 'comparison')
    const texts = sl.elements.filter((e) => e.type === 'text' && !e.decorative)
    expect(texts.length > 0 && texts.every((e) => e.fontSize >= 20), `smallest text ${Math.min(...texts.map((e) => e.fontSize))}px`)
  })

  await s.check('title-body slide: "please add 2 more bullet points here" adds exactly 2', p, twice(async () => {
    const d0 = await fresh(); const i = d0.slides.findIndex((x) => x.layoutId === 'title-body' && x.content.bullets.length <= 4)
    expect(i >= 0, 'no title-body slide with room')
    await select(i)
    const n = d0.slides[i].content.bullets.length
    await send('please add 2 more bullet points here')
    const d = await fresh()
    expect(d.slides[i].content.bullets.length === n + 2, `bullets ${n} → ${d.slides[i].content.bullets.length}`)
  }))

  await s.check('a slide that is already full says so plainly (no bare "Done")', p, async () => {
    const d0 = await fresh(); const i = d0.slides.findIndex((x) => x.layoutId === 'comparison')
    await select(i)
    await send('please add 2 more bullet points on both sides')
    const log = (await panel().getByRole('log').innerText()).slice(-400)
    const d = await fresh(); const now = d.slides[i].content
    expect(now.left.bullets.length <= 6 && now.right.bullets.length <= 6, 'more than 6 points on a side')
    expect(/already full|at most 6|can hold|room|limit/i.test(log), `no explanation: ${log}`)
  })

  await b.close()
  return s.done()
}
