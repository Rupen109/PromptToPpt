import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { STATE } from './02-auth.mjs'

export default async function () {
  const s = suite('14-topic-theme')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1000 }, storageState: STATE })
  const p = await ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  const lum = (hex) => { const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * bl }
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const make = async (prompt) => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' }); await p.getByLabel('Presentation prompt').fill(prompt)
    await p.getByRole('button', { name: 'Create Presentation' }).click(); await p.waitForURL(/\/create/)
    const dir = p.getByRole('button', { name: /Let AI decide/ }); const len = p.getByRole('radio', { name: /slides · ~/ }).first()
    await dir.or(len).first().waitFor({ timeout: 90000 }); if (await dir.count()) await dir.click()
    await len.waitFor({ timeout: 30000 }); await len.click()
    await p.getByRole('radiogroup', { name: 'AI model' }).getByRole('radio').first().click()
    await p.waitForURL(/\/edit\//, { timeout: 240000 }); await settle(1500)
    const id = p.url().split('/edit/')[1]
    return { id, doc: await p.evaluate(async (id) => (await (await fetch(`http://localhost:4000/api/v1/presentations/${id}`, { credentials: 'include' })).json()).data.document, id) }
  }
  let env
  await s.check('"ppt on environment of india" → DARK deck in environment greens (not a generic colour)', p, async () => {
    env = await make('i want to make ppt on environment of india')
    const c = env.doc.theme.colors; expect(lum(c.background) < 0.05, `background not dark: ${c.background}`)
    const [r, g, bl] = rgb(c.primary); expect(g > r && g >= bl * 0.9, `primary ${c.primary} is not green-ish`)
    const [br, bg2, bb] = rgb(c.background); expect(bg2 >= br && bg2 >= bb, `background ${c.background} is not green-tinted`)
  })
  await s.check('"ppt on gandhi jayanti" → dark deck with a colour scheme that is not the default blue', p, async () => {
    const g = await make('i want to make ppt on gandhi jayanti')
    const c = g.doc.theme.colors; expect(lum(c.background) < 0.05, `background not dark: ${c.background}`)
    const [r, gg, bl] = rgb(c.primary); expect(!(bl > r && bl > gg), `primary ${c.primary} is the default blue family`)
  })
  await s.check('an explicit "light mode" request gives a light deck', p, async () => {
    const l = await make('make a presentation on solar energy in india, light mode with a white background')
    expect(lum(l.doc.theme.colors.background) > 0.5, `background not light: ${l.doc.theme.colors.background}`)
  })
  await s.check('Style › Colors › Light/Dark switch converts the whole deck both ways and keeps content and brand colours', p, async () => {
    await p.goto(`${EDITOR}/edit/${env.id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(800)
    const read = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 }).then(() => p.evaluate(async (id) => (await (await fetch(`http://localhost:4000/api/v1/presentations/${id}`, { credentials: 'include' })).json()).data.document, env.id))
    await p.getByRole('button', { name: /Style/ }).click(); const dr = p.getByRole('complementary', { name: 'Style' }); await dr.getByRole('tab', { name: /Colo/i }).click()
    await dr.getByRole('group', { name: 'Deck mode' }).getByRole('button', { name: /Light/ }).click(); await settle(900)
    const l = await read(); expect(lum(l.theme.colors.background) > 0.5, `not light: ${l.theme.colors.background}`)
    expect(JSON.stringify(l.slides.map((x) => x.content)) === JSON.stringify(env.doc.slides.map((x) => x.content)), 'content changed by the mode switch')
    expect(JSON.stringify(l.theme.fonts) === JSON.stringify(env.doc.theme.fonts), 'fonts changed')
    await dr.getByRole('group', { name: 'Deck mode' }).getByRole('button', { name: /Dark/ }).click(); await settle(900)
    const d = await read(); expect(lum(d.theme.colors.background) < 0.05, `not dark again: ${d.theme.colors.background}`)
  })
  await b.close()
  return s.done()
}
