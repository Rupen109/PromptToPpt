import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The background removal editor's production-readiness work, in a real browser with the development MOCK provider (no model, no cost; a synthetic picture with a known edge):
 *  - the editor works with any provider (?bgprovider=mock), typed provider errors are shown plainly, Cancel stops work;
 *  - real touch events (Chromium's touch input): one finger paints, a second finger cancels the stroke and pinches, so pinching never paints;
 *  - Space moves the picture only for the stage and never takes Space from a focused button or radio button;
 *  - mouse wheel / Ctrl+wheel zoom, the wheel preference, Fit and 100%;
 *  - the brush lands under the pointer at several zoom levels;
 *  - a picture over this device's limit is refused with a plain sentence before the provider is asked (?bgmaxmp=…);
 *  - Expand, Shrink and Soften are undoable steps; the exported PNG has a fully opaque core and a crisp edge (the edge fitted to the picture), at the picture's own size.
 * Needs a verified account: E2E_EMAIL=… E2E_PASSWORD=…
 */
const sharp = createRequire(new URL('../../services/api/package.json', import.meta.url))('sharp')
const W = 1000, H = 800

export default async function () {
  const s = suite('84-background-removal-p0-p1')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, hasTouch: true })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H_ = { origin: EDITOR }
    // a red ellipse (exactly where the mock provider puts its subject: centre, 32% x 36% of the size) on a blue-green gradient, with a one pixel soft edge
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2d7fa8"/><stop offset="1" stop-color="#3fa38a"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/><ellipse cx="${W / 2}" cy="${H / 2}" rx="${W * 0.32}" ry="${H * 0.36}" fill="#c4352c"/></svg>`
    const picture = await sharp(Buffer.from(svg)).png().toBuffer()
    const deckId = (await (await ctx.request.post(`${API}/api/v1/presentations`, { headers: H_, data: { title: 'Background P0 P1 check' } })).json()).data.id
    const p = await ctx.newPage()
    const errors = []
    const asked = []
    p.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`))
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]|status of 40[0-9]|status of 503/.test(m.text())) errors.push(m.text().slice(0, 160)) })
    p.on('request', (rq) => { if (/images\/cutout-mask|images\/cutout$/.test(rq.url())) asked.push(rq.url()) })
    const cdp = await ctx.newCDPSession(p)
    const tid = (t) => p.getByTestId(t)
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) })
    const useProvider = (id) => p.evaluate((id) => history.replaceState(null, '', `${location.pathname}${id ? `?${id}` : ''}`), id)
    const zoom = async () => Number((await tid('bg-zoom').innerText()).replace('%', ''))
    const hash = () => p.evaluate(() => { const c = document.querySelector('[data-testid=bg-canvas]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h })
    const pixel = (x, y) => p.evaluate(([x, y]) => { const c = document.querySelector('[data-testid=bg-canvas]'); const k = c.width / c.getBoundingClientRect().width; const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return [d[0], d[1], d[2], d[3]] }, [x, y])
    const isChecker = (c) => [[255, 255, 255], [217, 221, 227]].some((k) => Math.abs(c[0] - k[0]) <= 4 && Math.abs(c[1] - k[1]) <= 4 && Math.abs(c[2] - k[2]) <= 4)
    /** pixels of the canvas that show the subject (opaque and not the checkerboard) */
    const solidCount = () => p.evaluate(() => { const c = document.querySelector('[data-testid=bg-canvas]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 250) continue; const r = d[i], g = d[i + 1], bl = d[i + 2]; if ((Math.abs(r - 255) < 5 && Math.abs(g - 255) < 5 && Math.abs(bl - 255) < 5) || (Math.abs(r - 217) < 5 && Math.abs(g - 221) < 5 && Math.abs(bl - 227) < 5)) continue; n++ } return n })
    /** page coordinates of a subject point (red, well inside) and the canvas's page box */
    const subjectPoint = () => p.evaluate(() => {
      const c = document.querySelector('[data-testid=bg-canvas]'); const k = c.width / c.getBoundingClientRect().width; const g = c.getContext('2d'); const w = c.width, h = c.height, d = g.getImageData(0, 0, w, h).data
      const red = (x, y) => { const i = (y * w + x) * 4; return d[i + 3] > 250 && d[i] > 150 && d[i + 1] < 90 }
      let best = null
      for (let y = Math.round(h * 0.3); y < h * 0.75 && !best; y += 10) for (let x = Math.round(w * 0.3); x < w * 0.7 && !best; x += 10) if ([[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30]].every(([dx, dy]) => red(x + dx, y + dy))) best = [x, y]
      const r = c.getBoundingClientRect()
      return best ? { x: r.left + best[0] / k, y: r.top + best[1] / k } : null
    })
    const openDialog = async () => {
      await p.locator('[data-testid="stage"] img').last().click({ force: true })
      await tid('remove-background').waitFor({ timeout: 10000 })
      await tid('remove-background').click()
      await tid('bg-dialog').waitFor({ timeout: 10000 })
    }
    const ready = async () => { await tid('bg-canvas').waitFor({ timeout: 60000 }); await p.waitForTimeout(500) }
    const closeDialog = async () => { await p.keyboard.press('Escape'); await tid('bg-dialog').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {}) }

    await s.check('the picture is uploaded, and the dialog opens with a mock provider (no model, no server call) showing the mask', p, async () => {
      await p.goto(`${EDITOR}/edit/${deckId}?bgprovider=mock`, { waitUntil: 'networkidle' })
      await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
      await tid('tb-media').click()
      await p.locator('input[type=file]').first().setInputFiles({ name: 'ellipse.png', mimeType: 'image/png', buffer: picture })
      await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="stage"] img')].some((i) => /\/api\/v1\/assets\//.test(i.getAttribute('src') ?? '')), null, { timeout: 30000 })
      await p.waitForTimeout(2500) // autosave
      await openDialog(); await ready()
      expect(/Mock provider/.test(await tid('bg-provider').innerText()), 'the dialog does not name the mock provider')
      expect(asked.length === 0, `the server model was asked: ${asked.join(' ')}`)
      expect(await solidCount() > 1000, 'no subject shown')
      expect(await tid('bg-reset').isDisabled() && await tid('bg-undo').isDisabled(), 'a fresh mask should have nothing to undo or reset')
    })

    await s.check('one finger paints; a second finger cancels the stroke (no history step, mask unchanged) and the two fingers pinch-zoom and pan: pinching never paints', p, async () => {
      // (a fresh dialog)
      await closeDialog(); await openDialog(); await ready()
      const pt = await subjectPoint(); expect(pt, 'no subject point')
      const z0 = await zoom()
      // two fingers from the start: the first touch begins a dab, the second cancels it
      const a0 = [pt.x - 40, pt.y], b0 = [pt.x + 40, pt.y]
      await touch('touchStart', [a0])
      await touch('touchMove', [[a0[0] - 6, a0[1]]])
      await touch('touchStart', [[a0[0] - 6, a0[1]], b0])
      for (let i = 1; i <= 6; i++) await touch('touchMove', [[a0[0] - 6 - i * 12, a0[1] - i * 4], [b0[0] + i * 12, b0[1] + i * 4]]) // spread apart and drift
      await touch('touchEnd', [])
      await p.waitForTimeout(250)
      expect(await zoom() > z0 + 10, `the pinch did not zoom in (${z0}% -> ${await zoom()}%)`)
      expect(await tid('bg-undo').isDisabled(), 'the pinch left a history step: something was painted')
      expect(await tid('bg-reset').isDisabled(), 'the pinch changed the mask')
      // two fingers moving together pan
      const h0 = await hash()
      const q = await subjectPoint() ?? pt
      await touch('touchStart', [[q.x - 30, q.y], [q.x + 30, q.y]])
      for (let i = 1; i <= 5; i++) await touch('touchMove', [[q.x - 30 + i * 15, q.y + i * 10], [q.x + 30 + i * 15, q.y + i * 10]])
      await touch('touchEnd', []); await p.waitForTimeout(200)
      expect(await hash() !== h0, 'two fingers moving together did not move the picture')
      expect(await tid('bg-reset').isDisabled() && await tid('bg-undo').isDisabled(), 'the two-finger pan painted')
      // the finger that stays after a pinch must not start painting
      const r2 = await subjectPoint() ?? pt
      await touch('touchStart', [[r2.x - 30, r2.y], [r2.x + 30, r2.y]])
      await touch('touchMove', [[r2.x - 40, r2.y], [r2.x + 40, r2.y]])
      await touch('touchMove', [[r2.x - 40, r2.y]]) // the second finger lifted (this input method reports the points that remain)
      await touch('touchMove', [[r2.x - 60, r2.y + 20]])
      await touch('touchEnd', []); await p.waitForTimeout(200)
      expect(await tid('bg-reset').isDisabled(), 'the remaining finger painted after the pinch')
      // one finger, paint tool: a real stroke
      await tid('bg-zoom').waitFor()
      await p.getByRole('button', { name: 'Fit to screen' }).click(); await p.waitForTimeout(200)
      const s3 = await subjectPoint(); expect(s3, 'no subject point after fit')
      await tid('tool-erase').click()
      await touch('touchStart', [[s3.x - 20, s3.y]])
      for (let i = 1; i <= 6; i++) await touch('touchMove', [[s3.x - 20 + i * 7, s3.y]])
      await touch('touchEnd', []); await p.waitForTimeout(250)
      expect(!(await tid('bg-undo').isDisabled()), 'one finger did not paint')
      expect(isChecker(await pixel(s3.x - (await tid('bg-canvas').boundingBox()).x, s3.y - (await tid('bg-canvas').boundingBox()).y)), 'the stroke did not erase under the finger')
    })

    await s.check('Space does not take the key from a focused button or radio button, and moves the picture (never paints) only when the stage has it', p, async () => {
      await closeDialog(); await openDialog(); await ready()
      // a focused tool button gets its Space
      await tid('tool-restore').focus(); await p.keyboard.press('Space')
      expect((await tid('tool-restore').getAttribute('aria-pressed')) === 'true', 'Space did not press the focused Restore button')
      await tid('tool-erase').focus(); await p.keyboard.press('Space')
      expect((await tid('tool-erase').getAttribute('aria-pressed')) === 'true', 'Space did not press the focused Erase button')
      // and a focused radio-style background button
      await tid('bg-white').focus(); await p.keyboard.press('Space')
      expect((await tid('bg-white').getAttribute('aria-checked')) === 'true', 'Space did not choose the focused White background')
      await tid('bg-transparent').focus(); await p.keyboard.press('Space')
      expect((await tid('bg-transparent').getAttribute('aria-checked')) === 'true', 'Space did not choose Transparent')
      // with the stage focused, Space + drag moves the picture and paints nothing, though the Erase tool is selected
      await tid('bg-stage').focus()
      const box = await tid('bg-canvas').boundingBox()
      const h0 = await hash()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.keyboard.down('Space')
      await p.mouse.down(); for (let i = 1; i <= 6; i++) await p.mouse.move(box.x + box.width / 2 + i * 12, box.y + box.height / 2 + i * 8); await p.mouse.up()
      await p.keyboard.up('Space'); await p.waitForTimeout(200)
      expect(await hash() !== h0, 'Space + drag did not move the picture')
      expect(await tid('bg-undo').isDisabled(), 'Space + drag painted')
    })

    await s.check('the wheel: a notched wheel and Ctrl + wheel zoom, the choice "wheel moves the picture" is respected; Fit and 100% work', p, async () => {
      await p.getByRole('button', { name: 'Fit to screen' }).click(); await p.waitForTimeout(150)
      const fit = await zoom()
      const box = await tid('bg-canvas').boundingBox()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await p.mouse.wheel(0, -100); await p.waitForTimeout(150)
      expect(await zoom() > fit, 'a mouse wheel notch did not zoom in')
      const zoomedIn = await zoom()
      await p.keyboard.down('Control'); await p.mouse.wheel(0, 120); await p.keyboard.up('Control'); await p.waitForTimeout(150)
      expect(await zoom() < zoomedIn, 'Ctrl + wheel did not zoom out')
      const before = await zoom()
      await p.keyboard.down('Control'); await p.mouse.wheel(0, -120); await p.keyboard.up('Control'); await p.waitForTimeout(150)
      expect(await zoom() > before, 'Ctrl + wheel did not zoom in')
      await tid('bg-wheel').uncheck()
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2) // (unchecking moved the pointer to the checkbox)
      const z = await zoom(), h0 = await hash()
      await p.mouse.wheel(0, 100); await p.waitForTimeout(150)
      expect(await zoom() === z, 'with "wheel zooms" off the wheel still zoomed')
      expect(await hash() !== h0, 'with "wheel zooms" off the wheel did not move the picture')
      await tid('bg-wheel').check()
      await p.getByRole('button', { name: '100%' }).click(); await p.waitForTimeout(150)
      expect(await zoom() === 100, `100% shows ${await zoom()}%`)
      await p.getByRole('button', { name: 'Fit to screen' }).click(); await p.waitForTimeout(150)
      expect(await zoom() === fit, `Fit gave ${await zoom()}% instead of ${fit}%`)
    })

    await s.check('the brush lands under the pointer at several zoom levels (the spot under the pointer is erased, a spot a brush-width away is not)', p, async () => {
      await tid('tool-erase').click()
      for (const level of ['fit', 'in', 'in2']) {
        await tid('bg-reset').isDisabled() || await tid('bg-reset').click()
        await p.getByRole('button', { name: 'Fit to screen' }).click(); await p.waitForTimeout(150)
        if (level !== 'fit') { await p.getByRole('button', { name: 'Zoom in' }).click(); await p.getByRole('button', { name: 'Zoom in' }).click(); if (level === 'in2') { await p.getByRole('button', { name: 'Zoom in' }).click(); await p.getByRole('button', { name: 'Zoom in' }).click() } await p.waitForTimeout(150) }
        const pt = await subjectPoint(); expect(pt, `no subject point at zoom ${level}`)
        const box = await tid('bg-canvas').boundingBox()
        await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(150)
        expect(isChecker(await pixel(pt.x - box.x, pt.y - box.y)), `zoom ${level}: the spot under the pointer is not erased`)
        // the brush is 40 css px wide (radius 20): 34 px away is outside it
        expect(!isChecker(await pixel(pt.x - box.x + 34, pt.y - box.y)), `zoom ${level}: the stroke reached 34 px away`)
        expect(!isChecker(await pixel(pt.x - box.x - 34, pt.y - box.y)), `zoom ${level}: the stroke reached 34 px to the left`)
      }
      await tid('bg-reset').isDisabled() || await tid('bg-reset').click()
      await p.getByRole('button', { name: 'Fit to screen' }).click()
    })

    await s.check('Expand, Shrink and Soften are undoable steps: the subject grows, shrinks, softens, and Undo brings the exact mask back', p, async () => {
      await p.waitForTimeout(400) // the last Fit must be drawn before the subject is measured
      const base = await solidCount()
      await tid('edge-amount').fill('6')
      await tid('edge-grow').click(); await p.waitForFunction(() => !document.querySelector('[data-testid=edge-grow]').disabled, null, { timeout: 30000 }); await p.waitForTimeout(250)
      const grown = await solidCount()
      expect(grown > base * 1.03, `Expand did not grow the subject (${base} -> ${grown})`)
      await tid('bg-undo').click(); await p.waitForTimeout(200)
      await p.waitForTimeout(600) // the preview colours are worked out again after a whole-mask undo
      expect(Math.abs(await solidCount() - base) <= base * 0.003, `Undo did not bring the mask back after Expand (${base} -> ${await solidCount()})`)
      expect(await tid('bg-reset').isDisabled(), 'after undoing everything the mask is the first mask again')
      await tid('edge-shrink').click(); await p.waitForFunction(() => !document.querySelector('[data-testid=edge-shrink]').disabled, null, { timeout: 30000 }); await p.waitForTimeout(250)
      const shrunk = await solidCount()
      expect(shrunk < base * 0.97, `Shrink did not shrink the subject (${base} -> ${shrunk})`)
      await tid('bg-undo').click(); await p.waitForTimeout(200)
      await tid('edge-soften').click(); await p.waitForFunction(() => !document.querySelector('[data-testid=edge-soften]').disabled, null, { timeout: 30000 }); await p.waitForTimeout(250)
      const soft = await solidCount() // (a soft edge shows MORE blended, not-quite-checkerboard pixels, so this goes up)
      expect(soft > base * 1.02 && soft < base * 1.3, `Soften should widen the edge into a soft band (${base} -> ${soft})`)
      expect(!(await tid('bg-undo').isDisabled()), 'Soften is not an undo step')
      await tid('bg-undo').click(); await p.waitForTimeout(200)
      await p.waitForTimeout(600)
      expect(Math.abs(await solidCount() - base) <= base * 0.003, `Undo did not bring the mask back after Soften (${base} -> ${await solidCount()})`)
    })

    await s.check('the exported PNG is at the picture\'s own size with a fully opaque core, a clear background and a crisp edge on the picture\'s real edge (the mask was a blurry one 4x smaller)', p, async () => {
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), tid('bg-download').click()])
      const png = readFileSync(await dl.path())
      const raw = await sharp(png).raw().toBuffer({ resolveWithObject: true })
      expect(raw.info.width === W && raw.info.height === H, `size ${raw.info.width}x${raw.info.height}`)
      const a = (x, y) => raw.data[(y * W + x) * 4 + 3]
      let coreSolid = 0, coreN = 0, outsideClear = 0, outsideN = 0
      for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
        const d = Math.hypot((x - W / 2) / (W * 0.32), (y - H / 2) / (H * 0.36))
        if (d < 0.9) { coreN++; if (a(x, y) === 255) coreSolid++ } else if (d > 1.1) { outsideN++; if (a(x, y) === 0) outsideClear++ }
      }
      expect(coreSolid / coreN > 0.995, `only ${Math.round((coreSolid / coreN) * 1000) / 10}% of the subject's core is fully opaque`)
      expect(outsideClear / outsideN > 0.995, `only ${Math.round((outsideClear / outsideN) * 1000) / 10}% of the background is fully clear`)
      // the edge on the middle row: from 10% to 90% opaque in a few pixels, at x = 500 + 320 = 820
      const row = H / 2
      let lo = -1, hi = -1
      for (let x = 700; x < 940; x++) { const v = a(x, row); if (lo < 0 && v < 230) lo = x; if (hi < 0 && v < 25) hi = x }
      expect(hi - lo <= 5, `the edge is ${hi - lo} px wide (a plain enlargement of this mask would be about 39)`)
      expect(Math.abs((lo + hi) / 2 - 820) <= 2.5, `the edge is at x=${(lo + hi) / 2}, the picture's edge is at 820`)
    })

    await s.check('a picture over this device\'s limit is refused in plain words BEFORE the provider is asked, the picture is untouched, and there is nothing to retry', p, async () => {
      await closeDialog()
      asked.length = 0
      await useProvider('bgprovider=mock&bgmaxmp=0.0001')
      await openDialog()
      await tid('bg-error').waitFor({ timeout: 20000 })
      const text = await tid('bg-error').innerText()
      expect(/megapixels/.test(text) && /not changed/.test(text), `the message does not explain: ${text}`)
      expect(await p.getByRole('button', { name: 'Try again' }).count() === 0, 'a picture that is too large offers Try again')
      expect(await tid('bg-canvas').count() === 0, 'a canvas was made for a picture that is too large')
      expect(asked.length === 0, 'the provider was asked')
      await closeDialog()
    })

    await s.check('typed provider errors: "no subject" says so with nothing to retry, "busy" offers Try again, Cancel stops a slow provider', p, async () => {
      await useProvider('bgprovider=mock-no-subject'); await openDialog()
      await tid('bg-error').waitFor({ timeout: 20000 })
      expect(/clear subject/.test(await tid('bg-error').innerText()), 'no-subject message')
      expect(await p.getByRole('button', { name: 'Try again' }).count() === 0, 'no-subject offers Try again')
      await closeDialog()
      await useProvider('bgprovider=mock-busy'); await openDialog()
      await tid('bg-error').waitFor({ timeout: 20000 })
      expect(/Try again in a moment|worked on right now/.test(await tid('bg-error').innerText()), 'busy message')
      expect(await p.getByRole('button', { name: 'Try again' }).count() === 1, 'busy does not offer Try again')
      await closeDialog()
      await useProvider('bgprovider=mock-slow'); await openDialog()
      await tid('bg-loading').waitFor({ timeout: 10000 })
      await p.getByRole('button', { name: 'Cancel', exact: true }).first().click()
      await tid('bg-error').waitFor({ timeout: 10000 })
      expect(/Cancelled/.test(await tid('bg-error').innerText()), 'cancel message')
      await closeDialog()
      await useProvider('bgprovider=mock')
    })

    await s.check('no errors in the page', null, async () => { expect(errors.length === 0, errors.join(' | ')) })
    await ctx.request.delete(`${API}/api/v1/presentations/${deckId}`, { headers: H_ }).catch(() => {})
  } finally { await b.close() }
  return s.done()
}
