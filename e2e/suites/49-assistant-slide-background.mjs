/**
 * The assistant and ONE slide's background, with the REAL model, in the real editor: the conversation that went wrong for a customer. They added a thank-you page, it came out
 * in a different colour than the other slides, and they asked for it to match. The assistant must change THAT slide's background to the other slides' colour, touch nothing else
 * (theme, other slides), and offer Undo; it must never restyle the whole deck or "put back" a change when the user only explained what they want.
 */
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

export default async function () {
  const s = suite('49-assistant-slide-background')
  const b = await launch()
  const A = await person(b, 'asbg', 'pro')
  await api.get(A, '/me/entitlements')
  const created = await api.post(A, '/presentations', { templateId: 'education-thesis-defense' })
  const id = created.data.id
  const p = await A.ctx.newPage()
  const settle = (ms = 500) => p.waitForTimeout(ms)
  await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(800)
  const panel = () => p.getByRole('complementary', { name: 'AI assistant' })
  const steady = () => panel().getByLabel('AI model').selectOption({ label: 'Gemini 3.6 Flash' }).catch(() => {})
  const send = async (text) => {
    await steady()
    await p.getByLabel('Message to the AI assistant').fill(text); await p.getByRole('button', { name: 'Send' }).click()
    const working = p.getByText('Working on it'); await working.waitFor({ state: 'visible', timeout: 10000 }); await working.waitFor({ state: 'detached', timeout: 150000 }); await settle(1500)
  }
  const twice = (fn) => async () => { try { await fn() } catch { await settle(15000); await fn() } }
  const deck = async () => { await settle(3500); return (await api.get(A, `/presentations/${id}`)).data.document } // autosave has run
  const bgOf = (sl) => (sl.background?.type === 'color' ? sl.background.value.toUpperCase() : null)
  const common = (doc, exceptId) => { const m = new Map(); for (const sl of doc.slides) if (sl.id !== exceptId && bgOf(sl)) m.set(bgOf(sl), (m.get(bgOf(sl)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] }
  await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()

  const start = await deck()
  const baseTheme = JSON.stringify(start.theme.colors) + start.theme.templateId
  const n0 = start.slides.length
  let added

  await s.check('"add thank you page also" adds ONE new slide at the end', p, twice(async () => {
    await send('add thank you page also')
    const d = await deck()
    expect(d.slides.length === n0 + 1, `slides ${n0} → ${d.slides.length}`)
    added = d.slides[d.slides.length - 1]
    expect(added.layoutId === 'thank-you', `last slide is ${added.layoutId}`)
  }))

  await s.check('"color should be brown": never recolours the whole deck (it changes that slide only, or asks which)', p, async () => {
    await send('color should be brown')
    const d = await deck()
    expect(JSON.stringify(d.theme.colors) + d.theme.templateId === baseTheme, 'the WHOLE deck was recoloured')
    const others = d.slides.filter((x) => x.id !== added.id).every((x) => JSON.stringify(x.background) === JSON.stringify(start.slides.find((o) => o.id === x.id)?.background))
    expect(others, 'other slides changed')
  })

  await s.check('"means it should match with our other slides" does not undo anything and does not restyle the deck', p, async () => {
    await send('means it should match with our other slides')
    const d = await deck()
    expect(JSON.stringify(d.theme.colors) + d.theme.templateId === baseTheme, 'the deck theme changed')
    expect(d.slides.length === n0 + 1, 'the added slide was removed (a "put it back" misread)')
  })

  await s.check('"change the background of thank you page, same as other slides bg": the new slide gets the other slides\' background, nothing else moves, Undo is offered', p, twice(async () => {
    await send('no man just simple change the background color of thank you page, and apply color same as other slides bg')
    const d = await deck()
    const last = d.slides[d.slides.length - 1]
    const want = common(d, last.id)
    expect(bgOf(last) === want, `new slide background ${bgOf(last)} ≠ the other slides' ${want}`)
    expect(JSON.stringify(d.theme.colors) + d.theme.templateId === baseTheme, 'the deck theme changed')
    const moved = d.slides.filter((x) => x.id !== last.id && x.id !== added.id).some((x) => JSON.stringify(x.background) !== JSON.stringify(start.slides.find((o) => o.id === x.id)?.background))
    expect(!moved, 'another slide changed')
    expect(await panel().getByRole('button', { name: 'Undo' }).count() >= 1, 'no Undo offered')
    expect(!/Only the selected slide can be changed here/.test(await panel().getByRole('log').innerText()), 'the old refusal appeared')
    // the customer's second bug: the text of that slide was dark on the new dark background (invisible)
    const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
    const tokens = d.theme.colors
    for (const e of last.elements.filter((x) => x.type === 'text')) {
      const fg = String(e.color).startsWith('#') ? e.color : tokens[e.color] ?? tokens.textPrimary
      expect(ratio(fg, want) >= 3, `"${e.role}" text ${fg} is not readable on ${want} (contrast ${ratio(fg, want).toFixed(2)})`)
    }
  }))

  await s.check('"thank you text is not visible" (if it ever is) is FIXED, not answered by undoing the background the user asked for', p, twice(async () => {
    const before = await deck(); const last = before.slides[before.slides.length - 1]
    await send('thank you text is not visible')
    const after = await deck(); const now = after.slides[after.slides.length - 1]
    expect(bgOf(now) === bgOf(last), `the background was put back (${bgOf(last)} → ${bgOf(now)})`)
    expect(!/put it back the way it was|Put back/i.test(await panel().getByRole('log').innerText().then((t) => t.slice(-300))), 'the assistant reverted instead of fixing')
  }))

  await s.check('"put it back" restores the previous background of that slide', p, twice(async () => {
    const before = await deck(); const last = before.slides[before.slides.length - 1]
    await send('undo that')
    const after = await deck(); const now = after.slides[after.slides.length - 1]
    expect(bgOf(now) !== bgOf(last), 'background did not change back')
    expect(after.slides.length === n0 + 1, 'slide count changed')
  }))

  await b.close()
  return s.done()
}
