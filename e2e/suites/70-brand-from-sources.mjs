import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EDITOR, RESULTS, expect, launch, suite } from '../lib.mjs'
import { api, details, deleteAllKits, kitsOf, logos, openBrand, person, saved, stage, tsx } from '../kits-lib.mjs'

/**
 * "Get brand from a website, PowerPoint or PDF", in a real browser against the real servers, self-contained (it makes its own people, decks and files; no other suite's state):
 * the three sources in the Style panel's Brand tab, one shared review card (name, colours, fonts, logo, notes), editing before saving, Save / Update, applying to an EXISTING deck
 * (light and dark, contrast checked) and to a NEW one, the "Also use its slide layouts as a design" hand-off for a PowerPoint, honest refusals (password, wrong type, picture-only PDF),
 * Starter's upgrade, and a real public website. No AI is called. Screenshots of the extracted kits applied to decks go to e2e/results/70-*.png to be looked at.
 */
const luma = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const contrast = (a, b) => { const [x, y] = [luma(a), luma(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const dist = (a, b) => Math.hypot(...[1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)))

export default async function () {
  const s = suite('70-brand-from-sources')
  const b = await launch()
  const dir = mkdtempSync(join(tmpdir(), 'brand-fx-'))
  const errors = []
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]|status of (4\d\d|503)/.test(m.text())) errors.push(m.text().slice(0, 200)) })
    p.on('dialog', (d) => void d.accept())
  }
  const shot = (p, name) => p.screenshot({ path: join(RESULTS, `70-${name}.png`) })
  const SRC = 'Get brand from a website, PowerPoint or PDF'
  const found = (p) => p.getByLabel('What we found')
  const tab = (p, name) => p.getByRole('tab', { name })
  const openSource = async (p, which) => {
    const sec = p.locator('details[aria-label="Get brand from a source"]')
    if ((await sec.getAttribute('open')) === null) await p.getByText(SRC).click()
    await tab(p, which).click()
  }
  const readFile = async (p, which, path, expectFound = true) => {
    await openSource(p, which)
    await p.getByTestId('brand-file-input').setInputFiles(path)
    if (expectFound) await found(p).waitFor({ timeout: 60000 })
    else await p.locator('details[aria-label="Get brand from a source"]').getByRole('alert').waitFor({ timeout: 60000 })
  }
  const docOf = async (A, id) => (await api.get(A, `/presentations/${id}`)).data.document
  const deckWith = async (A, templateId, title) => { const r = await api.post(A, '/presentations', { title, templateId, aspectRatio: '16:9' }); expect(r.status === 200 || r.status === 201, `create deck ${r.status} ${JSON.stringify(r.body?.error)}`); return r.data.id }
  const contrastOk = (theme, dark) => {
    const c = theme.colors
    expect(contrast(c.textPrimary, c.background) >= 4.5, `text on background ${contrast(c.textPrimary, c.background).toFixed(2)}`)
    expect(contrast(c.onPrimary, c.primary) >= 4.5, `text on the main colour ${contrast(c.onPrimary, c.primary).toFixed(2)}`)
    expect(contrast(c.primary, c.background) >= (dark ? 3 : 1.5), `main colour against background ${contrast(c.primary, c.background).toFixed(2)}`)
  }
  try {
    console.log(tsx(`scripts/qa-make-brand-fixtures.ts ${dir}`))
    const PPTX = join(dir, 'acme-brand.pptx'), DARKPPTX = join(dir, 'acme-dark.pptx'), PDF = join(dir, 'acme-brand.pdf'), SCAN = join(dir, 'scan.pdf'), LOCKED = join(dir, 'locked.pdf')
    const G = await person(b, 'bsrc', 'pro')
    const S = await person(b, 'bsrcs')
    const { p } = G
    watch(p); watch(S.p)
    const light = await deckWith(G, 'pitch-seed-round', 'Brand light deck')
    const darkDeck = await deckWith(G, 'pitch-launchpad', 'Brand dark deck')
    let designName

    await s.check('T1 Starter: the Brand tab offers the upgrade (no sources), and the server refuses a file before reading it', S.p, async () => {
      const d = await deckWith(S, undefined, 'Starter deck')
      await openBrand(S.p, d)
      expect((await S.p.getByText(SRC).count()) === 0, 'Starter sees the source picker')
      await S.p.getByRole('button', { name: 'See plans' }).waitFor({ timeout: 8000 })
      const r = await api.upload(S, '/brand/from-file', { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
      expect(r.status === 403 && r.body?.error?.details?.feature === 'brand', `${r.status} ${JSON.stringify(r.body?.error)}`)
    })

    await s.check('T2 Pro: the three sources are offered clearly (website, PowerPoint, PDF) and the wrong file type in a tab is explained', p, async () => {
      await openBrand(p, light)
      await p.getByText(SRC).click()
      for (const n of ['From a website (URL)', 'From a PowerPoint (.pptx)', 'From a PDF']) await tab(p, n).waitFor({ timeout: 5000 })
      await readFile(p, 'From a PowerPoint (.pptx)', PDF, false) // a PDF in the PowerPoint tab
      expect(/Choose a PowerPoint file/.test(await p.locator('details[aria-label="Get brand from a source"]').getByRole('alert').innerText()), 'no explanation')
      await readFile(p, 'From a PDF', PPTX, false)
      expect(/Choose a PDF/.test(await p.locator('details[aria-label="Get brand from a source"]').getByRole('alert').innerText()), 'no explanation')
    })

    await s.check('T3 PowerPoint: the review card shows name, colours, fonts and logo read from the file, honest layouts text and the second action', p, async () => {
      await readFile(p, 'From a PowerPoint (.pptx)', PPTX)
      const f = found(p)
      expect((await f.getByLabel('Brand name').inputValue()) === 'acme', `name ${await f.getByLabel('Brand name').inputValue()}`)
      expect((await f.getByLabel('Found main colour').inputValue()).toUpperCase() === '#E4572E', 'main colour')
      expect((await f.getByLabel('Found accent colour').inputValue()).toUpperCase() === '#17BEBB', 'accent colour')
      expect((await f.getByLabel('Headings font found').inputValue()) === 'Montserrat', 'heading font')
      expect((await f.getByLabel('Text font found').inputValue()) === 'Lato', 'text font')
      await f.getByRole('img', { name: 'Logo found in the file' }).waitFor({ timeout: 8000 })
      expect(await f.getByRole('img', { name: 'Logo found in the file' }).evaluate((i) => i.naturalWidth > 0), 'logo did not load')
      expect(/slide layouts/i.test(await f.getByTestId('brand-layouts').innerText()), 'no layouts text')
      await f.getByTestId('brand-use-layouts').waitFor({ timeout: 3000 })
    })

    await s.check('T4 the review is editable; Save as brand kit stores the EDITED colours/fonts and the logo; reload keeps them', p, async () => {
      const f = found(p)
      await f.getByLabel('Brand name').fill('Acme Robotics')
      await f.getByLabel('Found main colour').fill('#d9482b')
      await f.getByLabel('Headings font found').selectOption('Playfair Display')
      await f.getByRole('button', { name: 'Save as brand kit' }).click()
      await p.getByText(/Saved to your brand kit "Acme Robotics"/).waitFor({ timeout: 10000 })
      const k = (await kitsOf(G)).kits[0]
      expect(k.name === 'Acme Robotics' && k.colors.primary === '#D9482B' && k.colors.accent === '#17BEBB', JSON.stringify(k.colors))
      expect(k.fonts.heading === 'Playfair Display' && k.fonts.body === 'Lato', JSON.stringify(k.fonts))
      expect(!!k.logo && (await G.ctx.request.get(k.logo.url)).ok(), 'logo missing or not served')
      expect(k.sourceUrl === null, 'a file kit must not claim a website')
      await shot(p, 'kit-from-pptx')
    })

    await s.check('T5 the same card applies to an EXISTING light deck: colours (legible), fonts, logo on every slide, one undo', p, async () => {
      await openBrand(p, light)
      await readFile(p, 'From a PowerPoint (.pptx)', PPTX)
      await found(p).getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.getByText(/Applied to every slide/).waitFor({ timeout: 8000 })
      expect((await logos(p)) >= 1, 'no logo on the slide')
      await saved(p)
      const d = await docOf(G, light)
      expect(d.theme.fonts.heading === 'Montserrat' && d.theme.fonts.body === 'Lato', JSON.stringify(d.theme.fonts))
      expect(dist(d.theme.colors.primary, '#E4572E') < 70, `primary ${d.theme.colors.primary}`)
      expect(!!d.theme.brand?.logo?.src, 'logo not on the theme')
      contrastOk(d.theme, false)
      await shot(p, 'light-deck-pptx-brand')
      await p.keyboard.press('Meta+z'); await p.keyboard.press('Control+z')
      await saved(p).catch(() => {})
      expect((await logos(p)) === 0, 'undo left the logo')
    })

    await s.check('T6 a PowerPoint kit on a DARK deck stays legible (text, button text, main colour against the dark background)', p, async () => {
      await openBrand(p, darkDeck)
      await readFile(p, 'From a PowerPoint (.pptx)', DARKPPTX)
      const f = found(p)
      expect((await f.getByLabel('Found main colour').inputValue()).toUpperCase() === '#14B8A6', 'main colour of the dark deck')
      expect((await f.getByLabel('Found accent colour').inputValue()).toUpperCase() === '#F59E0B', 'accent colour of the dark deck')
      expect(/replaced|Closest to Segoe UI/.test(await f.innerText()), 'the replaced font Segoe UI is not mentioned')
      await f.getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.getByText(/Applied to every slide/).waitFor({ timeout: 8000 })
      await saved(p)
      const d = await docOf(G, darkDeck)
      contrastOk(d.theme, true)
      await shot(p, 'dark-deck-pptx-brand')
    })

    await s.check('T7 "Also use its slide layouts as a design": the file becomes a design in "Your designs", same colours and fonts, and the card says so', p, async () => {
      await openBrand(p, light)
      await readFile(p, 'From a PowerPoint (.pptx)', PPTX)
      await found(p).getByTestId('brand-use-layouts').click()
      await found(p).getByTestId('brand-layouts-done').waitFor({ timeout: 60000 })
      const msg = await found(p).getByTestId('brand-layouts-done').innerText()
      expect(/Saved as the design/.test(msg) && /Use a file's design/.test(msg), msg)
      const list = (await api.get(G, '/file-templates')).data.templates
      const t = list.find((x) => /acme/i.test(x.name))
      expect(!!t, `no design in the list: ${JSON.stringify(list.map((x) => x.name))}`)
      expect(t.theme.fonts.heading === 'Montserrat' && dist(t.theme.colors.primary, '#E4572E') < 5, JSON.stringify(t.theme))
      designName = t.name
      await shot(p, 'layouts-handoff')
    })

    await s.check('T8 PDF (text): colours, fonts, logo read; honest "approximation" layouts text and the layouts button; Update my kit replaces the kit incl. its logo', p, async () => {
      await openBrand(p, light)
      await readFile(p, 'From a PDF', PDF)
      const f = found(p)
      expect((await f.getByLabel('Brand name').inputValue()) === 'Acme Robotics brand', `name ${await f.getByLabel('Brand name').inputValue()}`)
      expect((await f.getByLabel('Found main colour').inputValue()).toUpperCase() === '#0A2540', 'main colour')
      expect((await f.getByLabel('Found accent colour').inputValue()).toUpperCase() === '#FF5A1F', 'accent colour')
      expect((await f.getByLabel('Headings font found').inputValue()) === 'Helvetica', 'heading font')
      await f.getByRole('img', { name: 'Logo found in the file' }).waitFor({ timeout: 8000 })
      expect(/approximation/.test(await f.getByTestId('brand-layouts').innerText()), 'no honest PDF layouts text')
      await f.getByTestId('brand-use-layouts').waitFor({ timeout: 3000 }) // a text PDF can also be kept as a design
      const before = (await kitsOf(G)).kits[0]
      await f.getByRole('button', { name: 'Update my kit' }).click()
      await p.getByText(/Saved to your brand kit/).waitFor({ timeout: 10000 })
      const k = (await kitsOf(G)).kits[0]
      expect(k.id === before.id && k.colors.primary === '#0A2540' && k.colors.accent === '#FF5A1F', JSON.stringify(k.colors))
      expect(!!k.logo && k.logo.url !== before.logo.url, 'the kit kept the old logo')
      expect(k.fonts.heading === 'Helvetica' && k.sourceUrl === null, JSON.stringify(k.fonts))
    })

    await s.check('T9 the saved kit applies to an existing deck from the kit panel, and to a brand-new deck made from a template', p, async () => {
      const fresh = await deckWith(G, 'pitch-seed-round', 'Brand new deck')
      await openBrand(p, fresh)
      await applyBoxClick(p)
      await saved(p)
      const d = await docOf(G, fresh)
      expect(d.theme.fonts.heading === 'Helvetica', JSON.stringify(d.theme.fonts))
      expect(dist(d.theme.colors.primary, '#0A2540') < 80 || dist(d.theme.colors.primary, '#FF5A1F') < 80, d.theme.colors.primary)
      expect((await logos(p)) >= 1, 'no logo')
      contrastOk(d.theme, false)
      await shot(p, 'pdf-kit-on-deck')
    })

    await s.check('T10 picture-only PDF: still gives colours from the page and says fonts could not be read; password-protected PDF gets a plain message', p, async () => {
      await openBrand(p, light)
      await readFile(p, 'From a PDF', SCAN)
      const f = found(p)
      expect((await f.getByLabel('Found main colour').inputValue()).toUpperCase() === '#1478C8', 'colour of the page picture')
      const t = await f.innerText()
      expect(/page pictures|No fonts could be read/.test(t), `no fonts message: ${t.slice(0, 300)}`)
      await readFile(p, 'From a PDF', LOCKED, false)
      const msg = await p.locator('details[aria-label="Get brand from a source"]').getByRole('alert').innerText()
      expect(/password protected/.test(msg) && !/Exception|stack/i.test(msg), msg)
    })

    await s.check('T11 a real public website still works through the same card (colours, fonts, name; honest "no layouts" text) and applies to a deck', p, async () => {
      await openBrand(p, light)
      await openSource(p, 'From a website (URL)')
      let ok = false
      for (const site of ['tailwindcss.com', 'stripe.com']) {
        await p.locator('#brand-url').fill(site)
        await p.getByRole('button', { name: /^Find brand$/ }).click()
        const r = await Promise.race([found(p).waitFor({ timeout: 45000 }).then(() => 'ok'), p.locator('details[aria-label="Get brand from a source"]').getByRole('alert').waitFor({ timeout: 45000 }).then(() => 'err')]).catch(() => 'timeout')
        if (r === 'ok') { ok = true; break }
      }
      expect(ok, 'no public site could be read')
      const f = found(p)
      expect(/^#[0-9A-F]{6}$/.test((await f.getByLabel('Found main colour').inputValue()).toUpperCase()), 'no main colour')
      expect((await f.getByLabel('Brand name').inputValue()).length >= 2, 'no name')
      expect(/A website has no slide layouts/.test(await f.getByTestId('brand-layouts').innerText()), 'no honest website text')
      expect((await f.getByTestId('brand-use-layouts').count()) === 0, 'a website offered layouts')
      await f.getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.getByText(/Applied to every slide/).waitFor({ timeout: 8000 })
      await shot(p, 'website-on-deck')
    })

    await s.check('T12 isolation and cleanliness: another person cannot use this person\'s logo or see their designs; no console errors', S.p, async () => {
      const k = (await kitsOf(G)).kits[0]
      const other = await person(b, 'bsrco', 'pro')
      const r = await api.post(other, '/brand/kits', { name: 'Steal', logoUrl: k.logo.url })
      expect(r.status === 422, `another person used the logo: ${r.status}`)
      const list = (await api.get(other, '/file-templates')).data.templates
      expect(list.length === 0 && !!designName, 'designs leaked')
      expect(errors.length === 0, errors.slice(0, 4).join(' | '))
    })
  } finally {
    await b.close()
    rmSync(dir, { recursive: true, force: true })
  }
  async function applyBoxClick(p) {
    await p.getByLabel('Apply this kit').getByRole('button', { name: 'Apply to this presentation' }).click()
    await p.getByText(/Applied to every slide/).waitFor({ timeout: 8000 })
  }
  return s.done()
}
