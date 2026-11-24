import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { API, expect, launch, suite } from '../lib.mjs'
import { api, openBrand, person } from '../kits-lib.mjs'

/**
 * A brand on SOME slides only (packages/theme slide-theme.ts), in a real browser, judged on the SAVED deck, the slide on screen and the downloaded PowerPoint file:
 * Brand tab → Apply to "Slides 2-3" → only those slides carry the brand (fonts, colours, logo), the others stay in the deck's look; a wrong range is refused while typed;
 * the file writes those slides in the brand's fonts; "Back to the presentation's look" takes it off; undo puts it back. No AI is used.
 */
export default async function () {
  const s = suite('95-slide-brand')
  const b = await launch()
  const dir = mkdtempSync(join(tmpdir(), 'sb-'))
  try {
    const A = await person(b, 'b95', 'gold')
    const p = A.p
    const id = (await api.post(A, '/presentations', { title: 'Slide brand deck', templateId: 'pitch-seed-round' })).data.id
    const kit = await api.post(A, '/brand/kits', { name: 'Acme', primary: '#E4572E', accent: '#17BEBB', headingFont: 'Playfair Display', bodyFont: 'Inter' })
    expect(!!kit.data?.id, `kit: ${JSON.stringify(kit).slice(0, 200)}`)
    const deck = async () => (await api.get(A, `/presentations/${id}`)).data.document
    const scope = () => p.getByLabel('Apply this kit')
    // the database keeps object keys in its own order: compare by value
    const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [c]) => a.localeCompare(c))) : x))
    const diff = (a, b2) => Object.keys({ ...a, ...b2 }).filter((k) => canon(a[k]) !== canon(b2[k]))

    await s.check('a wrong range is refused while it is typed: the button is off and says why', p, async () => {
      await openBrand(p, id)
      await scope().waitFor({ timeout: 10000 })
      await scope().getByLabel('Slides to brand').fill('2-99')
      expect(/no slide 99/.test(await scope().innerText()), 'no reason shown for slide 99')
      expect(await scope().getByRole('button', { name: /^Apply to/ }).isDisabled(), 'Apply should be off for a wrong range')
    })

    await s.check('Apply to slides 2-3: only those slides carry the brand (fonts, colours); slide 1 and the deck design stay as they were', p, async () => {
      const before = await deck()
      await scope().getByLabel('Slides to brand').fill('2-3')
      const btn = scope().getByRole('button', { name: 'Apply to slides 2-3' })
      await btn.click()
      await p.getByText('Applied to slides 2-3.').waitFor({ timeout: 8000 })
      await p.waitForTimeout(2500) // autosave
      const d = await deck()
      expect(!d.slides[0].brand && !!d.slides[1].brand && !!d.slides[2].brand && !d.slides[3]?.brand, `brands: ${JSON.stringify(d.slides.map((x) => !!x.brand))}`)
      expect(d.slides[1].brand.headingFont === 'Playfair Display' && d.slides[1].brand.primary === '#E4572E', `slide 2 brand: ${JSON.stringify(d.slides[1].brand)}`)
      // (the first save fills in the design's default style values the stored deck left out: that is the save's own normalising, not this change)
      const same = ['id', 'colors', 'fonts', 'brand'].every((k) => canon(d.theme[k]) === canon(before.theme[k])) && Object.entries(before.theme.style ?? {}).every(([k, v]) => canon(d.theme.style?.[k]) === canon(v))
      expect(same, `the deck design changed: ${diff(d.theme, before.theme).map((k) => `${k}: ${canon(before.theme[k])} -> ${canon(d.theme[k])}`).join('; ')}`)
      expect(canon(d.slides[0].elements) === canon(before.slides[0].elements), 'slide 1 changed')
      // the slide on screen: open slide 2 and read the title's font
      await p.locator('[data-testid^="thumb-"]').nth(1).click(); await p.waitForTimeout(400)
      const fonts = await p.locator('[data-testid="stage"] [data-role="title"], [data-testid="stage"] h1, [data-testid="stage"] div').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily).filter((f) => /Playfair/.test(f)).length)
      expect(fonts > 0, 'slide 2 is not drawn in the brand\'s heading font')
      await p.locator('[data-testid^="thumb-"]').nth(0).click(); await p.waitForTimeout(400)
      const deckFonts = await p.locator('[data-testid="stage"] div').evaluateAll((els) => els.filter((e) => /Playfair/.test(getComputedStyle(e).fontFamily)).length)
      expect(deckFonts === 0, 'slide 1 shows the brand font')
      expect(/Slides with their own brand: slides 2-3/.test(await p.locator('body').innerText()), 'the tab does not list the branded slides')
    })

    await s.check('the PowerPoint file writes slides 2-3 in the brand\'s font and slide 1 in the deck\'s', p, async () => {
      const r = await A.ctx.request.post(`${API}/api/v1/exports`, { headers: { Origin: 'http://localhost:3001', 'Content-Type': 'application/json' }, data: { presentationId: id, format: 'pptx' } })
      expect(r.ok(), `export ${r.status()}`)
      const file = join(dir, 'b.pptx'); writeFileSync(file, Buffer.from(await r.body()))
      const x = (n) => execSync(`unzip -p "${file}" ppt/slides/slide${n}.xml`).toString()
      expect(/Playfair Display/.test(x(2)) && /Playfair Display/.test(x(3)), 'slides 2-3 are not in the brand font in the file')
      expect(!/Playfair Display/.test(x(1)), 'slide 1 is in the brand font in the file')
    })

    await s.check('"Back to the presentation\'s look" takes the brand off; Ctrl+Z puts it back', p, async () => {
      await p.getByRole('button', { name: "Back to the presentation's look" }).click(); await p.waitForTimeout(2500)
      expect((await deck()).slides.every((x) => !x.brand), 'a slide kept its brand')
      await p.keyboard.press('Escape'); await p.locator('[data-testid="stage"]').click({ position: { x: 5, y: 5 } })
      await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await p.waitForTimeout(2500)
      const d = await deck()
      expect(!!d.slides[1].brand && !!d.slides[2].brand && !d.slides[0].brand, `after undo: ${JSON.stringify(d.slides.map((x) => !!x.brand))}`)
      await p.screenshot({ path: join(process.env['E2E_OUT'] ?? dir, '95-slide-brand.png') })
    })
  } finally {
    await b.close()
    rmSync(dir, { recursive: true, force: true })
  }
  return s.done()
}
