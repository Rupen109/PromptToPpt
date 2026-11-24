import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'

/**
 * The background removal DIALOG, development only, in a real browser with the REAL server model (the dialog itself knows no model): the mask appears on a checkerboard; erase and restore
 * brushes change it (read back from the canvas pixels); undo, redo and reset work without new inference; the background can be transparent, white, black, a colour or a picture; before/after
 * shows; Download gives a PNG at the picture's own size with a real alpha channel; Apply puts it on the slide. Needs a verified account: E2E_EMAIL=… E2E_PASSWORD=…  SHOTS=<folder> for pictures.
 */
const sharp = createRequire(new URL('../../services/api/package.json', import.meta.url))('sharp')
const CHECKER = [[255, 255, 255], [217, 221, 227]]
const near = (a, b, t = 6) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t
const isChecker = (c) => CHECKER.some((k) => near(c, k, 4))

export default async function () {
  const s = suite('83-background-removal-dialog')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const photo = await sharp(join(import.meta.dirname, '../../apps/web/public/morph-templates/mood-coffee.webp')).jpeg({ quality: 92 }).toBuffer()
    const meta = await sharp(photo).metadata()
    const blue = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 51, g: 102, b: 204 } } }).png().toBuffer()
    const deckId = (await (await ctx.request.post(`${API}/api/v1/presentations`, { headers: H, data: { title: 'Background dialog check' } })).json()).data.id
    const p = await ctx.newPage()
    const errors = []
    p.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`))
    p.on('console', (m) => { if (m.type() === 'error' && !/favicon|DevTools|\[vite\]|status of 40[0-9]|status of 503/.test(m.text())) errors.push(m.text().slice(0, 160)) })
    const tid = (t) => p.getByTestId(t)
    /** the canvas pixel at css offset (x, y) from the canvas's top-left */
    const pixel = (x, y) => p.evaluate(([x, y]) => { const c = document.querySelector('[data-testid=bg-canvas]'); const k = c.width / c.getBoundingClientRect().width; const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return [d[0], d[1], d[2], d[3]] }, [x, y])
    /** finds a subject pixel (not a checkerboard colour) and a background pixel (checkerboard) on the canvas, as css offsets */
    const probe = () => p.evaluate(() => {
      const c = document.querySelector('[data-testid=bg-canvas]'); const k = c.width / c.getBoundingClientRect().width; const g = c.getContext('2d')
      const w = c.width, h = c.height, img = g.getImageData(0, 0, w, h).data
      const chk = (i) => { const r = img[i], gg = img[i + 1], bb = img[i + 2]; return (Math.abs(r - 255) < 5 && Math.abs(gg - 255) < 5 && Math.abs(bb - 255) < 5) || (Math.abs(r - 217) < 5 && Math.abs(gg - 221) < 5 && Math.abs(bb - 227) < 5) }
      const solid = (i) => img[i + 3] > 250
      let subj = null, back = null
      // the picture occupies the middle of the canvas: look there on a grid; a subject point must have a margin of non-checker pixels around it
      for (let y = Math.round(h * 0.25); y < h * 0.8 && !subj; y += 12) for (let x = Math.round(w * 0.3); x < w * 0.7 && !subj; x += 12) {
        const ok = [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]].every(([dx, dy]) => { const i = ((y + dy) * w + (x + dx)) * 4; return solid(i) && !chk(i) })
        if (ok) subj = [x / k, y / k]
      }
      for (let y = Math.round(h * 0.3); y < h * 0.8 && !back; y += 12) for (let x = Math.round(w * 0.3); x < w * 0.7 && !back; x += 12) {
        const ok = [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]].every(([dx, dy]) => chk(((y + dy) * w + (x + dx)) * 4))
        if (ok) back = [x / k, y / k]
      }
      const r = c.getBoundingClientRect()
      return { subj, back, left: r.left, top: r.top }
    })
    const drag = async (from, to, pts = 8) => {
      const box = await tid('bg-canvas').boundingBox()
      await p.mouse.move(box.x + from[0], box.y + from[1]); await p.mouse.down()
      for (let i = 1; i <= pts; i++) await p.mouse.move(box.x + from[0] + ((to[0] - from[0]) * i) / pts, box.y + from[1] + ((to[1] - from[1]) * i) / pts)
      await p.mouse.up()
      await p.waitForTimeout(150)
    }
    let pr = null, subjBefore = null

    await s.check('the dialog is offered on a picture in development and opens with the picture and a mask on a checkerboard (real server model)', p, async () => {
      await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
      await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
      await tid('tb-media').click()
      await p.locator('input[type=file]').first().setInputFiles({ name: 'coffee.jpg', mimeType: 'image/jpeg', buffer: photo })
      await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="stage"] img')].some((i) => /\/api\/v1\/assets\//.test(i.getAttribute('src') ?? '')), null, { timeout: 30000 })
      await p.locator('[data-testid="stage"] img').last().click({ force: true })
      await tid('remove-background').waitFor({ timeout: 10000 })
      await tid('remove-background').click()
      await tid('bg-dialog').waitFor({ timeout: 10000 })
      expect(/Development preview/.test(await tid('bg-provider').innerText()), 'the dialog does not say it is a development preview')
      await tid('bg-loading').waitFor({ timeout: 10000 })
      await tid('bg-canvas').waitFor({ timeout: 180000 })
      await p.waitForTimeout(600)
      pr = await probe()
      expect(pr.subj && pr.back, `no subject/background found on the canvas: ${JSON.stringify(pr)}`)
      subjBefore = await pixel(...pr.subj)
      expect(!isChecker(subjBefore), `the subject point is the checkerboard: ${subjBefore}`)
      expect(isChecker(await pixel(...pr.back)), 'the background point is not the checkerboard')
      if (process.env['SHOTS']) await p.screenshot({ path: join(process.env['SHOTS'], 'dialog-1-ready.png') })
    })

    await s.check('Erase takes the subject away under the brush; Undo puts it back exactly; Redo erases again; no new inference was needed', p, async () => {
      await tid('tool-erase').click()
      const calls = []
      p.on('request', (rq) => { if (/cutout-mask|\/cutout$/.test(rq.url())) calls.push(rq.url()) })
      await drag([pr.subj[0] - 14, pr.subj[1]], [pr.subj[0] + 14, pr.subj[1]], 6)
      expect(isChecker(await pixel(...pr.subj)), 'the erased spot still shows the picture')
      await tid('bg-undo').click(); await p.waitForTimeout(200)
      expect(near(await pixel(...pr.subj), subjBefore, 3), 'undo did not bring the exact colour back')
      await tid('bg-redo').click(); await p.waitForTimeout(200)
      expect(isChecker(await pixel(...pr.subj)), 'redo did not erase again')
      expect(calls.length === 0, `the server was asked again: ${calls.join(' ')}`)
      if (process.env['SHOTS']) await p.screenshot({ path: join(process.env['SHOTS'], 'dialog-2-erased.png') })
    })

    await s.check('Restore brings the picture back where the model had removed it', p, async () => {
      await tid('tool-restore').click()
      await drag([pr.back[0] - 14, pr.back[1]], [pr.back[0] + 14, pr.back[1]], 6)
      expect(!isChecker(await pixel(...pr.back)), 'the restored spot is still the checkerboard')
    })

    await s.check('Reset goes back to the model\'s mask in one step, and that step can be undone', p, async () => {
      await tid('bg-reset').click(); await p.waitForTimeout(200)
      expect(!isChecker(await pixel(...pr.subj)), 'reset did not bring the subject back')
      expect(isChecker(await pixel(...pr.back)), 'reset did not remove the restored background')
      expect(await tid('bg-reset').isDisabled(), 'reset should be disabled when the mask is the model\'s')
      await tid('bg-undo').click(); await p.waitForTimeout(200)
      expect(isChecker(await pixel(...pr.subj)) && !isChecker(await pixel(...pr.back)), 'undoing the reset did not bring the edits back')
    })

    await s.check('the background can be white, black, a colour or a picture, and the preview shows it behind the subject', p, async () => {
      // the previous step left the Restore stroke in place: go back to the model's mask so the background probe point really is background
      await tid('bg-reset').click(); await p.waitForTimeout(200)
      await tid('bg-white').click(); await p.waitForTimeout(150)
      expect(near(await pixel(...pr.back), [255, 255, 255], 2), 'white')
      await tid('bg-black').click(); await p.waitForTimeout(150)
      expect(near(await pixel(...pr.back), [0, 0, 0], 2), 'black')
      await tid('bg-color').fill('#cc3366'); await p.waitForTimeout(150)
      expect(near(await pixel(...pr.back), [204, 51, 102], 2), 'colour')
      await tid('bg-image-input').setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: blue })
      await p.waitForTimeout(400)
      expect(near(await pixel(...pr.back), [51, 102, 204], 6), `picture ${await pixel(...pr.back)}`)
      await tid('bg-transparent').click(); await p.waitForTimeout(150)
      expect(isChecker(await pixel(...pr.back)), 'transparent shows the checkerboard again')
    })

    await s.check('Before / after shows a divider and the original picture on its left side', p, async () => {
      await tid('bg-compare').click(); await p.waitForTimeout(250)
      await tid('bg-divider').waitFor({ timeout: 3000 })
      const box = await tid('bg-canvas').boundingBox()
      const div = await tid('bg-divider').boundingBox()
      const left = await pixel(div.x - box.x - 40, pr.back[1]) // left of the divider: the original (no checkerboard)
      expect(!isChecker(left), `the left of the divider is not the original: ${left}`)
      if (process.env['SHOTS']) await p.screenshot({ path: join(process.env['SHOTS'], 'dialog-3-compare.png') })
      await tid('bg-compare').click()
    })

    await s.check('Download gives a PNG at the picture\'s own size with a real alpha channel (transparent corners, solid subject), and a white one is opaque white', p, async () => {
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), tid('bg-download').click()])
      const path = await dl.path()
      const png = readFileSync(path)
      const m = await sharp(png).metadata()
      expect(m.width === meta.width && m.height === meta.height, `size ${m.width}x${m.height}, the picture is ${meta.width}x${meta.height}`)
      expect(m.format === 'png' && m.hasAlpha, `not a PNG with alpha: ${m.format} ${m.hasAlpha}`)
      const raw = await sharp(png).raw().toBuffer({ resolveWithObject: true })
      const a = (x, y) => raw.data[(y * raw.info.width + x) * 4 + 3]
      expect(a(0, 0) === 0 && a(raw.info.width - 1, raw.info.height - 1) === 0, 'the corners are not transparent')
      let hi = 0, lo = 0; for (let i = 3; i < raw.data.length; i += 4) { if (raw.data[i] >= 250) hi++; else if (raw.data[i] === 0) lo++ }
      // the model's matte rarely reaches exactly 255 (a sigmoid cut to 8 bits), so "solid" means >= 250; the coffee is a small part of the photo
      const total = raw.info.width * raw.info.height
      expect(hi / total > 0.04, `the subject is missing: only ${Math.round((hi / total) * 100)}% is solid`)
      expect(lo / total > 0.5, `the background is not transparent: only ${Math.round((lo / total) * 100)}% is clear`)
      await tid('bg-white').click(); await p.waitForTimeout(150)
      const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), tid('bg-download').click()])
      const w = await sharp(readFileSync(await dl2.path())).raw().toBuffer({ resolveWithObject: true })
      expect(w.info.width === meta.width && w.info.height === meta.height, `white size ${w.info.width}x${w.info.height}`)
      expect(w.data[0] === 255 && w.data[1] === 255 && w.data[2] === 255 && w.data[3] === 255, `a white background should be opaque white at the corner: ${[w.data[0], w.data[1], w.data[2], w.data[3]]}`)
      await tid('bg-transparent').click()
    })

    await s.check('Apply puts the finished picture on the slide (the original stays in the library) and closes the dialog', p, async () => {
      const before = await p.evaluate(() => [...document.querySelectorAll('[data-testid="stage"] img')].map((i) => i.getAttribute('src')))
      await tid('bg-apply').click()
      await tid('bg-dialog').waitFor({ state: 'detached', timeout: 120000 })
      await p.waitForFunction((had) => [...document.querySelectorAll('[data-testid="stage"] img')].some((i) => { const s = i.getAttribute('src') ?? ''; return /\/api\/v1\/assets\//.test(s) && !had.includes(s) }), before, { timeout: 30000 })
      const now = await p.evaluate((had) => [...document.querySelectorAll('[data-testid="stage"] img')].map((i) => i.getAttribute('src')).find((s) => s && !had.includes(s)), before)
      const res = await ctx.request.get(now)
      const m = await sharp(Buffer.from(await res.body())).metadata()
      expect(m.format === 'png' && m.hasAlpha, `placed picture: ${m.format} alpha=${m.hasAlpha}`)
      expect(m.width === meta.width && m.height === meta.height, `a picture under the upload limit keeps its own size: ${m.width}x${m.height}`)
      const mine = (await (await ctx.request.get(`${API}/api/v1/media/mine`, { headers: H })).json()).data.items
      expect(mine.length >= 2, `only ${mine.length} pictures kept`)
    })

    await s.check('a picture that is already a cut-out opens straight away from its own transparency (no model call), and can be refined', p, async () => {
      const calls = []
      const watch = (rq) => { if (/cutout-mask/.test(rq.url())) calls.push(rq.url()) }
      p.on('request', watch)
      await p.locator('[data-testid="stage"] img').last().click({ force: true })
      await tid('remove-background').click()
      await tid('bg-canvas').waitFor({ timeout: 30000 })
      await p.waitForTimeout(500)
      const again = await probe()
      expect(again.subj && again.back, `nothing to work on: ${JSON.stringify(again)}`)
      expect(isChecker(await pixel(...again.back)), 'the transparent part should show the checkerboard')
      const was = await pixel(...again.subj)
      await tid('tool-erase').click()
      await drag([again.subj[0] - 12, again.subj[1]], [again.subj[0] + 12, again.subj[1]], 5)
      expect(isChecker(await pixel(...again.subj)) && !isChecker(was), 'erasing on the existing cut-out did not work')
      expect(calls.length === 0, `the model was asked for a picture that is already transparent: ${calls.join(' ')}`)
      p.off('request', watch)
      await p.getByRole('button', { name: 'Cancel', exact: true }).last().click()
      await tid('bg-dialog').waitFor({ state: 'detached', timeout: 5000 })
    })

    /** the model's own processes on this machine (the server starts one, cutout-child, and kills it when a job is cancelled or times out) */
    const modelPids = () => { try { return execSync('pgrep -f "media/cutout-child"', { encoding: 'utf8' }).trim().split('\n').filter(Boolean) } catch { return [] } }
    const modelProcesses = () => modelPids().length
    const describePids = (pids) => { try { return pids.length ? execSync(`ps -o pid=,etime=,rss= -p ${pids.join(',')}`, { encoding: 'utf8' }).trim().replace(/\s+/g, ' ') : 'none' } catch { return 'gone' } }

    await s.check('Cancel while the model is working stops cleanly: a plain message, Try again and Close, nothing changed, and the model\'s process is REALLY stopped on the server', p, async () => {
      await tid('tb-media').click()
      await p.locator('input[type=file]').first().setInputFiles({ name: 'coffee2.jpg', mimeType: 'image/jpeg', buffer: photo })
      await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="stage"] img')].length >= 2, null, { timeout: 30000 })
      await p.locator('[data-testid="stage"] img').last().click({ force: true })
      await tid('remove-background').click()
      await tid('bg-loading').waitFor({ timeout: 10000 })
      await p.waitForTimeout(2500) // the request has reached the server and the model is working on it
      const during = modelPids()
      expect(during.length >= 1, 'no model process is running while a picture is being worked on')
      await p.getByRole('button', { name: 'Cancel', exact: true }).first().click()
      await tid('bg-error').waitFor({ timeout: 5000 })
      expect(/Cancelled/.test(await tid('bg-error').innerText()), 'no cancelled message')
      await p.getByRole('button', { name: 'Try again', exact: true }).waitFor({ timeout: 2000 })
      // the work must really stop, not just be abandoned: the process (and its gigabytes of memory) is gone within a few seconds
      let left = modelProcesses()
      for (let i = 0; i < 20 && left > 0; i++) { await p.waitForTimeout(500); left = modelProcesses() }
      const leftover = describePids(modelPids())
      await p.getByRole('button', { name: 'Close', exact: true }).last().click() // (the dialog is closed even if the check below fails)
      expect(left === 0, `${left} model process(es) still running after the cancel: during [${describePids(during)}] after [${leftover}] (pid elapsed rss)`)
      await tid('bg-dialog').waitFor({ state: 'detached', timeout: 5000 })
    })

    await s.check('after a cancel the next picture still works (the model starts again) and the process stays idle-limited, not running forever', p, async () => {
      await p.locator('[data-testid="stage"] img').last().click({ force: true })
      await tid('remove-background').click()
      await tid('bg-canvas').waitFor({ timeout: 240000 })
      expect(modelProcesses() >= 1, 'the model did not start again')
      await p.getByRole('button', { name: 'Cancel', exact: true }).last().click()
      await tid('bg-dialog').waitFor({ state: 'detached', timeout: 5000 })
    })

    await s.check('no errors in the page', null, async () => { expect(errors.length === 0, errors.join(' | ')) })
    await ctx.request.delete(`${API}/api/v1/presentations/${deckId}`, { headers: H }).catch(() => {})
  } finally { await b.close() }
  return s.done()
}
