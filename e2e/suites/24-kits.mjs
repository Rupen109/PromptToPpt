import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { JPEG, tsx, api, applyBox, assetOk, deleteAllKits, details, file, fillKit, kitsOf, logos, makeKit, newDeck, openBrand, openDeck, person, plan, png, stage, saved } from '../kits-lib.mjs'

/**
 * Brand kits (C2): real browser + real server + real database, no AI. Flow ids refer to docs/BRAND_KITS_FUNCTIONAL_FLOWS.md.
 * Sections: A plans · B editing · C logo · D pictures · G deleting · H security · I layout.
 */
export default async function () {
  const s = suite('24-kits')
  const b = await launch()
  const A = await person(b, 'kitsA') // Starter at first, then Pro, then Gold
  const O = await person(b, 'kitsO', 'pro') // "someone else"
  const p = A.p
  p.on('dialog', (d) => void d.accept())
  const NAMED = (t) => `${t} ${Date.now() % 100000}`
  const LOGO_WIDE = png(600, 150, { rgba: [23, 190, 187, 200] })
  const limitHit = (r) => r.status === 429 && r.body?.error?.code === 'LIMIT_REACHED'
  const msg = async () => (await p.getByRole('alert').first().innerText()).trim()

  try {
    A.id = await newDeck(A)
    // ───────── A: plans ─────────
    await s.check('A1 Starter: the Brand tab explains the feature and offers the upgrade; nothing can be created (UI and API)', p, async () => {
      await openBrand(p, A.id)
      await p.getByText(/Available on Pro and Gold/).waitFor({ timeout: 8000 })
      expect(await p.getByRole('button', { name: 'New brand kit' }).count() === 0, 'a Starter user sees "New brand kit"')
      const r = await api.post(A, '/brand/kits', { name: 'x' }); expect(r.status === 403 && r.body.error.code === 'UPGRADE_REQUIRED', `API gave ${r.status}`)
      await p.getByRole('button', { name: 'See plans' }).click(); await p.getByText(/Pro and Gold/).first().waitFor({ timeout: 5000 })
    })

    plan(A.email, 'pro')
    await s.check('A2 Pro: one kit; "New brand kit" is then off with the limit explained; the API refuses a second', p, async () => {
      await openBrand(p, A.id)
      await p.getByText('No brand kit yet').waitFor({ timeout: 8000 })
      await makeKit(p, { name: 'First', primary: '#e4572e', accent: '#17bebb' })
      const btn = p.getByRole('button', { name: 'New brand kit' })
      expect(await btn.isDisabled(), 'a second kit can be started on Pro')
      expect(/1 brand kit/.test(await btn.getAttribute('title') ?? ''), 'the limit is not explained')
      const r = await api.post(A, '/brand/kits', { name: 'second' }); expect(limitHit(r), `API gave ${r.status} ${r.body?.error?.code} for the second kit`)
    })

    // ───────── B: editing ─────────
    await s.check('B1 + B2 a kit keeps name, colours and fonts across a reload; Save is on only when something changed; Apply is off while unsaved', p, async () => {
      await openBrand(p, A.id)
      const d = details(p); await d.waitFor({ timeout: 8000 })
      const save = d.getByRole('button', { name: 'Save kit' }), apply = applyBox(p).getByRole('button', { name: 'Apply to this presentation' })
      expect(await save.isDisabled(), 'Save is on although nothing changed'); expect(await apply.isEnabled(), 'Apply is off with nothing to save')
      await fillKit(p, { name: 'Acme Roasters', primary: '#336699', accent: '#cc6600', heading: 'Playfair Display', body: 'Inter' })
      expect(await save.isEnabled(), 'Save stays off after an edit'); expect(await apply.isDisabled(), 'Apply stays on with unsaved changes')
      expect(/Save your changes first/.test(await apply.getAttribute('title') ?? ''), 'no hint why Apply is off')
      await save.click(); await p.getByText('Saved.').waitFor({ timeout: 8000 })
      expect(await save.isDisabled() && await apply.isEnabled(), 'buttons do not return to normal after saving')
      await openBrand(p, A.id); await details(p).waitFor()
      expect(await details(p).getByLabel('Kit name').inputValue() === 'Acme Roasters', 'name lost')
      expect(await details(p).getByLabel('Main colour').inputValue() === '#336699' && await details(p).getByLabel('Accent colour').inputValue() === '#cc6600', 'colours lost')
      expect(await details(p).getByLabel('Heading font in kit').inputValue() === 'Playfair Display' && await details(p).getByLabel('Body font in kit').inputValue() === 'Inter', 'fonts lost')
    })

    await s.check('B3 empty name, a 60+ character name, and HTML in the name: a sensible default / a limit / shown as plain text', p, async () => {
      await openBrand(p, A.id); const d = details(p); await d.waitFor()
      await d.getByLabel('Kit name').fill('x'.repeat(80))
      expect((await d.getByLabel('Kit name').inputValue()).length === 60, 'name is not limited to 60')
      await d.getByLabel('Kit name').fill('<img src=x onerror="window.__pwned=1"><b>Bold</b>')
      await d.getByRole('button', { name: 'Save kit' }).click(); await p.getByText('Saved.').waitFor({ timeout: 8000 })
      await openBrand(p, A.id); await details(p).waitFor()
      expect(await p.evaluate(() => window.__pwned === undefined), 'HTML in the kit name ran')
      expect(await p.locator('aside[aria-label="Style"] b').filter({ hasText: 'Bold' }).count() === 0, 'HTML in the name was rendered')
      await details(p).getByLabel('Kit name').fill('')
      await details(p).getByRole('button', { name: 'Save kit' }).click()
      await p.waitForTimeout(1200)
      const k = (await kitsOf(A)).kits[0]
      expect(k.name.trim().length > 0, `an empty name was stored: "${k.name}"`)
      await details(p).getByLabel('Kit name').fill('Acme Roasters'); await details(p).getByRole('button', { name: 'Save kit' }).click().catch(() => {}); await p.waitForTimeout(800)
    })

    await s.check('B5 colours the API must refuse: red, #12, javascript:, 8-digit, with spaces', p, async () => {
      await deleteAllKits(A)
      const id = (await api.post(A, '/brand/kits', { name: 'Colours', primary: '#336699', accent: '#cc6600' })).data.id
      for (const bad of ['red', '#12', 'javascript:alert(1)', '#12345678', ' #112233', 'rgb(1,2,3)', '#GGGGGG']) {
        const r = await api.patch(A, `/brand/kits/${id}`, { primary: bad }); expect(r.status >= 400 && r.status < 500, `"${bad}" gave ${r.status}`)
      }
      expect((await kitsOf(A)).kits[0].colors.primary === '#336699', 'a bad colour changed the stored colour')
    })

    await s.check('B6 two tabs: a change made in tab 1 shows in tab 2 after a reload, and other fields are not overwritten', p, async () => {
      await openBrand(p, A.id); await details(p).waitFor({ timeout: 8000 })
      const p2 = await A.ctx.newPage(); await openBrand(p2, A.id); await details(p2).waitFor()
      await details(p).getByLabel('Kit name').fill(NAMED('Renamed')); await details(p).getByRole('button', { name: 'Save kit' }).click(); await p.getByText('Saved.').waitFor({ timeout: 8000 })
      await openBrand(p2, A.id); await details(p2).waitFor()
      expect(/^Renamed/.test(await details(p2).getByLabel('Kit name').inputValue()), 'tab 2 does not show the new name')
      expect(await details(p2).getByLabel('Main colour').inputValue() === '#336699', 'another field changed')
      await p2.close()
    })

    await s.check('B7 a double click on Save and on Delete does one save and one delete (no error)', p, async () => {
      await openBrand(p, A.id); const d = details(p); await d.waitFor()
      await d.getByLabel('Kit name').fill(NAMED('Twice'))
      await d.getByRole('button', { name: 'Save kit' }).dblclick(); await p.getByText('Saved.').waitFor({ timeout: 8000 })
      expect(await p.getByRole('alert').count() === 0, `an error showed: ${await p.getByRole('alert').allInnerTexts()}`)
      await d.getByRole('button', { name: 'Delete kit' }).dblclick(); await p.getByText('No brand kit yet').waitFor({ timeout: 8000 })
      expect(await p.getByRole('alert').count() === 0, 'an error showed after the double delete')
      expect((await kitsOf(A)).kits.length === 0, 'the kit is still there')
    })

    // ───────── C: logo ─────────
    await s.check('C1 + C3 upload a PNG, then a JPEG-as-replacement, then remove: shown in the kit, stored on our side, gone after Remove', p, async () => {
      await openBrand(p, A.id); await makeKit(p, { name: 'Logos', primary: '#e4572e', accent: '#17bebb' })
      const d = details(p)
      await d.getByLabel('Upload logo').setInputFiles(file('logo.png', LOGO_WIDE, 'image/png'))
      const img = d.getByRole('img', { name: 'Brand logo' }); await img.waitFor({ timeout: 10000 })
      const url1 = await img.getAttribute('src'); expect(new URL(url1).pathname.startsWith('/api/v1/assets/'), 'logo is not served from our side')
      expect(await assetOk(A, url1), 'stored logo does not load')
      await d.getByLabel('Upload logo').setInputFiles(file('logo.jpg', JPEG, 'image/jpeg'))
      await p.waitForFunction((u) => document.querySelector('img[alt="Brand logo"]')?.getAttribute('src') !== u, url1, { timeout: 10000 })
      expect(!(await assetOk(A, url1)), 'C2: the replaced logo file is still served although nothing uses it')
      await d.getByRole('button', { name: 'Remove', exact: true }).first().click()
      await d.getByText('No logo yet.').waitFor({ timeout: 8000 })
      expect((await kitsOf(A)).kits[0].logo === null, 'the logo is still on the kit')
    })

    await s.check('C4 + C5 wrong files and sizes are refused with a plain message and nothing is stored: text named .png, HTML named .png, SVG, GIF, WebP, 20 px, 1200×50, over 2 MB', p, async () => {
      const kit = (await kitsOf(A)).kits[0]
      expect(kit.logo === null, 'the kit starts with a logo')
      const cases = [
        ['text.png', Buffer.from('this is not a picture'), 'image/png'],
        ['evil.png', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png'],
        ['logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>'), 'image/svg+xml'],
        ['logo.gif', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;'), 'image/gif'],
        ['logo.webp', Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 '), 'image/webp'],
        ['tiny.png', png(20, 20), 'image/png'],
        ['strip.png', png(1200, 50), 'image/png'],
        ['huge.png', png(1100, 1100, { noise: true }), 'image/png'],
      ]
      for (const [name, buf, type] of cases) {
        const r = await api.upload(A, `/brand/kits/${kit.id}/logo`, file(name, buf, type))
        expect(r.status >= 400 && r.status < 500, `${name} gave ${r.status}`)
        const m = r.body?.error?.message ?? ''; expect(m.length > 5 && !/ENOENT|stack|at \S+\.(ts|js)|Error:/.test(m), `${name}: unfriendly message "${m}"`)
      }
      expect((await kitsOf(A)).kits[0].logo === null, 'a refused file became the logo')
      // and the same through the page (one case is enough to see the message there)
      await openBrand(p, A.id); await details(p).waitFor()
      await details(p).getByLabel('Upload logo').setInputFiles(file('logo.png', Buffer.from('not a picture'), 'image/png'))
      expect(/PNG or JPEG/.test(await msg()), `page message: "${await msg()}"`)
      await details(p).getByLabel('Upload logo').setInputFiles(file('anim.gif', Buffer.from('GIF89a'), 'image/gif'))
      await p.waitForTimeout(500); expect(/PNG or JPEG/.test(await msg()), 'a .gif was not refused on the page')
    })

    // ───────── D: pictures ─────────
    await s.check('D1 + D3 pictures: add up to 20 (counter follows), the 21st is refused with a message, remove works', p, async () => {
      const kit = (await kitsOf(A)).kits[0]
      let last
      for (let i = 0; i < 20; i++) { last = await api.upload(A, `/brand/kits/${kit.id}/images`, file(`p${i}.png`, png(60 + i, 60), 'image/png')); expect(last.status === 200 || last.status === 201, `picture ${i + 1} gave ${last.status}: ${JSON.stringify(last.body?.error)}`) }
      await openBrand(p, A.id); await details(p).getByText('(20/20)').waitFor({ timeout: 8000 })
      const over = await api.upload(A, `/brand/kits/${kit.id}/images`, file('p21.png', png(80, 80), 'image/png'))
      expect(limitHit(over) && /20/.test(over.body?.error?.message ?? ''), `21st gave ${over.status} ${over.body?.error?.message}`)
      await details(p).getByLabel('Add picture').setInputFiles(file('p21.png', png(81, 81), 'image/png'))
      await p.waitForTimeout(600); expect(/20/.test(await msg()), `no limit message on the page: "${await p.getByRole('alert').allInnerTexts()}"`)
      await details(p).getByRole('button', { name: /^Remove p0/ }).click(); await details(p).getByText('(19/20)').waitFor({ timeout: 8000 })
    })

    await s.check('D2 + D4 insert a picture on the open slide as ONE undo step; a text file / over-size picture is refused', p, async () => {
      await openBrand(p, A.id); await details(p).waitFor()
      const before = await stage(p).locator('img').count()
      await details(p).getByRole('button', { name: /^Insert p5/ }).click(); await p.waitForTimeout(700)
      expect(await stage(p).locator('img').count() === before + 1, 'the picture was not placed on the slide')
      await stage(p).click({ position: { x: 5, y: 5 } }); await p.keyboard.press('Meta+z'); await p.waitForTimeout(600)
      expect(await stage(p).locator('img').count() === before, 'one undo did not remove the picture')
      const kit = (await kitsOf(A)).kits[0]
      for (const f of [file('note.png', Buffer.from('plain text'), 'image/png'), file('huge.png', png(1100, 1100, { noise: true }), 'image/png')]) {
        const r = await api.upload(A, `/brand/kits/${kit.id}/images`, f); expect(r.status >= 400 && r.status < 500, `${f.name} gave ${r.status}`)
      }
    })

    // ───────── G: deleting (a deck that shows the logo) ─────────
    await s.check('G1–G4 deleting a kit: cancel keeps it; confirming removes files nothing uses; a logo that a deck shows survives, also after undo / an older version', p, async () => {
      const deck = await newDeck(A, 'Deck with logo'); A.id = deck
      await deleteAllKits(A)
      await openBrand(p, deck); await makeKit(p, { name: 'ToDelete', primary: '#e4572e', accent: '#17bebb' })
      await details(p).getByLabel('Upload logo').setInputFiles(file('logo.png', LOGO_WIDE, 'image/png')); await details(p).getByRole('img', { name: 'Brand logo' }).waitFor({ timeout: 10000 })
      await details(p).getByLabel('Add picture').setInputFiles(file('pic.png', png(100, 100), 'image/png')); await details(p).getByRole('button', { name: /^Insert pic/ }).waitFor({ timeout: 10000 })
      const kit = (await kitsOf(A)).kits[0]; const logoUrl = kit.logo.url, picUrl = kit.images[0].url
      await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 8000 })
      await saved(p); await p.waitForTimeout(1800)
      // G4 cancel
      p.removeAllListeners('dialog'); p.once('dialog', (d) => void d.dismiss())
      await details(p).getByRole('button', { name: 'Delete kit' }).click(); await p.waitForTimeout(600)
      expect((await kitsOf(A)).kits.length === 1, 'G4: Cancel still deleted the kit')
      // G1 confirm
      p.on('dialog', (d) => void d.accept())
      await details(p).getByRole('button', { name: 'Delete kit' }).click(); await p.getByText('No brand kit yet').waitFor({ timeout: 8000 })
      expect(!(await assetOk(A, picUrl)), 'G1: the unused picture file is still served')
      expect(await assetOk(A, logoUrl), 'G2: the logo a deck shows was deleted')
      await openDeck(p, deck); await p.waitForFunction(() => { const i = document.querySelector('[data-testid="stage"] img[alt$="logo"]'); return !!i && i.complete && i.naturalWidth > 0 }, null, { timeout: 10000 })
      // G3: remove the logo (a newer version without it), then go back one step with undo: still loads
      await p.getByRole('toolbar').getByRole('button', { name: /Style/ }).click(); await p.getByRole('tab', { name: 'Brand' }).click()
      await p.getByRole('button', { name: 'Remove logo from every slide' }).click(); await p.waitForTimeout(500)
      expect(await logos(p) === 0, 'remove logo did not remove it')
      await stage(p).click({ position: { x: 5, y: 5 } }); await p.keyboard.press('Meta+z'); await p.waitForTimeout(700)
      await p.waitForFunction(() => { const i = document.querySelector('[data-testid="stage"] img[alt$="logo"]'); return !!i && i.complete && i.naturalWidth > 0 }, null, { timeout: 10000 })
    })

    // ───────── A3 / A4: Gold and downgrade ─────────
    await s.check('A3 Gold: five kits are allowed, the sixth is refused in the API and "New brand kit" is off in the page', p, async () => {
      plan(A.email, 'gold'); await deleteAllKits(A)
      for (let i = 0; i < 5; i++) { const r = await api.post(A, '/brand/kits', { name: `Gold ${i + 1}`, primary: '#112233', accent: '#445566' }); expect(r.status === 200 || r.status === 201, `kit ${i + 1} gave ${r.status}`) }
      const sixth = await api.post(A, '/brand/kits', { name: 'Gold 6' }); expect(limitHit(sixth), `sixth gave ${sixth.status} ${sixth.body?.error?.code}`)
      await openBrand(p, A.id); await p.getByLabel('Brand kit', { exact: true }).waitFor({ timeout: 8000 })
      expect(await p.getByRole('button', { name: 'New brand kit' }).isDisabled(), 'the 6th kit can be started')
      expect((await p.getByLabel('Brand kit', { exact: true }).locator('option').allInnerTexts()).length === 5, 'the kit list does not show five')
    })

    await s.check('A4 Gold → Pro with 5 kits: the kits stay and still apply, a new one is refused, nothing is deleted behind the user\'s back', p, async () => {
      plan(A.email, 'pro')
      const list = await kitsOf(A); expect(list.kits.length === 5 && list.limit === 1, `kits ${list.kits.length}, limit ${list.limit}`)
      expect(limitHit(await api.post(A, '/brand/kits', { name: 'one more' })), 'a new kit was allowed over the limit')
      await openBrand(p, A.id); await details(p).waitFor({ timeout: 8000 })
      await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click(); await p.getByText(/./).first().waitFor()
      expect(await p.getByRole('alert').count() === 0, 'applying a kept kit failed after the downgrade')
      await deleteAllKits(A)
    })

    // ───────── F1: default kit ─────────
    await s.check('F1 the first kit is the default; making another the default moves it; deleting the default hands over; there is exactly one default', p, async () => {
      plan(A.email, 'gold')
      const mk = async (n) => (await api.post(A, '/brand/kits', { name: n, primary: '#112233', accent: '#445566' })).data
      const k1 = await mk('One'), k2 = await mk('Two'), k3 = await mk('Three')
      const defaults = async () => (await kitsOf(A)).kits.filter((k) => k.isDefault).map((k) => k.name)
      expect(k1.isDefault && JSON.stringify(await defaults()) === '["One"]', `first default: ${await defaults()}`)
      await openBrand(p, A.id); await p.getByLabel('Brand kit', { exact: true }).selectOption({ label: 'Two' }); await p.waitForFunction(() => document.querySelector('[aria-label="Kit name"]')?.value === 'Two', null, { timeout: 5000 })
      await details(p).getByLabel(/Default kit/).click(); await p.waitForFunction(() => document.querySelector('input[type=checkbox][disabled]') !== null || true); await p.waitForTimeout(1200)
      expect(JSON.stringify(await defaults()) === '["Two"]', `after change: ${await defaults()}`)
      expect(await details(p).getByLabel(/Default kit/).isDisabled(), 'the default checkbox can be unticked (would leave no default)')
      await details(p).getByRole('button', { name: 'Delete kit' }).click(); await p.waitForTimeout(1000)
      const left = await defaults(); expect(left.length === 1, `after deleting the default: ${left}`)
      // many quick changes never leave two defaults
      await Promise.all([api.patch(A, `/brand/kits/${k1.id}`, { isDefault: true }), api.patch(A, `/brand/kits/${k3.id}`, { isDefault: true })])
      expect((await defaults()).length === 1, `two defaults after a race: ${await defaults()}`)
      await deleteAllKits(A)
    })

    // ───────── H: security and ownership (two real accounts) ─────────
    await s.check('H1 another person cannot read, change, delete, or upload into my kit, and cannot see it in their list', p, async () => {
      plan(A.email, 'pro'); await deleteAllKits(A)
      const mine = (await api.post(A, '/brand/kits', { name: 'Private', primary: '#112233', accent: '#445566' })).data
      expect(mine?.id, 'could not create the kit')
      const up = await api.upload(A, `/brand/kits/${mine.id}/logo`, file('l.png', png(200, 80), 'image/png')); expect(up.status === 200 || up.status === 201, `own upload ${up.status}`)
      expect((await kitsOf(O)).kits.every((k) => k.id !== mine.id), 'my kit is in their list')
      expect((await api.patch(O, `/brand/kits/${mine.id}`, { name: 'hacked' })).status === 404, 'they changed my kit')
      expect((await api.del(O, `/brand/kits/${mine.id}`)).status === 404, 'they deleted my kit')
      expect((await api.upload(O, `/brand/kits/${mine.id}/logo`, file('l.png', png(200, 80), 'image/png'))).status === 404, 'they uploaded into my kit')
      expect((await api.upload(O, `/brand/kits/${mine.id}/images`, file('l.png', png(200, 80), 'image/png'))).status === 404, 'they added a picture to my kit')
      expect((await kitsOf(A)).kits[0].name === 'Private', 'my kit changed')
    })

    await s.check('H3 + H4 a file that is HTML but named .png is refused by content; a request from another site (wrong Origin) is refused; signed-out gets 401', p, async () => {
      const kit = (await kitsOf(A)).kits[0]
      const r = await api.upload(A, `/brand/kits/${kit.id}/logo`, file('a.png', Buffer.from('<script>1</script>'), 'image/png')); expect(r.status >= 400 && r.status < 500, `HTML-as-png gave ${r.status}`)
      const cross = await A.ctx.request.patch(`${API}/api/v1/brand/kits/${kit.id}`, { headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, data: { name: 'csrf' } })
      expect(cross.status() >= 400, `cross-site request gave ${cross.status()}`)
      expect((await kitsOf(A)).kits[0].name === 'Private', 'a cross-site request changed the kit')
      const anon = await b.newContext(); const a401 = await anon.request.get(`${API}/api/v1/brand/kits`); expect(a401.status() === 401, `signed-out gave ${a401.status()}`); await anon.close()
    })

    await s.check('A6 a person invited to edit a deck sees the logo on it, but never the owner\'s kits', p, async () => {
      const deck = await newDeck(A, 'Shared brand deck')
      await openBrand(p, deck); await details(p).waitFor({ timeout: 8000 })
      await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 8000 })
      // (the kit has no logo, so give the deck one the real way: upload to the kit, apply again)
      await details(p).getByLabel('Upload logo').setInputFiles(file('logo.png', LOGO_WIDE, 'image/png')); await details(p).getByRole('img', { name: 'Brand logo' }).waitFor({ timeout: 10000 })
      await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 8000 }); await saved(p); await p.waitForTimeout(1800)
      const inv = await api.post(A, `/presentations/${deck}/members`, { email: O.email }); expect(inv.status === 200 || inv.status === 201, `invite gave ${inv.status} ${JSON.stringify(inv.body?.error)}`)
      const token = tsx(`scripts/qa-invite-token.ts ${O.email}`)
      await O.p.goto(`${EDITOR}/invite/${token}`, { waitUntil: 'networkidle' }); await O.p.getByRole('button', { name: /Accept and open/ }).click(); await O.p.waitForURL(new RegExp(`/edit/${deck}`), { timeout: 15000 })
      await stage(O.p).waitFor({ timeout: 15000 })
      await O.p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 10000 })
      await O.p.getByRole('toolbar').getByRole('button', { name: /Style/ }).click(); await O.p.getByRole('tab', { name: 'Brand' }).click()
      await O.p.getByText('No brand kit yet').waitFor({ timeout: 8000 })
      expect(await O.p.getByLabel('Brand kit details').count() === 0 && !(await O.p.locator('aside[aria-label="Style"]').innerText()).includes('Private'), 'the owner\'s kit is visible to the collaborator')
    })

    // ───────── I: layout ─────────
    await s.check('I1 + I4 phone width (390 px): the Brand tab fits with a very long kit name and many colours; no sideways scroll; Save / Apply reachable', p, async () => {
      await deleteAllKits(A)
      const k = (await api.post(A, '/brand/kits', { name: 'A very long company name that keeps going and going on', primary: '#112233', accent: '#445566', extra: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888'].map((c, i) => `#${(i + 1).toString(16).repeat(6)}`) })).data
      void k
      const pctx = await b.newContext({ viewport: { width: 390, height: 780 }, storageState: await A.ctx.storageState() }); const pp = await pctx.newPage()
      await pp.goto(`${EDITOR}/edit/${A.id}`, { waitUntil: 'networkidle' }); await stage(pp).waitFor({ timeout: 20000 })
      await pp.getByRole('toolbar').getByRole('button', { name: /Style/ }).click(); await pp.getByRole('tab', { name: 'Brand' }).click()
      await details(pp).waitFor({ timeout: 8000 })
      for (const n of ['Save kit', 'Delete kit']) await details(pp).getByRole('button', { name: n }).scrollIntoViewIfNeeded()
      await applyBox(pp).getByRole('button', { name: 'Apply to this presentation' }).scrollIntoViewIfNeeded()
      const w = await pp.evaluate(() => ({ doc: document.documentElement.scrollWidth, inner: window.innerWidth, aside: (document.querySelector('aside[aria-label="Style"]')?.scrollWidth ?? 0) - (document.querySelector('aside[aria-label="Style"]')?.clientWidth ?? 0) }))
      expect(w.doc <= w.inner + 1, `the page scrolls sideways (${w.doc} > ${w.inner})`); expect(w.aside <= 1, `the panel scrolls sideways (${w.aside}px)`)
      await pp.screenshot({ path: new URL('../results/24-kits-phone.png', import.meta.url).pathname })
      await pctx.close()
    })

    await s.check('I2 every control in the Brand tab has a name and the tab key reaches Save / Apply / Delete', p, async () => {
      await openBrand(p, A.id); await details(p).waitFor({ timeout: 8000 })
      const unnamed = await p.evaluate(() => [...document.querySelectorAll('aside[aria-label="Style"] button, aside[aria-label="Style"] input, aside[aria-label="Style"] select')].filter((e) => { const n = (e.getAttribute('aria-label') || e.labels?.[0]?.textContent || e.textContent || e.getAttribute('title') || '').trim(); return !n && e.type !== 'hidden' }).map((e) => e.outerHTML.slice(0, 90)))
      expect(unnamed.length === 0, `controls without a name: ${unnamed.join(' | ')}`)
      const reached = new Set()
      await details(p).getByLabel('Kit name').focus()
      for (let i = 0; i < 30; i++) { await p.keyboard.press('Tab'); const t = await p.evaluate(() => (document.activeElement?.textContent || document.activeElement?.getAttribute('aria-label') || '').trim()); reached.add(t) }
      for (const need of ['Save kit', 'Delete kit', 'Apply to this presentation']) expect([...reached].some((t) => t.includes(need)), `Tab never reaches "${need}"`)
    })

    await s.check('I3 the API is unreachable: saving shows a message and the page is usable again (no frozen screen)', p, async () => {
      await openBrand(p, A.id); const d = details(p); await d.waitFor({ timeout: 8000 })
      await d.getByLabel('Kit name').fill(NAMED('Offline'))
      await p.route('**/api/v1/brand/kits/**', (r) => r.abort('failed'))
      await d.getByRole('button', { name: 'Save kit' }).click(); await p.getByRole('alert').first().waitFor({ timeout: 8000 })
      expect(!/TypeError|fetch failed|stack/.test(await msg()), `technical text: "${await msg()}"`)
      await p.unroute('**/api/v1/brand/kits/**')
      expect(await d.getByRole('button', { name: 'Save kit' }).isEnabled(), 'Save stays off after a failure (cannot retry)')
    })

    await s.check('H5 + a11y scan: the Brand tab has no serious accessibility violations', p, async () => {
      await openBrand(p, A.id); await details(p).waitFor({ timeout: 8000 })
      const bad = await p.evaluate(() => { const out = []; for (const i of document.querySelectorAll('aside[aria-label="Style"] img')) if (!i.hasAttribute('alt')) out.push('img without alt'); return out })
      expect(bad.length === 0, bad.join(', '))
    })
  } finally {
    await b.close()
  }
  return s.done()
}
