import { join } from 'node:path'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { API, EDITOR, RESULTS, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, openDeck, person, plan, saved, stage, tsx } from '../kits-lib.mjs'

/**
 * C7 share-link analytics — real browser, real server, real database. The owner is one account; every "visitor" is its own browser context
 * (own storage, so a different visitor id), really waiting on really-shown slides. Flow ids: docs/SHARE_ANALYTICS_C7_FUNCTIONAL_FLOWS.md.
 */
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

export default async function () {
  const s = suite('29-share-analytics')
  const b = await launch()
  const O = await person(b, 'shro', 'pro')
  const o = O.p
  o.on('dialog', (d) => void d.accept())
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const dash = async (deck, days = 30) => (await api.get(O, `/presentations/${deck}/analytics?days=${days}`)).data
  const rowsOf = (deck) => JSON.parse(tsx(`scripts/qa-share.ts rows ${deck}`))
  const until = async (fn, ms = 15000, what = 'condition') => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(400) } }
  const viewer = (page) => page.locator('[aria-label="Slide"]')
  const privacyText = (p) => p.getByTestId('view-notice')

  /** a deck with four slides and a live view-only link */
  async function sharedDeck(title, o2 = {}) {
    const id = await newDeck(O, title)
    await openDeck(o, id)
    for (let i = 0; i < 3; i++) { await o.getByRole('button', { name: '+ New slide' }).click(); await o.getByRole('menuitem', { name: 'Blank slide' }).click(); await o.waitForTimeout(300) }
    await saved(o); await o.waitForTimeout(1800)
    const link = await api.post(O, `/presentations/${id}/share`, o2.password ? { password: o2.password } : {})
    expect(link.status === 200 || link.status === 201, `share ${link.status} ${JSON.stringify(link.body)}`)
    return { id, token: link.data.url.split('/s/')[1] }
  }
  /** a visitor in a brand-new browser context; resolves when the deck is on screen and the visit was reported */
  async function visit(token, opt = {}) {
    const ctx = await b.newContext({ viewport: opt.viewport ?? { width: 1280, height: 800 }, ...(opt.cookies ? {} : {}) })
    if (opt.dnt) await ctx.addInitScript(() => Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' }))
    const p = await ctx.newPage()
    const sent = []; p.on('request', (r) => { if (/analytics\/(start|ping)/.test(r.url())) sent.push(r.url().split('/').pop()) })
    if (opt.country) await p.route('**/analytics/start', (r) => r.continue({ headers: { ...r.request().headers(), 'cf-ipcountry': opt.country } }))
    if (opt.block) await p.route('**/analytics/**', (r) => r.abort('failed'))
    const started = opt.dnt || opt.block ? null : p.waitForResponse((r) => /analytics\/start/.test(r.url()), { timeout: 15000 })
    await p.goto(`${EDITOR}/s/${token}`, { waitUntil: 'networkidle', ...(opt.referer ? { referer: opt.referer } : {}) })
    if (!opt.noWait) await viewer(p).waitFor({ timeout: 15000 })
    const res = started ? await started.then((r) => r.json()).catch(() => null) : null
    return { ctx, p, sent, res }
  }
  const next = (p) => p.keyboard.press('ArrowRight'), prev = (p) => p.keyboard.press('ArrowLeft')
  // a visitor closes the TAB; the browser stays open for a moment (closing the whole browser in the same instant would abort any request still in flight, which no web technology can prevent)
  // a visitor leaving: the page is navigated away (pagehide fires and the closing report is sent); Playwright's abrupt page.close() can drop that report, which a real tab closing does not
  const leave = async (v) => { await v.p.goto('about:blank').catch(() => {}); await sleep(700); await v.ctx.close() }

  const slideNames = ['', ''] // keep the linter quiet about unused helpers
  void slideNames; void WEB; void plan

  try {
    // ───────── the main deck M ─────────
    const M = await sharedDeck('Analytics deck M')

    await s.check('A5 a link nobody opened: the Share dialog says so and the dashboard shows a clear empty state (no errors)', o, async () => {
      await openDeck(o, M.id); await o.getByRole('button', { name: /Share/ }).click(); await o.getByRole('tab', { name: /link/i }).click().catch(() => {})
      await o.getByTestId('share-views').waitFor({ timeout: 8000 })
      expect(/Nobody has opened this link yet/.test(await o.getByTestId('share-views').innerText()), 'no empty summary')
      await o.getByRole('button', { name: 'See analytics' }).click(); const dlg = o.getByRole('dialog', { name: 'Link analytics' }); await dlg.waitFor({ timeout: 8000 })
      await dlg.getByLabel('No views yet').waitFor({ timeout: 8000 }); expect(await dlg.getByRole('alert').count() === 0, 'an error showed')
      await dlg.getByRole('button', { name: 'Close' }).click()
    })

    let v1, v2
    await s.check('B1 + B4 two different visitors in two browsers: two views, two visitors, within seconds', o, async () => {
      v1 = await visit(M.token); expect(v1.res?.data?.viewId, `start answered ${JSON.stringify(v1.res)}`)
      v2 = await visit(M.token)
      const d = await until(async () => { const x = await dash(M.id); return x.totals.views === 2 && x }, 12000, 'two views')
      expect(d.totals.visitors === 2, `visitors ${d.totals.visitors}`)
    })

    await s.check('B2 the same visitor reloading is the same visit; A1 the Share dialog now shows the count and the last view', o, async () => {
      await v1.p.reload({ waitUntil: 'networkidle' }); await viewer(v1.p).waitFor(); await sleep(1500)
      expect((await dash(M.id)).totals.views === 2, 'a reload made a third view')
      await o.reload({ waitUntil: 'networkidle' }); await o.getByRole('button', { name: /Share/ }).click(); await o.getByRole('tab', { name: /link/i }).click().catch(() => {})
      const t = await o.getByTestId('share-views').innerText(); expect(/2 views/.test(t) && /last viewed/.test(t), `summary: ${t}`)
      await o.keyboard.press('Escape')
    })

    await s.check('B5 the owner opening their own link is not counted (and the page still works); B9 Do Not Track sends and stores nothing', o, async () => {
      const own = await o.context().newPage(); const seen = []
      own.on('response', async (r) => { if (/analytics\/start/.test(r.url())) seen.push(await r.json().catch(() => null)) })
      await own.goto(`${EDITOR}/s/${M.token}`, { waitUntil: 'networkidle' }); await viewer(own).waitFor({ timeout: 10000 }); await sleep(1500)
      expect(seen[0]?.data?.ignored === 'own', `owner start answer: ${JSON.stringify(seen)}`); await own.close()
      const dnt = await visit(M.token, { dnt: true }); await sleep(1500)
      expect(dnt.sent.length === 0, `Do Not Track visitor sent ${dnt.sent}`); expect(await viewer(dnt.p).isVisible(), 'the page does not work with Do Not Track'); await leave(dnt)
      expect((await dash(M.id)).totals.views === 2, 'the owner or the Do-Not-Track visitor was counted')
    })

    await s.check('F3 analytics blocked (an ad-blocker) or failing: the presentation works normally and shows no error; nothing is counted', o, async () => {
      const blocked = await visit(M.token, { block: true }); await next(blocked.p); await next(blocked.p); await sleep(1200)
      expect(await blocked.p.getByRole('alert').count() === 0, 'an error showed'); expect(/3 \/ 4/.test(await blocked.p.locator('footer').innerText()), 'navigation did not work'); await leave(blocked)
      expect((await dash(M.id)).totals.views === 2, 'a blocked visitor was counted')
    })

    await s.check('D1 + D2 what is stored: no IP, user-agent or raw id; the viewer page shows the privacy note; no cookie is set by tracking', o, async () => {
      const rows = rowsOf(M.id); expect(rows.length === 2, `${rows.length} rows`)
      const text = JSON.stringify(rows); expect(!/127\.0\.0\.1|::1|Mozilla|HeadlessChrome|Chrome\/|AppleWebKit/.test(text), 'an IP or user-agent text is stored')
      expect(rows.every((r) => /^[0-9a-f]{32}$/.test(r.visitorHash)), 'visitor hash is not a hash'); expect(new Set(rows.map((r) => r.visitorHash)).size === 2, 'two visitors share a hash')
      await v1.p.locator('details summary', { hasText: 'Privacy' }).click(); const note = await privacyText(v1.p).innerText()
      expect(/No name, e-mail address, IP address or cookie/.test(note) && /Do Not Track/.test(note), `notice: ${note}`)
      expect((await v1.ctx.cookies()).filter((c) => /view|visitor|track|analytic/i.test(c.name)).length === 0, 'a tracking cookie exists')
      await leave(v1); await leave(v2)
    })

    // ───────── time deck T: C1, C4, C6, C7 ─────────
    const T = await sharedDeck('Analytics deck T')
    await s.check('C1 + C6 + C7 a visitor spends about 2 s on slide 1, 3 s on slide 2, goes back for 2 s, then closes the tab: times add up per slide and the last seconds are delivered', o, async () => {
      const v = await visit(T.token)
      await sleep(2000); await next(v.p); await sleep(3000); await prev(v.p); await sleep(2000)
      await leave(v)
      const d = await until(async () => { const x = await dash(T.id); const r = x.slides[0]; return r && r.avgSeconds >= 3 && x }, 15000, 'slide times')
      expect(Math.abs(d.slides[0].avgSeconds - 4) <= 1.6, `slide 1 average ${d.slides[0].avgSeconds}s, wanted about 4 (2 + 2: the last 2 s are delivered when the tab closes)`)
      expect(Math.abs(d.slides[1].avgSeconds - 3) <= 1.6, `slide 2 average ${d.slides[1].avgSeconds}s, wanted about 3`)
      expect(d.slides[0].reachPct === 100 && d.slides[1].reachPct === 100 && d.slides[2].reachPct === 0, 'reach is wrong')
    })

    await s.check('C6 five visitors each read one slide for ~3 s and close the tab at once: every one of those visits still has its time recorded (the last report survives the tab closing)', o, async () => {
      const before = (await dash(T.id)).recent.length
      for (let i = 0; i < 5; i++) { const v = await visit(T.token); await sleep(3200); await leave(v) }
      const d = await until(async () => { const x = await dash(T.id); return x.recent.length === before + 5 && x.recent.slice(0, 5).every((r) => r.seconds >= 2.6) && x }, 20000, 'all five visits with their time').catch(async (e) => { const x = await dash(T.id); throw new Error(`${e.message}; before ${before}, now ${x.recent.length}, seconds ${x.recent.slice(0, 6).map((r) => r.seconds)}`) })
      expect(d.recent.slice(0, 5).every((r) => r.seconds >= 2.6 && r.seconds <= 6), `recorded seconds: ${d.recent.slice(0, 5).map((r) => r.seconds)}`)
    })

    await s.check('C4 time does not accrue while the tab is hidden (visibility event) and resumes afterwards', o, async () => {
      const before = (await dash(T.id)).recent.length
      const v = await visit(T.token)
      await sleep(2000)
      await v.p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
      await sleep(6000)
      await v.p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
      await sleep(2000); await leave(v)
      const d = await until(async () => { const x = await dash(T.id); return x.recent.length === before + 1 && x }, 12000, 'the new visit')
      const secs = d.recent[0].seconds
      expect(secs >= 2 && secs <= 6.5, `a visit with 4 s visible and 6 s hidden recorded ${secs} s`)
    })

    // ───────── reach deck R: C2, C3, E3, C8 ─────────
    const R = await sharedDeck('Analytics deck R')
    await s.check('C2 + C3 three visitors stop at slide 1, 2 and 4: reach 100 / 66.7 / 33.3 / 33.3 %, one of three finished', o, async () => {
      const a = await visit(R.token); await sleep(1500); await leave(a)
      const bb = await visit(R.token); await sleep(800); await next(bb.p); await sleep(1500); await leave(bb)
      const c = await visit(R.token); await sleep(800); await next(c.p); await sleep(800); await next(c.p); await sleep(800); await next(c.p); await sleep(2200); await leave(c)
      const d = await until(async () => { const x = await dash(R.id); return x.totals.views === 3 && x.slides[3].reachPct > 0 && x }, 15000, 'three visits')
      expect(JSON.stringify(d.slides.map((x) => x.reachPct)) === '[100,66.7,33.3,33.3]', `reach ${d.slides.map((x) => x.reachPct)}`)
      expect(d.totals.completionPct === 33.3 && d.totals.visitors === 3, `completion ${d.totals.completionPct}, visitors ${d.totals.visitors}`)
      expect(d.slides[0].leftHerePct === 33.3 && d.slides[1].leftHerePct === 33.3 && d.slides[3].leftHerePct === 0, `left here ${d.slides.map((x) => x.leftHerePct)}`)
    })

    await s.check('E1 + E3 the dashboard shows exactly those numbers (views, visitors, finished, one row per slide with its reach)', o, async () => {
      await openDeck(o, R.id); await o.getByRole('button', { name: /Share/ }).click(); await o.getByRole('tab', { name: /link/i }).click().catch(() => {})
      await o.getByRole('button', { name: 'See analytics' }).click(); const dlg = o.getByRole('dialog', { name: 'Link analytics' }); await dlg.getByLabel('Key numbers').waitFor({ timeout: 10000 })
      const kpi = async (n) => (await dlg.locator(`[data-kpi="${n}"]`).innerText()).trim()
      expect(await kpi('Views') === '3' && await kpi('Visitors') === '3' && await kpi('Finished') === '33.3%', `KPIs: ${await kpi('Views')}/${await kpi('Visitors')}/${await kpi('Finished')}`)
      const rows = await dlg.locator('[data-slide-row]').allInnerTexts(); expect(rows.length === 4, `${rows.length} slide rows`)
      expect(/100%/.test(rows[0]) && /66\.7%/.test(rows[1]) && /33\.3%/.test(rows[2]) && /33\.3%/.test(rows[3]), `rows: ${rows.join(' | ')}`)
      await shotDialog(o, 'dashboard')
    })

    await s.check('E2 the daily chart adds up to the views; 7 / 30 / 90 days change the number of bars', o, async () => {
      const dlg = o.getByRole('dialog', { name: 'Link analytics' })
      const sum = async () => (await dlg.locator('[data-testid="daily-chart"] rect').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-views'))))).reduce((a, x) => a + x, 0)
      const bars = () => dlg.locator('[data-testid="daily-chart"] rect').count()
      expect(await bars() === 30 && await sum() === 3, `30 days: ${await bars()} bars summing ${await sum()}`)
      await dlg.getByRole('button', { name: '7 days' }).click(); await until(async () => (await bars()) === 7, 6000, '7 bars'); expect(await sum() === 3, '7-day sum')
      await dlg.getByRole('button', { name: '90 days' }).click(); await until(async () => (await bars()) === 90, 6000, '90 bars'); expect(await sum() === 3, '90-day sum')
      expect(await dlg.locator('table.sr-only').count() >= 1, 'the chart has no text alternative')
    })

    await s.check('E7 the open dashboard has no serious or critical accessibility violations (axe, WCAG A/AA) and every control has a name', o, async () => {
      await o.addScriptTag({ content: axeSrc })
      const res = await o.evaluate(() => axe.run(document.querySelector('[role="dialog"][aria-label="Link analytics"]'), { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] }))
      const bad = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact)); expect(bad.length === 0, bad.map((v) => `${v.id}(${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 90)}`).join(' | '))
    })

    await s.check('C8 after slide 4 is deleted the table follows the deck (3 rows) and the time spent on it is kept as "removed slides"', o, async () => {
      await o.keyboard.press('Escape'); await o.keyboard.press('Escape')
      await openDeck(o, R.id); await o.getByTestId('thumb-3').click({ button: 'right' }); await o.getByRole('menuitem', { name: 'Delete slide' }).click(); await saved(o); await o.waitForTimeout(2000)
      const d = await dash(R.id); expect(d.slides.length === 3, `${d.slides.length} rows`); expect(d.removedSlidesSeconds >= 1, `removed-slide time ${d.removedSlidesSeconds}`)
    })

    // ───────── E4 + E5: sources, devices, countries ─────────
    const S = await sharedDeck('Analytics deck S')
    await s.check('E4 + E5 a phone visitor from LinkedIn in India and a direct computer visitor: devices, sources, countries and the recent list show them (no personal data)', o, async () => {
      const ph = await visit(S.token, { viewport: { width: 390, height: 800 }, referer: 'https://www.linkedin.com/feed/', country: 'IN' }); await sleep(1500); await leave(ph)
      const pc = await visit(S.token); await sleep(1500); await leave(pc)
      const d = await until(async () => { const x = await dash(S.id); return x.totals.views === 2 && x }, 12000, 'two views')
      expect(JSON.stringify(Object.fromEntries(d.devices.map((x) => [x.name, x.views]))) === '{"phone":1,"computer":1}' || JSON.stringify(Object.fromEntries(d.devices.map((x) => [x.name, x.views]))) === '{"computer":1,"phone":1}', `devices ${JSON.stringify(d.devices)}`)
      expect(d.sources.some((x) => x.name === 'linkedin.com') && d.sources.some((x) => x.name === 'Direct'), `sources ${JSON.stringify(d.sources)}`); expect(d.countries.length === 1 && d.countries[0].name === 'IN', `countries ${JSON.stringify(d.countries)}`)
      await openDeck(o, S.id); await o.getByRole('button', { name: /Share/ }).click(); await o.getByRole('tab', { name: /link/i }).click().catch(() => {}); await o.getByRole('button', { name: 'See analytics' }).click()
      const dlg = o.getByRole('dialog', { name: 'Link analytics' }); await dlg.getByLabel('Key numbers').waitFor({ timeout: 10000 })
      const txt = await dlg.innerText(); expect(/Phone/.test(txt) && /Computer/.test(txt) && /linkedin\.com/.test(txt) && /Direct/.test(txt) && /India/.test(txt), 'a section is missing on the dashboard')
      const recent = await dlg.getByLabel('Recent views').locator('tbody tr').allInnerTexts(); expect(recent.length === 2 && recent.some((r) => /Phone/.test(r) && /linkedin\.com/.test(r) && /India/.test(r)), `recent: ${recent.join(' | ')}`)
      expect(!/hash|visitor id|Mozilla/i.test(await dlg.getByLabel('Recent views').innerText()), 'personal data in the recent list')
      await o.keyboard.press('Escape'); await o.keyboard.press('Escape')
    })

    // ───────── password, expiry, revoked: B7, B8, B10 ─────────
    await s.check('B7 a password-protected link counts a visitor only after the right password (lock screen and wrong password do not count)', o, async () => {
      const P = await sharedDeck('Analytics deck P', { password: 'secret-pass-1' })
      const ctx = await b.newContext(); const p = await ctx.newPage(); const starts = []; p.on('response', async (r) => { if (/analytics\/start/.test(r.url())) starts.push(r.status()) })
      await p.goto(`${EDITOR}/s/${P.token}`, { waitUntil: 'networkidle' }); await p.getByLabel('Password').waitFor({ timeout: 8000 }); await sleep(1200)
      expect((await dash(P.id)).totals.views === 0 && starts.length === 0, 'the lock screen was counted')
      await p.getByLabel('Password').fill('wrong-password'); await p.getByRole('button', { name: 'Open presentation' }).click(); await p.getByRole('alert').waitFor({ timeout: 6000 }); await sleep(800)
      expect((await dash(P.id)).totals.views === 0, 'a wrong password was counted')
      await p.getByLabel('Password').fill('secret-pass-1'); await p.getByRole('button', { name: 'Open presentation' }).click(); await viewer(p).waitFor({ timeout: 10000 })
      await until(async () => (await dash(P.id)).totals.views === 1, 10000, 'the counted view')
      // B8: expired link, made-up address
      tsx(`scripts/qa-share.ts expire ${P.token}`)
      const e = await b.newContext(); const ep = await e.newPage(); await ep.goto(`${EDITOR}/s/${P.token}`, { waitUntil: 'networkidle' }); await ep.getByText(/expired/i).first().waitFor({ timeout: 8000 })
      const m = await b.newContext(); const mp = await m.newPage(); await mp.goto(`${EDITOR}/s/${'A'.repeat(32)}`, { waitUntil: 'networkidle' }); await mp.getByText(/isn't available/).waitFor({ timeout: 8000 })
      await sleep(800); expect((await dash(P.id)).totals.views === 1, 'an expired or made-up link was counted'); for (const c of [ctx, e, m]) await c.close()
    })

    await s.check('B10 the owner turns the link off while someone is viewing: tracking stops quietly, the viewer sees no error, and the presentation keeps working', o, async () => {
      const Q = await sharedDeck('Analytics deck Q')
      const v = await visit(Q.token); await sleep(1200)
      expect((await api.del(O, `/presentations/${Q.id}/share`)).status < 300, 'turning the link off failed')
      await next(v.p); await sleep(1500); await next(v.p); await sleep(11500) // past a batch report
      expect(await v.p.getByRole('alert').count() === 0, 'the viewer saw an error'); expect(/3 \/ 4/.test(await v.p.locator('footer').innerText()), 'the presentation stopped working'); await leave(v)
    })

    // ───────── D3: clear; A3: Starter ─────────
    await s.check('D3 "Clear analytics" deletes every recorded visit of the deck at once', o, async () => {
      await openDeck(o, M.id); await o.getByRole('button', { name: /Share/ }).click(); await o.getByRole('tab', { name: /link/i }).click().catch(() => {}); await o.getByRole('button', { name: 'See analytics' }).click()
      const dlg = o.getByRole('dialog', { name: 'Link analytics' }); await dlg.getByLabel('Key numbers').waitFor({ timeout: 10000 })
      await dlg.getByRole('button', { name: /Clear analytics/ }).click(); await dlg.getByLabel('No views yet').waitFor({ timeout: 8000 })
      expect(rowsOf(M.id).length === 0, 'rows are still in the database')
      await o.keyboard.press('Escape'); await o.keyboard.press('Escape')
    })

    await s.check('A3 a Starter owner sees the total number of views and an upgrade prompt, never the detail (the API does not send it)', o, async () => {
      const St = await person(b, 'shrs'); const sp = St.p
      const id = await newDeck(St, 'Starter deck'); const link = await api.post(St, `/presentations/${id}/share`); const token = link.data.url.split('/s/')[1]
      const v = await visit(token); await sleep(1000); await leave(v)
      await until(async () => (await api.get(St, `/presentations/${id}/analytics`)).data.totalViews === 1, 10000, 'one view')
      const raw = (await api.get(St, `/presentations/${id}/analytics`)).data; expect(raw.detail === false && !('totals' in raw) && !('recent' in raw), `Starter got ${JSON.stringify(Object.keys(raw))}`)
      await openDeck(sp, id); await sp.getByRole('button', { name: /Share/ }).click(); await sp.getByRole('tab', { name: /link/i }).click().catch(() => {}); await sp.getByRole('button', { name: 'See analytics' }).click()
      const dlg = sp.getByRole('dialog', { name: 'Link analytics' }); await dlg.getByLabel('Views summary').waitFor({ timeout: 8000 })
      expect(await dlg.locator('[data-kpi="Total views"]').innerText() === '1' && await dlg.getByRole('button', { name: 'See plans' }).isVisible() && await dlg.locator('[data-testid="daily-chart"]').count() === 0, 'Starter dialog is wrong')
    })

    // ───────── E6 phone, E8 size ─────────
    await s.check('E6 phone width (390 px): the dashboard fits, nothing scrolls sideways, tables stay readable', o, async () => {
      const pc = await b.newContext({ viewport: { width: 390, height: 800 }, storageState: await O.ctx.storageState() }); const pp = await pc.newPage()
      await pp.goto(`${EDITOR}/edit/${R.id}`, { waitUntil: 'networkidle' }); await stage(pp).waitFor({ timeout: 15000 })
      await pp.getByRole('button', { name: /Share/ }).click(); await pp.getByRole('tab', { name: /link/i }).click().catch(() => {}); await pp.getByRole('button', { name: 'See analytics' }).click()
      const dlg = pp.getByRole('dialog', { name: 'Link analytics' }); await dlg.getByLabel('Key numbers').waitFor({ timeout: 10000 })
      const box = await dlg.boundingBox(); expect(box.x >= 0 && box.x + box.width <= 391, `dialog wider than the screen ${JSON.stringify(box)}`)
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the page scrolls sideways')
      await pp.screenshot({ path: join(RESULTS, '29-analytics-phone.png') }); await pc.close()
    })

    await s.check('E8 5,000 recorded visits on one deck: the dashboard loads in a few seconds', o, async () => {
      const Big = await sharedDeck('Analytics deck Big'); tsx(`scripts/qa-share.ts fill ${Big.id} 5000`)
      const t0 = Date.now(); const d = await dash(Big.id, 90); expect(Date.now() - t0 < 6000, `the API took ${Date.now() - t0} ms`); expect(d.totals.views === 5000, `${d.totals.views} views`)
      await openDeck(o, Big.id); await o.getByRole('button', { name: /Share/ }).click(); await o.getByRole('tab', { name: /link/i }).click().catch(() => {}); await o.getByRole('button', { name: 'See analytics' }).click()
      const t1 = Date.now(); await o.getByRole('dialog', { name: 'Link analytics' }).getByLabel('Key numbers').waitFor({ timeout: 15000 }); expect(Date.now() - t1 < 8000, `the dashboard took ${Date.now() - t1} ms`)
    })
  } finally {
    await b.close()
  }
  async function shotDialog(p, name) { await p.screenshot({ path: join(RESULTS, `29-analytics-${name}.png`) }) }
  return s.done()
}
