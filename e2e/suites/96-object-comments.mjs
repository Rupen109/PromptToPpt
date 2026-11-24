import { API, expect, launch, suite } from '../lib.mjs'
import { api, openDeck, person } from '../kits-lib.mjs'

/**
 * A comment ON an object (packages/validation comment-pin.ts), in a real browser against the real server: right-click a picture → Comment… → the panel says which object;
 * the saved thread names the object; its pin sits at the object's corner and FOLLOWS it when the object moves; "On the picture" selects it; when the object is deleted the
 * comment stays and says so. No AI is used (the assistant's comment-on-object is covered by the scenario suite and a live case).
 */
export default async function () {
  const s = suite('96-object-comments')
  const b = await launch()
  try {
    const A = await person(b, 'b96', 'pro')
    const p = A.p
    p.on('dialog', (d) => void d.accept())
    const made = await api.post(A, '/presentations', { title: 'Object comments' })
    const id = made.data.id
    const cur = (await api.get(A, `/presentations/${id}`)).data
    const doc = cur.document
    doc.slides[0].elements = [{ type: 'image', id: 'pic1', x: 300, y: 200, width: 600, height: 400, rotation: 0, locked: false, zIndex: 1, opacity: 1, src: 'http://localhost:3100/logo-lockup.png', alt: 'logo', fit: 'contain', clip: 'none' }]
    const put = await A.ctx.request.put(`${API}/api/v1/presentations/${id}`, { headers: { Origin: 'http://localhost:3001' }, data: { baseRevision: cur.revision, document: doc } })
    expect(put.ok(), `seed ${put.status()}`)
    const panel = () => p.locator('aside[aria-label="Comments"]')
    const threads = async () => (await api.get(A, `/presentations/${id}/comments`)).data.threads
    const pinBox = async () => p.locator('[data-comment-pin]').first().boundingBox()
    const picBox = async () => p.locator('[data-testid="stage"] [data-element="pic1"]').boundingBox()

    await s.check('right-click the picture → Comment…: the panel opens on "On the picture"; the saved thread names the object', p, async () => {
      await openDeck(p, id)
      await p.locator('[data-testid="stage"] [data-element="pic1"]').click({ button: 'right', force: true })
      await p.getByRole('menuitem', { name: 'Comment…' }).click()
      await panel().waitFor({ timeout: 8000 })
      expect(/On the picture on slide 1/.test(await panel().innerText()), 'the panel does not say which object')
      await panel().getByLabel('Write a comment').fill('Use the new logo here')
      await panel().getByRole('button', { name: 'Comment', exact: true }).click()
      await panel().locator('article[data-thread-id]').filter({ hasText: 'Use the new logo here' }).waitFor({ timeout: 8000 })
      const t = (await threads()).find((x) => x.comments[0].body === 'Use the new logo here')
      expect(t?.elementId === 'pic1', `thread: ${JSON.stringify(t)}`)
      expect(await panel().locator('[data-comment-object="pic1"]').count() === 1, 'the thread does not name the object')
    })

    await s.check('the pin sits at the picture\'s top-right corner and follows it when it moves', p, async () => {
      const near = async () => { const a = await pinBox(), c = await picBox(); return Math.abs(a.x + a.width / 2 - (c.x + c.width)) < 12 && Math.abs(a.y + a.height - c.y) < 12 }
      expect(await near(), 'the pin is not at the corner')
      const before = await pinBox()
      await p.locator('[data-testid="stage"] [data-element="pic1"]').click({ force: true })
      for (let i = 0; i < 10; i++) await p.keyboard.press('Shift+ArrowRight')
      await p.waitForTimeout(400)
      const after = await pinBox()
      expect(after.x - before.x > 20, `the pin did not move with the picture (${before.x} → ${after.x})`)
      expect(await near(), 'the pin left the corner after the move')
    })

    await s.check('"On the picture" selects the object on the slide', p, async () => {
      await p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 } })
      await panel().locator('[data-comment-object="pic1"]').click()
      await p.waitForTimeout(300)
      expect(await p.locator('[data-handle]').count() > 0, 'the picture was not selected (no resize handles)')
    })

    await s.check('deleting the picture keeps the comment, which now says the object was removed; its pin stays where the picture was', p, async () => {
      await p.locator('[data-testid="stage"] [data-element="pic1"]').click({ force: true })
      await p.keyboard.press('Delete'); await p.waitForTimeout(600)
      expect(await panel().locator('[data-comment-object="gone"]').count() === 1, 'the comment does not say the object was removed')
      expect(await p.locator('[data-comment-pin]').count() === 1, 'the pin vanished')
      expect((await threads()).some((x) => x.comments[0].body === 'Use the new logo here'), 'the comment was lost')
    })
  } finally {
    await b.close()
  }
  return s.done()
}
