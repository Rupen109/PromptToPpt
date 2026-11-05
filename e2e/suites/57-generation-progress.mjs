import { EDITOR, expect, launch, startBuild, suite } from '../lib.mjs'
import { STATE } from './02-auth.mjs'

/**
 * The progress screen while a deck is written (real AI, two 10-slide decks, a few cents): the person sees the stages, a bar and the slides ticking off with their real
 * titles; the editor does not open before the deck is complete, then opens by itself with every slide written; and "Open the editor now" opens it early.
 */
const PROMPT = 'A 10 slide pitch for Aroma Coffee Roasters, a small-batch coffee roastery with 4 stores, for local investors. Do not use any statistics.'

export default async function () {
  const s = suite('57-generation-progress')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, storageState: STATE })
  const p = await ctx.newPage()

  /** from the home prompt to the moment generation starts (the summary's Start button, or the first length) */
  const begin = async () => {
    await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await p.getByLabel('Presentation prompt').fill(PROMPT)
    await p.getByRole('button', { name: 'Create Presentation' }).click(); await p.waitForURL(/\/create/, { timeout: 10000 })
    await startBuild(p)
  }
  const rows = () => p.evaluate(() => [...document.querySelectorAll('[data-testid=build-slides] li')].map((li) => ({ state: li.getAttribute('data-state'), title: (li.textContent ?? '').replace(/, (written|being written|waiting)$/, '').trim() })))
  const editorState = () => p.evaluate(() => ({ placeholders: document.querySelectorAll('[data-writing]').length, slides: document.querySelectorAll('[aria-label^="Slide "]').length }))

  try {
    await s.check('A1 the progress screen shows the stages, a bar and the slides ticking off with real titles; the editor opens only when the deck is complete, by itself, with every slide written', p, async () => {
      await begin()
      await p.getByRole('progressbar').waitFor({ timeout: 10000 })
      expect(await p.getByRole('list', { name: 'Steps' }).count() === 1, 'no steps')
      let sawTitles = false, sawDone = false
      for (let i = 0; i < 200 && !/\/edit\//.test(p.url()); i++) {
        const r = await rows()
        if (r.length >= 5 && r.every((x) => !/^(\d+)?Slide \d+$/.test(x.title))) sawTitles = true
        if (r.some((x) => x.state === 'done')) sawDone = true
        await p.waitForTimeout(500)
      }
      expect(/\/edit\//.test(p.url()), 'the editor never opened')
      expect(sawTitles, 'the slides never showed their real titles')
      expect(sawDone, 'no slide was ever shown as written before the editor opened')
      await p.locator('[aria-label^="Slide "]').first().waitFor({ timeout: 15000 })
      const e = await editorState()
      expect(e.placeholders === 0, `${e.placeholders} slides were still being written when the editor opened by itself`)
    })

    await s.check('A2 "Open the editor now" appears once a slide is written and opens the editor (the job is held at "writing" in the browser so the button is not a race)', p, async () => {
      // hold the page's view of the job at "writing": the real deck still gets written, but the page never sees it complete and so never opens it by itself
      await p.route('**/api/v1/generation/jobs/*', async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        const res = await route.fetch(); const j = await res.json()
        if (j.data && j.data.status === 'completed') { j.data.status = 'generating'; j.data.progress = 60 }
        await route.fulfill({ response: res, json: j })
      })
      await begin()
      await p.getByRole('progressbar').waitFor({ timeout: 10000 })
      const open = p.getByRole('button', { name: 'Open the editor now' })
      await open.waitFor({ timeout: 120000 })
      expect(/\/create/.test(p.url()), 'the editor opened by itself although the page was told the job is not finished')
      await p.waitForFunction(() => document.querySelectorAll('[data-testid=build-slides] li[data-state=done]').length >= 8, null, { timeout: 120000 })
      await open.click(); await p.waitForURL(/\/edit\//, { timeout: 15000 })
      await p.locator('[aria-label^="Slide "]').first().waitFor({ timeout: 15000 })
      await p.unroute('**/api/v1/generation/jobs/*')
    })
  } finally { await b.close() }
  return s.done()
}
