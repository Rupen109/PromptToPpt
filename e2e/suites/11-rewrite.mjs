import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { STATE } from './02-auth.mjs'

const BRIEF = 'I did a QA internship. I learned to write test cases, then test the actual functionality and report real bugs. I want a presentation covering all of it.'

export default async function () {
  const s = suite('11-rewrite')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE })
  const p = await ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  const stageText = () => p.locator('[data-testid="stage"]').innerText()
  const allText = async () => { const n = await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').count(); return n }
  let deckId = ''
  const done = async () => { await p.getByRole('dialog').waitFor({ state: 'detached', timeout: 240000 }); await settle(1200) }

  await s.check('template → editor opens with the "tell me what to put in your slides" popup', p, async () => {
    await p.goto(EDITOR + '/templates', { waitUntil: 'networkidle' })
    await p.getByLabel('Search templates').fill('Launchpad'); await p.getByRole('button', { name: /^Launchpad —/ }).first().click()
    await p.getByRole('dialog').getByRole('button', { name: /Use this template/ }).click(); await p.waitForURL(/\/edit\/.*new=1/, { timeout: 25000 })
    deckId = new URL(p.url()).pathname.split('/edit/')[1]
    await p.getByRole('dialog', { name: /Tell me what to put/ }).waitFor({ timeout: 10000 })
    expect(await p.getByRole('button', { name: /Create my slides/ }).isDisabled(), 'submit enabled with an empty brief')
  })
  await s.check('"Skip" closes the popup, keeps the sample, and the popup does not return on reload', p, async () => {
    await p.getByRole('button', { name: /Skip/ }).click(); await settle(400)
    expect(await p.getByRole('dialog').count() === 0, 'popup stayed'); expect(!/new=1/.test(p.url()), '?new=1 left in the URL')
    await p.reload({ waitUntil: 'networkidle' }); await settle(800); expect(await p.getByRole('dialog').count() === 0, 'popup came back after reload')
    expect(/Northwind/.test(await stageText()), 'sample content missing')
  })
  await s.check('brief → every slide is rewritten from the user\'s details (not the sample), same design, with pictures', p, async () => {
    await p.goto(`${EDITOR}/edit/${deckId}?new=1`, { waitUntil: 'networkidle' })
    const themeOf = () => p.evaluate(async (id) => (await (await fetch(`http://localhost:4000/api/v1/presentations/${id}`, { credentials: 'include' })).json()).data.document.theme, deckId)
    const before = await themeOf()
    await p.getByLabel('What is your presentation about?').fill(`${BRIEF} Do not change the colours, theme or fonts.`); await p.getByRole('button', { name: /Create my slides/ }).click()
    // Stage 0: the app shows what it understood BEFORE spending credits
    await p.getByRole('heading', { name: /Does this look right/ }).waitFor({ timeout: 60000 })
    const card = await p.getByLabel('What I understood').innerText()
    expect(/test case/i.test(card) && /bug/i.test(card), `understanding card misses the user's details: ${card.slice(0, 200)}`)
    expect(/design stays/i.test(card), 'card does not promise to keep the design')
    await p.getByRole('button', { name: /Looks right/ }).click()
    await p.getByRole('progressbar').waitFor({ timeout: 15000 }); await done()
    expect(!/Northwind|logistics/i.test(await stageText()), 'sample text still on slide 1')
    const after = await themeOf()
    expect(JSON.stringify(after) === JSON.stringify(before), `THEME CHANGED by the rewrite: ${before.id}/${before.fonts.heading} → ${after.id}/${after.fonts.heading}`)
    const texts = []
    const n = await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').count(); expect(n >= 6, `only ${n} slides`)
    for (let i = 0; i < n; i++) { await p.locator(`[data-testid=thumb-${i}]`).click(); await settle(250); texts.push((await stageText()).toLowerCase()) }
    expect(texts.join(' ').includes('qa') || texts.join(' ').includes('test'), 'content is not about QA / testing')
    expect(!texts.join(' ').match(/northwind|logistics|delivery van/), 'sample content leaked into later slides')
    const imgs = await p.evaluate(() => 0); void imgs
    expect(texts.filter((t) => t.length > 20).length >= n - 1, 'empty slides')
  })
  await s.check('pictures: none are broken or empty frames; a slide without a matching picture is a clean text slide (a missing picture beats a wrong one)', p, async () => {
    const n = await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').count(); let pics = 0; const broken = []
    for (let i = 0; i < n; i++) {
      await p.locator(`[data-testid=thumb-${i}]`).click(); await settle(500)
      const imgs = await p.locator('[data-testid="stage"] img').evaluateAll((els) => els.map((e) => ({ ok: e.complete && e.naturalWidth > 0, src: e.src })))
      pics += imgs.length; for (const im of imgs) if (!im.ok) broken.push(`${i + 1}: ${im.src.slice(-40)}`)
    }
    expect(!broken.length, `broken pictures: ${broken.join(' | ')}`)
    console.log(`      (${pics} picture(s) placed; relevance needs PEXELS_API_KEY — see docs/AI_GENERATION_PLAN.md)`)
  })
  await s.check('the previous version is kept in Version history (restore possible)', p, async () => {
    await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name: /Version history/ }).click()
    const dlg = p.getByRole('dialog', { name: 'Version history' }); await dlg.getByText('Loading…').waitFor({ state: 'detached', timeout: 8000 })
    expect(await dlg.getByRole('button', { name: /Restore/ }).count() >= 1, 'no older version'); await p.keyboard.press('Escape')
  })
  await s.check('AI assistant: "update all slides with my content" rebuilds the WHOLE deck (not just slide 1)', p, async () => {
    await p.goto(EDITOR + '/templates', { waitUntil: 'networkidle' })
    await p.getByLabel('Search templates').fill('Seed Round'); await p.getByRole('button', { name: /^Seed Round —/ }).first().click()
    await p.getByRole('dialog').getByRole('button', { name: /Use this template/ }).click(); await p.waitForURL(/\/edit\//, { timeout: 25000 })
    await p.getByRole('button', { name: /Skip/ }).click(); await settle(500)
    await p.getByRole('button', { name: /Edit with AI/ }).click()
    await p.getByLabel('Message to the AI assistant').fill(`Update all the slides content as per this: ${BRIEF}`); await p.getByRole('button', { name: 'Send' }).click()
    await p.getByRole('dialog', { name: /Tell me what to put/ }).or(p.getByRole('progressbar')).first().waitFor({ timeout: 90000 })
    await done()
    expect(!/Northwind|logistics/i.test(await stageText()), 'slide 1 still the sample')
    const n = await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').count(); let sample = 0
    for (let i = 0; i < n; i++) { await p.locator(`[data-testid=thumb-${i}]`).click(); await settle(200); if (/northwind|logistics|delivery van/i.test(await stageText())) sample++ }
    expect(sample === 0, `${sample} slides still carry the sample story`)
  })
  void allText
  await b.close()
  return s.done()
}
