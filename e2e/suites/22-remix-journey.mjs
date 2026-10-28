import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { API, EDITOR, RESULTS, WEB, expect, launch, suite, uniqueEmail } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'

/**
 * Remix and Duplicate, the way a person uses them: real browser, real server, real database, REAL AI (dev provider).
 * Follows docs/REMIX_FUNCTIONAL_FLOWS.md. Costs real money (a few rupees): it runs ~4 small real remixes.
 */
export default async function () {
  const s = suite('22-remix-journey')
  // REMIX_ONLY=B4 runs only the checks whose name starts with that text (handy to re-run one flow without paying for the real-AI ones)
  if (process.env.REMIX_ONLY) { const check = s.check.bind(s); s.check = (name, ...rest) => (name.startsWith(process.env.REMIX_ONLY) ? check(name, ...rest) : undefined) }
  const cwd = new URL('../..', import.meta.url).pathname
  const api = (cmd) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim().split('\n').pop()
  const owner = JSON.parse(readFileSync(ACCOUNT, 'utf8'))
  const db = (cmd, arg = '') => JSON.parse(api(`scripts/qa-remix-check.ts ${cmd} ${owner.email} ${arg}`))
  const plan = (p) => api(`scripts/qa-grant-plan.ts ${owner.email} ${p}`)
  const PNG = new URL('../../apps/web/public/apple-touch-icon.png', import.meta.url).pathname
  const canon = (x) => JSON.stringify(x, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  plan('pro')
  const since = new Date().toISOString()
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, storageState: STATE })
  const p = await ctx.newPage()
  p.on('dialog', (d) => void d.accept())
  const J = (path, init) => p.evaluate(async ([path, init]) => { const r = await fetch('http://localhost:4000/api/v1' + path, { credentials: 'include', ...(init ?? {}), headers: { 'Content-Type': 'application/json' } }); return r.json() }, [path, init ? { method: init.method, body: init.body ? JSON.stringify(init.body) : undefined } : undefined])
  const doc = async (id) => (await J(`/presentations/${id}`)).data.document
  const saved = () => p.waitForFunction(() => [...document.querySelectorAll('[role=status]')].some((e) => /^Saved$/.test(e.textContent.trim())), null, { timeout: 20000 })
  const more = async (name) => { await p.getByRole('button', { name: 'More' }).click(); await p.getByRole('menuitem', { name }).click() }
  const dlg = () => p.getByRole('dialog', { name: 'Remix this presentation' })
  const stage = () => p.locator('[data-testid="stage"]')
  const logos = () => p.locator('[data-testid="stage"] img[alt$="logo"]').count()
  const open = async (id) => { await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await stage().waitFor({ timeout: 20000 }) }
  const texts = (d) => JSON.stringify(d.slides.map((x) => { const walk = (v) => (Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !['imageUrl', 'imagePrompt', 'imageAlt', 'imageAttribution', 'sources', 'id'].includes(k)).map(([k, x]) => [k, walk(x)])) : v); return walk(x.content) }))
  const numbers = (t) => new Set((t.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]+$/, ''))) // "200," at the end of a clause is the number 200
  const chooseModel = async () => { const sel = dlg().getByLabel('AI model'); const opts = await sel.locator('option').allInnerTexts(); const label = opts.find((o) => /3\.6 Flash/.test(o)) ?? opts[0]; await sel.selectOption({ label }); return Number(/(\d+) credits\/slide/.exec(label)?.[1] ?? 0) }
  const startRemix = async ({ text, slides, dbl = false }) => {
    await more('Remix this presentation…'); await dlg().waitFor({ timeout: 8000 })
    const price = await chooseModel()
    const box = dlg().getByLabel('How should it change?'); await box.click(); await box.pressSequentially(text, { delay: 8 })
    const n = dlg().getByLabel('Slides in the new version'); await n.click({ clickCount: 3 }); await n.pressSequentially(String(slides)); await box.click()
    const btn = dlg().getByRole('button', { name: 'Create remixed copy' })
    if (dbl) await btn.dblclick(); else await btn.click()
    return price
  }
  const waitNewDeck = async (origId, ms = 300000) => { await p.waitForURL((u) => /\/edit\/[^/]+/.test(u.pathname) && !u.pathname.includes(origId), { timeout: ms }); await stage().waitFor({ timeout: 30000 }); return p.url().split('/edit/')[1].split('?')[0] }

  // ── setup: an original deck with a brand logo and a real hand edit ───────────────────────────────────────────
  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  for (const k of (await J('/brand/kits')).data.kits) await J(`/brand/kits/${k.id}`, { method: 'DELETE' })
  const title0 = `Journey original ${Date.now() % 100000}`
  const orig = (await J('/presentations', { method: 'POST', body: { templateId: 'pitch-launchpad', aspectRatio: '4:3', title: title0 } })).data.id
  const MARK = 'ZETA-77 hand edit'
  let before // the original's document right before the remix

  await s.check('A1/D8/D7 setup — owner sees Remix + Duplicate; a brand kit with a logo is applied; the first slide is edited by hand in the editor', p, async () => {
    await open(orig)
    await p.getByRole('button', { name: 'More' }).click()
    expect(await p.getByRole('menuitem', { name: 'Duplicate presentation' }).isVisible() && await p.getByRole('menuitem', { name: 'Remix this presentation…' }).isVisible(), 'owner does not see both items')
    await p.keyboard.press('Escape')
    await p.getByRole('toolbar').getByRole('button').nth(1).click(); await p.getByRole('tab', { name: 'Brand' }).click()
    await p.getByRole('button', { name: 'New brand kit' }).click()
    const kit = p.getByLabel('Brand kit details'); await kit.waitFor({ timeout: 8000 })
    await kit.getByLabel('Kit name').fill('Journey Brand'); await kit.getByLabel('Main colour').fill('#e4572e'); await kit.getByLabel('Accent colour').fill('#17bebb')
    await kit.getByLabel('Upload logo').setInputFiles(PNG); await kit.getByRole('img', { name: 'Brand logo' }).waitFor({ timeout: 15000 })
    await kit.getByRole('button', { name: 'Save kit' }).click(); await p.getByText('Saved.').waitFor({ timeout: 8000 })
    await p.getByLabel('Apply this kit').getByRole('button', { name: 'Apply to this presentation' }).click()
    await p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 10000 })
    await p.getByRole('button', { name: 'Close style panel' }).click()
    const t = stage().locator('[data-testid="el-text"]').first(); await t.dblclick(); const ed = p.getByLabel('Edit text'); await ed.waitFor({ timeout: 5000 })
    await p.keyboard.press('Meta+a'); await p.keyboard.press('Control+a'); await p.keyboard.type(MARK); await p.keyboard.press('Escape'); await p.mouse.click(5, 500); await saved()
    before = await doc(orig)
    expect(JSON.stringify(before.slides[0].elements).includes(MARK), 'the hand edit is not in the saved deck')
    expect(before.slides[0].manual === true, 'the slide is not marked hand-edited')
  })

  let remixId = ''
  const price = { v: 0 }
  await s.check('D1/D9/D11 — Remix dialog (model choice, typed instruction, count 4), a DOUBLE click creates ONE job, the progress screen survives a reload, and the new deck opens by itself', p, async () => {
    await open(orig)
    price.v = await startRemix({ text: 'A customer-facing summary. Leave out the funding ask and the use of funds. Keep the company name exactly as on the first slide.', slides: 4, dbl: true })
    await p.waitForURL(/\/create/, { timeout: 30000 })
    await p.getByRole('progressbar').waitFor({ timeout: 30000 })
    await p.reload({ waitUntil: 'networkidle' })
    await p.getByRole('progressbar').waitFor({ timeout: 30000 }) // resumed: still generating, not bounced home
    expect(/\/create/.test(p.url()), 'the reload left the progress screen')
    remixId = await waitNewDeck(orig)
    expect(remixId && remixId !== orig, 'no new deck opened')
  })

  await s.check('D2/D3/D6/D8 — the result: 4 slides in the same 4:3 format and theme, logo on every slide, only numbers from the original; the original is exactly as it was', p, async () => {
    const out = await doc(remixId), now = await doc(orig)
    expect(out.aspectRatio === '4:3', `format ${out.aspectRatio}`)
    expect(out.slides.length === 4, `slides ${out.slides.length}`)
    expect(canon(out.theme) === canon(before.theme), 'the theme is not the original\'s')
    expect(out.title && out.title !== title0 && out.title.length > 3, `title "${out.title}"`)
    expect(out.slides.every((x) => x.validation?.status !== 'failed'), 'a slide failed validation')
    const l = await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Slides"] [data-testid^="thumb-"]')].map((t) => t.querySelectorAll('img[alt$="logo"]').length))
    expect(l.length === 4 && l.every((n) => n >= 1), `logo per slide: ${l}`)
    expect(out.sources.length === 0, 'the working source leaked into the deck')
    // what the original SHOWS (its stored text plus anything typed by hand, e.g. the marker) is what the remix may use
    const shown = texts(before) + JSON.stringify(before.slides.map((x) => x.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((q) => q.runs.map((r) => r.text).join('')))))
    const invented = [...numbers(texts(out))].filter((n) => !numbers(shown).has(n) && !['4'].includes(n))
    expect(invented.length === 0, `numbers not in the original: ${invented}`)
    expect(canon(now) === canon(before), 'THE ORIGINAL CHANGED')
    const funding = /use of funds|the ask/i.test(texts(out))
    console.log(`      note: result titles = ${JSON.stringify(out.slides.map((x) => x.content?.title ?? x.layoutId))}; funding content still present: ${funding}; hand-edit marker kept: ${texts(out).includes('ZETA-77')}`)
  })

  await s.check('D5/D7/D11 — credits: exactly one charge of slides × price; one remix job; the AI was handed the hand-edited text', p, async () => {
    const spent = db('spent', since), jobs = db('jobs', since)
    expect(spent.net === 4 * price.v && spent.charges === 1 && spent.refunds === 0, `ledger: ${JSON.stringify(spent)} expected ${4 * price.v} (4 × ${price.v})`)
    expect(jobs.length === 1 && jobs[0].remixOf === orig && jobs[0].slideCount === 4, `jobs: ${JSON.stringify(jobs)}`)
    const src = db('source', since)
    expect(src && src.text.includes(MARK), 'the text typed by hand was not in what the AI was given')
  })

  await s.check('D4/F4 — the library lists both decks; the remix opens from the list; Back from the new deck does not land on a broken page', p, async () => {
    await p.goto(EDITOR + '/created', { waitUntil: 'networkidle' })
    const t = await p.locator('main').innerText()
    expect(t.includes(title0), 'the original is not in the library')
    const out = await doc(remixId)
    expect(t.includes(out.title.slice(0, 20)), `the remix "${out.title}" is not in the library`)
    await p.getByText(out.title.slice(0, 20), { exact: false }).first().click(); await p.waitForURL(new RegExp(`/edit/${remixId}`), { timeout: 15000 })
    await stage().waitFor({ timeout: 15000 })
    await p.goBack(); await p.waitForTimeout(1500)
    expect(!(await p.locator('body').innerText()).match(/Something went wrong|Cannot|undefined|not found/i), 'Back landed on an error page')
  })

  await s.check('E1–E5 — the remix is a normal deck: edit persists, present mode, PPTX export (4 slides), template change keeps the logo, AI assistant works', p, async () => {
    await open(remixId)
    const t = `Remix edited ${Date.now() % 100000}`; const inp = p.getByLabel('Presentation title'); await inp.fill(t); await inp.press('Enter'); await saved()
    await p.reload({ waitUntil: 'networkidle' }); expect(await p.getByLabel('Presentation title').inputValue() === t, 'edit lost after reload')
    const pp = await ctx.newPage(); await pp.goto(`${EDITOR}/present/${remixId}`, { waitUntil: 'networkidle' }); await pp.waitForTimeout(1500)
    expect((await pp.locator('body').innerText()).trim().length > 10, 'present mode is empty'); await pp.close()
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), (async () => { await p.getByRole('button', { name: /^Export/ }).click(); await p.getByRole('menuitem', { name: /^PPTX/ }).click() })()])
    const f = join(RESULTS, `remix-${Date.now()}.pptx`); await dl.saveAs(f)
    const slides = Object.keys(unzipSync(new Uint8Array(readFileSync(f)))).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)).length
    expect(slides === 4, `PPTX has ${slides} slides`)
    await p.getByRole('toolbar').getByRole('button').nth(1).click(); await p.getByRole('tab', { name: 'Templates' }).click()
    await p.locator('aside[aria-label=Style] button[aria-label$=" template"]').first().click(); await p.waitForTimeout(1000)
    expect(await logos() >= 1, 'the logo disappeared after a template change'); await p.getByRole('button', { name: 'Close style panel' }).click()
    await p.getByRole('button', { name: /Edit with AI/ }).click(); const panel = p.getByRole('complementary', { name: 'AI assistant' }); await panel.waitFor({ timeout: 8000 })
    await panel.getByLabel('AI model').locator('option', { hasText: '3.6 Flash' }).waitFor({ state: 'attached', timeout: 15000 }) // the model list loads after the panel opens
    await panel.getByLabel('AI model').selectOption({ label: (await panel.getByLabel('AI model').locator('option').allInnerTexts()).find((o) => /3\.6 Flash/.test(o)) })
    await panel.getByLabel('Message to the AI assistant').fill('animate every slide'); await panel.getByRole('button', { name: 'Send' }).click()
    await p.getByText('Working on it').waitFor({ state: 'visible', timeout: 15000 }); await p.getByText('Working on it').waitFor({ state: 'detached', timeout: 120000 })
    expect(/animated every slide|Done/i.test(await panel.getByRole('log').innerText()), 'the assistant did not apply the request')
  })

  await s.check('B1/B2/B3/B5/B6 — Duplicate: opens "Copy of …" with the same slides; unsaved edits come along; the copy edits, presents, exports on its own; deleting it leaves the original', p, async () => {
    await open(remixId)
    const t = `Unsaved dup ${Date.now() % 100000}`; await p.getByLabel('Presentation title').fill(t); await p.getByLabel('Presentation title').blur()
    await more('Duplicate presentation')
    await p.waitForURL((u) => /\/edit\//.test(u.pathname) && !u.pathname.includes(remixId), { timeout: 20000 }); await stage().waitFor({ timeout: 20000 })
    const copyId = p.url().split('/edit/')[1].split('?')[0]
    await p.waitForFunction((x) => document.querySelector('input[aria-label="Presentation title"]')?.value === x, `Copy of ${t}`, { timeout: 15000 })
    const a = await doc(remixId), c = await doc(copyId)
    expect(c.slides.length === a.slides.length && canon(c.theme) === canon(a.theme) && c.aspectRatio === a.aspectRatio, 'the copy differs from the original in slides/theme/format')
    const edited = `Copy only ${Date.now() % 100000}`; await p.getByLabel('Presentation title').fill(edited); await p.getByLabel('Presentation title').press('Enter'); await saved()
    await p.reload({ waitUntil: 'networkidle' }); expect(await p.getByLabel('Presentation title').inputValue() === edited, 'copy edit lost')
    expect((await doc(remixId)).title === t, 'editing the copy changed the original')
    const pp = await ctx.newPage(); await pp.goto(`${EDITOR}/present/${copyId}`, { waitUntil: 'networkidle' }); await pp.waitForTimeout(1200); expect((await pp.locator('body').innerText()).trim().length > 10, 'present mode of the copy is empty'); await pp.close()
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), (async () => { await p.getByRole('button', { name: /^Export/ }).click(); await p.getByRole('menuitem', { name: /^PPTX/ }).click() })()])
    const f = join(RESULTS, `copy-${Date.now()}.pptx`); await dl.saveAs(f); expect(readFileSync(f).length > 5000, 'the copy exported an empty file')
    await more('Delete presentation'); await p.waitForURL((u) => u.pathname === '/', { timeout: 15000 })
    const ids = (await J('/presentations')).data.map((d) => d.id)
    expect(!ids.includes(copyId) && ids.includes(remixId), 'the library is wrong after deleting the copy')
  })

  await s.check('G1 — leaving a deck right after an edit (clicking Home inside the 1.5 s save delay) does not lose the edit', p, async () => {
    await open(remixId)
    const t = `Left fast ${Date.now() % 100000}`; const inp = p.getByLabel('Presentation title'); await inp.fill(t); await inp.press('Enter')
    await p.locator('a[href="/"]').first().click(); await p.waitForURL((u) => u.pathname === '/', { timeout: 10000 })
    await p.waitForTimeout(2500)
    expect((await doc(remixId)).title === t, 'the edit made just before leaving was lost')
  })

  await s.check('D10/C6 — Cancel on the progress screen: no new deck, the credits come back; closing the dialog creates nothing', p, async () => {
    await open(orig)
    await more('Remix this presentation…'); await dlg().waitFor(); await p.keyboard.press('Escape'); await dlg().waitFor({ state: 'detached', timeout: 5000 })
    const decksBefore = db('decks').filter((d) => !d.deleted).length
    const t0 = new Date().toISOString()
    await startRemix({ text: 'A very short version for a newsletter', slides: 4 })
    await p.waitForURL(/\/create/, { timeout: 30000 }); await p.getByRole('progressbar').waitFor({ timeout: 30000 })
    await p.getByRole('button', { name: 'Cancel' }).click(); await sleep(6000)
    const spent = db('spent', t0)
    expect(spent.net === 0, `credits not returned after cancel: ${JSON.stringify(spent)}`)
    expect(db('decks').filter((d) => !d.deleted).length === decksBefore, 'a deck was created although it was cancelled')
  })

  await s.check('D12 — not enough credits: a clear message, no job, no deck, no charge', p, async () => {
    db('setbalance', '3')
    try {
      await open(orig); const t0 = new Date().toISOString(); const decksBefore = db('decks').filter((d) => !d.deleted).length
      await startRemix({ text: 'A short version', slides: 4 })
      await dlg().waitFor({ state: 'detached', timeout: 20000 }) // the remix dialog gives way to the upgrade / credits message
      await p.getByRole('dialog').getByText(/credit|upgrade|plan/i).first().waitFor({ timeout: 15000 })
      expect(!/\/create/.test(p.url()), 'went to the progress screen without enough credits')
      expect(db('jobs', t0).length === 0, 'a job was created without enough credits')
      expect(db('spent', t0).net === 0, 'credits were charged')
      expect(db('decks').filter((d) => !d.deleted).length === decksBefore, 'a deck appeared')
    } finally { db('setbalance', '3000') }
  })

  await s.check('A2 — a person invited to EDIT the deck is not offered Remix or Duplicate (no dead-end errors)', p, async () => {
    const friendEmail = uniqueEmail('rxfriend'); await open(orig)
    await p.getByRole('button', { name: /Share/ }).click(); await p.getByLabel('Email to invite').fill(friendEmail)
    await p.getByRole('button', { name: 'Invite', exact: true }).click(); await p.getByText(/Invitation sent/).waitFor({ timeout: 8000 }); await p.keyboard.press('Escape')
    const fctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const fp = await fctx.newPage(); fp.on('dialog', (d) => void d.accept())
    const su = await fctx.request.post(`${API}/api/auth/sign-up/email`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { email: friendEmail, password: 'Passw0rd!qa-test', name: 'Friend' } }); expect(su.ok(), 'friend sign-up')
    const token = api(`scripts/qa-invite-token.ts ${friendEmail}`)
    await fp.goto(`${EDITOR}/invite/${token}`, { waitUntil: 'networkidle' }); await fp.getByRole('button', { name: /Accept and open/ }).click()
    await fp.waitForURL(new RegExp(`/edit/${orig}`), { timeout: 15000 }); await fp.getByText('Collaborating').waitFor({ timeout: 10000 })
    await fp.getByRole('button', { name: 'More' }).click()
    expect(await fp.getByRole('menuitem').count() > 0, 'menu did not open')
    expect(await fp.getByRole('menuitem', { name: /Remix|Duplicate/ }).count() === 0, 'a collaborator is offered Remix or Duplicate')
    await fctx.close()
  })

  await s.check('C5 — on a phone (390 px) the Remix dialog fits, scrolls and its buttons are reachable', p, async () => {
    const pctx = await b.newContext({ viewport: { width: 390, height: 780 }, storageState: STATE }); const pp = await pctx.newPage()
    await pp.goto(`${EDITOR}/edit/${orig}`, { waitUntil: 'networkidle' }); await pp.locator('[data-testid="stage"]').waitFor({ timeout: 20000 })
    await pp.getByRole('button', { name: 'More' }).click(); await pp.getByRole('menuitem', { name: 'Remix this presentation…' }).click()
    const d = pp.getByRole('dialog', { name: 'Remix this presentation' }); await d.waitFor({ timeout: 8000 })
    const box = await d.boundingBox(); expect(box.x >= 0 && box.x + box.width <= 391, `dialog is wider than the screen: ${JSON.stringify(box)}`)
    await d.getByLabel('How should it change?').fill('Short version'); const btn = d.getByRole('button', { name: 'Create remixed copy' }); await btn.scrollIntoViewIfNeeded()
    const bb = await btn.boundingBox(); expect(bb && bb.x >= 0 && bb.x + bb.width <= 391, 'the main button is off screen'); expect(await btn.isEnabled(), 'button disabled')
    await pctx.close()
  })

  // ── robustness with real AI: unusual text, and a long deck ───────────────────────────────────────────────
  await s.check('F1 — unusual text (emoji, quotes, <script>, accents, a 190-character title) remixes and nothing runs', p, async () => {
    const nasty = (await J('/presentations', { method: 'POST', body: { templateId: 'pitch-launchpad', aspectRatio: '16:9', title: 'x' } })).data.id
    const g = (await J(`/presentations/${nasty}`)).data; const d = g.document
    d.title = ('Ünïcödé 🚀 "quoted" <b>bold</b> ' + 'long '.repeat(40)).slice(0, 190)
    const c = d.slides[0].content; c.title = 'Q3 💥 "record" <img src=x onerror=window.__xss=1> & Zoë\'s café'; d.slides[0].content = c
    const r = await J(`/presentations/${nasty}`, { method: 'PUT', body: { baseRevision: g.revision, document: d, snapshot: false } }); expect(r.success !== false, `save: ${JSON.stringify(r)}`)
    await open(nasty); await startRemix({ text: 'A short version, keep every special character in names exactly', slides: 4 })
    const id = await waitNewDeck(nasty)
    expect(await p.evaluate(() => window.__xss === undefined), 'injected script ran'); expect(id !== nasty, 'no new deck')
    const out = await doc(id); expect(out.slides.length === 4, `slides ${out.slides.length}`)
  })

  await s.check('F2 — a long deck (33 slides) is condensed to 6 within the time limit', p, async () => {
    const long = (await J('/presentations', { method: 'POST', body: { templateId: 'pitch-launchpad', aspectRatio: '16:9', title: 'Long deck' } })).data.id
    const g = (await J(`/presentations/${long}`)).data; const d = g.document; const base = d.slides
    d.slides = [...base, ...base.map((x, i) => ({ ...x, id: `c1-${i}-${Math.random().toString(36).slice(2, 7)}` })), ...base.map((x, i) => ({ ...x, id: `c2-${i}-${Math.random().toString(36).slice(2, 7)}` }))]
    const r = await J(`/presentations/${long}`, { method: 'PUT', body: { baseRevision: g.revision, document: d, snapshot: false } }); expect(r.success !== false, `save: ${JSON.stringify(r)}`)
    await open(long); const t0 = Date.now(); await startRemix({ text: 'Condense this into the 6 must-know slides', slides: 6 })
    const id = await waitNewDeck(long); const out = await doc(id)
    expect(out.slides.length === 6, `slides ${out.slides.length}`)
    console.log(`      note: 33 → 6 slides took ${Math.round((Date.now() - t0) / 1000)} s`)
  })

  await s.check('B4/B7 — a copy stays in the original\'s project; once the monthly deck allowance (Pro: 50) is used up, Duplicate says so clearly and creates nothing', p, async () => {
    // a throwaway account: deleted decks still count for the month, so the shared QA account must not be used up
    const email = uniqueEmail('rxlimit'); const lctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const lp = await lctx.newPage(); lp.on('dialog', (d) => void d.accept())
    const su = await lctx.request.post(`${API}/api/auth/sign-up/email`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { email, password: 'Passw0rd!qa-test', name: 'Limit' } }); expect(su.ok(), 'sign-up')
    api(`scripts/qa-grant-plan.ts ${email} pro`)
    await lp.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    const LJ = (path, body) => lp.evaluate(async ([path, body]) => (await fetch('http://localhost:4000/api/v1' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })).json(), [path, body])
    const proj = (await LJ('/projects', { name: 'Remix project' })).data
    const first = (await LJ('/presentations', { templateId: 'pitch-launchpad', aspectRatio: '16:9', title: 'In a project', projectId: proj.id })).data.id
    const dup = (await LJ(`/presentations/${first}/duplicate`, {})).data
    const list = (await LJ('/presentations')).data
    expect(list.find((d) => d.id === dup.id)?.projectId === proj.id, 'the copy is not in the original\'s project')
    api(`scripts/qa-remix-check.ts fill ${email} 48`) // the original + the copy + 48 = the Pro allowance of 50 this month
    const over = await LJ('/presentations', { templateId: 'pitch-launchpad', aspectRatio: '16:9', title: 'one too many' })
    expect(!over.success && over.error.code === 'LIMIT_REACHED', `creating over the limit: ${JSON.stringify(over)}`)
    await lp.goto(`${EDITOR}/edit/${first}`, { waitUntil: 'networkidle' }); await lp.locator('[data-testid="stage"]').waitFor({ timeout: 20000 })
    await lp.getByRole('button', { name: 'More' }).click(); await lp.getByRole('menuitem', { name: 'Duplicate presentation' }).click()
    await lp.getByText(/reached 50 presentations this month/).waitFor({ timeout: 10000 })
    expect(lp.url().includes(first), 'it navigated away although nothing was created')
    const titles = (await LJ('/presentations')).data.map((d) => d.title); expect(!titles.some((t) => /^Copy of Copy|one too many/.test(t)), 'a deck was created although the allowance was used up')
    await lctx.close()
  })

  plan('starter')
  await b.close()
  return s.done()
}
