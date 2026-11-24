import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, newDeck, openDeck, person, tsx } from '../kits-lib.mjs'

/**
 * A collaborator who can VIEW and comment only (services/api collab/access.ts), in a real browser with TWO real accounts: the owner invites through the Share dialog
 * choosing "Can view and comment"; the viewer accepts the real invitation, opens a read-only editor (no toolbars, no AI, title and slides cannot change), can present
 * and comment; the server refuses their saves; the owner switches them to "Can edit" and the viewer's open editor becomes editable at once (live). No AI is used.
 */
export default async function () {
  const s = suite('97-viewer-role')
  const b = await launch()
  try {
    const O = await person(b, 'vwo', 'pro')
    const V = await person(b, 'vwv')
    const o = O.p, v = V.p
    for (const x of [o, v]) x.on('dialog', (d) => void d.accept())
    const deck = await newDeck(O, 'Viewer role deck')
    const share = () => o.getByRole('dialog', { name: 'Share presentation' })

    await s.check('the owner invites with "Can view and comment" in the Share dialog; the viewer accepts the real invitation', o, async () => {
      await openDeck(o, deck)
      await o.getByRole('button', { name: /^Share/ }).click()
      await share().getByLabel('Email to invite').fill(V.email)
      await share().getByLabel('What they can do').selectOption('viewer')
      await share().getByRole('button', { name: 'Invite' }).click()
      await share().getByText(/view and comment only/).waitFor({ timeout: 8000 })
      const token = tsx(`scripts/qa-invite-token.ts ${V.email}`)
      await v.goto(`${EDITOR}/invite/${token}`, { waitUntil: 'networkidle' }); await v.getByRole('button', { name: /Accept and open/ }).click()
      await v.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 15000 })
    })

    await s.check('the viewer\'s editor is read-only: "View only", no toolbar, no Insert / Style / Edit with AI, the title cannot change, dragging moves nothing', v, async () => {
      await v.locator('[data-testid="stage"]').waitFor({ timeout: 20000 })
      await v.getByTestId('view-only').waitFor({ timeout: 8000 })
      expect(await v.locator('[data-testid="tb-text"]').count() === 0, 'the top toolbar is there')
      expect(await v.getByRole('button', { name: /Edit with AI/ }).count() === 0, 'Edit with AI is offered')
      expect(await v.getByRole('button', { name: /^Style$/ }).count() === 0, 'Style is offered')
      expect(await v.getByLabel('Presentation title').getAttribute('readonly') !== null, 'the title can be typed in')
      const before = JSON.stringify((await api.get(O, `/presentations/${deck}`)).data.document.slides[0].elements.map((e) => [e.x, e.y]))
      const el = v.locator('[data-testid="stage"] [data-element]').first()
      const box = await el.boundingBox()
      await v.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await v.mouse.down(); await v.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 6 }); await v.mouse.up()
      await v.waitForTimeout(2500)
      const after = JSON.stringify((await api.get(O, `/presentations/${deck}`)).data.document.slides[0].elements.map((e) => [e.x, e.y]))
      expect(before === after, 'the viewer moved an object')
      expect(await v.locator('[data-handle]').count() === 0, 'resize handles are shown to a viewer')
    })

    await s.check('the viewer can present and comment; the server refuses a save from them (VIEW_ONLY)', v, async () => {
      expect(await v.getByRole('button', { name: /Present/ }).count() === 1, 'Present is missing')
      await v.getByRole('toolbar').getByRole('button', { name: /^Comments/ }).click()
      const panel = v.locator('aside[aria-label="Comments"]')
      await panel.getByLabel('Write a comment').fill('Please check slide one')
      await panel.getByRole('button', { name: 'Comment', exact: true }).click()
      await panel.locator('article[data-thread-id]').filter({ hasText: 'Please check slide one' }).waitFor({ timeout: 8000 })
      const cur = (await api.get(V, `/presentations/${deck}`)).data
      const r = await V.ctx.request.put(`http://localhost:4000/api/v1/presentations/${deck}`, { headers: { Origin: EDITOR }, data: { baseRevision: cur.revision, document: { ...cur.document, title: 'Changed by viewer' } } })
      expect(r.status() === 403 && (await r.json()).error.code === 'VIEW_ONLY', `save answered ${r.status()}`)
    })

    await s.check('the owner switches them to "Can edit": the viewer\'s open editor becomes editable at once (toolbar back, a message says so)', o, async () => {
      await share().getByLabel(`What ${V.email} can do`).selectOption('editor')
      await share().getByText(/can now edit/).waitFor({ timeout: 8000 })
      await v.getByText(/gave you edit access/).waitFor({ timeout: 15000 })
      await v.locator('[data-testid="tb-text"]').waitFor({ timeout: 8000 })
      expect(await v.getByTestId('view-only').count() === 0, '"View only" is still shown')
    })
  } finally {
    await b.close()
  }
  return s.done()
}
