import { createRequire } from 'node:module'
import { join } from 'node:path'
import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'

/**
 * Remove background, with the REAL segmentation model (BiRefNet) and the REAL assistant model, in a real browser: a photo of a coffee pour is uploaded, selected, and its background is
 * removed with the button (the result must be a PNG with a really transparent margin, cropped to the subject, the original kept), then the assistant is asked in chat, in the words the
 * owner used ("please remove the background from this coffee image, only coffee product i want"): the picture must be cut out, never deleted. Free (no credits); a few cents of the
 * assistant's model. Needs a verified account: E2E_EMAIL=… E2E_PASSWORD=…  Set SHOTS=<folder> for pictures.
 */
const sharp = createRequire(new URL('../../services/api/package.json', import.meta.url))('sharp')
export default async function () {
  const s = suite('82-remove-background')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const photo = await sharp(join(import.meta.dirname, '../../apps/web/public/morph-templates/mood-coffee.webp')).jpeg({ quality: 90 }).toBuffer()
    const made = await ctx.request.post(`${API}/api/v1/presentations`, { headers: H, data: { title: 'Remove background check' } })
    const deckId = (await made.json()).data.id
    const p = await ctx.newPage()
    const srcOfPicture = () => p.evaluate(() => [...document.querySelectorAll('[data-testid="stage"] img')].map((i) => i.getAttribute('src')).filter(Boolean).at(-1) ?? '')
    let uploadedSrc = '', cutSrc = ''

    await s.check('a photo is uploaded and selected on the slide', p, async () => {
      await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
      await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
      await p.getByTestId('tb-media').click()
      await p.locator('input[type=file]').first().setInputFiles({ name: 'coffee.jpg', mimeType: 'image/jpeg', buffer: photo })
      await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="stage"] img')].some((i) => /\/api\/v1\/assets\//.test(i.getAttribute('src') ?? '')), null, { timeout: 30000 })
      uploadedSrc = await srcOfPicture()
      expect(/\/api\/v1\/assets\//.test(uploadedSrc), `the picture is not ours: ${uploadedSrc}`)
    })

    await s.check('the "Remove background" button cuts the subject out: a new transparent PNG replaces the picture on the slide', p, async () => {
      // select the picture (click its centre on the stage)
      const img = p.locator('[data-testid="stage"] img').last()
      await img.click({ force: true })
      await p.getByTestId('remove-background').waitFor({ timeout: 10000 })
      await p.getByTestId('remove-background').click()
      await p.waitForFunction((old) => [...document.querySelectorAll('[data-testid="stage"] img')].some((i) => { const s = i.getAttribute('src') ?? ''; return /\/api\/v1\/assets\//.test(s) && s !== old }), uploadedSrc, { timeout: 120000 })
      cutSrc = await srcOfPicture()
      expect(cutSrc !== uploadedSrc, 'the picture did not change')
      const res = await ctx.request.get(cutSrc)
      expect(res.ok(), `cut-out ${res.status()}`)
      const out = Buffer.from(await res.body())
      const meta = await sharp(out).metadata()
      expect(meta.format === 'png' && meta.hasAlpha, `not a transparent PNG: ${meta.format} alpha=${meta.hasAlpha}`)
      const raw = await sharp(out).raw().toBuffer({ resolveWithObject: true })
      const alpha = (x, y) => raw.data[(y * raw.info.width + x) * 4 + 3]
      let clear = 0, solid = 0
      for (let i = 3; i < raw.data.length; i += 4) { if (raw.data[i] < 20) clear++; else if (raw.data[i] > 235) solid++ }
      const total = raw.info.width * raw.info.height
      expect(clear / total > 0.1, `only ${Math.round((clear / total) * 100)}% of the picture is transparent`)
      expect(solid / total > 0.2, `only ${Math.round((solid / total) * 100)}% of the picture is kept`)
      expect(alpha(0, 0) < 20 || alpha(raw.info.width - 1, 0) < 20, 'the corners are not transparent')
      if (process.env['SHOTS']) await p.screenshot({ path: join(process.env['SHOTS'], 'cutout-button.png') })
    })

    await s.check('the original picture is still in "my uploads" (nothing was deleted)', null, async () => {
      const mine = (await (await ctx.request.get(`${API}/api/v1/media/mine`, { headers: H })).json()).data.items
      expect(mine.length >= 2, `only ${mine.length} pictures kept`)
    })

    await s.check('the assistant, asked in the owner\'s own words, cuts the background out of the selected picture and never deletes it (real model)', p, async () => {
      // a fresh picture so the assistant has something to do
      await p.getByTestId('tb-media').click()
      await p.locator('input[type=file]').first().setInputFiles({ name: 'coffee2.jpg', mimeType: 'image/jpeg', buffer: photo })
      await p.waitForFunction((old) => [...document.querySelectorAll('[data-testid="stage"] img')].some((i) => { const s = i.getAttribute('src') ?? ''; return /\/api\/v1\/assets\//.test(s) && s !== old }), cutSrc, { timeout: 30000 })
      const known = await p.evaluate(() => [...document.querySelectorAll('[data-testid="stage"] img')].map((i) => i.getAttribute('src')).filter(Boolean))
      await p.getByRole('button', { name: /Edit with AI/ }).click()
      const box = p.getByPlaceholder(/e\.g\./)
      await box.fill('please remove the background from this coffee image, only coffee product i want')
      await box.press('Enter')
      // a picture that was not on the slide before: the cut-out of the selected one
      await p.waitForFunction((had) => [...document.querySelectorAll('[data-testid="stage"] img')].some((i) => { const s = i.getAttribute('src') ?? ''; return /\/api\/v1\/assets\//.test(s) && !had.includes(s) }), known, { timeout: 180000 })
      const after = await p.evaluate((had) => [...document.querySelectorAll('[data-testid="stage"] img')].map((i) => i.getAttribute('src')).find((s) => s && /\/api\/v1\/assets\//.test(s) && !had.includes(s)) ?? '', known)
      const res = await ctx.request.get(after)
      const meta = await sharp(Buffer.from(await res.body())).metadata()
      expect(meta.format === 'png' && meta.hasAlpha, `the picture is not a cut-out: ${meta.format} alpha=${meta.hasAlpha}`)
      const said = await p.locator('body').innerText()
      expect(!/Removed the pictures from slide/.test(said), 'the assistant said it removed the pictures')
      expect(/Removed the background/.test(said), `the assistant did not report the cut-out: ${said.slice(-300)}`)
      if (process.env['SHOTS']) await p.screenshot({ path: join(process.env['SHOTS'], 'cutout-assistant.png') })
    })
    await ctx.request.delete(`${API}/api/v1/presentations/${deckId}`, { headers: H }).catch(() => {})
  } finally { await b.close() }
  return s.done()
}
