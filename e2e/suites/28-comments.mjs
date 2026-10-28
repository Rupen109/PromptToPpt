import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { API, EDITOR, RESULTS, WEB, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, openDeck, person, saved, stage, tsx } from '../kits-lib.mjs'

/**
 * C6 comments — real browser, real server, real database, TWO real accounts (owner + invited collaborator), real emails read from the server's
 * mail log. No AI. Flow ids refer to docs/COMMENTS_C6_FUNCTIONAL_FLOWS.md.
 */
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const API_LOG = process.env.API_LOG ?? '/private/tmp/api.log'

export default async function () {
  const s = suite('28-comments')
  const b = await launch()
  const O = await person(b, 'cmo', 'pro')
  const F = await person(b, 'cmf')
  const o = O.p, f = F.p
  for (const x of [o, f]) x.on('dialog', (d) => void d.accept())
  const UNIQ = `m${Date.now() % 1e6}`
  const panel = (p) => p.locator('aside[aria-label="Comments"]')
  const openPanel = async (p) => { if (!(await panel(p).count())) await p.getByRole('toolbar').getByRole('button', { name: /^Comments/ }).click(); await panel(p).waitFor({ timeout: 8000 }) }
  const composer = (p) => panel(p).getByLabel('Write a comment')
  const send = (p) => panel(p).getByRole('button', { name: 'Comment', exact: true })
  const say = async (p, text) => { await composer(p).fill(text); await send(p).click() }
  const threadWith = (p, text) => panel(p).locator('article[data-thread-id]').filter({ hasText: text })
  const counts = (deck) => JSON.parse(tsx(`scripts/qa-comments.ts counts ${deck}`))
  const mailsFor = (email) => { try { return readFileSync(API_LOG, 'utf8').split('\n').filter((l) => l.includes(`[mail → ${email}]`)).length } catch { return -1 } }
  const myId = async (A) => (await (await A.ctx.request.get(`${API}/api/v1/me`)).json()).data.id
  let deck

  try {
    // ───────── setup: owner's deck with 4 slides, friend invited and accepted ─────────
    await s.check('setup: a deck with four slides, a collaborator invited through the real invitation flow', o, async () => {
      deck = await newDeck(O, 'Comments deck'); O.id = deck
      await openDeck(o, deck)
      for (let i = 0; i < 3; i++) { await o.getByRole('button', { name: '+ New slide' }).click(); await o.getByRole('menuitem', { name: 'Blank slide' }).click(); await o.waitForTimeout(300) }
      await saved(o); await o.waitForTimeout(1800)
      const fe = F.email
      const inv = await api.post(O, `/presentations/${deck}/members`, { email: fe }); expect(inv.status === 201 || inv.status === 200, `invite ${inv.status}`)
      const token = tsx(`scripts/qa-invite-token.ts ${fe}`)
      await f.goto(`${EDITOR}/invite/${token}`, { waitUntil: 'networkidle' }); await f.getByRole('button', { name: /Accept and open/ }).click(); await f.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 15000 })
      await stage(f).waitFor({ timeout: 15000 })
      expect(await o.locator('[data-testid^="thumb-"]').count() === 4, 'the owner does not have four slides')
    })

    // ───────── A1 + A2 ─────────
    await s.check('A1 + A2 the owner and the collaborator both open Comments; the empty state explains what comments are (and that they stay out of the slides)', o, async () => {
      for (const p of [o, f]) { await openPanel(p); await panel(p).getByLabel('No comments yet').waitFor({ timeout: 8000 }); expect(/never appear on the slides/.test(await panel(p).innerText()), 'the empty state does not say where comments do not appear') }
      expect(await o.getByRole('toolbar').getByRole('button', { name: /^Comments/ }).getAttribute('aria-pressed') === 'true', 'the toolbar button does not show it is open')
    })

    // ───────── B1 + E1 + E2 + B3 ─────────
    await s.check('B1 + E1 a comment on a slide shows in the owner\'s panel, the slide\'s bubble and the toolbar count; the collaborator sees it live with an unread dot', o, async () => {
      await f.getByRole('toolbar').getByRole('button', { name: /^Comments/ }).click() // close the collaborator's panel so the dot can show
      await panel(f).waitFor({ state: 'detached' })
      await o.getByTestId('thumb-0').click() // the owner has just added slides, so slide 4 is active: comment on slide 1
      await say(o, `First note ${UNIQ}`)
      await threadWith(o, `First note ${UNIQ}`).waitFor({ timeout: 8000 })
      expect(await o.getByTestId('comment-badge-0').innerText().then((t) => /1/.test(t)), 'the slide bubble does not show 1')
      expect(await o.getByTestId('comments-count').innerText() === '1', 'the toolbar count is not 1')
      await f.getByTestId('comments-unread').waitFor({ timeout: 6000 }) // E1: live, without reloading
      expect(await f.getByTestId('comment-badge-0').count() === 1, 'the collaborator\'s slide bubble is missing')
      expect(await o.getByTestId('comments-unread').count() === 0, 'E2: the author got an unread dot for their own comment')
    })

    await s.check('E2 + B3 opening the panel clears the dot; a reply from the collaborator appears for the owner in order, with name and time', o, async () => {
      await openPanel(f)
      await threadWith(f, `First note ${UNIQ}`).waitFor({ timeout: 6000 })
      await f.waitForFunction(() => !document.querySelector('[data-testid="comments-unread"]'), null, { timeout: 6000 })
      const t = threadWith(f, `First note ${UNIQ}`)
      await t.getByRole('button', { name: 'Reply' }).click(); await t.getByLabel('Reply').fill(`Reply ${UNIQ}`); await t.getByRole('button', { name: 'Reply', exact: true }).last().click()
      await threadWith(o, `Reply ${UNIQ}`).waitFor({ timeout: 6000 })
      const items = await threadWith(o, `First note ${UNIQ}`).locator('li[data-comment-id]').allInnerTexts()
      expect(items.length === 2 && /First note/.test(items[0]) && /Reply/.test(items[1]) && /ago|just now/.test(items[1]), `thread: ${JSON.stringify(items)}`)
    })

    // ───────── B2 pins ─────────
    await s.check('B2 "Pin to a spot": click the slide, a numbered pin appears exactly there, stays put when the window is resized, and clicking it opens its thread', o, async () => {
      await o.getByRole('button', { name: /Pin to a spot/ }).click()
      const st = await stage(o).boundingBox()
      await o.getByTestId('pin-overlay').click({ position: { x: st.width * 0.3, y: st.height * 0.4 } })
      await o.getByText(/Pinned on slide 1/).waitFor({ timeout: 4000 }); await o.locator('[data-comment-pin-draft]').waitFor()
      await say(o, `Pinned note ${UNIQ}`)
      const pin = o.locator('[data-comment-pin]').first(); await pin.waitFor({ timeout: 6000 })
      const frac = async () => { const sb = await stage(o).boundingBox(); const pb = await pin.boundingBox(); return { x: (pb.x + pb.width / 2 - sb.x) / sb.width, y: (pb.y + pb.height - sb.y) / sb.height } }
      const a = await frac(); expect(Math.abs(a.x - 0.3) < 0.03 && Math.abs(a.y - 0.4) < 0.03, `pin at ${JSON.stringify(a)}, wanted about 0.3/0.4`)
      expect((await pin.innerText()).trim() === '1', 'the pin is not numbered 1')
      await o.setViewportSize({ width: 1100, height: 800 }); await o.waitForTimeout(400)
      const b2 = await frac(); expect(Math.abs(b2.x - a.x) < 0.02 && Math.abs(b2.y - a.y) < 0.02, `the pin moved when the window was resized: ${JSON.stringify([a, b2])}`)
      await o.setViewportSize({ width: 1500, height: 950 })
      await pin.click(); await o.waitForFunction(() => document.querySelector('article[data-thread-id].ring-2') !== null, null, { timeout: 4000 })
      expect(await threadWith(o, `Pinned note ${UNIQ}`).evaluate((el) => el.className.includes('ring-primary')), 'clicking the pin did not highlight its thread')
    })

    // ───────── B4 / B5 / B6 / B7 / G2 ─────────
    await s.check('B4 + G2 empty and too-long comments are refused with a plain message and the draft is kept; when the API is down the draft is kept and Send works again', o, async () => {
      expect(await send(o).isDisabled(), 'Send is enabled for an empty comment')
      await composer(o).fill('   '); expect(await send(o).isDisabled(), 'Send is enabled for spaces')
      await composer(o).fill('x'.repeat(2001)); await send(o).click()
      expect(/up to 2000/.test(await panel(o).getByRole('alert').first().innerText()), 'no length message')
      expect(await composer(o).inputValue() === 'x'.repeat(2001), 'the long draft was lost')
      await composer(o).fill(`Draft kept ${UNIQ}`)
      await o.route('**/api/v1/presentations/*/comments', (r) => r.request().method() === 'POST' ? r.abort('failed') : r.continue())
      await send(o).click(); await panel(o).getByRole('alert').first().waitFor({ timeout: 6000 })
      expect(!/TypeError|fetch failed|stack/.test(await panel(o).getByRole('alert').first().innerText()), 'technical text shown')
      expect(await composer(o).inputValue() === `Draft kept ${UNIQ}`, 'the draft was lost when the API failed')
      await o.unroute('**/api/v1/presentations/*/comments')
      await send(o).click(); await threadWith(o, `Draft kept ${UNIQ}`).waitFor({ timeout: 6000 })
      expect(await composer(o).inputValue() === '', 'the box was not cleared after sending')
    })

    await s.check('B5 + B6 HTML, script and emoji show as plain text and nothing runs; Enter adds a line, Cmd/Ctrl+Enter sends', o, async () => {
      const evil = `<img src=x onerror="window.__pwn=1"><b>bold</b> 😀 مرحبا ${UNIQ}x`
      await composer(o).fill(evil); await o.keyboard.press('Meta+Enter')
      const t = threadWith(o, `bold`); await t.first().waitFor({ timeout: 6000 })
      expect((await t.first().innerText()).includes('<img src=x'), 'the HTML is not shown as text')
      expect(await o.evaluate(() => window.__pwn === undefined), 'a comment ran code')
      expect(await panel(o).locator('b, img').count() === 0, 'HTML was rendered inside the panel')
      await composer(o).fill('line1'); await o.keyboard.press('Enter'); await o.keyboard.type('line2')
      expect(await composer(o).inputValue() === 'line1\nline2', 'Enter did not add a line'); await o.keyboard.press('Meta+Enter')
      await panel(o).locator('article').filter({ hasText: 'line2' }).first().waitFor({ timeout: 6000 })
      expect(await o.locator('[data-testid="stage"]').innerText().then((x) => !x.includes('line1')), 'a comment appeared on the slide itself')
      await composer(o).fill('text'); await o.keyboard.press('Escape'); expect(await composer(o).inputValue() === 'text', 'Escape in the composer cleared the draft unexpectedly') // Esc only closes pickers / cancels edits
      await composer(o).fill('')
    })

    await s.check('B7 a double click on Comment posts one comment; typing in the box never deletes or undoes the slide', o, async () => {
      const before = counts(deck).threads
      await composer(o).fill(`Once only ${UNIQ}`); await send(o).dblclick()
      await threadWith(o, `Once only ${UNIQ}`).first().waitFor({ timeout: 6000 }); await o.waitForTimeout(800)
      expect(counts(deck).threads === before + 1, `${counts(deck).threads - before} threads were created by a double click`)
      await composer(o).fill('abc'); for (const k of ['Backspace', 'Delete', 'Meta+z', 'Meta+a']) await o.keyboard.press(k)
      expect(await o.locator('[data-testid^="thumb-"]').count() === 4, 'keys typed in the comment box changed the slides')
      await composer(o).fill('')
    })

    // ───────── C: mentions and email ─────────
    await s.check('C1 + C2 typing @ lists the owner and the collaborator (names only), arrows + Enter pick one; the mention is highlighted and the person gets ONE email with the excerpt', o, async () => {
      const fid = await myId(F); void fid
      const fname = (await (await F.ctx.request.get(`${API}/api/v1/me`)).json()).data.name
      await composer(o).fill('Please look at this '); await composer(o).pressSequentially('@')
      const list = panel(o).getByRole('listbox', { name: 'People you can mention' }); await list.waitFor({ timeout: 3000 })
      const names = await list.locator('li').allInnerTexts(); expect(names.length === 2 && names.every((n) => !n.includes('@example.com') && !n.includes('example')), `people list: ${names}`)
      await o.keyboard.press('ArrowDown'); await o.keyboard.press('ArrowUp'); await o.keyboard.press('Enter')
      const picked = await composer(o).inputValue(); expect(/@\S/.test(picked), `nothing was inserted: "${picked}"`)
      // pick the collaborator explicitly so the email goes to them
      await composer(o).fill('Please look at this '); await composer(o).pressSequentially(`@${fname.slice(0, 2)}`)
      await list.waitFor(); await list.getByRole('option').filter({ hasText: 'collaborator' }).click() // both test accounts are called "Kit QA": the pick must be exact
      expect((await composer(o).inputValue()).includes(`@${fname}`), `the collaborator was not inserted: "${await composer(o).inputValue()}"`)
      const mailsBefore = mailsFor(F.email)
      await composer(o).pressSequentially(`wording ${UNIQ}`); await send(o).click()
      const t = threadWith(o, `wording ${UNIQ}`); await t.waitFor({ timeout: 6000 })
      expect(await t.locator('[data-mention]').first().innerText() === `@${fname}`, 'the mention is not highlighted')
      await o.waitForTimeout(1500)
      if (mailsBefore >= 0) expect(mailsFor(F.email) === mailsBefore + 1, `${mailsFor(F.email) - mailsBefore} email(s) were sent to the mentioned person`)
      await f.waitForTimeout(1500); await threadWith(f, `wording ${UNIQ}`).locator('[data-mention]').first().waitFor({ timeout: 6000 })
    })

    // ───────── D: managing threads ─────────
    await s.check('D1 + D4 the collaborator resolves a thread; the owner sees it under Resolved (and its pin is gone), then reopens it; the filters and "only this slide" work', o, async () => {
      const t = threadWith(f, `Pinned note ${UNIQ}`); await t.getByRole('button', { name: 'Resolve' }).click()
      await panel(o).locator(`article[data-status="resolved"]`).filter({ hasText: `Pinned note ${UNIQ}` }).waitFor({ timeout: 2000 }).catch(() => {})
      await panel(o).getByRole('button', { name: /^Resolved/ }).click()
      const rt = panel(o).locator('article[data-status="resolved"]').filter({ hasText: `Pinned note ${UNIQ}` }); await rt.waitFor({ timeout: 6000 })
      expect(/Resolved by/.test(await rt.innerText()), 'no "Resolved by …"'); expect(await o.locator('[data-comment-pin]').count() === 0, 'the pin of a resolved thread is still on the slide')
      await panel(o).getByRole('button', { name: /^Open/ }).click(); expect(await threadWith(o, `Pinned note ${UNIQ}`).count() === 0, 'a resolved thread shows in Open')
      await panel(o).getByRole('button', { name: 'All', exact: true }).click(); expect(await threadWith(o, `Pinned note ${UNIQ}`).count() === 1, 'All does not show it')
      await rt.getByRole('button', { name: 'Reopen' }).click(); await panel(o).getByRole('button', { name: /^Open/ }).click()
      await threadWith(o, `Pinned note ${UNIQ}`).waitFor({ timeout: 6000 }); await o.locator('[data-comment-pin]').first().waitFor()
      await panel(o).getByRole('button', { name: 'Only this slide' }).click(); expect(await panel(o).locator('article[data-thread-id]').count() >= 4, 'slide 1 threads are missing')
      await panel(o).getByRole('button', { name: 'All slides' }).click()
    })

    await s.check('D2 + D3 only the author sees Edit; the edit shows "edited" to the other person; Delete is offered on own comments (the owner on all); deleting the first comment removes the thread', o, async () => {
      const ft = threadWith(f, `First note ${UNIQ}`)
      const reply = ft.locator('li[data-comment-id]').filter({ hasText: `Reply ${UNIQ}` })
      await reply.getByRole('button', { name: /^Edit comment/ }).click(); await ft.getByLabel('Edit comment').fill(`Reply edited ${UNIQ}`); await ft.getByRole('button', { name: 'Save' }).click()
      const ot = threadWith(o, `First note ${UNIQ}`)
      await ot.locator('li[data-comment-id]').filter({ hasText: `Reply edited ${UNIQ}` }).waitFor({ timeout: 6000 })
      expect(/edited/.test(await ot.locator('li[data-comment-id]').nth(1).innerText()), 'no "edited" mark')
      expect(await ot.locator('li[data-comment-id]').nth(1).getByRole('button', { name: /^Edit comment/ }).count() === 0, 'the owner is offered Edit on the collaborator\'s comment')
      expect(await ft.locator('li[data-comment-id]').nth(0).getByRole('button', { name: /^Delete comment/ }).count() === 0, 'the collaborator is offered Delete on the owner\'s comment')
      await ot.locator('li[data-comment-id]').nth(1).getByRole('button', { name: /^Delete comment/ }).click() // the owner removes the collaborator's reply
      await f.waitForFunction((t) => !document.body.innerText.includes(t), `Reply edited ${UNIQ}`, { timeout: 6000 })
      await ot.locator('li[data-comment-id]').nth(0).getByRole('button', { name: /^Delete comment/ }).click()
      await o.waitForFunction((t) => !document.body.innerText.includes(t), `First note ${UNIQ}`, { timeout: 6000 })
      await f.waitForFunction((t) => !document.body.innerText.includes(t), `First note ${UNIQ}`, { timeout: 6000 })
    })

    await s.check('D5 clicking a thread on another slide jumps to that slide and highlights its pin', o, async () => {
      await o.getByTestId('thumb-2').click(); await o.waitForFunction(() => document.querySelector('[data-testid="thumb-2"]')?.getAttribute('aria-current') === 'true')
      await panel(o).locator('article[data-thread-id]').filter({ hasText: `Pinned note ${UNIQ}` }).locator('li').first().click()
      await o.waitForFunction(() => document.querySelector('[data-testid="thumb-0"]')?.getAttribute('aria-current') === 'true', null, { timeout: 4000 })
      await o.locator('[data-comment-pin]').first().waitFor({ timeout: 4000 })
    })

    await s.check('D6 deleting the slide a thread is on moves it under "On removed slides"; undo brings it back to the slide', o, async () => {
      await o.getByTestId('thumb-0').click({ button: 'right' }); await o.getByRole('menuitem', { name: 'Delete slide' }).click()
      await panel(o).getByRole('region', { name: 'On removed slides' }).waitFor({ timeout: 6000 })
      expect(await panel(o).getByRole('region', { name: 'On removed slides' }).innerText().then((t) => t.includes(`Pinned note ${UNIQ}`)), 'the thread is not under removed slides')
      await stage(o).click({ position: { x: 5, y: 5 } }); await o.keyboard.press('Meta+z')
      await panel(o).getByRole('region', { name: 'Slide 1' }).waitFor({ timeout: 6000 })
      expect(await panel(o).getByRole('region', { name: 'On removed slides' }).count() === 0, 'the thread did not come back after undo')
    })

    // ───────── E: live edge cases ─────────
    await s.check('E4 two people post at the same moment: both appear once, for both', o, async () => {
      const slideId = (await (await O.ctx.request.get(`${API}/api/v1/presentations/${deck}`)).json()).data.document.slides[0].id
      const post = (A, t) => A.ctx.request.post(`${API}/api/v1/presentations/${deck}/comments`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { slideId, body: t } })
      await Promise.all([post(O, `Same time A ${UNIQ}`), post(F, `Same time B ${UNIQ}`)])
      for (const p of [o, f]) for (const t of ['Same time A', 'Same time B']) { await threadWith(p, `${t} ${UNIQ}`).first().waitFor({ timeout: 6000 }); expect(await threadWith(p, `${t} ${UNIQ}`).count() === 1, `${t} shows twice`) }
    })

    await s.check('E3 the owner goes offline, the collaborator keeps commenting; when the owner is back the comments catch up (live reconnect or the next refresh)', o, async () => {
      await O.ctx.setOffline(true); await o.waitForTimeout(500)
      const slideId = (await (await F.ctx.request.get(`${API}/api/v1/presentations/${deck}`)).json()).data.document.slides[0].id
      await F.ctx.request.post(`${API}/api/v1/presentations/${deck}/comments`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { slideId, body: `While offline ${UNIQ}` } })
      await o.waitForTimeout(1500); expect(await threadWith(o, `While offline ${UNIQ}`).count() === 0, 'it arrived while offline?')
      await O.ctx.setOffline(false)
      await threadWith(o, `While offline ${UNIQ}`).waitFor({ timeout: 70000 })
    })

    // ───────── F: comments stay out of the content ─────────
    await s.check('F1 Present mode and the view-only link page show no comment text and no pins', o, async () => {
      const link = await api.post(O, `/presentations/${deck}/share`); const token = link.data.url.split('/s/')[1]
      const v = await b.newContext(); const vp = await v.newPage(); await vp.goto(`${EDITOR}/s/${token}`, { waitUntil: 'networkidle' }); await vp.waitForTimeout(1500)
      const vt = await vp.locator('body').innerText(); expect(!vt.includes(UNIQ) && !vt.includes('Pinned note') && !/Comment thread|Write a comment/.test(vt), 'the share page shows comments'); expect(await vp.locator('[data-comment-pin]').count() === 0, 'pins on the share page'); await v.close()
      await o.goto(`${EDITOR}/present/${deck}`, { waitUntil: 'networkidle' }); await o.getByTestId('present').waitFor({ timeout: 8000 }); await o.waitForTimeout(800)
      const pt = await o.locator('body').innerText(); expect(!pt.includes(UNIQ), 'Present mode shows comment text'); expect(await o.locator('[data-comment-pin]').count() === 0, 'pins in Present mode')
    })

    await s.check('F2 + F6 exported files contain no comment text; comments never change the deck\'s revision or the undo history', o, async () => {
      await openDeck(o, deck)
      const rev0 = (await (await O.ctx.request.get(`${API}/api/v1/presentations/${deck}`)).json()).data.revision
      await openPanel(o); await say(o, `Revision check ${UNIQ}`); await threadWith(o, `Revision check ${UNIQ}`).waitFor({ timeout: 6000 }); await o.waitForTimeout(2500)
      expect((await (await O.ctx.request.get(`${API}/api/v1/presentations/${deck}`)).json()).data.revision === rev0, 'a comment changed the deck\'s revision')
      expect(await o.getByRole('button', { name: 'Undo' }).isDisabled(), 'a comment made the deck undoable')
      const [dl] = await Promise.all([o.waitForEvent('download', { timeout: 120000 }), (async () => { await o.getByRole('button', { name: /^Export/ }).click(); await o.getByRole('menuitem', { name: /^PPTX/ }).click() })()])
      const path = join(RESULTS, `28-comments-${Date.now()}.pptx`); await dl.saveAs(path)
      const z = unzipSync(new Uint8Array(readFileSync(path))); const all = Object.values(z).map((u) => { try { return strFromU8(u) } catch { return '' } }).join('')
      expect(!all.includes(UNIQ) && !all.includes('Pinned note') && !all.includes('First note'), 'comment text is inside the exported PPTX')
    })

    await s.check('F4 Duplicate starts with no comments; the original keeps its own', o, async () => {
      await o.getByRole('button', { name: 'More' }).click(); await o.getByRole('menuitem', { name: 'Duplicate presentation' }).click()
      await o.waitForURL((u) => !u.pathname.endsWith(deck) && /\/edit\//.test(u.pathname), { timeout: 20000 }); await stage(o).waitFor({ timeout: 15000 })
      const copy = new URL(o.url()).pathname.split('/').pop()
      await openPanel(o); await panel(o).getByLabel('No comments yet').waitFor({ timeout: 8000 })
      expect(counts(copy).threads === 0 && counts(deck).threads >= 3, `copy ${counts(copy).threads}, original ${counts(deck).threads}`)
      await openDeck(o, deck)
    })

    // ───────── A4: removed collaborator ─────────
    await s.check('A4 removing the collaborator ends their access at once (banner, no comments); their earlier comments stay for the owner with their name', o, async () => {
      const members = await api.get(O, `/presentations/${deck}/members`); const m = members.data.members.find((x) => x.email === F.email)
      expect((await api.del(O, `/presentations/${deck}/members/${m.id}`)).status < 300, 'removal failed')
      await f.getByText(/Your access to this presentation has ended/).waitFor({ timeout: 15000 })
      expect((await api.get(F, `/presentations/${deck}/comments`)).status === 404, 'the removed person can still read comments')
      await openDeck(o, deck); await openPanel(o); const fname = (await (await F.ctx.request.get(`${API}/api/v1/me`)).json()).data.name
      await panel(o).getByRole('button', { name: 'All', exact: true }).click(); await threadWith(o, `While offline ${UNIQ}`).waitFor({ timeout: 6000 })
      expect((await threadWith(o, `While offline ${UNIQ}`).innerText()).includes(fname), 'the removed person\'s name is gone from their comments')
    })

    // ───────── G3 / G4 / G5 ─────────
    await s.check('G3 300 threads on one deck: the panel opens fast and the slide rail stays responsive', o, async () => {
      const big = await newDeck(O, 'Many comments'); tsx(`scripts/qa-comments.ts fill ${big} ${O.email} 300`)
      await o.goto(`${EDITOR}/edit/${big}`, { waitUntil: 'networkidle' }); await stage(o).waitFor({ timeout: 20000 })
      const t0 = Date.now(); await o.getByRole('toolbar').getByRole('button', { name: /^Comments/ }).click(); await panel(o).locator('article[data-thread-id]').first().waitFor({ timeout: 15000 })
      expect(Date.now() - t0 < 5000, `the panel took ${Date.now() - t0} ms`); expect(await o.getByTestId('comments-count').innerText() === '300', 'the toolbar count is not 300')
      const t1 = Date.now(); await panel(o).getByRole('button', { name: 'All', exact: true }).click(); await o.waitForTimeout(100); expect(Date.now() - t1 < 4000, 'switching the filter was slow')
    })

    await s.check('G4 phone width (390 px): the panel is a sheet that fits, the composer and Comment are reachable, and nothing scrolls sideways', o, async () => {
      const pc = await b.newContext({ viewport: { width: 390, height: 780 }, storageState: await O.ctx.storageState() }); const pp = await pc.newPage()
      await pp.goto(`${EDITOR}/edit/${deck}`, { waitUntil: 'networkidle' }); await stage(pp).waitFor({ timeout: 20000 })
      await pp.getByRole('toolbar').getByRole('button', { name: /^Comments/ }).click(); const pnl = panel(pp); await pnl.waitFor()
      const box = await pnl.boundingBox(); expect(box.x >= 0 && box.x + box.width <= 391, `panel wider than the screen: ${JSON.stringify(box)}`)
      await composer(pp).scrollIntoViewIfNeeded(); await composer(pp).fill(`Phone ${UNIQ}`); const btn = send(pp); await btn.scrollIntoViewIfNeeded(); await btn.click()
      await threadWith(pp, `Phone ${UNIQ}`).first().waitFor({ timeout: 8000 })
      expect(await pp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the page scrolls sideways')
      await pp.screenshot({ path: join(RESULTS, '28-comments-phone.png') }); await pc.close()
    })

    await s.check('G5 every control in the panel has a name and the Tab key reaches the composer, Comment, Reply and Resolve', o, async () => {
      await openDeck(o, deck); await openPanel(o); await panel(o).locator('article[data-thread-id]').first().waitFor({ timeout: 8000 })
      const unnamed = await o.evaluate(() => [...document.querySelectorAll('aside[aria-label="Comments"] button, aside[aria-label="Comments"] textarea, aside[aria-label="Comments"] input')].filter((e) => !(e.getAttribute('aria-label') || e.labels?.[0]?.textContent || e.textContent || '').trim()).map((e) => e.outerHTML.slice(0, 80)))
      expect(unnamed.length === 0, `controls without a name: ${unnamed.join(' | ')}`)
      await composer(o).fill('typed so Comment is enabled'); const reached = new Set()
      for (let i = 0; i < 25; i++) { await o.keyboard.press('Tab'); reached.add(await o.evaluate(() => (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent || '').trim())) }
      for (const need of ['Comment', 'Reply', 'Resolve']) expect([...reached].some((t) => t === need), `Tab never reaches "${need}" (${[...reached].slice(0, 8).join(' | ')})`)
    })
    await s.check('G5 the open Comments panel (with pins, threads, the composer and the mention list) has no serious or critical accessibility violations (axe, WCAG A/AA)', o, async () => {
      await openDeck(o, deck); await openPanel(o); await panel(o).locator('article[data-thread-id]').first().waitFor({ timeout: 8000 })
      await composer(o).fill('Hello @'); await panel(o).getByRole('listbox', { name: 'People you can mention' }).waitFor({ timeout: 3000 }).catch(() => {})
      await o.addScriptTag({ content: axeSrc })
      const res = await o.evaluate(() => axe.run(document.querySelector('aside[aria-label="Comments"]'), { runOnly: ['wcag2a', 'wcag2aa'], resultTypes: ['violations'] }))
      const bad = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
      expect(bad.length === 0, bad.map((v) => `${v.id}(${v.nodes.length}) e.g. ${v.nodes[0].html.slice(0, 90)}`).join(' | '))
    })
  } finally {
    await b.close()
  }
  return s.done()
}
