import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { WEB, EDITOR, API, PASSWORD, expect, launch, suite, uniqueEmail } from '../lib.mjs'

/**
 * The vertical 9:16 format, the format choice in Remix, and "Remix a PowerPoint", in a real browser against the real server. No AI is called and no credit is spent: the final
 * "start the job" request is answered by the test (its content is what is checked), everything before it (the upload and the reading of the file) is real.
 * Needs the API started with REQUIRE_EMAIL_VERIFICATION=false (the account is made through the API), or an existing verified account: E2E_EMAIL=… E2E_PASSWORD=… (then the Starter check is skipped, and the
 * account is put on Pro for the run).
 */
const { zipSync, strToU8 } = createRequire(new URL('../../services/api/package.json', import.meta.url))('fflate')
const pptx = (slides) => Buffer.from(zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
  'ppt/presentation.xml': strToU8('<?xml version="1.0"?><p:presentation xmlns:p="p"/>'),
  ...Object.fromEntries(slides.map((t, i) => [`ppt/slides/slide${i + 1}.xml`, strToU8(`<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`)])),
}))

export default async function () {
  const s = suite('74-remix-format-and-pptx')
  const b = await launch()
  try {
    const existing = process.env['E2E_EMAIL']
    const email = existing ?? uniqueEmail('remixfmt')
    const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
    const r = existing
      ? await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
      : await ctx.request.post(API + '/api/auth/sign-up/email', { headers: { origin: WEB }, data: { name: 'QA', email, password: PASSWORD } })
    expect(r.ok(), `${existing ? 'sign-in' : 'sign-up'} ${r.status()}`)
    const grant = (plan) => execSync(`pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/qa-grant-plan.ts ${email} ${plan}`, { cwd: new URL('..', import.meta.url).pathname.replace(/e2e\/$/, ''), stdio: 'pipe' })
    let sent = null
    const stub = async (p) => { await p.route('**/api/v1/generation/jobs', (rt) => { if (rt.request().method() !== 'POST') return rt.continue(); sent = rt.request().postDataJSON(); return rt.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'stub', status: 'queued', progress: 0, stage: 'queued', presentationId: null } }) }) }) }

    // ── Starter: Remix a PowerPoint is a paid feature
    if (!existing) {
      const p = await ctx.newPage(); await stub(p)
      await s.check('Starter: "Remix a PowerPoint" shows the Pro lock and opens the upgrade message, not the dialog', p, async () => {
        await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
        const btn = p.getByTestId('remix-pptx-open')
        expect(/Pro/.test(await btn.innerText()), 'no Pro badge')
        await btn.click(); await p.waitForTimeout(600)
        expect((await p.getByRole('dialog', { name: 'Remix a PowerPoint' }).count()) === 0, 'the dialog opened for a Starter account')
        expect(/Pro|Gold|Premium/.test(await p.locator('body').innerText()), 'no upgrade message')
      })
      await p.close()
    }
    grant('pro')

    // ── Create from scratch: the vertical format
    {
      const p = await ctx.newPage()
      let deckId = null
      await s.check('Create from scratch offers four formats; Vertical makes a 9:16 deck whose slide fits the screen height', p, async () => {
        await p.goto(EDITOR + '/scratch', { waitUntil: 'networkidle' })
        expect((await p.locator('[data-testid^="size-"]').count()) === 4, 'not four formats')
        await p.getByTestId('size-9:16').click()
        await p.getByTestId('scratch-start').click(); await p.waitForURL(/\/edit\//, { timeout: 20000 })
        const stage = p.locator('[data-testid="stage"]'); await stage.waitFor(); await p.waitForTimeout(800)
        deckId = p.url().split('/edit/')[1]
        const box = await stage.boundingBox()
        expect(Math.abs(box.width / box.height - 9 / 16) < 0.02, `ratio ${box.width / box.height}`)
        expect(box.y + box.height <= 950, `the slide runs off the screen: bottom at ${box.y + box.height}`)
        const doc = (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`)).json()).data.document
        expect(doc.aspectRatio === '9:16', doc.aspectRatio)
      })
      await s.check('a vertical deck presents at the full height of the screen', p, async () => {
        await p.getByRole('button', { name: 'Present' }).click(); await p.waitForURL(/present/); await p.waitForTimeout(1200)
        const dim = await p.evaluate(() => { const e = [...document.querySelectorAll('div')].find((d) => d.style.aspectRatio === '' && d.getBoundingClientRect().height > 600 && d.getBoundingClientRect().width < d.getBoundingClientRect().height); const r = e?.getBoundingClientRect(); return r ? [r.width, r.height] : null })
        expect(dim && dim[1] >= 700, `Present does not use the height: ${JSON.stringify(dim)}`)
      })
      if (deckId) await ctx.request.delete(`${API}/api/v1/presentations/${deckId}`, { headers: { origin: EDITOR } })
      await p.close()
    }

    // ── Remix a PowerPoint (real upload and reading, stubbed start)
    {
      const p = await ctx.newPage(); await stub(p)
      await s.check('Remix a PowerPoint: a text file is refused, a real .pptx is read (slides counted), the choices go to the job', p, async () => {
        await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
        await p.getByTestId('remix-pptx-open').click()
        expect((await p.getByRole('dialog', { name: 'Remix a PowerPoint' }).count()) === 1, 'dialog did not open')
        expect(await p.getByTestId('remix-file-start').isDisabled(), 'Create is on before a file is read')
        await p.getByTestId('remix-file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('just a few notes, not a presentation') })
        await p.getByRole('alert').waitFor({ timeout: 15000 })
        await p.getByTestId('remix-file-input').setInputFiles({ name: 'Resultados.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx(['Resultados del tercer trimestre', 'Ventas: 120 millones', 'Equipo', 'Plan de contratación']) })
        await p.getByTestId('remix-file-ready').waitFor({ timeout: 20000 })
        expect(/4 slides/.test(await p.getByTestId('remix-file-ready').innerText()), 'slides not counted')
        expect((await p.getByLabel('Slides in the new version').inputValue()) === '4', 'slide count not prefilled')
        await p.getByTestId('format-9:16').click()
        await p.getByLabel('How should it change?').fill('Una versión corta para inversores')
        await p.getByTestId('remix-file-start').click(); await p.waitForTimeout(1500)
        expect(sent && sent.remixFile === 'Resultados' && sent.aspectRatio === '9:16' && sent.slideCount === 4 && sent.sourceIds?.length === 1, `job: ${JSON.stringify(sent)}`)
        expect(/Una versión corta/.test(sent.prompt), 'the instruction was not sent')
      })
      await p.close()
    }

    // ── Remix a deck: the format choice
    {
      const idr = await ctx.request.post(`${API}/api/v1/presentations`, { headers: { origin: EDITOR }, data: { templateId: 'pitch-launchpad', title: 'remix format qa' } })
      const id = (await idr.json()).data.id
      const p = await ctx.newPage(); await stub(p)
      await s.check('Remix this presentation: the format row marks the current shape; the new shape is sent only when it changed', p, async () => {
        await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor()
        const open = async () => { await p.locator('button[aria-haspopup="menu"]').last().click(); await p.getByRole('menuitem', { name: /Remix this presentation/ }).click(); await p.getByRole('radiogroup', { name: 'Format of the new version' }).waitFor() }
        await open()
        expect(/now/.test(await p.getByTestId('format-16:9').innerText()), 'current shape not marked')
        await p.getByLabel('How should it change?').fill('A short version for investors')
        sent = null; await p.getByRole('button', { name: 'Create remixed copy' }).click(); await p.waitForTimeout(1200)
        expect(sent && !('aspectRatio' in sent), `the shape was sent although it did not change: ${JSON.stringify(sent)}`)
        await p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'networkidle' }); await p.locator('[data-testid="stage"]').waitFor()
        await open()
        await p.getByLabel('How should it change?').fill('A vertical story version'); await p.getByTestId('format-9:16').click()
        sent = null; await p.getByRole('button', { name: 'Create remixed copy' }).click(); await p.waitForTimeout(1200)
        expect(sent && sent.aspectRatio === '9:16' && sent.remixOf === id, `job: ${JSON.stringify(sent)}`)
      })
      await ctx.request.delete(`${API}/api/v1/presentations/${id}`, { headers: { origin: EDITOR } })
      await p.close()
    }
    await ctx.close()
  } finally { await b.close() }
  return s.done()
}
