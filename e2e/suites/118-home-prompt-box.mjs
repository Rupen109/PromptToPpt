import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { person } from '../kits-lib.mjs'

/**
 * The home prompt box (apps/editor HomePage + components/StartFromMenu.tsx): the text, then ONE bar — Add files or links · Start from · language · Create.
 * "Start from" is one selector for how the deck starts (your prompt, a file's design, remixing a PowerPoint), each with a line saying what it does;
 * it works from the keyboard; the paid choices show the Pro lock on Starter. No AI is called.
 */
export default async function () {
  const s = suite('118-home-prompt-box')
  const b = await launch()
  try {
    const A = await person(b, 'homebox', 'pro')
    const { p } = A
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByLabel('Presentation prompt').waitFor({ timeout: 20000 })
    const form = p.locator('form').filter({ has: p.getByLabel('Presentation prompt') })
    const menu = p.getByRole('menu', { name: 'Start from' })

    await s.check('one clear bar under the text: Add files or links, Start from, the deck language and Create; the old strip of buttons and paragraph is gone', p, async () => {
      for (const name of [/Add files/, /Start from/, 'Create Presentation']) expect(await form.getByRole('button', { name }).count() === 1, `${name} missing`)
      expect(await form.getByLabel('Deck language').count() === 1, 'no language')
      expect(await p.getByTestId('file-design-strip').count() === 0, 'the old dashed strip is still there')
      expect(!/Upload a PowerPoint and make a new presentation in exactly its look/.test(await form.innerText()), 'the old paragraph is still in the box')
      expect(/Your prompt/.test(await p.getByTestId('start-from').innerText()), 'the selector does not say the default')
    })

    await s.check('Start from lists the three ways with a line each saying what it does; the chosen one is ticked', p, async () => {
      await p.getByTestId('start-from').click()
      await menu.waitFor()
      const t = await menu.innerText()
      for (const x of ['Your prompt', "A file's design", 'Remix a PowerPoint', 'AI writes the slides', 'keeps its colours, fonts and layouts', 'new version']) expect(t.includes(x), `"${x}" missing: ${t}`)
      expect(await menu.getByRole('menuitemradio', { name: /Your prompt/ }).getAttribute('aria-checked') === 'true', 'the default is not ticked')
      expect(await menu.getByText('Pro', { exact: true }).count() === 0, 'a Pro lock is shown on a Pro plan')
    })

    await s.check('keyboard: the menu opens on the chosen item, arrows move, Escape closes it and returns to the selector', p, async () => {
      expect(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'start-prompt', 'focus did not start on the chosen item')
      await p.keyboard.press('ArrowDown')
      expect(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'file-tpl-open', 'ArrowDown did not move')
      await p.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached', timeout: 3000 })
      expect(await p.evaluate(() => document.activeElement?.getAttribute('data-testid')) === 'start-from', 'focus did not come back to the selector')
    })

    await s.check('"A file\'s design" opens the upload window, and "Remix a PowerPoint" opens its own dialog', p, async () => {
      await p.getByTestId('start-from').click(); await p.getByTestId('file-tpl-open').click()
      await p.getByText(/Drop a PowerPoint \(\.pptx\) or PDF here/).waitFor({ timeout: 8000 })
      await p.keyboard.press('Escape'); await p.waitForTimeout(300)
      await p.getByTestId('start-from').click(); await p.getByTestId('remix-pptx-open').click()
      await p.getByRole('dialog', { name: 'Remix a PowerPoint' }).waitFor({ timeout: 8000 })
      await p.keyboard.press('Escape')
    })

    await s.check('a click outside closes the menu; typing in the box still works', p, async () => {
      await p.getByTestId('start-from').click(); await menu.waitFor()
      await p.getByLabel('Presentation prompt').click()
      await menu.waitFor({ state: 'detached', timeout: 3000 })
      await p.getByLabel('Presentation prompt').fill('A pitch for Lighthouse Coffee')
      expect(await p.getByLabel('Presentation prompt').inputValue() === 'A pitch for Lighthouse Coffee', 'typing broke')
    })

    await s.check('phone: the bar wraps neatly, nothing scrolls sideways, and the menu fits the screen', p, async () => {
      await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300)
      expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the page scrolls sideways')
      await p.getByTestId('start-from').click(); await menu.waitFor()
      const box = await menu.boundingBox()
      expect(box.x >= 0 && box.x + box.width <= 390, `the menu runs off the screen: ${JSON.stringify(box)}`)
      await p.keyboard.press('Escape'); await p.setViewportSize({ width: 1500, height: 950 })
    })
    await A.ctx.close()

    const S = await person(b, 'homeboxfree')
    await s.check('Starter: the two paid ways show the Pro lock; choosing one shows the upgrade message, not the upload', S.p, async () => {
      await S.p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
      await S.p.getByTestId('start-from').click()
      // the locks follow the account's plan, which the page loads alongside everything else
      for (const id of ['file-tpl-open', 'remix-pptx-open']) await S.p.getByTestId(id).getByText('Pro', { exact: true }).waitFor({ timeout: 8000 })
      await S.p.getByTestId('file-tpl-open').click()
      await S.p.getByRole('dialog').filter({ hasText: /Pro, Gold and Premium/ }).waitFor({ timeout: 8000 })
    })
    await S.ctx.close()
  } finally { await b.close() }
  return s.done()
}
