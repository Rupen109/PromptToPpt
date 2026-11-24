import { API, EDITOR, PASSWORD, WEB, choicesReady, expect, launch, startBuild, suite } from '../lib.mjs'

/**
 * "What you choose is what you get": every way of choosing a Morph template must reach the server as that template (a deck from another template, or an AI-planned deck, is a
 * total failure for the person who chose one). The request that starts the deck is caught in the browser and stopped, so no deck is generated (the prompt is still analysed, a
 * small model call). Needs an existing verified Gold or Premium account: E2E_EMAIL=… E2E_PASSWORD=…
 */
export default async function () {
  const s = suite('76-morph-template-selection')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified Gold+ account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const p = await ctx.newPage()
    let body = null
    // the request that creates the deck is caught and refused: nothing is generated, nothing is charged
    await p.route(/\/api\/v1\/generation\/jobs$/, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      body = JSON.parse(route.request().postData() ?? '{}')
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'TEST_STOP', message: 'stopped by the test' } }) })
    })
    // the server allows a handful of prompt analyses a minute: the suite makes many, so it starts a fresh minute when it has used most of them
    let analyses = 0, started = false
    p.on('request', (r) => { if (/\/generation\/analyze$/.test(r.url()) && r.method() === 'POST') analyses++ })
    const freshMinute = async () => { if (analyses < 3 && started) return; started = true; await new Promise((res) => setTimeout(res, 61_000 - (Date.now() % 60_000))); analyses = 0 }
    const TOPIC = 'make presentation on amazon jungle.'
    const picks = () => p.getByRole('list', { name: 'Morph templates' }).getByRole('radio')
    const selected = async () => {
      const locked = p.getByTestId('morph-picker-locked')
      if (await locked.count()) return await locked.innerText() // chosen on the website: shown as chosen, not asked again
      return (await p.locator('[data-testid=morph-picker] [role=radio][aria-checked=true]').allInnerTexts()).join('|')
    }
    const toCreate = async (url) => {
      await freshMinute()
      body = null
      await p.goto(url, { waitUntil: 'networkidle' })
      await p.getByLabel('Presentation prompt').fill(TOPIC)
      await p.getByLabel('Presentation prompt').press('Enter').catch(() => {})
      if (!/\/create/.test(p.url())) await p.locator('form button[type=submit]').first().click()
      await p.waitForURL(/\/create/, { timeout: 15000 })
      await choicesReady(p)
    }
    const letAiDecide = async () => {
      const dir = p.getByRole('button', { name: /Let AI decide/ })
      if (await dir.count()) await dir.click()
      await p.getByRole('radio', { name: /\d+ slides/ }).first().waitFor({ timeout: 90000 })
    }
    const caught = async () => { for (let i = 0; i < 40 && !body; i++) await p.waitForTimeout(250); expect(body, 'the request that starts the deck was never sent'); return body }
    /** the id of a card's template, read from its poster's address (/morph-posters/<id>.webp) */
    const idOfCard = async (card) => /morph-posters\/([a-z0-9-]+)\./.exec((await card.locator('img').getAttribute('src')) ?? '')?.[1] ?? ''

    await s.check('picked on the create screen: the request names that template', p, async () => {
      await toCreate(`${EDITOR}/`)
      await letAiDecide()
      await p.getByLabel('Morph animation').check()
      const card = picks().nth(2)
      const id = await idOfCard(card)
      expect(id, 'could not read the card template id')
      await card.click()
      await startBuild(p)
      const sent = await caught()
      expect(sent.morph === true && sent.morphTemplate === id, `chose "${id}", sent ${JSON.stringify(sent.morphTemplate)}`)
    })

    await s.check('the website link (a chosen template on the home page): the request names that template', p, async () => {
      await toCreate(`${EDITOR}/?morphTemplate=pitch-orbit`)
      await letAiDecide()
      expect((await selected()).includes('Orbit Pitch'), `the create screen did not start on the chosen template: ${await selected()}`)
      await startBuild(p)
      expect((await caught()).morphTemplate === 'pitch-orbit', `sent ${JSON.stringify((await caught()).morphTemplate)}`)
    })

    await s.check('the website link: the create screen shows the template as chosen (name, slides, Change button) and does not ask again; Change opens the list with it selected; the address keeps it', p, async () => {
      await toCreate(`${EDITOR}/?morphTemplate=pitch-orbit`)
      await letAiDecide()
      expect(/morphTemplate=pitch-orbit/.test(p.url()), `the address lost the template: ${p.url()}`)
      await p.getByTestId('morph-picker-locked').waitFor({ timeout: 5000 })
      expect((await p.getByRole('list', { name: 'Morph templates' }).count()) === 0, 'the whole list is shown although a template was chosen')
      expect(/Orbit Pitch/.test(await p.getByTestId('morph-picker-locked').innerText()), 'the chosen template is not named')
      await p.getByTestId('morph-change').click()
      await p.getByRole('list', { name: 'Morph templates' }).waitFor({ timeout: 5000 })
      expect((await selected()).includes('Orbit Pitch'), `Change did not open with it selected: ${await selected()}`)
    })

    await s.check('a refresh of the create screen keeps the website-chosen template', p, async () => {
      await toCreate(`${EDITOR}/?morphTemplate=pitch-orbit`)
      await p.evaluate(() => sessionStorage.removeItem('prompttoppt:pending-morph-template')) // storage lost: the address still carries it
      await freshMinute()
      await p.reload({ waitUntil: 'networkidle' })
      await choicesReady(p)
      await letAiDecide()
      expect(/Orbit Pitch/.test(await selected()), `template lost after reload: ${await selected()}`)
      await startBuild(p)
      expect((await caught()).morphTemplate === 'pitch-orbit', `sent ${JSON.stringify((await caught()).morphTemplate)}`)
    })

    await s.check('the website link, then an angle card instead of "Let AI decide": still that template', p, async () => {
      await toCreate(`${EDITOR}/?morphTemplate=pitch-orbit`)
      const card = p.locator('button:has(div.font-semibold)').first()
      if (await card.count()) await card.click()
      await p.getByRole('radio', { name: /\d+ slides/ }).first().waitFor({ timeout: 90000 })
      await startBuild(p)
      expect((await caught()).morphTemplate === 'pitch-orbit', `sent ${JSON.stringify((await caught()).morphTemplate)}`)
    })

    await s.check('Morph switched off and on again keeps the chosen template', p, async () => {
      await toCreate(`${EDITOR}/?morphTemplate=pitch-orbit`)
      await letAiDecide()
      await p.getByLabel('Morph animation').uncheck()
      await p.getByLabel('Morph animation').check()
      expect((await selected()).includes('Orbit Pitch'), `selection lost: ${await selected()}`)
      await startBuild(p)
      expect((await caught()).morphTemplate === 'pitch-orbit', `sent ${JSON.stringify((await caught()).morphTemplate)}`)
    })

    await s.check('a template chosen in another family tab, then a different one: the LAST choice is sent', p, async () => {
      await toCreate(`${EDITOR}/`)
      await letAiDecide()
      await p.getByLabel('Morph animation').check()
      await picks().nth(0).click()
      await p.getByRole('tab', { name: 'Pitch' }).click()
      const card = picks().nth(1)
      const id = await idOfCard(card)
      expect(id, 'could not read the card template id')
      await card.click()
      await startBuild(p)
      expect((await caught()).morphTemplate === id, `chose "${id}", sent ${JSON.stringify((await caught()).morphTemplate)}`)
    })

    await s.check('the progress screen says which template it is building from (a wrong one is seen at once)', p, async () => {
      // the same flow, but the request is let through to an answer that keeps the page on its progress screen
      await p.unroute(/\/api\/v1\/generation\/jobs$/)
      await p.route(/\/api\/v1\/generation\/jobs$/, async (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        await new Promise(() => {}) // never answered: the screen stays on "Starting…"
      })
      await toCreate(`${EDITOR}/?morphTemplate=pitch-orbit`)
      await letAiDecide()
      await startBuild(p)
      await p.getByTestId('building-from-template').waitFor({ timeout: 10000 })
      expect(/Orbit Pitch/.test(await p.getByTestId('building-from-template').innerText()), await p.getByTestId('building-from-template').innerText())
    })
  } finally {
    await b.close()
  }
  return s.done()
}
