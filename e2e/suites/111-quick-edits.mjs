import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * Quick edits (the editor toolbar's one-click AI menu, apps/editor components/editor/QuickEditsMenu.tsx): the plan's prices are shown; "Improve writing"
 * changes ONLY the slide on screen, shows in the chat with the credits it took (one AI edit), and Ctrl+Z puts it back; a locked slide cannot use it; Starter
 * is offered the upgrade. Real AI: one writing call (about a tenth of a cent).
 */
export default async function () {
  const s = suite('111-quick-edits')
  const b = await launch()
  try {
    const A = await person(b, 'quick', 'pro')
    const { p } = A
    const id = (await api.post(A, '/presentations', { templateId: 'pitch-launchpad' })).data.id
    const deck = async () => (await api.get(A, `/presentations/${id}`)).data.document
    const credits = async () => (await api.get(A, '/me/entitlements')).data.credits.balance
    const textOf = (sl) => JSON.stringify(sl.content ?? sl.elements)
    await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    await p.getByRole('toolbar', { name: 'Editor toolbar' }).waitFor({ timeout: 20000 })
    // the second slide (a content slide) on screen
    await p.getByRole('button', { name: /^Slide 2\b/ }).first().click()
    const openMenu = async () => { await p.getByRole('button', { name: 'Quick edits' }).click(); await p.getByRole('menu', { name: 'Quick edits for this slide' }).waitFor() }

    await s.check('the menu lists Writing, Design and Pictures with the plan\'s price (4 credits each on Pro; a split 7), and no search box', p, async () => {
      await openMenu()
      const m = p.getByRole('menu', { name: 'Quick edits for this slide' })
      await p.getByTestId('quick-price').waitFor({ timeout: 10000 })
      expect((await p.getByTestId('quick-price').innerText()).trim() === '4 credits each', `price: ${await p.getByTestId('quick-price').innerText()}`)
      for (const g of ['Writing', 'Design', 'Pictures']) expect(await m.getByText(g, { exact: true }).count() === 1, `${g} missing`)
      expect(/7 credits/.test(await m.getByRole('menuitem', { name: /Split into 2 slides/ }).innerText()), 'the split does not show 7 credits')
      expect(await m.getByRole('menuitem').count() >= 12, `the menu lists ${await m.getByRole('menuitem').count()} actions`)
      expect(await p.getByLabel('Search AI actions').count() === 0, 'the search box is still there')
      await p.keyboard.press('Escape')
    })
    await s.check('"Improve writing" changes only slide 2, the chat shows it with 4 credits, and Ctrl+Z puts it back', p, async () => {
      const before = await deck(), c0 = await credits()
      await openMenu()
      await p.getByRole('menuitem', { name: 'Improve writing' }).click()
      const panel = p.getByRole('complementary', { name: 'AI assistant' })
      await panel.waitFor()
      await panel.getByText(/Improve writing \(slide 2\)/).waitFor({ timeout: 10000 })
      await panel.getByText(/^Done/).first().waitFor({ timeout: 180000 })
      await p.waitForTimeout(2500) // the autosave
      const after = await deck()
      const changed = after.slides.map((sl, i) => (textOf(sl) !== textOf(before.slides[i]) ? i + 1 : 0)).filter(Boolean)
      expect(changed.length === 1 && changed[0] === 2, `changed slides: ${changed.join(',')}`)
      expect(c0 - (await credits()) === 4, `charged ${c0 - (await credits())}`)
      await p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 } }).catch(() => {})
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await p.waitForTimeout(2500)
      expect(textOf((await deck()).slides[1]) === textOf(before.slides[1]), 'undo did not put slide 2 back')
    })
    await s.check('a locked slide cannot use quick edits (the menu says why)', p, async () => {
      await p.getByRole('button', { name: 'Slide 3 options' }).click()
      await p.getByRole('menuitem', { name: 'Lock slide' }).click()
      await openMenu()
      expect(await p.getByRole('menu', { name: 'Quick edits for this slide' }).getByText('This slide is locked').count() === 1, 'no locked note in the menu')
      expect(await p.getByRole('menuitem', { name: 'Improve writing' }).isDisabled(), 'Improve writing works on a locked slide')
      await p.keyboard.press('Escape')
    })
    await A.ctx.close()

    const F = await person(b, 'quickfree')
    const fid = (await api.post(F, '/presentations', { templateId: 'pitch-launchpad' })).data.id
    await F.p.goto(`${EDITOR}/edit/${fid}`, { waitUntil: 'networkidle' })
    await s.check('Starter: a quick edit offers the upgrade and charges nothing', F.p, async () => {
      const c0 = (await api.get(F, '/me/entitlements')).data.credits.balance
      await F.p.getByRole('button', { name: 'Quick edits' }).click()
      await F.p.getByRole('menuitem', { name: 'Improve writing' }).click()
      await F.p.getByRole('dialog').filter({ hasText: /Pro plan/ }).first().waitFor({ timeout: 8000 })
      expect((await api.get(F, '/me/entitlements')).data.credits.balance === c0, 'Starter was charged')
    })
    await F.ctx.close()
  } finally { await b.close() }
  return s.done()
}
