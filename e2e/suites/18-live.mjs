import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { API, EDITOR, WEB, expect, launch, suite, uniqueEmail } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'
import { DECKS } from './03-create.mjs'

/** Real-time collaboration with two live browsers on the same deck: presence, pointers, text locks, live merging, per-person undo. */
export default async function () {
  const s = suite('18-live')
  const cwd = new URL('../..', import.meta.url).pathname
  const run = (cmd) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim().split('\n').pop()
  const owner = JSON.parse(readFileSync(ACCOUNT, 'utf8'))
  run(`scripts/qa-grant-plan.ts ${owner.email} pro`)
  const id = JSON.parse(readFileSync(DECKS, 'utf8')).ai.split('?')[0]
  const b = await launch()
  const octx = await b.newContext({ viewport: { width: 1400, height: 900 }, storageState: STATE })
  const op = await octx.newPage()
  const friendEmail = uniqueEmail('livefriend')
  const fctx = await b.newContext({ viewport: { width: 1400, height: 900 } })
  const fp = await fctx.newPage()
  const deck = async () => (await (await octx.request.get(`${API}/api/v1/presentations/${id}`)).json()).data
  const stage = (p) => p.locator('[data-testid=stage]')
  const poll = async (fn, ms = 12000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await op.waitForTimeout(250) } }

  await s.check('setup: owner invites a friend, the friend accepts, both open the same deck', op, async () => {
    // clean slate: remove earlier collaborators of this deck
    const list = await (await octx.request.get(`${API}/api/v1/presentations/${id}/members`)).json()
    for (const m of list.data?.members ?? []) await octx.request.delete(`${API}/api/v1/presentations/${id}/members/${m.id}`, { headers: { Origin: EDITOR } })
    const inv = await octx.request.post(`${API}/api/v1/presentations/${id}/members`, { headers: { Origin: EDITOR, 'Content-Type': 'application/json' }, data: { email: friendEmail } })
    expect(inv.ok(), `invite ${inv.status()}`)
    const su = await fctx.request.post(`${API}/api/auth/sign-up/email`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { email: friendEmail, password: 'Passw0rd!qa-test', name: 'Maya Friend' } })
    expect(su.ok(), `sign-up ${su.status()}`)
    const token = run(`scripts/qa-invite-token.ts ${friendEmail}`)
    const acc = await fctx.request.post(`${API}/api/v1/invites/${token}/accept`, { headers: { Origin: EDITOR } })
    expect(acc.ok(), `accept ${acc.status()}`)
    await Promise.all([op.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }), fp.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })])
    await stage(op).waitFor(); await stage(fp).waitFor()
  })

  await s.check('presence: each sees the other\'s avatar in the header and on the slide rail', op, async () => {
    expect(await poll(() => op.locator('[data-peer-avatar="Maya Friend"]').count()), 'owner does not see Maya')
    expect(await poll(() => fp.locator('[data-peer-avatar]').count()), 'friend does not see the owner')
    expect(await poll(() => op.locator('nav[aria-label=Slides] [aria-label$="viewing"]').count()), 'no "viewing" marker on the slide rail')
  })

  await s.check('pointer + selection: the friend\'s cursor and selected element show up on the owner\'s canvas with her name', op, async () => {
    const box = await stage(fp).boundingBox()
    await fp.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4)
    await fp.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45)
    expect(await poll(() => op.locator('[data-peer-cursor="Maya Friend"]').count()), 'no live cursor')
    const el = fp.locator('[data-testid=el-text]').first()
    await el.click()
    expect(await poll(() => op.locator('[data-peer-selection="Maya Friend"]').count()), 'selection outline not shown')
  })

  await s.check('text lock: while the friend types in a text box, the owner cannot edit that same box and is told why', op, async () => {
    const f = fp.locator('[data-testid=el-text]').first()
    await f.dblclick()
    await fp.getByRole('textbox', { name: 'Edit text' }).waitFor({ timeout: 5000 })
    await op.waitForTimeout(600)
    const label = await poll(async () => (await op.locator('[data-peer-selection="Maya Friend"]').first().innerText().catch(() => '')).includes('typing'))
    expect(label, 'owner is not told Maya is typing')
    await op.locator('[data-testid=el-text]').first().dblclick()
    await op.getByText(/Maya Friend is editing this text/).waitFor({ timeout: 5000 })
    expect(await op.getByRole('textbox', { name: 'Edit text' }).count() === 0, 'owner could enter the locked text box')
    await fp.keyboard.press('Escape')
  })

  await s.check('live merge: both people change DIFFERENT things at the same moment and both changes survive, with no conflict dialog', op, async () => {
    const stamp = Date.now() % 100000
    const ownerTitle = `Owner ${stamp}`, note = `Maya note ${stamp}`
    await op.keyboard.press('Escape'); await fp.keyboard.press('Escape')
    // friend: speaker notes on slide 1; owner: deck title — typed at the same time
    await fp.getByRole('button', { name: /Speaker notes/ }).click()
    const notes = fp.getByLabel('Speaker notes')
    const titleInput = op.getByLabel('Presentation title')
    await Promise.all([notes.fill(note), (async () => { await titleInput.fill(ownerTitle); await titleInput.press('Enter') })()])
    const merged = await poll(async () => { const d = await deck(); return d.title === ownerTitle && d.document.slides[0].speakerNotes === note ? d : null }, 20000)
    expect(merged, 'one of the two changes was lost on the server')
    // and each browser shows the other\'s change without reloading
    await op.getByRole('button', { name: /Speaker notes/ }).click().catch(() => {})
    expect(await poll(() => op.getByLabel('Speaker notes').inputValue().then((v) => v === note).catch(() => false), 15000), 'owner does not see Maya\'s note live')
    expect(await poll(() => fp.getByLabel('Presentation title').inputValue().then((v) => v === ownerTitle), 15000), 'friend does not see the new title live')
    expect(await op.getByRole('alert').filter({ hasText: /changed|conflict/i }).count() === 0, 'a conflict dialog appeared')
  })

  await s.check('undo is per person: the owner\'s undo reverts the owner\'s title change, not Maya\'s note', op, async () => {
    await op.locator('main').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
    await op.keyboard.press('Control+z')
    const d = await poll(async () => { const x = await deck(); return x.title !== 'x' && !x.title.startsWith('Owner ') ? x : null }, 15000)
    expect(d, 'owner undo did not revert the title')
    const note = (await deck()).document.slides[0].speakerNotes
    expect(/^Maya note \d+$/.test(note), `Maya's note was lost: "${note}"`)
  })

  await s.check('access ends live: when the owner removes Maya her editor is told immediately', op, async () => {
    const list = await (await octx.request.get(`${API}/api/v1/presentations/${id}/members`)).json()
    for (const m of list.data.members) await octx.request.delete(`${API}/api/v1/presentations/${id}/members/${m.id}`, { headers: { Origin: EDITOR } })
    await fp.getByText(/Your access to this presentation has ended/).waitFor({ timeout: 10000 })
  })

  await b.close()
  return s.done()
}
