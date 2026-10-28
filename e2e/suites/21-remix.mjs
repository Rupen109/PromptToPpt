import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'
import { DECKS } from './03-create.mjs'

/** Duplicate and Remix in the editor's ⋮ menu: Remix is Pro/Gold, builds a NEW deck from this deck's slides (the job request is intercepted: no AI runs here). */
export default async function () {
  const s = suite('21-remix')
  const root = new URL('../..', import.meta.url).pathname
  const email = JSON.parse(readFileSync(ACCOUNT, 'utf8')).email
  const plan = (p) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${email} ${p}`, { cwd: root, stdio: 'pipe' })
  const id = JSON.parse(readFileSync(DECKS, 'utf8')).ai.split('?')[0]
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, storageState: STATE })
  const p = await ctx.newPage()
  const open = async () => { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor({ timeout: 15000 }) }
  const menu = async (name) => { await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name }).click() }
  const dlg = () => p.getByRole('dialog', { name: 'Remix this presentation' })

  try {
    plan('starter')
    await s.check('Starter: Remix opens, and starting it asks to upgrade (the server refuses; nothing is created)', p, async () => {
      await open(); await menu('Remix this presentation…'); await dlg().waitFor({ timeout: 5000 })
      await dlg().getByLabel('How should it change?').fill('A short version for my team'); await dlg().getByRole('button', { name: 'Create remixed copy' }).click()
      await p.getByText(/Pro and Gold/).first().waitFor({ timeout: 8000 })
      expect(/\/edit\//.test(p.url()), 'left the editor')
    })

    plan('pro')
    await s.check('Pro: Duplicate makes a "Copy of …" deck and opens it; the original is untouched', p, async () => {
      await open()
      const title = await p.getByLabel('Presentation title').inputValue()
      await menu('Duplicate presentation')
      await p.waitForURL((u) => /\/edit\//.test(u.pathname) && !u.pathname.endsWith(id), { timeout: 15000 })
      await p.locator('[data-testid="stage"]').waitFor({ timeout: 15000 })
      await p.waitForFunction((t) => document.querySelector('input[aria-label="Presentation title"]')?.value === `Copy of ${t}`, title, { timeout: 15000 })
      const copyId = p.url().split('/edit/')[1].split('?')[0]
      expect(copyId !== id, 'same deck')
      const list = await p.evaluate(() => fetch('http://localhost:4000/api/v1/presentations', { credentials: 'include' }).then((r) => r.json()))
      const ids = list.data.map((d) => d.id)
      expect(ids.includes(id) && ids.includes(copyId), 'both decks should exist')
      await p.evaluate((c) => fetch(`http://localhost:4000/api/v1/presentations/${c}`, { method: 'DELETE', credentials: 'include' }), copyId) // tidy up
    })

    await s.check('Pro: Remix — idea chips fill the box, the credit estimate shows, and starting sends a remix job for THIS deck with its text as the source', p, async () => {
      const jobs = []
      await p.route('**/api/v1/generation/jobs', async (r) => { jobs.push(JSON.parse(r.request().postData() ?? '{}')); await r.fulfill({ contentType: 'application/json', status: 201, body: JSON.stringify({ success: true, data: { id: 'job-remix', status: 'queued', progress: 0, presentationId: null, error: null } }) }) })
      await p.route('**/api/v1/generation/jobs/job-remix', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'job-remix', status: 'generating', progress: 40, presentationId: null, error: null } }) }))
      await open()
      const slides = await p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]').count()
      await menu('Remix this presentation…'); await dlg().waitFor({ timeout: 5000 })
      expect(await dlg().getByRole('button', { name: 'Create remixed copy' }).isDisabled(), 'enabled with no instruction')
      await dlg().getByRole('button', { name: /customer-facing/ }).click()
      expect(/customer-facing/.test(await dlg().getByLabel('How should it change?').inputValue()), 'the idea did not fill the box')
      expect(Number(await dlg().getByLabel('Slides in the new version').inputValue()) === slides, 'default slide count is not the deck\'s')
      await dlg().getByText(/About \d+ credits/).waitFor({ timeout: 8000 })
      await dlg().getByLabel('Slides in the new version').fill('6')
      await dlg().getByRole('button', { name: 'Create remixed copy' }).click()
      await p.waitForURL(/\/create/, { timeout: 15000 })
      await p.getByText('Writing the slides…').waitFor({ timeout: 10000 })
      expect(jobs.length === 1, `expected 1 job request, got ${jobs.length}`)
      expect(jobs[0].remixOf === id && jobs[0].slideCount === 6 && Array.isArray(jobs[0].sourceIds) && jobs[0].sourceIds.length === 1, `job: ${JSON.stringify(jobs[0])}`)
      expect(/customer-facing/.test(jobs[0].prompt), 'the instruction was not sent')
    })

    await s.check('Remix: the slide count follows "N slides" in the instruction until you set it yourself; a two-digit number can be typed', p, async () => {
      await p.unroute('**/api/v1/generation/jobs'); await p.unroute('**/api/v1/generation/jobs/job-remix').catch(() => {})
      await open(); await menu('Remix this presentation…'); await dlg().waitFor({ timeout: 5000 })
      const box = dlg().getByLabel('How should it change?')
      await box.click(); await box.pressSequentially('Make it 7 slides', { delay: 30 }) // key by key: focus must stay in the box after every character
      expect(await box.inputValue() === 'Make it 7 slides', `typing lost focus: "${await box.inputValue()}"`)
      const n = dlg().getByLabel('Slides in the new version')
      expect(await n.inputValue() === '7', `count did not follow the typed instruction: ${await n.inputValue()}`)
      await dlg().getByLabel('How should it change?').fill('A 6 slides version for customers')
      expect(await n.inputValue() === '6', `count did not follow the instruction: ${await n.inputValue()}`)
      await n.click({ clickCount: 3 }); await n.pressSequentially('12') // select the number and type over it, digit by digit, like a person
      expect(await n.inputValue() === '12', `typing 12 gave ${await n.inputValue()} before leaving the box`)
      await dlg().getByLabel('How should it change?').click()
      expect(await n.inputValue() === '12', `typing 12 gave ${await n.inputValue()}`)
      await dlg().getByLabel('How should it change?').fill('A 4 slides version for customers')
      expect(await n.inputValue() === '12', 'the count you typed was overwritten')
      await n.fill('999'); await n.blur()
      expect(Number(await n.inputValue()) <= 40, 'the count is not limited to the plan')
      await p.keyboard.press('Escape')
    })

    await s.check('Remix saves what is on screen first (a remix reads the saved deck)', p, async () => {
      const log = []
      p.on('request', (r) => { const u = new URL(r.url()); if (r.method() !== 'GET' && u.pathname.includes(`/presentations/${id}`)) log.push(`${r.method()} ${u.pathname.replace(/.*presentations\/[^/]+/, '') || '/'}`) })
      await p.route('**/api/v1/generation/jobs', (r) => r.fulfill({ contentType: 'application/json', status: 500, body: JSON.stringify({ success: false, error: { code: 'TEST_STOP', message: 'stopped by the test' } }) }))
      await open()
      const title = p.getByLabel('Presentation title'); await title.fill(`Saved first ${Date.now()}`); await title.blur()
      await menu('Remix this presentation…'); await dlg().waitFor({ timeout: 5000 })
      await dlg().getByLabel('How should it change?').fill('A short version'); await dlg().getByRole('button', { name: 'Create remixed copy' }).click()
      await dlg().getByRole('alert').waitFor({ timeout: 10000 }) // the stub refuses the job; we only care what happened before
      const save = log.findIndex((l) => l.startsWith('PUT')), source = log.findIndex((l) => l.includes('remix-source'))
      expect(source >= 0 && save >= 0 && save < source, `order of requests: ${log.join(' | ')}`)
      await p.unroute('**/api/v1/generation/jobs')
    })

    await s.check('Remix tells you how many hand-edited slides it will use "as they look now" (nothing is silently dropped)', p, async () => {
      await open()
      const marked = await p.evaluate(async (deckId) => {
        const g = await fetch(`http://localhost:4000/api/v1/presentations/${deckId}`, { credentials: 'include' }).then((r) => r.json())
        const doc = g.data.document; doc.slides[0].manual = true
        const r = await fetch(`http://localhost:4000/api/v1/presentations/${deckId}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: g.data.revision, document: doc, snapshot: false }) })
        return r.status
      }, id)
      expect(marked === 200, `could not mark a slide as hand-edited (${marked})`)
      await open(); await menu('Remix this presentation…'); await dlg().waitFor({ timeout: 5000 })
      await dlg().getByText(/1 slide you edited by hand will be remixed as it looks now, with your changes\./).waitFor({ timeout: 5000 })
      expect(!/left out/.test(await dlg().innerText()), 'the dialog still says slides are left out')
      await p.keyboard.press('Escape')
    })
  } finally {
    plan('starter')
    await b.close()
  }
  return s.done()
}
