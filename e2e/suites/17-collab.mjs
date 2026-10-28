import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { API, EDITOR, WEB, expect, launch, suite, uniqueEmail } from '../lib.mjs'
import { ACCOUNT, STATE } from './02-auth.mjs'
import { DECKS } from './03-create.mjs'

/** Share links and collaboration through the real UI, with two browsers (owner, invited friend) and one anonymous visitor. */
export default async function () {
  const s = suite('17-collab')
  const cwd = new URL('../..', import.meta.url).pathname
  const run = (cmd) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env ${cmd}`, { cwd, stdio: 'pipe' }).toString().trim().split('\n').pop()
  const owner = JSON.parse(readFileSync(ACCOUNT, 'utf8'))
  run(`scripts/qa-grant-plan.ts ${owner.email} pro`)
  const id = JSON.parse(readFileSync(DECKS, 'utf8')).ai.split('?')[0]
  const b = await launch()
  const octx = await b.newContext({ viewport: { width: 1400, height: 900 }, storageState: STATE })
  const op = await octx.newPage()
  op.on('dialog', (d) => void d.accept())
  let link = ''

  await s.check('owner: Share → view-only link is created and can be copied', op, async () => {
    await op.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    await op.getByRole('button', { name: /Share/ }).click()
    await op.getByRole('tab', { name: 'View-only link' }).click()
    await op.getByRole('button', { name: 'Create view-only link' }).click()
    const input = op.getByLabel('Share link'); await input.waitFor({ timeout: 8000 })
    link = await input.inputValue()
    expect(/\/s\/[A-Za-z0-9_-]{32}$/.test(link), `odd link ${link}`)
  })

  await s.check('anonymous visitor: the link opens a view-only deck with navigation, no editor controls, no speaker notes', null, async () => {
    const vctx = await b.newContext({ viewport: { width: 1200, height: 800 } })
    const vp = await vctx.newPage()
    await vp.goto(link, { waitUntil: 'networkidle' })
    await vp.getByText(/\d+ \/ \d+/).waitFor({ timeout: 10000 })
    expect(await vp.getByRole('button', { name: 'Next slide' }).isEnabled(), 'cannot go next')
    await vp.getByRole('button', { name: 'Next slide' }).click()
    expect(/2 \/ \d+/.test(await vp.locator('footer').innerText()), 'did not advance')
    expect(await vp.getByRole('button', { name: /Share|Export|Insert/ }).count() === 0, 'editor controls visible')
    expect(!/speaker notes/i.test(await vp.locator('body').innerText()), 'notes visible')
    await vctx.close()
  })

  await s.check('Pro: owner password-protects the link; a visitor must enter it (wrong password refused, right one opens), then the owner removes it', op, async () => {
    await op.getByLabel('Password', { exact: true }).fill('open-sesame-1')
    await op.getByRole('button', { name: 'Set', exact: true }).click()
    await op.getByText(/Password saved/).waitFor({ timeout: 8000 })
    const vctx = await b.newContext({ viewport: { width: 1200, height: 800 } })
    const vp = await vctx.newPage()
    await vp.goto(link, { waitUntil: 'networkidle' })
    await vp.getByText(/password-protected/).waitFor({ timeout: 8000 })
    expect(await vp.getByRole('button', { name: /Next slide/ }).count() === 0, 'slides visible before the password')
    await vp.getByLabel('Password').fill('not-the-password'); await vp.getByRole('button', { name: 'Open presentation' }).click()
    await vp.getByRole('alert').filter({ hasText: /not right/ }).waitFor({ timeout: 8000 })
    await vp.getByLabel('Password').fill('open-sesame-1'); await vp.getByRole('button', { name: 'Open presentation' }).click()
    await vp.getByText(/\d+ \/ \d+/).waitFor({ timeout: 10000 })
    await vp.reload({ waitUntil: 'networkidle' }) // the proof survives a reload in the same tab
    await vp.getByText(/\d+ \/ \d+/).waitFor({ timeout: 10000 })
    await vctx.close()
    await op.getByRole('button', { name: 'Remove password' }).click()
    await op.getByText(/Password removed/).waitFor({ timeout: 8000 })
  })

  await s.check('Pro: owner sets an expiry; the dialog confirms it', op, async () => {
    await op.getByLabel('Link expires').selectOption('7')
    await op.getByText(/stop working in 7 days/).waitFor({ timeout: 8000 })
    await op.getByLabel('Link expires').selectOption('never')
    await op.getByText(/no longer expires/).waitFor({ timeout: 8000 })
  })

  await s.check('owner turns the link off → it stops working immediately', op, async () => {
    await op.getByRole('button', { name: 'Turn the link off' }).click()
    await op.getByText(/Link turned off/).waitFor({ timeout: 8000 })
    const vctx = await b.newContext()
    const vp = await vctx.newPage()
    await vp.goto(link, { waitUntil: 'networkidle' })
    await vp.getByText(/isn't available/).waitFor({ timeout: 8000 })
    await vctx.close()
    await op.keyboard.press('Escape')
  })

  const friendEmail = uniqueEmail('friend')
  await s.check('owner invites a friend by email (Pro): the invitation shows as pending', op, async () => {
    await op.getByRole('button', { name: /Share/ }).click()
    await op.getByLabel('Email to invite').fill(friendEmail)
    await op.getByRole('button', { name: 'Invite', exact: true }).click()
    await op.getByText(/Invitation sent/).waitFor({ timeout: 8000 })
    expect(await op.getByRole('list', { name: 'People with access' }).innerText().then((t) => t.includes(friendEmail) && /Invited/.test(t)), 'not listed as invited')
    await op.keyboard.press('Escape')
  })

  const fctx = await b.newContext({ viewport: { width: 1400, height: 900 } })
  const fp = await fctx.newPage()
  fp.on('dialog', (d) => void d.accept())
  await s.check('friend signs up with that email, opens the invitation, accepts, and lands in the owner\'s deck as a collaborator', fp, async () => {
    const su = await fctx.request.post(`${API}/api/auth/sign-up/email`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { email: friendEmail, password: 'Passw0rd!qa-test', name: 'Friend' } })
    expect(su.ok(), `sign-up ${su.status()}`)
    const token = run(`scripts/qa-invite-token.ts ${friendEmail}`)
    await fp.goto(`${EDITOR}/invite/${token}`, { waitUntil: 'networkidle' })
    await fp.getByRole('button', { name: /Accept and open/ }).click()
    await fp.waitForURL(new RegExp(`/edit/${id}`), { timeout: 15000 })
    await fp.getByText('Collaborating').waitFor({ timeout: 10000 })
  })

  await s.check('collaborator has no Share / Export, can rename the deck, and the owner sees the change', fp, async () => {
    expect(await fp.getByRole('button', { name: /Share/ }).count() === 0, 'Share visible to collaborator')
    expect(await fp.getByRole('button', { name: 'Export' }).count() === 0, 'Export visible to collaborator')
    const title = `Co-edited ${Date.now() % 100000}`
    const input = fp.getByLabel('Presentation title')
    await input.fill(title); await input.press('Enter')
    // autosave is debounced and the status already said "Saved" before the edit: poll what the OWNER's account sees from the server
    let seen = ''
    for (let t = 0; t < 30 && seen !== title; t++) {
      await op.waitForTimeout(500)
      const r = await octx.request.get(`${API}/api/v1/presentations/${id}`)
      seen = (await r.json()).data?.title ?? ''
    }
    expect(seen === title, `owner sees "${seen}", expected "${title}"`)
    await op.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    expect(await op.getByLabel('Presentation title').inputValue() === title, 'owner editor does not show the change')
  })

  await s.check('the deck appears under "Shared with me" for the friend; a stranger account cannot open it', fp, async () => {
    await fp.goto(`${EDITOR}/shared`, { waitUntil: 'networkidle' })
    await fp.getByRole('link', { name: /Co-edited/ }).first().waitFor({ timeout: 8000 })
    const sctx = await b.newContext()
    await sctx.request.post(`${API}/api/auth/sign-up/email`, { headers: { Origin: WEB, 'Content-Type': 'application/json' }, data: { email: uniqueEmail('stranger'), password: 'Passw0rd!qa-test', name: 'Stranger' } })
    const sp = await sctx.newPage()
    await sp.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    await sp.getByText(/not found|Could not load/i).waitFor({ timeout: 8000 })
    await sctx.close()
  })

  await s.check('owner removes the friend → access ends at once', op, async () => {
    await op.getByRole('button', { name: /Share/ }).click()
    await op.getByRole('button', { name: `Remove ${friendEmail}` }).click()
    await op.getByRole('button', { name: `Remove ${friendEmail}` }).waitFor({ state: 'detached', timeout: 8000 })
    await fp.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' })
    await fp.getByText(/not found|Could not load/i).waitFor({ timeout: 8000 })
  })

  await b.close()
  return s.done()
}
