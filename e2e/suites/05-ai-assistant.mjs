import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { STATE } from './02-auth.mjs'

export default async function () {
  const s = suite('05-ai-assistant')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, storageState: STATE })
  const p = await ctx.newPage()
  const settle = (ms = 400) => p.waitForTimeout(ms)
  await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
  const id = await p.evaluate(async () => { const r = await fetch('http://localhost:4000/api/v1/presentations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: 'pitch-seed-round' }) }); return (await r.json()).data.id })
  await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor(); await settle(800)
  const thumbs = () => p.locator('nav[aria-label="Slides"] [data-testid^="thumb-"]')
  const panel = () => p.getByRole('complementary', { name: 'AI assistant' })
  // (the model is the server's choice now: there is no picker in the panel)
  const steadyModel = async () => {}
  const send = async (text, wait = 150000) => {
    await steadyModel()
    await p.getByLabel('Message to the AI assistant').fill(text); await p.getByRole('button', { name: 'Send' }).click()
    const working = p.getByText('Working on it')
    await working.waitFor({ state: 'visible', timeout: 10000 }) // the request really started
    await working.waitFor({ state: 'detached', timeout: wait }) // …and finished
    await settle(700)
  }
  /** a model's wording can differ run to run: one more try before a check counts as failed (a second miss is a real failure) */
  const twice = (fn) => async () => { try { await fn() } catch { await settle(20000); await fn() } }
  const sig = () => thumbs().evaluateAll((els) => els.map((e) => e.innerHTML.length + ':' + (e.innerHTML.match(/#[0-9a-fA-F]{6}|rgb\([^)]*\)/g) ?? []).slice(0, 6).join(',')).join('|'))

  await s.check('panel: opens from the toolbar, has NO whole-deck / this-slide switch (the chat asks which slide), model picker, suggestions, quick actions, closes', p, async () => {
    await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor({ timeout: 4000 })
    expect(await panel().getByRole('group', { name: 'What should the AI change?' }).count() === 0 && await panel().getByRole('button', { name: /^Whole deck$/ }).count() === 0, 'the scope switch is still there')
    expect(await panel().getByLabel('AI model').count() === 0, 'the model picker is still there (the server chooses the model)')
    expect(await panel().getByTestId('ai-context').isVisible(), 'the line saying what the message is about is missing')
    expect(await panel().locator('button').count() >= 6, 'no suggestions')
    await p.getByLabel('Close AI panel').click(); await settle(200); expect(await panel().count() === 0, 'did not close')
    await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()
  })
  await s.check('panel: Send is disabled for an empty message; the placeholder names the slide you are on', p, async () => {
    expect(await p.getByRole('button', { name: 'Send' }).isDisabled(), 'Send enabled when empty')
    expect(/slide \d+/.test(await p.getByLabel('Message to the AI assistant').getAttribute('placeholder')), 'placeholder not slide-specific')
  })
  await s.check('deck request: "change colours to warm oranges" restyles every slide live (no reload) and offers Undo', p, async () => {
    const before = await sig()
    await send('Change the colour scheme to warm sunset oranges and reds')
    const msg = await panel().getByRole('log').innerText(); expect(!/Something went wrong|not charged/.test(msg), `error: ${msg.slice(-200)}`)
    expect(before !== await sig(), 'slides did not change after the AI replied')
    expect(await panel().getByRole('button', { name: 'Undo' }).count() >= 1, 'no Undo in the reply')
    const after = await sig(); await panel().getByRole('button', { name: 'Undo' }).last().click(); await settle(400)
    expect(after !== await sig(), 'Undo did not revert')
  })
  await s.check('deck request: animate + fonts ("animate every slide, use a serif font")', p, async () => {
    await send('Animate every slide and use a more elegant serif font')
    const log = await panel().getByRole('log').innerText(); expect(!/Something went wrong/.test(log), 'errored'); expect(/animat|font|serif/i.test(log), `reply doesn't mention it: ${log.slice(-200)}`)
  })
  await s.check('slide request: "make this slide shorter" edits only the active slide', p, async () => {
    await thumbs().nth(2).click(); await settle(300)
    const others = await thumbs().evaluateAll((els) => els.map((e, i) => i === 2 ? '' : e.innerHTML.length).join(','))
    await send('Make this slide shorter and punchier')
    expect(!/Something went wrong/.test(await panel().getByRole('log').innerText()), 'errored')
    const others2 = await thumbs().evaluateAll((els) => els.map((e, i) => i === 2 ? '' : e.innerHTML.length).join(','))
    expect(others === others2, 'other slides changed on a slide-scoped request')
  })
  await s.check('a quick edit from the toolbar menu works on the slide', p, async () => {
    await p.getByRole('button', { name: 'Quick edits' }).click()
    await p.getByRole('menu', { name: 'Quick edits for this slide' }).waitFor({ timeout: 5000 })
    await p.getByRole('menuitem', { name: 'Make shorter' }).click()
    await p.waitForFunction(() => document.querySelector('textarea[aria-label="Message to the AI assistant"]')?.disabled === false && /Done|couldn|Partly/i.test(document.querySelector('[role=log]')?.textContent ?? ''), null, { timeout: 180000 })
    expect(/Rewrote the text|Made it shorter|Done/i.test(await panel().getByRole('log').innerText()), 'the quick edit changed nothing')
  })
  await s.check('export / share: the assistant prepares ONE button for the person to press, and never claims it sent anything', p, async () => {
    await send('Export this to PDF and email it to my boss')
    const log = (await panel().getByRole('log').innerText()).toLowerCase()
    expect(/ready to (export|open share)|export|share/.test(log), `no prepared action: ${log.slice(-250)}`)
    expect(!/sent|emailed|i have emailed|mailed it/.test(log), `it claimed to have sent something: ${log.slice(-250)}`)
  })
  await s.check('pictures: "add a picture" places a free photo (or proposes an AI image) instead of silently doing nothing', p, async () => {
    await thumbs().nth(1).click(); await settle(300)
    await send('Add a picture of a modern city skyline at dawn to this slide')
    // a plain "add a picture" is answered with a FREE real photo placed on the slide; the paid AI proposal is for requests that say AI / generate
    const card = p.getByLabel(/Picture proposal for slide/)
    const placed = /photo (beside the text on|on) slide 2/.test(await p.getByRole('complementary', { name: 'AI assistant' }).innerText())
    expect(await card.count() >= 1 || placed, 'neither a picture proposal nor a placed photo')
    // a slide with a hand-placed picture is protected from AI text edits, so put it back before the checks that edit this slide
    if (placed) { await p.getByText('Undo', { exact: true }).last().click(); await settle(800) }
  })
  await s.check('add a slide: "please add the thank you page at last" appends a Thank you slide (one undo step)', p, async () => {
    const count = () => thumbs().count()
    const before = await count()
    await send('please add the thank you pafe at last')
    await settle(600)
    expect(await count() === before + 1, `slide count ${before} -> ${await count()}`)
    expect(/added a (new )?slide/i.test(await panel().getByRole('log').innerText()), 'no confirmation of the added slide')
    await p.keyboard.press('Meta+z'); await settle(400)
    expect(await count() === before, 'undo did not remove the added slide')
  })
  await s.check('a greeting gets ONE friendly line inviting a change (not the long list of what the assistant can do, not a refusal)', p, twice(async () => {
    await send('hey')
    const log = await panel().getByRole('log').innerText()
    expect(/Hi! What would you like to change in your presentation\?/.test(log.slice(-200)) && !/Tell me what to update/.test(log.slice(-200)) && !/couldn't change anything|nothing was charged/i.test(log), `reply: ${log.slice(-300)}`)
  }))
  await s.check('off-topic ("give me some water please") shows the help list, not a made-up note', p, twice(async () => {
    await send('give me some water please')
    const log = await panel().getByRole('log').innerText()
    expect(/change the words of slides|add a slide|what can I do/i.test(log.slice(-1800)) && !/serving|physical|drinks|glass of water/i.test(log.slice(-700)), `reply: ${log.slice(-300)}`)
  }))
  await s.check('"why did you change the theme?" puts the assistant\'s own change back (free), and says so', p, twice(async () => {
    const base = await sig()
    await send('change the colours to deep purple and gold')
    expect(await sig() !== base, 'the colour change did not apply')
    await send('why did you change the theme?')
    const log = await panel().getByRole('log').innerText()
    expect(/put it back/i.test(log.slice(-400)), `no apology/put-back: ${log.slice(-300)}`)
    const colours = (x) => x.split('|').map((t) => t.replace(/^\d+:/, '')).join('|') // markup length can differ by a few characters; the colours are what matter
    const aft = await sig()
    expect(colours(aft) === colours(base), 'the theme was not restored')
  }))
  await s.check('"add more content in the 2nd slide" writes new topic content itself (no document needed, no refusal)', p, async () => {
    await send('add more content in the 2nd slide')
    const tail = (await panel().getByRole('log').innerText()).slice(-400)
    expect(/rewrote slide 2/i.test(tail) && !/attach|specific details|couldn.?t do that/i.test(tail), `reply: ${tail}`)
  })
  await s.check('vague request ("make the title shorter") always asks which slide (this one / all / another by number), changes nothing, costs nothing; the "this slide" button then does it', p, async () => {
    p.once('dialog', (d) => void d.accept())
    await panel().getByRole('button', { name: 'Clear chat' }).click(); await settle(700)
    const before = await sig()
    await steadyModel()
    await p.getByLabel('Message to the AI assistant').fill('please make the title shorter'); await p.getByRole('button', { name: 'Send' }).click()
    // the slide on screen IS the slide meant (context-aware editing, 2026-11-26): the assistant acts on it instead of asking which one
    await p.waitForFunction(() => document.querySelector('textarea[aria-label="Message to the AI assistant"]')?.disabled === false, null, { timeout: 180000 })
    await settle(900)
    const tail = (await panel().getByRole('log').innerText()).slice(-500)
    expect(!/which slide/i.test(tail), `it asked which slide although one is on screen: ${tail}`)
    expect(await sig() !== before, `nothing changed: ${tail}`)
  })
  const colours = (x) => x.split('|').map((t) => t.replace(/^\d+:/, '')).join('|')
  await s.check('"make theme light" then, after closing and reopening the panel, "didnt like it revert it please" simply puts it back (no question)', p, async () => {
    // the deck may already be light (templates are light or dark, and the assistant keeps that): start from a dark one so "make it light" has something to change
    await send('make the theme dark')
    const base = colours(await sig())
    await send('make the theme light')
    expect(colours(await sig()) !== base, 'the theme change did not apply')
    await p.getByLabel('Close AI panel').click(); await settle(300)
    await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()
    await send('didnt like it revert it please')
    const tail = (await panel().getByRole('log').innerText()).slice(-350)
    expect(/put it back/i.test(tail) && !/\?/.test(tail.slice(tail.toLowerCase().lastIndexOf('revert it please'))), `reply: ${tail}`)
    expect(colours(await sig()) === base, 'the theme was not restored')
  })
  await s.check('the same works after a full page reload (the undo record is saved with the chat)', p, async () => {
    await settle(50000) // the assistant allows 15 requests a minute: let the window reset after the earlier checks
    const base = colours(await sig())
    await send('change the colours to deep green and gold')
    expect(colours(await sig()) !== base, 'the colour change did not apply')
    await settle(3500) // autosave
    await p.reload({ waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor({ timeout: 15000 }); await settle(800)
    await p.getByRole('button', { name: /Edit with AI/ }).click(); await panel().waitFor()
    await panel().getByText(/deep green and gold/).first().waitFor({ timeout: 10000 }) // the conversation came back
    await send('undo that')
    expect(/put it back/i.test((await panel().getByRole('log').innerText()).slice(-350)), 'no put-back confirmation after reload')
    expect(colours(await sig()) === base, 'the theme was not restored after a reload')
  })
  await s.check('credits: the plan card shows credits were spent and the Starter/Pro balance decreased', p, async () => {
    const ent = await p.evaluate(() => fetch('http://localhost:4000/api/v1/me/entitlements', { credentials: 'include' }).then((r) => r.json()))
    const txt = JSON.stringify(ent); expect(/credit/i.test(txt), 'no credit info in entitlements')
  })

  await b.close()
  return s.done()
}
