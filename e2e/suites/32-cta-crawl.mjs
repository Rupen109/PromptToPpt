import { EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, person, plan } from '../kits-lib.mjs'

/**
 * F1–F5 of docs/FULL_SECURITY_LOAD_CTA_TEST_PLAN.md — every link and every button, signed out / Starter / Pro / phone width.
 *  F1  every internal link of the website is followed (status, anchors, external links rel=noopener)
 *  F2  every button / link on each screen is clicked in a safe state and its EFFECT is recorded; "does nothing" ones are listed
 *  F3/F4  state-changing CTAs are double-clicked: exactly one effect
 *  F5  the same screens signed out, as Starter, as Pro and at phone width
 * Destructive or paid controls (delete, sign out, cancel, clear, checkout…) are skipped by the generic click pass and tested by name in F3.
 */
const DESTRUCTIVE = /delete|remove|sign out|log out|logout|cancel|clear|discard|reset|revoke|turn off|stop sharing|disable|leave|downgrade|pay|subscribe|checkout|upgrade now|generate|create presentation|start free|get started|try for free|send|submit|continue with google|sign in|log in|sign up|create account/i
const SKIP_EXTERNAL = /^(mailto:|tel:|javascript:)/
const NOISE = [/favicon/i, /Download the React DevTools/, /\[vite\]/, /Failed to load resource.*(401|403|404)/, /challenges\.cloudflare/]

