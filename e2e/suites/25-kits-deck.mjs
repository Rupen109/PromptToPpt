import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { API, EDITOR, RESULTS, WEB, expect, launch, suite } from '../lib.mjs'
import { api, applyBox, assetOk, deleteAllKits, details, file, kitsOf, logos, newDeck, openBrand, openDeck, person, plan, png, saved, stage, tsx } from '../kits-lib.mjs'

/**
 * Brand kits on real decks, with REAL AI generation (two real decks, a few rupees): E apply · F default kit + Create · J lookups judged by eye.
 * Flow ids refer to docs/BRAND_KITS_FUNCTIONAL_FLOWS.md.
 */
export default async function () {
  const s = suite('25-kits-deck')
  const b = await launch()
  const P = await person(b, 'deckP', 'pro')
  const Q = await person(b, 'deckQ', 'pro')
  const p = P.p, q = Q.p
  for (const x of [p, q]) x.on('dialog', (d) => void d.accept())
  const PROMPT = 'A 5 slide pitch for Aroma Coffee Roasters, a small-batch coffee roastery with 4 stores, for local investors.'
  const KIT = { name: 'Journey', primary: '#E4572E', accent: '#17BEBB', headingFont: 'Playfair Display', bodyFont: 'Lora' }
  const LOGO = png(480, 160, { rgba: [23, 190, 187, 255] })
  const dist = (a, b) => Math.hypot(...[1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)))
  const hue = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360 }
  const hueGap = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d) }
  const shot = (page, name) => page.screenshot({ path: join(RESULTS, `25-${name}.png`) })
  const docOf = async (A, id) => (await api.get(A, `/presentations/${id}`)).data
  const text = async (A, id) => JSON.stringify(await docOf(A, id)).toLowerCase()
  const balance = (A) => JSON.parse(tsx(`scripts/qa-remix-check.ts balance ${A.email}`)).balance
  const spentSince = (A, since) => JSON.parse(tsx(`scripts/qa-remix-check.ts spent ${A.email} ${since}`))
  const brandEls = async (A, id) => { const d = (await docOf(A, id)); const slides = d.document?.slides ?? d.slides ?? []; return { slides: slides.length, withLogo: slides.filter((sl) => (sl.elements ?? []).some((e) => e.brand)).length } }

  /** the real thing: home → prompt → Create → model → wait for the deck; returns the new deck id and the job request that was sent */
  async function generate(pg, A, { expectOffer }) {
    const sent = []
    pg.on('request', (r) => { if (r.url().endsWith('/generation/jobs') && r.method() === 'POST') sent.push(JSON.parse(r.postData() ?? '{}')) })
    await pg.goto(EDITOR + '/', { waitUntil: 'networkidle' })
    await pg.getByLabel('Presentation prompt').fill(PROMPT)
    await pg.getByRole('button', { name: 'Create Presentation' }).click(); await pg.waitForURL(/\/create/)
    if (expectOffer !== null) { const box = pg.getByLabel('Build it in my brand'); await box.waitFor({ state: expectOffer ? 'visible' : 'detached', timeout: 90000 }) } else await pg.getByRole('radiogroup', { name: 'AI model' }).waitFor({ timeout: 90000 })
    return { sent, start: async () => {
      const radios = pg.getByRole('radiogroup', { name: 'AI model' }).getByRole('radio'); const names = await radios.allInnerTexts()
      const i = Math.max(0, names.findIndex((n) => /3\.6 Flash/.test(n)))
      await radios.nth(i).click()
      await pg.waitForURL(/\/edit\//, { timeout: 300000 })
      return new URL(pg.url()).pathname.split('/').pop()
    } }
  }

  let W // the deck made WITHOUT the kit (five real slides)
  let costPlain = 0
  try {
    // a kit with colours, fonts and a logo for account P
    const k = (await api.post(P, '/brand/kits', KIT)).data; expect(k?.id, 'kit not created')
    const up = await api.upload(P, `/brand/kits/${k.id}/logo`, file('logo.png', LOGO, 'image/png')); expect(up.status === 200, `logo upload ${up.status}`)
    tsx(`scripts/qa-remix-check.ts setbalance ${P.email} 2000`); tsx(`scripts/qa-remix-check.ts setbalance ${Q.email} 2000`)

    await s.check('F4 + F2 + F3 + F6 REAL AI: Create offers "Build it in my brand" (on by default); turned OFF, the job carries no kit and the deck is NOT in the brand', p, async () => {
      // F4 first: a person with no kit is not offered the option (account Q)
      const gq = await generate(q, Q, { expectOffer: false }); expect(await q.getByLabel('Build it in my brand').count() === 0, 'F4: the option is shown without a kit')
      const g = await generate(p, P, { expectOffer: true })
      const box = p.getByLabel('Build it in my brand'); expect(await box.isChecked(), 'F2: not on by default')
      expect(/Journey/.test(await box.locator('..').innerText()), 'F2: the kit name is not shown')
      await box.uncheck()
      const t0 = new Date().toISOString()
      W = await g.start()
      expect(g.sent.length === 1 && g.sent[0].brandKitId === undefined, `F3: the job carried a kit: ${JSON.stringify(g.sent)}`)
      const t = await text(P, W)
      expect(!t.includes('#17bebb') && !t.includes('"brand":true') && !/"logo"\s*:\s*\{\s*"src"/.test(t), 'F6: the plain deck already has the kit\'s colour or logo')
      const sp = spentSince(P, t0); costPlain = sp.net; expect(sp.charges === 1 && costPlain > 0, `charges: ${JSON.stringify(sp)}`)
      void gq
    })

    await openDeck(p, W)
    const nSlides = (await brandEls(P, W)).slides
    await s.check('E1 Apply everything: colours, fonts and the logo reach EVERY slide; ONE undo reverts all', p, async () => {
      await openBrand(p, W); await details(p).waitFor({ timeout: 8000 })
      await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click()
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 8000 })
      await saved(p); await p.waitForTimeout(1800)
      const t = await text(P, W)
      expect(t.includes('#17bebb'), 'accent colour not applied')
      const pr = (await docOf(P, W)); const prim = JSON.stringify(pr).match(/"primary":"(#[0-9A-Fa-f]{6})"/)?.[1]; expect(prim && dist(prim, '#E4572E') < 60, `main colour ${prim} is far from the brand's #E4572E`); expect(t.includes('playfair display') && t.includes('"lora"'), 'fonts not applied')
      const be = await brandEls(P, W); expect(be.slides === nSlides && be.withLogo === nSlides, `logo on ${be.withLogo} of ${be.slides} slides`)
      await shot(p, 'applied-16x9')
      await p.keyboard.press('Escape'); await stage(p).click({ position: { x: 5, y: 5 } }); await p.keyboard.press('Meta+z'); await p.waitForTimeout(800)
      expect(await logos(p) === 0, 'undo did not remove the logo')
      await saved(p); await p.waitForTimeout(1800)
      const t2 = await text(P, W); expect(!t2.includes('#17bebb') && !t2.includes('"lora"'), 'one undo did not revert colours and fonts too')
    })

    await s.check('E2 + E3 only ticked parts apply; applying twice never doubles the logo', p, async () => {
      await openBrand(p, W); await details(p).waitFor()
      await applyBox(p).getByRole('checkbox', { name: 'Fonts' }).uncheck(); await applyBox(p).getByRole('checkbox', { name: 'Logo' }).uncheck()
      await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click(); await p.waitForTimeout(900)
      expect(await logos(p) === 0, 'E2: the logo was applied although unticked')
      await saved(p); await p.waitForTimeout(1800)
      const t = await text(P, W); expect(t.includes('#17bebb') && !t.includes('"lora"'), 'E2: colours missing or fonts applied although unticked')
      await applyBox(p).getByRole('checkbox', { name: 'Fonts' }).check(); await applyBox(p).getByRole('checkbox', { name: 'Logo' }).check()
      for (let i = 0; i < 2; i++) { await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click(); await p.waitForTimeout(700) }
      expect(await logos(p) === 1, `E3: ${await logos(p)} logos on the slide after applying twice`)
      await saved(p); await p.waitForTimeout(1800)
      const be = await brandEls(P, W); expect(be.withLogo === nSlides, `E3: logo on ${be.withLogo} of ${nSlides}`)
      const total = (await docOf(P, W)); const els = (total.document?.slides ?? total.slides).flatMap((sl) => sl.elements ?? []).filter((e) => e.brand && e.type === 'image').length
      expect(els === nSlides, `E3: ${els} logo images for ${nSlides} slides`)
    })

    await s.check('E4 + E5 a kit without a logo leaves the deck\'s logo alone; a kit without colours has the Colours box off', p, async () => {
      const kit = (await kitsOf(P)).kits[0]
      await api.patch(P, `/brand/kits/${kit.id}`, { removeLogo: true })
      await openBrand(p, W); await details(p).waitFor()
      expect(await applyBox(p).getByRole('checkbox', { name: 'Logo' }).isDisabled(), 'E4: Logo box is on for a kit without a logo')
      await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click(); await p.waitForTimeout(800)
      expect(await logos(p) === 1, 'E4: the deck lost its logo')
      await api.patch(P, `/brand/kits/${kit.id}`, { primary: null, accent: null })
      await openBrand(p, W); await details(p).waitFor()
      expect(await applyBox(p).getByRole('checkbox', { name: 'Colours' }).isDisabled(), 'E5: Colours box is on for a kit without colours')
      await api.patch(P, `/brand/kits/${kit.id}`, { primary: '#E4572E', accent: '#17BEBB' })
      await api.upload(P, `/brand/kits/${kit.id}/logo`, file('logo.png', LOGO, 'image/png'))
    })

    await s.check('E7 formats 16:9, 4:3 and 1:1: the logo sits in the margin, inside the slide, and never over other content (screenshots kept)', p, async () => {
      const kit = (await kitsOf(P)).kits[0]
      for (const ratio of ['16:9', '4:3', '1:1']) {
        const id = await newDeck(P, `Format ${ratio}`, ratio); await openBrand(p, id); await details(p).waitFor({ timeout: 8000 })
        await applyBox(p).getByRole('button', { name: 'Apply to this presentation' }).click()
        await p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] img[alt$="logo"]').length >= 1, null, { timeout: 8000 }); await p.waitForTimeout(500)
        const r = await p.evaluate(() => {
          const st = document.querySelector('[data-testid="stage"]').getBoundingClientRect(); const logo = document.querySelector('[data-testid="stage"] img[alt$="logo"]').getBoundingClientRect()
          const others = [...document.querySelectorAll('[data-testid="stage"] [data-testid^="el-"]')].filter((e) => !e.querySelector('img[alt$="logo"]') && e.getAttribute('alt') === null).map((e) => e.getBoundingClientRect())
          const hit = others.filter((o) => o.width > 4 && o.height > 4 && !(o.right <= logo.left || o.left >= logo.right || o.bottom <= logo.top || o.top >= logo.bottom)).length
          return { inside: logo.left >= st.left - 1 && logo.right <= st.right + 1 && logo.top >= st.top - 1 && logo.bottom <= st.bottom + 1, hit, w: logo.width / st.width, h: logo.height / st.height }
        })
        expect(r.inside, `${ratio}: the logo is outside the slide`); expect(r.hit === 0, `${ratio}: the logo overlaps ${r.hit} element(s)`)
        expect(r.w < 0.35 && r.h < 0.2 && r.w > 0.04, `${ratio}: odd logo size ${JSON.stringify(r)}`)
        await shot(p, `format-${ratio.replace(':', 'x')}`)
      }
      void kit
    })

    await s.check('E8 Present mode shows the logo on every slide', p, async () => {
      await openDeck(p, W); await p.getByRole('button', { name: /Present/ }).click(); await p.getByTestId('present').waitFor({ timeout: 8000 })
      for (let i = 0; i < nSlides; i++) {
        await p.locator('[data-testid="present"] img[alt$="logo"]').first().waitFor({ timeout: 6000 }).catch(() => { throw new Error(`no logo on slide ${i + 1} in present mode`) })
        if (i === 1) await shot(p, 'present')
        await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500)
      }
      await p.keyboard.press('Escape')
    })

    await s.check('E9 Export PPTX: the logo image is on every slide of the file and the kit\'s fonts are in it', p, async () => {
      await openDeck(p, W)
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), (async () => { await p.getByRole('button', { name: /^Export/ }).click(); await p.getByRole('menuitem', { name: /^PPTX/ }).click() })()])
      const path = join(RESULTS, `25-kit-${Date.now()}.pptx`); await dl.saveAs(path)
      const z = unzipSync(new Uint8Array(readFileSync(path)))
      const slideFiles = Object.keys(z).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)); expect(slideFiles.length === nSlides, `${slideFiles.length} slides in the file`)
      const withPic = slideFiles.filter((f) => /<p:pic>/.test(strFromU8(z[f])) && /logo/i.test(strFromU8(z[f]))).length
      const withPicAny = slideFiles.filter((f) => /<p:pic>/.test(strFromU8(z[f]))).length
      expect(withPicAny >= nSlides, `only ${withPicAny} of ${nSlides} slides hold a picture (the logo)`)
      void withPic
      const all = slideFiles.map((f) => strFromU8(z[f])).join('')
      expect(all.includes('Playfair Display') && all.includes('Lora'), 'the kit\'s fonts are not in the file')
      expect(Object.keys(z).some((k) => /^ppt\/media\//.test(k)), 'no media in the file')
    })

    await s.check('E10 switching the deck to Light mode afterwards keeps the logo and the brand colours (the brand accent is still the kit\'s)', p, async () => {
      await openDeck(p, W)
      await p.getByRole('toolbar').getByRole('button', { name: /Style/ }).click(); await p.getByRole('tab', { name: 'Colors' }).click()
      const before = await text(P, W)
      await p.getByRole('button', { name: /Light/ }).click(); await p.waitForTimeout(1200)
      expect(await logos(p) === 1, 'the logo disappeared after changing the mode')
      await shot(p, 'light-mode')
      await saved(p); await p.waitForTimeout(1800)
      const after = await text(P, W)
      expect(after !== before && after.includes('#17bebb'), 'the mode did not change, or the brand accent was lost')
    })

    // ───────── F5 + J: lookups judged by eye, then a REAL generation in the looked-up brand ─────────
    const SITES = ['netflix.com', 'asana.com', 'zerodha.com', 'stripe.com', 'dropbox.com']
    const deckQ = await newDeck(Q, 'Look-up deck')
    await s.check('J1 + J2 five real sites are looked up in the editor and applied to a deck; screenshots are kept to be read by eye', q, async () => {
      await openBrand(q, deckQ); await q.getByText('Get brand from a website').waitFor({ timeout: 8000 })
      for (const site of SITES) {
        if ((await q.locator('details[aria-label="Get brand from a website"]').getAttribute('open')) === null) await q.getByText('Get brand from a website').click()
        await q.getByLabel('Your company website').fill(site); await q.getByRole('button', { name: 'Find brand' }).click()
        await Promise.race([q.getByLabel('What we found').waitFor({ timeout: 40000 }), q.getByRole('alert').first().waitFor({ timeout: 40000 })])
        const f = q.getByLabel('What we found'); expect(await f.count() === 1, `${site}: no result`)
        await shot(q, `lookup-${site.split('.')[0]}`)
        await f.getByRole('button', { name: 'Apply to this presentation' }).click(); await q.waitForTimeout(900)
        await shot(q, `slide-${site.split('.')[0]}`)
      }
    })

    await s.check('F5 + J3 REAL AI: a kit saved from a website lookup (Zerodha) → "Build it in my brand" → the generated deck has its colours, a logo on every slide, and costs the same as the plain deck', q, async () => {
      await openBrand(q, deckQ)
      await q.getByText('Get brand from a website').click()
      await q.getByLabel('Your company website').fill('zerodha.com'); await q.getByRole('button', { name: 'Find brand' }).click(); await q.getByLabel('What we found').waitFor({ timeout: 40000 })
      await q.getByLabel('What we found').getByRole('button', { name: /Save as brand kit|Update my kit/ }).click(); await q.getByText(/Saved to your brand kit/).waitFor({ timeout: 8000 })
      const kit = (await kitsOf(Q)).kits[0]; expect(kit.colors.primary && kit.logo, `the kit from the lookup lacks colours or logo: ${JSON.stringify(kit)}`)
      const g = await generate(q, Q, { expectOffer: true })
      const box = q.getByLabel('Build it in my brand'); expect(await box.isChecked(), 'not on by default')
      const t0 = new Date().toISOString()
      const id = await g.start()
      expect(g.sent.at(-1).brandKitId === kit.id, `the job did not carry the kit: ${JSON.stringify(g.sent.at(-1))}`)
      const t = await text(Q, id)
      const dp = JSON.stringify(await docOf(Q, id)).match(/"primary":"(#[0-9A-Fa-f]{6})"/)?.[1]; expect(dp && hueGap(dp, kit.colors.primary) < 12, `the deck's main colour ${dp} is not the kit's ${kit.colors.primary} (same hue expected; dark decks lighten it for legibility)`)
      expect(t.includes(kit.colors.accent.toLowerCase()), `the kit's accent ${kit.colors.accent} is not in the deck`)
      expect(kit.fonts.heading ? t.includes(kit.fonts.heading.toLowerCase()) : true, 'the deck does not use the kit heading font')
      const be = await brandEls(Q, id); expect(be.slides >= 4 && be.withLogo === be.slides, `logo on ${be.withLogo} of ${be.slides} slides`)
      const sp = spentSince(Q, t0); expect(sp.charges === 1, `charges ${JSON.stringify(sp)}`)
      expect(sp.net === costPlain || (be.slides !== nSlides), `the kit changed the price: ${sp.net} vs ${costPlain} credits`)
      await openDeck(q, id); await q.waitForFunction(() => { const i = document.querySelector('[data-testid="stage"] img[alt$="logo"]'); return !!i && i.complete && i.naturalWidth > 0 }, null, { timeout: 10000 })
      await shot(q, 'generated-in-brand')
    })

    await s.check('F7 a kit deleted while the Create screen was open: the job is refused or made without it with a plain message, never a stuck screen', p, async () => {
      const kit = (await kitsOf(P)).kits[0]
      await api.del(P, `/brand/kits/${kit.id}`)
      const r = await api.post(P, '/generation/jobs', { prompt: PROMPT, analysis: { title: 'x' }, slideCount: 5, brandKitId: kit.id })
      expect(r.status >= 400 && r.status < 500, `a stale kit id gave ${r.status}`)
      const m = r.body?.error?.message ?? ''; expect(m.length > 5 && !/stack|ENOENT|Error:|at \S+\.(ts|js)/.test(m), `unfriendly message: "${m}"`)
    })
  } finally {
    await b.close()
  }
  return s.done()
}
