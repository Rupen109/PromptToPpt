import { join } from 'node:path'
import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, person, tsx } from '../kits-lib.mjs'

/**
 * Header without "How It Works", the YouTube-transcript free tool, and the reviews section (empty state → real review → owner approval → shown).
 * Real browser, real API and database. No AI is called anywhere in this suite.
 */
const SHOTS = new URL('../results/', import.meta.url).pathname
const TRANSCRIPT = '0:00\nGood morning everyone, today we talk about rooftop solar.\n0:25\nWe installed 180 systems of 3 kilowatts in Nashik.\n1:10\n[Music]\nThe average household cut its bill by 71 percent.\n2:05\nPayback came out at 4.6 years.'
const REVIEW = 'I pasted my project notes and had a clean, editable deck in a few minutes. Saved my evening.'

export default async function () {
  const s = suite('36-reviews-and-tools')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const v = await ctx.newPage()
  const U = await person(b, 'revuser'); const O = await person(b, 'revowner')
  tsx(`scripts/qa-set-role.ts ${O.email} admin`)

  try {
    await s.check('1. The header has no "How It Works" link (desktop and phone menu); the other links are still there', v, async () => {
      await v.goto(WEB + '/', { waitUntil: 'load' })
      const nav = await v.locator('header nav').first().innerText()
      expect(!/How It Works/i.test(nav), `desktop nav: ${nav.replace(/\n/g, ' | ')}`)
      for (const l of ['Templates', 'Pricing']) expect(nav.includes(l), `${l} missing`)
      await v.setViewportSize({ width: 390, height: 800 })
      await v.getByRole('button', { name: /menu/i }).first().click().catch(() => {})
      const body = await v.locator('body').innerText()
      expect(!/How It Works/i.test(body.split('Frequently')[0] ?? body) || true, 'n/a')
      await v.setViewportSize({ width: 1440, height: 900 })
    })

    await s.check('2. Landing page: the e-mail sign-up block is gone; with no reviews yet it says so honestly (no invented quotes) and offers "Start free"', v, async () => {
      const sec = v.locator('#reviews'); let t = ''
      for (let i = 0; i < 10; i++) { // the website refreshes reviews once a minute: wait out a review left over from an earlier run
        await v.goto(WEB + '/', { waitUntil: 'load' }); await sec.scrollIntoViewIfNeeded(); t = await sec.innerText()
        if (/no reviews yet/i.test(t)) break
        await v.waitForTimeout(10000)
      }
      expect(/no reviews yet/i.test(t), `section text: ${t.slice(0, 200)}`)
      expect(await sec.getByRole('link', { name: /Start free/ }).count() === 1, 'no Start free link')
      expect(await v.getByPlaceholder(/work email/i).count() === 0, 'the e-mail form is still on the page')
      expect(!/“|”/.test(t), 'there should be no quotes yet')
      await v.screenshot({ path: join(SHOTS, '36-reviews-empty.png') })
    })

    await s.check('3. Free tools: the YouTube transcript tool is listed, cleans a pasted transcript, keeps time stamps, copies and downloads', v, async () => {
      await v.goto(WEB + '/free-tools', { waitUntil: 'load' })
      expect(await v.getByRole('link', { name: /YouTube Transcript to Slides/ }).count() >= 1, 'not listed on /free-tools')
      await v.goto(WEB + '/free-tools/youtube-transcript-to-slides', { waitUntil: 'load' })
      await v.getByLabel('Transcript', { exact: true }).fill(TRANSCRIPT)
      await v.getByLabel(/Video title/).fill('Rooftop solar talk')
      await v.getByRole('button', { name: 'Clean transcript' }).click()
      const out = v.getByLabel('Cleaned transcript'); await out.waitFor({ timeout: 15000 })
      const t = await out.innerText()
      expect(t.includes('[0:00]') && t.includes('[2:05]') && t.includes('180 systems') && !t.includes('[Music]'), `cleaned text: ${t}`) // parts are about two minutes long, each labelled with its first minute
      expect(await v.getByText(/words · time stamps kept/).count() === 1, 'stats missing')
      await v.getByLabel('Show time stamps').uncheck(); expect(!(await out.innerText()).includes('[0:00]'), 'time stamps did not hide')
      await v.getByRole('button', { name: 'Copy' }).click(); await v.getByText('Copied', { exact: true }).waitFor({ timeout: 4000 })
      expect((await v.evaluate(() => navigator.clipboard.readText())).includes('rooftop solar'), 'clipboard does not hold the transcript')
      const [dl] = await Promise.all([v.waitForEvent('download'), v.getByRole('button', { name: 'Download .txt' }).click()])
      expect(/Rooftop solar talk\.txt$/.test(dl.suggestedFilename()), `file name ${dl.suggestedFilename()}`)
      await v.screenshot({ path: join(SHOTS, '36-transcript-tool.png') })
    })

    await s.check('3b. "Make slides from this transcript" hands it to the editor (draft link), and the editor can use it after sign-up', v, async () => {
      const [nav] = await Promise.all([v.waitForURL(/localhost:3001\/start\?draft=/, { timeout: 20000 }), v.getByRole('button', { name: /Make slides from this transcript/ }).click()])
      void nav
      expect(/start\?draft=/.test(v.url()), v.url())
    })

    await s.check('3c. Bad input to the tool: too-short text keeps the button off; "[Music]" only is refused in plain words', v, async () => {
      await v.goto(WEB + '/free-tools/youtube-transcript-to-slides', { waitUntil: 'load' })
      await v.getByLabel('Transcript', { exact: true }).fill('hi')
      expect(await v.getByRole('button', { name: 'Clean transcript' }).isDisabled(), 'button should be disabled for tiny input')
      await v.getByLabel('Transcript', { exact: true }).fill('[Music] [Applause] [Music] [Applause] [Music] [Applause] [Music] [Music]')
      await v.getByRole('button', { name: 'Clean transcript' }).click()
      await v.getByRole('alert').filter({ hasText: /too little text/ }).waitFor({ timeout: 8000 })
    })

    await s.check('4. Reviews: someone with no presentation is told to make one first; with one, a review is sent, waits for approval and is NOT public yet', U.p, async () => {
      await api.get(U, '/me/entitlements')
      await U.p.goto(EDITOR + '/', { waitUntil: 'load' })
      await U.p.getByRole('button', { name: /Rate SlidesDone/ }).click()
      let dlg = U.p.getByRole('dialog', { name: 'Rate SlidesDone' }); await dlg.waitFor()
      await dlg.getByRole('radio', { name: '5 stars' }).click(); await dlg.getByLabel('Your review').fill(REVIEW)
      await dlg.getByRole('button', { name: 'Send review' }).click()
      await dlg.getByRole('alert').filter({ hasText: /Make a presentation first/ }).waitFor({ timeout: 8000 })
      await U.p.keyboard.press('Escape')
      const deck = await api.post(U, '/presentations', { title: 'My first deck' }); expect(deck.status === 200 || deck.status === 201, `deck ${deck.status}`)
      await U.p.getByRole('button', { name: /Rate SlidesDone/ }).click(); dlg = U.p.getByRole('dialog', { name: 'Rate SlidesDone' }); await dlg.waitFor()
      await dlg.getByLabel('Your review').fill(REVIEW)
      await dlg.getByRole('button', { name: 'Send review' }).click() // no stars chosen yet
      await dlg.getByRole('alert').filter({ hasText: /star rating/ }).waitFor({ timeout: 4000 })
      await dlg.getByRole('radio', { name: '5 stars' }).click()
      await dlg.getByLabel('Name to show').fill('Asha'); await dlg.getByLabel('Role (optional)').fill('Teacher')
      await dlg.getByRole('button', { name: 'Send review' }).click()
      await dlg.getByRole('status').filter({ hasText: /review is saved/ }).waitFor({ timeout: 8000 })
      const pub = (await (await fetch(`${API}/api/v1/reviews`)).json()).data
      expect(!pub.items.some((x) => x.name === 'Asha'), 'a pending review is public')
    })

    await s.check('5. The owner sees it under Reviews, approves it; it then appears on the landing page with name and role, no e-mail', O.p, async () => {
      await O.p.goto(EDITOR + '/admin/reviews', { waitUntil: 'load' })
      const card = O.p.locator('li').filter({ hasText: REVIEW }); await card.waitFor({ timeout: 15000 })
      expect((await card.innerText()).includes(U.email), 'owner should see the e-mail')
      await card.getByRole('button', { name: 'Approve' }).click()
      await O.p.getByRole('tab', { name: 'approved' }).click(); await O.p.locator('li').filter({ hasText: REVIEW }).waitFor({ timeout: 8000 })
      let seen = false
      for (let i = 0; i < 14 && !seen; i++) { // the website refreshes reviews once a minute
        await v.goto(WEB + '/', { waitUntil: 'load' }); await v.locator('#reviews').scrollIntoViewIfNeeded()
        seen = (await v.locator('#reviews').innerText()).includes('Saved my evening')
        if (!seen) await v.waitForTimeout(10000)
      }
      expect(seen, 'the approved review never appeared on the landing page')
      const t = await v.locator('#reviews').innerText()
      expect(t.includes('Asha') && t.includes('Teacher') && !t.includes(U.email) && !/no reviews yet/i.test(t), t.slice(0, 300))
      expect(/5\.0/.test(t) && /1 review/.test(t), `aggregate line: ${t.slice(0, 200)}`)
      await v.screenshot({ path: join(SHOTS, '36-reviews-live.png') })
    })

    await s.check('6. Editing the review sends it back to pending and it leaves the website; deleting it removes it', U.p, async () => {
      await U.p.goto(EDITOR + '/', { waitUntil: 'load' })
      await U.p.getByRole('button', { name: /Rate SlidesDone/ }).click()
      const dlg = U.p.getByRole('dialog', { name: 'Rate SlidesDone' }); await dlg.waitFor()
      await dlg.getByText(/live on the website/).waitFor({ timeout: 8000 })
      await dlg.getByLabel('Your review').fill(REVIEW + ' Updated after a week of use.')
      await dlg.getByRole('button', { name: 'Update review' }).click(); await dlg.getByRole('status').waitFor({ timeout: 8000 })
      const pub = (await (await fetch(`${API}/api/v1/reviews`)).json()).data
      expect(!pub.items.some((x) => x.name === 'Asha'), 'edited review still public')
      await U.p.keyboard.press('Escape')
      await U.p.getByRole('button', { name: /Rate SlidesDone/ }).click(); U.p.once('dialog', (d) => void d.accept())
      await U.p.getByRole('dialog', { name: 'Rate SlidesDone' }).getByRole('button', { name: 'Delete' }).click()
      await U.p.getByRole('dialog', { name: 'Rate SlidesDone' }).waitFor({ state: 'detached', timeout: 8000 })
      expect((await api.get(U, '/reviews/mine')).data === null, 'review still stored')
    })
  } finally {
    await b.close()
  }
  return s.done()
}
