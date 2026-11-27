import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person } from '../kits-lib.mjs'

/**
 * Present mode's controls (apps/editor components/present): the bottom bars show on activity and fade after a few seconds of stillness; previous / next / the
 * slide number; clicks on the bars never move the slide; the "more" menu: Restart, Go to end, thumbnails, speaker notes, drawing, autoplay every second, Loop,
 * the animation and highlight switches; Go to editor, Share and Download land in the editor with that window open; the speaker view follows the slideshow
 * and can move it. A template deck (no AI is called).
 */
export default async function () {
  const s = suite('110-present-controls')
  const b = await launch()
  try {
    const A = await person(b, 'present', 'pro')
    const { p } = A
    const made = await api.post(A, '/presentations', { templateId: 'pitch-launchpad' })
    const id = made.data.id
    const n = (await api.get(A, `/presentations/${id}`)).data.document.slides.length
    const bar = p.getByTestId('present-controls')
    const counter = async () => (await bar.innerText()).match(/(\d+)\s*\/\s*(\d+)/)?.slice(1).map(Number) ?? []
    const more = async () => { await p.mouse.move(300, 300); await p.getByRole('button', { name: 'More options' }).click(); await p.getByRole('menu', { name: 'Slideshow options' }).waitFor() }
    const wake = async () => { await p.mouse.move(200 + Math.random() * 50, 200); await p.waitForTimeout(150) }
    await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' })
    await p.getByTestId('present').waitFor({ timeout: 20000 })

    await s.check('the bars show at the start with the slide number, fade after a few seconds of stillness, and come back on a mouse move or a key', p, async () => {
      await p.mouse.move(400, 300)
      expect((await counter()).join('/') === `1/${n}`, `counter ${await counter()}`)
      expect(await bar.evaluate((e) => getComputedStyle(e).opacity) === '1', 'not shown at the start')
      await p.waitForTimeout(3800)
      expect(await bar.evaluate((e) => getComputedStyle(e).opacity) === '0', 'still shown after the mouse stood still')
      await wake(); await p.waitForTimeout(400)
      expect(await bar.evaluate((e) => getComputedStyle(e).opacity) === '1', 'not back after a mouse move')
      await p.waitForTimeout(3800); await p.keyboard.press('Shift'); await p.waitForTimeout(400)
      expect(await bar.evaluate((e) => getComputedStyle(e).opacity) === '1', 'not back after a key')
    })
    await s.check('next and previous move one slide; a click on the bar itself never moves the slide', p, async () => {
      await wake()
      await p.getByRole('button', { name: 'Next slide' }).click()
      await p.getByRole('button', { name: 'Next slide' }).click() // (a slide with effects plays them first: two clicks reach slide 2 or 3)
      const [at] = await counter()
      expect(at >= 2, `next did not move: ${at}`)
      await bar.click({ position: { x: 2, y: 2 } })
      expect((await counter())[0] === at, 'a click on the bar moved the slide')
      for (let k = 0; k < 6 && (await counter())[0] > 1; k++) await p.getByRole('button', { name: 'Previous slide' }).click()
      expect((await counter())[0] === 1, `previous did not go back: ${await counter()}`)
      expect(await p.getByRole('button', { name: 'Previous slide' }).isDisabled(), 'Previous is not greyed out on the first slide')
    })
    await s.check('Go to end and Restart', p, async () => {
      await more(); await p.getByRole('menuitem', { name: 'Go to end' }).click()
      expect((await counter())[0] === n, `not at the end: ${await counter()}`)
      await more(); await p.getByRole('menuitem', { name: 'Restart' }).click()
      expect((await counter())[0] === 1, `not back at 1: ${await counter()}`)
    })
    await s.check('thumbnails: every slide, picking one goes there; Esc closes', p, async () => {
      await more(); await p.getByRole('menuitem', { name: 'View slide thumbnails' }).click()
      const grid = p.getByRole('dialog', { name: 'Slide thumbnails' })
      await grid.waitFor()
      expect(await grid.getByRole('button', { name: /^Go to slide/ }).count() === n, 'not every slide is shown')
      await grid.getByRole('button', { name: 'Go to slide 3' }).click()
      await grid.waitFor({ state: 'detached' })
      expect((await counter())[0] === 3, `not on slide 3: ${await counter()}`)
      await p.keyboard.press('g'); await grid.waitFor(); await p.keyboard.press('Escape'); await grid.waitFor({ state: 'detached' })
      expect(/\/present\//.test(p.url()), 'Esc on the thumbnails left the slideshow')
    })
    await s.check('speaker notes open and close from the menu', p, async () => {
      await more(); await p.getByRole('menuitem', { name: 'Speaker notes' }).click()
      await p.getByRole('region', { name: 'Speaker notes' }).waitFor()
      await more(); await p.getByRole('menuitem', { name: 'Hide speaker notes' }).click()
      await p.getByRole('region', { name: 'Speaker notes' }).waitFor({ state: 'detached' })
    })
    await s.check('drawing: ink goes on the slide, clicks while drawing do not move it, Done ends it', p, async () => {
      const [at] = await counter()
      await more(); await p.getByRole('menuitem', { name: 'Draw' }).click()
      const pad = p.getByTestId('present-draw'); await pad.waitFor()
      await p.mouse.move(500, 300); await p.mouse.down(); await p.mouse.move(700, 400, { steps: 8 }); await p.mouse.up()
      const ink = await pad.evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) k++; return k })
      expect(ink > 50, `no ink drawn: ${ink}`)
      expect((await counter())[0] === at, 'drawing moved the slide')
      await p.getByRole('button', { name: 'Done' }).click(); await pad.waitFor({ state: 'detached' })
    })
    await s.check('autoplay every second moves on by itself; the play button stops it; Loop goes from the last slide to the first', p, async () => {
      await more(); await p.getByRole('menuitem', { name: 'Restart' }).click()
      await more(); await p.getByRole('menuitemcheckbox', { name: 'Every second' }).click()
      await p.waitForTimeout(4500)
      const [moved] = await counter()
      expect(moved >= 2, `autoplay did not move: ${moved}`)
      await wake(); await p.getByRole('button', { name: 'Stop autoplay' }).click()
      const [stopped] = await counter(); await p.waitForTimeout(2500)
      expect((await counter())[0] === stopped, 'autoplay did not stop')
      await p.getByRole('menu', { name: 'Slideshow options' }).count() || await more()
      if (!(await p.getByRole('menu', { name: 'Slideshow options' }).count())) await more()
      await p.getByRole('menuitemcheckbox', { name: 'Loop' }).click()
      await p.getByRole('menuitem', { name: 'Go to end' }).click()
      await wake()
      for (let k = 0; k < 6 && (await counter())[0] === n; k++) await p.getByRole('button', { name: 'Next slide' }).click() // (the last slide's own effects play first)
      expect((await counter())[0] === 1, `Loop did not wrap to the start: ${await counter()}`)
    })
    await s.check('the animation and highlight switches: switch state, and the highlight shows a laser dot that follows the pointer', p, async () => {
      await more()
      const anim = p.getByRole('switch', { name: 'Enable animation' }), hi = p.getByRole('switch', { name: 'Enable highlight in slides' })
      expect((await anim.getAttribute('aria-checked')) === 'true' && (await hi.getAttribute('aria-checked')) === 'false', 'wrong starting switches')
      await anim.click(); await hi.click()
      expect((await anim.getAttribute('aria-checked')) === 'false' && (await hi.getAttribute('aria-checked')) === 'true', 'switches did not change')
      await p.keyboard.press('Escape')
      await p.mouse.move(640, 360); await p.mouse.move(660, 380)
      const dot = await p.getByTestId('laser').boundingBox()
      expect(dot && Math.abs(dot.x + dot.width / 2 - 660) < 4 && Math.abs(dot.y + dot.height / 2 - 380) < 4, `laser not at the pointer: ${JSON.stringify(dot)}`)
    })
    await s.check('speaker view: a second window with the current and next slide and notes; it follows the slideshow and moves it', p, async () => {
      await more(); await p.getByRole('menuitem', { name: 'Restart' }).click()
      const [win] = await Promise.all([p.waitForEvent('popup'), (async () => { await more(); await p.getByRole('menuitem', { name: 'Speaker view' }).click() })()])
      await win.getByTestId('speaker-view').waitFor({ timeout: 20000 })
      await win.getByText('Slide 1 of').waitFor({ timeout: 5000 })
      expect(await win.getByRole('region', { name: /Notes|Speaker notes/ }).count() + await win.getByLabel('Speaker notes').count() > 0, 'no notes area')
      await win.getByRole('button', { name: 'Next' }).click()
      await p.waitForFunction(() => /2\s*\/\s*\d+/.test(document.querySelector('[data-testid=present-controls]')?.textContent ?? ''), null, { timeout: 5000 })
      await p.mouse.move(300, 300); await p.getByRole('button', { name: 'Next slide' }).click(); await p.getByRole('button', { name: 'Next slide' }).click()
      const [now] = await counter()
      await win.getByText(`Slide ${now} of`).waitFor({ timeout: 5000 })
      await win.close()
    })
    await s.check('the speaker view ends the show: Esc (and the End show button) closes it and takes the slideshow back to the editor', p, async () => {
      for (const how of ['button', 'esc']) {
        await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' })
        const [win] = await Promise.all([p.waitForEvent('popup'), (async () => { await more(); await p.getByRole('menuitem', { name: 'Speaker view' }).click() })()])
        await win.getByTestId('speaker-view').waitFor({ timeout: 20000 })
        const closed = win.waitForEvent('close', { timeout: 5000 }) // (listening first: the tab closes at once)
        if (how === 'button') await win.getByRole('button', { name: 'End show' }).click(); else await win.keyboard.press('Escape').catch(() => {}) // (the tab closes on the key itself, before the key is let go)
        await closed
        await p.waitForURL(new RegExp(`/edit/${id}`), { timeout: 8000 })
      }
    })
    await s.check('Esc in the slideshow itself goes back to the editor', p, async () => {
      await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' }); await p.getByTestId('present').waitFor()
      await p.keyboard.press('Escape')
      await p.waitForURL(new RegExp(`/edit/${id}`), { timeout: 8000 })
    })
    await s.check('Share and Download land in the editor with that window open; Go to editor opens the editor', p, async () => {
      await wake(); await p.getByRole('button', { name: 'Share' }).click()
      await p.waitForURL(/\/edit\//, { timeout: 15000 })
      await p.getByRole('dialog').first().waitFor({ timeout: 15000 })
      expect(/share|invite/i.test(await p.getByRole('dialog').first().innerText()), 'the share window did not open')
      expect(!/open=/.test(p.url()), 'the open= request stayed in the address')
      await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' }); await wake()
      await p.getByRole('button', { name: 'Download' }).click()
      await p.waitForURL(/\/edit\//, { timeout: 15000 })
      await p.getByText(/PPTX|PowerPoint/).first().waitFor({ timeout: 15000 })
      await p.goto(`${EDITOR}/present/${id}`, { waitUntil: 'networkidle' }); await wake()
      await p.getByRole('button', { name: 'Go to editor' }).click()
      await p.waitForURL(new RegExp(`/edit/${id}$`), { timeout: 15000 })
    })
    await A.ctx.close()
  } finally { await b.close() }
  return s.done()
}
