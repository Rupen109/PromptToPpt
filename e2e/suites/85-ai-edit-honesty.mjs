import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The assistant's chat must follow the DECK, in a real browser. The assistant's answer is faked here (so the situations are exact and cost nothing), including a false "applied" claim from the
 * "server"; everything else is real: the editor applies the answer as one transaction, checks every promise on the live deck, and builds the message from those checks.
 *   success / locked slide / missing picture / partly done + ONE undo step. Needs a verified account: E2E_EMAIL=… E2E_PASSWORD=…
 */
export default async function () {
  const s = suite('85-ai-edit-honesty')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const madeRes = await ctx.request.post(`${API}/api/v1/presentations`, { headers: H, data: { title: 'Honesty check' } })
    const made = await madeRes.json()
    expect(!!made?.data?.id, `could not create the deck: ${madeRes.status()} ${JSON.stringify(made).slice(0, 200)}`)
    const deckId = made.data.id
    const doc0 = (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data.document
    const titles = ['Alpha', 'Beta', 'Gamma', 'Delta']
    const slides = titles.map((t, i) => { const c = structuredClone(doc0.slides[0]); c.id = `sl${i + 1}`; c.content.title = t; c.locked = false; return c })
    const saved = async (patch) => {
      const cur = (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data
      const doc = structuredClone(cur.document); patch?.(doc)
      const res = await ctx.request.put(`${API}/api/v1/presentations/${deckId}`, { headers: H, data: { baseRevision: cur.revision, document: doc, snapshot: false } })
      expect(res.ok(), `save ${res.status()}`)
    }
    await saved((d) => { d.slides = structuredClone(slides) })
    const titleOf = async (id) => (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data.document.slides.find((x) => x.id === id).content.title

    const p = await ctx.newPage()
    const errors = [], outcomes = []
    p.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`))
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]|status of 40[0-9]/.test(m.text())) errors.push(m.text().slice(0, 160)) })
    // the assistant's next answer (set per check); the outcome report is observed and answered
    let nextAnswer = null
    await p.route('**/api/v1/presentations/*/ai-assist', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { theme: null, edits: [], additions: [], reverts: [], images: [], notes: [], rewrite: null, creditsCharged: 0, model: 'x', sources: [], ...nextAnswer } }) }))
    await p.route('**/api/v1/presentations/*/ai-assist/*/outcome', async (route) => { outcomes.push(JSON.parse(route.request().postData() ?? '{}')); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { settled: true, verified: 0, judged: 0, refunded: false, reason: '', already: false } }) }) })

    const edit = (i, title) => ({ slideId: `sl${i}`, content: { ...slides[i - 1].content, title } })
    const expectEdit = (key, i, title) => ({ key, kind: 'edit', slideId: `sl${i}`, content: { ...slides[i - 1].content, title }, change: 'text' })
    const openPanel = async () => {
      await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
      await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
      await p.getByRole('button', { name: /Edit with AI/ }).click()
    }
    const say = async (text, answer) => {
      nextAnswer = answer
      const box = p.getByPlaceholder(/e\.g\./)
      const REPLY = /Done —|Partly done|nothing was changed|Nothing needed changing/g
      // the chat of a deck is kept (and can be re-read from the server after a save): an old reply must never satisfy the wait. A reply counts only when it stands AFTER the message just sent.
      await box.fill(text); await box.press('Enter')
      try {
        await p.waitForFunction(([sent, src]) => { const t = document.body.innerText, at = t.lastIndexOf(sent); return at >= 0 && new RegExp(src).test(t.slice(at + sent.length)) }, [text, REPLY.source], { timeout: 15000 })
      } catch (e) { throw new Error(`no reply after "${text}": ${(await p.locator('body').innerText()).slice(-330).replace(/\n/g, ' ⏎ ')}`) }
      await p.waitForTimeout(300)
      return p.locator('body').innerText()
    }

    await s.check('an edit that really lands: the chat says so from the deck, ignoring a different claim from the server, and the report to the server says "done"', p, async () => {
      await openPanel()
      const log = await say('shorten slide 2', { reply: 'Done — I rewrote slide 3 and also colored the moon (SERVER CLAIM)', applied: ['Rewrote slide 3 (SERVER CLAIM)', 'Painted the moon'], requestId: 'req-honesty-1', edits: [edit(2, 'AI wrote this')], expect: [expectEdit('edit:0', 2, 'AI wrote this')] })
      expect(/Done — rewrote the text on slide 2/.test(log), `the chat did not say what the deck shows: ${log.slice(-400)}`)
      expect(!/SERVER CLAIM|Painted the moon/.test(log), 'the server\'s own claim was shown')
      await p.waitForTimeout(2800)
      expect(await titleOf('sl2') === 'AI wrote this', `the deck did not change: ${await titleOf('sl2')}`)
      expect(outcomes.at(-1)?.results?.[0]?.status === 'done', `the report to the server: ${JSON.stringify(outcomes.at(-1))}`)
    })

    await s.check('a locked slide: the chat says nothing was changed and why, with no ticks and no "Done"; the slide is untouched', p, async () => {
      await saved((d) => { d.slides.find((x) => x.id === 'sl3').locked = true })
      await openPanel()
      const log = await say('shorten slide 3', { reply: 'Done — I updated slide 3', applied: ['Rewrote slide 3 (SERVER CLAIM)'], requestId: 'req-honesty-2', edits: [edit(3, 'Should not land')], expect: [expectEdit('edit:0', 3, 'Should not land')] })
      expect(/nothing was changed/.test(log) && /slide 3 is locked, so I left it/i.test(log), `message: ${log.slice(-400)}`)
      expect(!/Done —/.test(log.split('Honesty check').pop() ?? log) || /nothing was changed/.test(log), 'it said Done')
      expect(!/SERVER CLAIM/.test(log), 'the server claim was shown')
      await p.waitForTimeout(2800)
      expect(await titleOf('sl3') === 'Gamma', `the locked slide changed: ${await titleOf('sl3')}`)
      expect(outcomes.at(-1)?.results?.[0]?.status === 'skipped', `report: ${JSON.stringify(outcomes.at(-1))}`)
    })

    await s.check('a cut-out whose picture is not there any more: "nothing was changed", never "removed the background"', p, async () => {
      await openPanel()
      const log = await say('remove the background of the picture on slide 2', { reply: 'Done — removed the background', applied: ['Removed the background of the picture on slide 2'], requestId: 'req-honesty-3', pictureSwaps: [{ slideId: 'sl2', elementId: 'ghost', url: 'https://example.com/cut.png', alt: 'cut', transparentShare: 0.4 }], expect: [{ key: 'picture_swap:0', kind: 'picture_swap', slideId: 'sl2', elementId: 'ghost', from: '', to: 'https://example.com/cut.png', transparentShare: 0.4 }] })
      expect(/nothing was changed/.test(log) && /picture on slide 2 is no longer there/.test(log), `message: ${log.slice(-400)}`)
      expect(!/Removed the background of the picture/.test(log), 'it claimed the background was removed')
      expect(outcomes.at(-1)?.results?.[0]?.status === 'failed', `report: ${JSON.stringify(outcomes.at(-1))}`)
    })

    await s.check('partly done is said as such (1 of 2), and the whole request is ONE undo step', p, async () => {
      await saved((d) => { d.slides.find((x) => x.id === 'sl2').content.title = 'Beta'; d.slides.find((x) => x.id === 'sl3').locked = true })
      await openPanel()
      const log = await say('shorten slides 2 and 3', { reply: 'Done', applied: ['Rewrote slides 2 and 3 (SERVER CLAIM)'], requestId: 'req-honesty-4', edits: [edit(2, 'Changed once'), edit(3, 'Locked one')], expect: [expectEdit('edit:0', 2, 'Changed once'), expectEdit('edit:1', 3, 'Locked one')] })
      expect(/Partly done — 1 of 2 changes applied/.test(log) && /slide 3 is locked, so I left it/i.test(log), `message: ${log.slice(-500)}`)
      await p.waitForTimeout(2800)
      expect(await titleOf('sl2') === 'Changed once', 'the unlocked slide did not change')
      expect(await titleOf('sl3') === 'Gamma', 'the locked slide changed')
      await p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {})
      await p.keyboard.press('Meta+z'); await p.keyboard.press('Control+z')
      await p.waitForTimeout(2800)
      expect(await titleOf('sl2') === 'Beta', `one undo did not restore the slide: ${await titleOf('sl2')}`)
    })

    await s.check('the request carries what is selected on the slide, so "this" and "make it bigger" can be understood', p, async () => {
      await saved((d) => { for (const sl of d.slides) sl.locked = false; d.slides.find((x) => x.id === 'sl1').content.title = 'Alpha' })
      await openPanel()
      const titleId = (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data.document.slides[0].elements.find((e) => e.type === 'text' && e.role === 'title').id
      let sent = null
      await p.route('**/api/v1/presentations/*/ai-assist', async (route) => { sent = JSON.parse(route.request().postData() ?? '{}'); await route.fallback() })
      await p.locator(`[data-element="${titleId}"]`).first().click()
      nextAnswer = { reply: 'x', applied: [], notes: [], requestId: 'req-honesty-5', ask: true }
      const box = p.getByPlaceholder(/e\.g\./)
      await box.fill('make this bigger'); await box.press('Enter')
      await p.waitForFunction(() => document.body.innerText.includes('make this bigger'), null, { timeout: 8000 })
      await p.waitForTimeout(800)
      expect(sent?.selection?.elementIds?.includes(titleId), `the request did not carry the selection: ${JSON.stringify(sent?.selection)}`)
    })

    await s.check('an object edit: the chat names what changed from the deck (bigger text on slide 1), the deck has it, and ONE undo puts it back', p, async () => {
      await openPanel()
      const doc = (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data.document
      const title = doc.slides[0].elements.find((e) => e.type === 'text' && e.role === 'title')
      const change = { slideId: 'sl1', elementId: title.id, patch: { fontSize: 61 }, verb: 'Set the text size of {}', desc: 'the title' }
      const log = await say('make the title size 61', { reply: 'Done', applied: ['Resized everything (SERVER CLAIM)'], requestId: 'req-honesty-6', elementChanges: [change], expect: [{ key: 'element:0', kind: 'element', change, already: false }] })
      expect(/Done — set the text size of the title on slide 1/.test(log) && !/SERVER CLAIM/.test(log), `message: ${log.slice(-400)}`)
      await p.waitForTimeout(2800)
      const fontOf = async () => (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data.document.slides[0].elements.find((e) => e.id === title.id).fontSize
      expect(await fontOf() === 61, `the deck did not change: ${await fontOf()}`)
      await p.keyboard.press('Meta+z'); await p.keyboard.press('Control+z')
      await p.waitForTimeout(2800)
      expect(await fontOf() === title.fontSize, `one undo did not restore it: ${await fontOf()} instead of ${title.fontSize}`)
    })

    await s.check('no errors in the page', null, async () => { expect(errors.length === 0, errors.join(' | ')) })
    await ctx.request.delete(`${API}/api/v1/presentations/${deckId}`, { headers: H }).catch(() => {})
  } finally { await b.close() }
  return s.done()
}
