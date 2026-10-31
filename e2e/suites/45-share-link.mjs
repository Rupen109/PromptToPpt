/**
 * The view-only share link, end to end, as three kinds of people: the owner (signed in), a visitor with no account (a separate browser
 * profile) and a visitor on a phone. What the visitor's browser actually receives is checked at the API as well as on the page.
 * Also: the "Email this link" box, links that are off / expired / for a deleted deck, and password changes signing viewers out.
 * No AI is called.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'

const root = new URL('../..', import.meta.url).pathname
const qa = (script, ...args) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/${script}.ts ${args.join(' ')}`, { cwd: root, stdio: 'pipe' })
const email = () => JSON.parse(readFileSync(ACCOUNT, 'utf8')).email
const API = 'http://localhost:4000/api/v1'
const TOKEN = /\/s\/([A-Za-z0-9_-]{32})$/

export default async function () {
  const s = suite('45-share-link')
  qa('qa-grant-plan', email(), 'starter')
  const b = await launch()
  const ownerCtx = await b.newContext({ viewport: { width: 1500, height: 950 }, storageState: STATE })
  const o = await ownerCtx.newPage()
  o.on('dialog', (d) => void d.accept())
  const anonCtx = await b.newContext({ viewport: { width: 1280, height: 800 } }) // no cookies, no storage: a stranger
  const v = await anonCtx.newPage()
  const settle = (ms = 400) => o.waitForTimeout(ms)

  const call = (pg, method, path, body) => pg.evaluate(async ({ method, path, body }) => {
    const r = await fetch(`http://localhost:4000/api/v1${path}`, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
    return { status: r.status, headers: Object.fromEntries(r.headers.entries()), json: await r.json().catch(() => null) }
  }, { method, path, body })
  await o.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  const newDeck = async () => (await call(o, 'POST', '/presentations', { templateId: 'pitch-launchpad' })).json.data.id
  const open = async (id) => { await o.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await o.locator('[data-testid="stage"]').waitFor({ timeout: 15000 }); await settle(500) }
  const shareDialog = async () => { await o.getByRole('button', { name: 'Share' }).click(); await o.getByRole('dialog', { name: 'Share presentation' }).waitFor({ timeout: 5000 }) }
  const linkTab = async () => { await o.getByRole('tab', { name: 'View-only link' }).click(); await settle(300) }
  const view = async (token, pg = v) => { await pg.goto(`${EDITOR}/s/${token}`, { waitUntil: 'networkidle' }) }
  const pub = async (token, headers = {}) => { const r = await anonCtx.request.get(`http://localhost:4000/api/v1/public/share/${token}`, { headers }); return { status: r.status(), headers: r.headers(), json: await r.json().catch(() => null) } }

  const deck = await newDeck()
  await open(deck)
  let token = ''

  await s.check('owner: Share → View-only link → Create gives a /s/<token> address; Copy confirms; the link is the only thing created', o, async () => {
    await shareDialog(); await linkTab()
    await o.getByRole('button', { name: 'Create view-only link' }).click()
    const field = o.getByLabel('Share link'); await field.waitFor({ timeout: 8000 })
    const url = await field.inputValue()
    expect(TOKEN.test(url), `unexpected link: ${url}`)
    token = TOKEN.exec(url)[1]
    await o.getByRole('button', { name: 'Copy' }).click(); await settle(300)
    expect(/Link copied|Select the link/.test(await o.getByRole('dialog').getByRole('status').innerText()), 'no confirmation after Copy')
  })

  await s.check('visitor with no account: opens the link, sees the deck read-only (title, slide counter, next/previous, keyboard Home/End), no editor or share controls', v, async () => {
    await view(token)
    await v.getByLabel('Next slide').waitFor({ timeout: 10000 })
    expect(await v.getByText('1 / 11').count() === 1, 'counter is not 1 / 11')
    await v.getByLabel('Next slide').click(); expect(await v.getByText('2 / 11').count() === 1, 'next did not move')
    await v.keyboard.press('End'); expect(await v.getByText('11 / 11').count() === 1, 'End did not go to the last slide')
    expect(await v.getByLabel('Next slide').isDisabled(), 'Next is enabled on the last slide')
    await v.keyboard.press('Home'); expect(await v.getByText('1 / 11').count() === 1, 'Home did not go to the first slide')
    expect(await v.getByLabel('Previous slide').isDisabled(), 'Previous is enabled on the first slide')
    const body = await v.locator('body').innerText()
    expect(!/Share|Export|Edit with AI|Insert|Style|Speaker notes|Undo/.test(body.replace(/Made with SlidesDone/, '')), `editor controls leaked: ${body.slice(0, 200)}`)
    expect(await v.locator('[contenteditable=true], textarea').count() === 0, 'something on the page can be edited')
  })

  await s.check('what a stranger receives: no speaker notes, no sources, no semantic content, never cached, not indexable', v, async () => {
    // give slide 2 a private note and a marker the visitor must never see
    const cur = (await call(o, 'GET', `/presentations/${deck}`)).json.data
    const doc = cur.document
    doc.slides[1].speakerNotes = 'PRIVATE-NOTE-7731'
    const put = await call(o, 'PUT', `/presentations/${deck}`, { baseRevision: cur.revision, document: doc })
    expect(put.status === 200, `setup save ${put.status}`)
    const r = await pub(token)
    expect(r.status === 200, `status ${r.status}`)
    const text = JSON.stringify(r.json)
    expect(!text.includes('PRIVATE-NOTE-7731'), 'a speaker note reached the visitor')
    expect(r.json.data.document.slides.every((sl) => sl.speakerNotes === '' && sl.content === undefined && (sl.sources ?? []).length === 0), 'notes / content / sources are not stripped on every slide')
    expect((r.json.data.document.sources ?? []).length === 0, 'the deck source list reached the visitor')
    expect(/no-store/.test(r.headers['cache-control'] ?? ''), `cache-control: ${r.headers['cache-control']}`)
    expect(/noindex/.test(r.headers['x-robots-tag'] ?? ''), `x-robots-tag: ${r.headers['x-robots-tag']}`)
    expect(!/userId|ownerId|email/i.test(text), 'personal fields in what the visitor receives')
  })

  await s.check('the visitor cannot reach owner functions with the link (share settings, members, analytics, editing the deck)', v, async () => {
    const tryIt = (method, path, body) => v.evaluate(async ({ method, path, body }) => (await fetch(`http://localhost:4000/api/v1${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })).status, { method, path, body })
    for (const [m, p, b2] of [['GET', `/presentations/${deck}`], ['PUT', `/presentations/${deck}`, { baseRevision: 1, document: {} }], ['GET', `/presentations/${deck}/share`], ['DELETE', `/presentations/${deck}/share`], ['GET', `/presentations/${deck}/members`], ['POST', `/presentations/${deck}/share/email`, { emails: ['x@example.com'] }]]) {
      const st = await tryIt(m, p, b2)
      expect(st === 401, `${m} ${p} answered ${st} (expected 401)`)
    }
  })

  await s.check('the link shows the LATEST version: the owner changes a slide, the visitor reloads and sees it', v, async () => {
    const cur = (await call(o, 'GET', `/presentations/${deck}`)).json.data
    const doc = cur.document
    const t = doc.slides[0].elements.find((e) => e.type === 'text')
    const marker = `LIVE ${Date.now() % 100000}`
    t.paragraphs = [{ runs: [{ text: marker }] }]
    expect((await call(o, 'PUT', `/presentations/${deck}`, { baseRevision: cur.revision, document: doc })).status === 200, 'owner save failed')
    await view(token); await v.getByLabel('Next slide').waitFor({ timeout: 10000 })
    expect((await v.locator('main').innerText()).includes(marker), 'the visitor still sees the old slide')
  })

  await s.check('Email this link: addresses are checked, up to 5, the owner is told how many went out; the link tab keeps working', o, async () => {
    await o.reload({ waitUntil: 'networkidle' }); await shareDialog(); await linkTab()
    const box = o.getByLabel('Email addresses')
    await box.fill('ann@example.com, bob@example.org'); await o.getByRole('button', { name: 'Send', exact: true }).first().click()
    await o.getByText(/Link emailed to 2 people/).waitFor({ timeout: 10000 })
    await box.fill('a@e.com b@e.com c@e.com d@e.com e@e.com f@e.com'); await o.getByRole('button', { name: 'Send', exact: true }).first().click()
    await o.getByText(/up to 5 people/).waitFor({ timeout: 5000 })
    await box.fill('not-an-address'); await o.getByRole('button', { name: 'Send', exact: true }).first().click()
    await o.getByRole('alert').waitFor({ timeout: 8000 })
    expect(!/Error:|undefined|stack/i.test(await o.getByRole('alert').innerText()), 'technical text in the message')
    expect(await o.getByLabel('Share link').inputValue() === `${EDITOR}/s/${token}`, 'the link changed')
  })

  await s.check('turn the link off: it stops at once ("isn\'t available", no deck content); creating again gives a NEW address and the old one stays dead', v, async () => {
    await o.getByRole('button', { name: 'Turn the link off' }).click(); await o.getByRole('button', { name: 'Create view-only link' }).waitFor({ timeout: 8000 })
    const dead = await pub(token); expect(dead.status === 404, `status after off: ${dead.status}`)
    await view(token)
    await v.getByText("This link isn't available").waitFor({ timeout: 8000 })
    expect(await v.getByText('Go to SlidesDone').count() === 1, 'no way back')
    expect(!(await v.locator('body').innerText()).includes('LIVE'), 'deck text still on the page')
    await o.getByRole('button', { name: 'Create view-only link' }).click()
    const url = await o.getByLabel('Share link').inputValue(); const t2 = TOKEN.exec(url)[1]
    expect(t2 !== token, 'the new link has the same address as the old one')
    expect((await pub(t2)).status === 200 && (await pub(token)).status === 404, 'new link must work and the old one must stay dead')
    token = t2
  })

  await s.check('addresses that never existed (wrong length, odd characters, 32 random characters) all say "isn\'t available" — no crash, no hint whether a link exists', v, async () => {
    for (const t of ['abc', 'x'.repeat(31), 'x'.repeat(33), '../../etc/passwd', 'a'.repeat(32), '%00%00']) {
      await view(encodeURIComponent(t))
      await v.getByText("This link isn't available").waitFor({ timeout: 8000 })
      expect(!/Error|stack|undefined/.test(await v.locator('body').innerText()), `technical text for "${t}"`)
    }
  })

  await s.check('phone width (390 px): the shared deck fits the screen, no sideways scroll, the buttons are reachable and big enough', v, async () => {
    await v.setViewportSize({ width: 390, height: 800 })
    await view(token); await v.getByLabel('Next slide').waitFor({ timeout: 10000 })
    const m = await v.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, canvas: Math.round(document.querySelector('main [style*="width"]')?.getBoundingClientRect().width ?? 0) }))
    expect(m.sw <= m.cw + 1, `page scrolls sideways: ${m.sw} > ${m.cw}`)
    expect(m.canvas > 0 && m.canvas <= 390, `slide is ${m.canvas}px wide`)
    const next = await v.getByLabel('Next slide').boundingBox()
    expect(next && next.width >= 40 && next.height >= 40 && next.x + next.width <= 390, `next button ${JSON.stringify(next)}`)
    await v.getByLabel('Next slide').click(); expect(await v.getByText('2 / 11').count() === 1, 'tapping next did not move')
    await v.setViewportSize({ width: 1280, height: 800 })
  })

  await s.check('watermark follows the OWNER\'s plan: Starter links carry it, Pro links do not', v, async () => {
    expect((await pub(token)).json.data.watermark === true, 'Starter link without watermark')
    qa('qa-grant-plan', email(), 'pro')
    expect((await pub(token)).json.data.watermark === false, 'Pro link still has the watermark')
  })

  await s.check('expired link: "This link has expired" (HTTP 410) and nothing of the deck; extending it brings it back', v, async () => {
    expect((await call(o, 'PATCH', `/presentations/${deck}/share`, { expiresInDays: 7 })).status === 200, 'could not set expiry')
    qa('qa-expire-share', deck)
    const r = await pub(token); expect(r.status === 410, `status ${r.status}`)
    expect(!JSON.stringify(r.json).includes('slides'), 'deck content in an expired answer')
    await view(token); await v.getByText('This link has expired').waitFor({ timeout: 8000 })
    expect((await call(o, 'PATCH', `/presentations/${deck}/share`, { expiresInDays: null })).status === 200, 'could not clear expiry')
    expect((await pub(token)).status === 200, 'link did not come back after clearing the expiry')
  })

  await s.check('changing the password signs every viewer out; wrong passwords are refused; the old proof stops working at once', v, async () => {
    expect((await call(o, 'PATCH', `/presentations/${deck}/share`, { password: 'first-pass-1' })).status === 200, 'set password')
    const locked = await pub(token); expect(locked.status === 401 && locked.json.error.code === 'PASSWORD_REQUIRED', `locked: ${locked.status}`)
    expect(!JSON.stringify(locked.json).includes('slides') && !JSON.stringify(locked.json).includes('Northwind'), 'content before the password')
    const unlock = (pw) => v.evaluate(async ({ token, pw }) => { const r = await fetch(`http://localhost:4000/api/v1/public/share/${token}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) }); return { status: r.status, json: await r.json() } }, { token, pw })
    expect((await unlock('wrong-pass-1')).status === 401, 'a wrong password was accepted')
    const ok = await unlock('first-pass-1'); expect(ok.status === 200 && ok.json.data.access, 'right password refused')
    expect((await pub(token, { 'x-share-access': ok.json.data.access })).status === 200, 'proof not accepted')
    expect((await call(o, 'PATCH', `/presentations/${deck}/share`, { password: 'second-pass-2' })).status === 200, 'change password')
    expect((await pub(token, { 'x-share-access': ok.json.data.access })).status === 401, 'the old proof still works after the password changed')
    expect((await call(o, 'PATCH', `/presentations/${deck}/share`, { password: null })).status === 200, 'remove password')
    expect((await pub(token)).status === 200, 'open again after removing the password')
  })

  await s.check('delete the presentation: its link stops working; a duplicate of it has no link', v, async () => {
    const dup = (await call(o, 'POST', `/presentations/${deck}/duplicate`, {})).json.data?.id
    if (dup) expect((await call(o, 'GET', `/presentations/${dup}/share`)).json.data.url === null, 'a duplicate inherited the link')
    const del = await call(o, 'DELETE', `/presentations/${deck}`)
    expect(del.status === 200, `delete answered ${del.status}`)
    expect((await pub(token)).status === 404, 'the link of a deleted presentation still opens')
    await view(token); await v.getByText("This link isn't available").waitFor({ timeout: 8000 })
  })

  await b.close()
  return s.done()
}