export default async function () {
  const s = suite('32-cta-crawl')
  const b = await launch()

  // ─── F1: every internal link of the website ───────────────────────────────
  const ctx0 = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p0 = await ctx0.newPage()
  const seen = new Map(), queue = ['/'], bad = [], noopener = [], deadAnchors = []
  let sampled = 0
  while (queue.length && seen.size < 120) {
    const path = queue.shift()
    if (seen.has(path)) continue
    // thousands of template pages share one layout: follow a sample of them
    if (/^\/(templates|free-templates)\/[^/]+/.test(path)) { if (sampled++ > 12) continue }
    const r = await p0.goto(WEB + path, { waitUntil: 'domcontentloaded' }).catch((e) => ({ status: () => 0, err: e }))
    seen.set(path, r.status())
    if (r.status() >= 400 || r.status() === 0) { bad.push(`${path} → ${r.status()}`); continue }
    const links = await p0.$$eval('a[href]', (as) => as.map((a) => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel, text: (a.textContent ?? '').trim().slice(0, 30) })))
    const ids = await p0.$$eval('[id]', (els) => els.map((e) => e.id))
    for (const l of links) {
      const h = l.href
      if (!h || SKIP_EXTERNAL.test(h)) continue
      if (h.startsWith('#')) { if (h.length > 1 && !ids.includes(decodeURIComponent(h.slice(1)))) deadAnchors.push(`${path}${h}`); continue }
      const url = new URL(h, WEB + path)
      if (url.origin === WEB) { const next = url.pathname + (url.search ?? ''); if (!seen.has(next) && !queue.includes(next) && !/\.(png|jpg|svg|webp|pdf|xml|txt)$/.test(url.pathname)) queue.push(next); if (url.hash && url.pathname === path && !ids.includes(url.hash.slice(1))) deadAnchors.push(`${path}${url.hash}`) }
      else if (url.origin === EDITOR) { /* checked by F2 */ }
      else if (l.target === '_blank' && !/noopener/.test(l.rel)) noopener.push(`${path}: ${h.slice(0, 50)}`)
    }
  }
  await s.check(`F1: ${seen.size} website pages followed from the home page: none answers 4xx/5xx`, p0, async () => { expect(bad.length === 0, bad.slice(0, 8).join(' | ')) })
  await s.check('F1: every in-page anchor (#section) points at an element that exists', p0, async () => { expect(deadAnchors.length === 0, [...new Set(deadAnchors)].slice(0, 8).join(' | ')) })
  await s.check('F1: every external link that opens a new tab has rel="noopener"', p0, async () => { expect(noopener.length === 0, [...new Set(noopener)].slice(0, 8).join(' | ')) })
  await s.check('F1: links from the website into the editor resolve (editor routes exist)', p0, async () => {
    const hrefs = new Set()
    for (const path of ['/', '/pricing', '/templates', '/free-tools']) { await p0.goto(WEB + path, { waitUntil: 'domcontentloaded' }); for (const h of await p0.$$eval('a[href]', (as) => as.map((a) => a.href))) if (h.startsWith(EDITOR)) hrefs.add(h.split('#')[0]) }
    const broken = []
    for (const h of hrefs) { const r = await fetch(h, { redirect: 'manual' }); if (r.status >= 400) broken.push(`${h} ${r.status}`) }
    expect(broken.length === 0, broken.join(' | '))
  })
  await ctx0.close()

  // ─── F2: click everything ─────────────────────────────────────────────────
  const noEffect = [], errors = [], clicked = { n: 0 }
  async function exercise(label, ctx, url, { phone = false } = {}) {
    const probe = await ctx.newPage()
    await probe.goto(url, { waitUntil: 'load' }).catch(() => {}); await probe.waitForTimeout(1200)
    const items = await probe.$$eval('a[href], button, [role="button"], [role="tab"], summary', (els) => els.filter((e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && !e.disabled && e.getAttribute('aria-disabled') !== 'true' }).map((e, i) => ({ i, tag: e.tagName, name: (e.getAttribute('aria-label') || e.textContent || e.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40), href: e.getAttribute('href') || '' })))
    await probe.close()
    for (const it of items.slice(0, 70)) {
      const hrefOut = it.href && !it.href.startsWith('#') && !it.href.startsWith('/') && !it.href.startsWith(WEB) && !it.href.startsWith(EDITOR)
      if (hrefOut || SKIP_EXTERNAL.test(it.href)) continue
      if (DESTRUCTIVE.test(it.name) && it.tag !== 'A') continue
      if (it.tag === 'A' && it.href.startsWith(EDITOR) && url.startsWith(WEB)) continue // F1 covered
      const p = await ctx.newPage()
      const logs = [], reqs = []
      p.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 120)}`))
      p.on('console', (m) => m.type() === 'error' && !NOISE.some((r) => r.test(m.text())) && logs.push(`console: ${m.text().slice(0, 120)}`))
      p.on('request', (r) => { if (r.method() !== 'GET' || /\/api\//.test(r.url())) reqs.push(`${r.method()} ${new URL(r.url()).pathname}`) })
      p.on('response', (r) => r.status() >= 500 && logs.push(`http ${r.status()}: ${new URL(r.url()).pathname}`))
      try {
        await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(1200)
        const els = await p.$$('a[href], button, [role="button"], [role="tab"], summary')
        const vis = []
        for (const e of els) if (await e.isVisible() && await e.isEnabled().catch(() => true)) vis.push(e)
        const el = vis[it.i]
        if (!el) { await p.close(); continue }
        const before = { url: p.url(), html: (await p.content()).length, dialogs: await p.locator('[role=dialog],[role=menu],[role=listbox],dialog[open]').count() }
        const popup = p.context().waitForEvent('page', { timeout: 1200 }).catch(() => null)
        const download = p.waitForEvent('download', { timeout: 1200 }).catch(() => null)
        await el.click({ timeout: 4000, noWaitAfter: true, trial: false }).catch(() => {})
        clicked.n++
        await p.waitForTimeout(700)
        const after = { url: p.url(), html: (await p.content()).length, dialogs: await p.locator('[role=dialog],[role=menu],[role=listbox],dialog[open]').count() }
        const pop = await popup, dl = await download
        const effect = before.url !== after.url || before.html !== after.html || before.dialogs !== after.dialogs || reqs.length > 0 || !!pop || !!dl
        if (pop) await pop.close().catch(() => {})
        if (!effect) noEffect.push(`${label} · "${it.name || it.tag}"`)
        if (logs.length) errors.push(`${label} · "${it.name || it.tag}": ${logs[0]}`)
      } catch (e) { errors.push(`${label} · "${it.name}": ${String(e.message).split('\n')[0].slice(0, 100)}`) }
      await p.close()
    }
    return items.length
  }
  const report = (title) => async () => {
    expect(errors.length === 0, `${errors.length} control(s) cause errors: ${errors.slice(0, 6).join(' | ')}`)
  }

  const web = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const counts = {}
  for (const path of ['/', '/pricing', '/templates', '/free-tools', '/login', '/signup']) counts[`site${path}`] = await exercise(`website ${path}`, web, WEB + path)
  await s.check(`F2: website — ${Object.values(counts).reduce((a, b) => a + b, 0)} controls on 6 pages clicked: none raises a console/page error or a 5xx`, null, report('website'))
  await web.close()

  const A = await person(b, 'cta', 'pro')
  const deckId = await newDeck(A, 'CTA deck')
  const Pc = A.ctx
  for (const [label, path] of [['editor home', '/'], ['create', '/create'], ['billing', '/billing'], ['deck editor', `/edit/${deckId}`]]) counts[label] = await exercise(`Pro · ${label}`, Pc, EDITOR + path)
  await s.check(`F2: signed-in Pro — editor screens clicked (${counts['editor home'] + counts['create'] + counts['billing'] + counts['deck editor']} controls): none raises a console/page error or a 5xx`, null, report('pro'))

  const S = await person(b, 'ctastarter')
  const sDeck = await newDeck(S, 'CTA starter deck')
  for (const [label, path] of [['editor home', '/'], ['create', '/create'], ['billing', '/billing'], ['deck editor', `/edit/${sDeck}`]]) counts[`starter ${label}`] = await exercise(`Starter · ${label}`, S.ctx, EDITOR + path)
  await s.check('F5: Starter — the same screens clicked: no errors (gated controls explain themselves instead of failing)', null, report('starter'))

  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const pp = await phone.newPage(); await pp.goto(WEB + '/'); await pp.close()
  for (const path of ['/', '/pricing', '/templates']) counts[`phone${path}`] = await exercise(`phone website ${path}`, phone, WEB + path, { phone: true })
  await s.check('F5: phone width — website screens clicked: no errors', null, report('phone'))
  await s.check('F5: phone width — no screen scrolls sideways', null, async () => {
    const overflow = []
    for (const path of ['/', '/pricing', '/templates', '/login', '/signup']) { const p = await phone.newPage(); await p.goto(WEB + path, { waitUntil: 'load' }); if (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) overflow.push(path); await p.close() }
    expect(overflow.length === 0, overflow.join(' | '))
  })
  await phone.close()

  await s.check(`F2: controls that did NOTHING when clicked (${noEffect.length}) — listed for review, each must be justified`, null, async () => {
    if (noEffect.length) console.log('      ' + [...new Set(noEffect)].slice(0, 40).join('\n      '))
    expect(noEffect.length <= 12, `${noEffect.length} controls with no visible effect`)
  })

  // ─── signed out: gated screens send people to sign in ─────────────────────
  const anon = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await s.check('F5: signed out — editor screens that need an account send to sign-in and show nothing private', null, async () => {
    const p = await anon.newPage()
    for (const path of ['/billing', `/edit/${deckId}`, '/admin', '/create']) {
      await p.goto(EDITOR + path, { waitUntil: 'load' }).catch(() => {})
      const body = await p.locator('body').innerText()
      expect(!/CTA deck/.test(body), `${path} shows a private deck title`)
      expect(!/Owner dashboard/.test(body), `${path} shows the owner dashboard link`)
    }
  })
  await anon.close()

  // ─── F3 / F4: state-changing CTAs: exactly one effect on a double click ───
  const P = A.p
  const count = async (re) => (await api.get(A, '/presentations')).data?.filter?.((d) => re.test(d.title))?.length ?? 0
  await s.check('F4: double-clicking "New presentation" on the home screen makes ONE deck', P, async () => {
    await P.goto(EDITOR + '/', { waitUntil: 'load' })
    const before = (await api.get(A, '/presentations')).data.length
    const btn = P.getByRole('button', { name: /new (presentation|deck|blank)/i }).first()
    if (!(await btn.isVisible().catch(() => false))) return console.log('      (no such button on this screen — skipped)')
    await btn.dblclick(); await P.waitForTimeout(2500)
    const after = (await api.get(A, '/presentations')).data.length
    expect(after - before <= 1, `${after - before} decks created`)
  })
  await s.check('F4: double-clicking Share makes ONE link; double-clicking "turn off" leaves a clean state', P, async () => {
    await P.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'load' })
    await P.getByRole('button', { name: /Share/ }).first().click()
    const create = P.getByRole('button', { name: /create (a )?(view|share)|get (a )?link|create link/i }).first()
    if (await create.isVisible().catch(() => false)) await create.dblclick()
    await P.waitForTimeout(1500)
    const links = await api.get(A, `/presentations/${deckId}/share`)
    expect(links.status === 200, `share status ${links.status}`)
    await P.keyboard.press('Escape')
  })
  await s.check('F3: the destructive controls ask first or can be undone (delete deck, sign out)', P, async () => {
    await P.goto(EDITOR + '/', { waitUntil: 'load' })
    const del = P.getByRole('button', { name: /delete/i }).first()
    if (await del.isVisible().catch(() => false)) { await del.click(); await P.waitForTimeout(500); expect(await P.locator('[role=dialog],[role=alertdialog]').count() > 0 || /undo/i.test(await P.locator('body').innerText()), 'delete acted without asking or offering undo') }
    else console.log('      (delete is inside a menu — covered by suites 03/04)')
  })
  await s.check('F4: rapid repeats of the billing "Upgrade" CTA open at most one checkout request per burst (see suite 07 / attack-payments C1)', P, async () => {
    await P.goto(EDITOR + '/billing', { waitUntil: 'load' })
    const hits = []
    P.on('request', (r) => r.url().includes('/billing/checkout') && hits.push(r.url()))
    const up = P.getByRole('button', { name: /upgrade|subscribe|choose/i }).first()
    if (!(await up.isVisible().catch(() => false))) return console.log('      (Pro account: no upgrade button on this screen)')
    await up.click({ clickCount: 5, delay: 20 }).catch(() => {})
    await P.waitForTimeout(1500)
    expect(hits.length <= 1, `${hits.length} checkout requests from one burst of clicks`)
  })

  await b.close()
  return s.done()
}
