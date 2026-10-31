import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person, tsx } from '../kits-lib.mjs'

/**
 * Video → slides for big recordings with the REAL model and REAL ffmpeg: a lecture video (spoken numbers + a slide with other numbers on screen),
 * and a 100 MB+ file that has to travel in many parts. Flow ids: docs/VIDEO_TO_DECK_FUNCTIONAL_FLOWS.md. No AI pictures.
 */
const FX = new URL('../fixtures/media/', import.meta.url).pathname
const ff = (...a) => execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...a])

export default async function () {
  const s = suite('39-video-job')
  const b = await launch()
  const P = await person(b, 'videojob'); await api.get(P, '/me/entitlements')
  const balance = () => JSON.parse(tsx(`scripts/qa-remix-check.ts balance ${P.email}`)).balance
  const sources = () => JSON.parse(tsx(`scripts/qa-sources.ts ${P.email}`))
  const textOf = (src) => src.chunks.map((c) => c.text).join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'sd-vjob-'))
  try {
    // a screen: a slide picture with its own numbers, shown while the speaker talks
    const sp = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
    await sp.setContent('<body style="margin:0;background:#fff;font-family:Arial"><div style="padding:120px 80px"><h1 style="font-size:84px;margin:0">Quarterly results</h1><p style="font-size:64px">Revenue: 86 crore rupees</p><p style="font-size:64px">Dealers: 1,275</p></div></body>')
    await sp.screenshot({ path: join(dir, 'slide.png') })
    ff('-loop', '1', '-framerate', '2', '-i', join(dir, 'slide.png'), '-i', join(FX, 'talk.m4a'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(dir, 'lecture.mp4'))
    ff('-f', 'lavfi', '-i', 'color=c=gray:s=1280x720:r=25', '-i', join(FX, 'talk.m4a'), '-vf', 'noise=alls=100:allf=t', '-c:v', 'libx264', '-b:v', '45M', '-minrate', '45M', '-maxrate', '45M', '-bufsize', '90M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '23', join(dir, 'big.mp4'))
    const bigMb = Math.round(statSync(join(dir, 'big.mp4')).size / 1048576); console.log('      big file MB:', bigMb)
    expect(bigMb > 100 && bigMb <= 200, `fixture size ${bigMb} MB`)

    await s.check('A1 Home screen: a video is chosen → chip shows progress, finishes with ONE timed source: speech AND on-screen text; 3 credits', P.p, async () => {
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      const before = balance()
      await P.p.getByRole('button', { name: /Upload files, or links/ }).click()
      const dlg = P.p.getByRole('dialog', { name: 'Add sources' }); await dlg.waitFor()
      expect(/3 credits per minute/.test(await dlg.innerText()), 'dialog does not state the video price')
      await dlg.getByLabel('File').setInputFiles(join(dir, 'lecture.mp4'))
      await dlg.getByRole('button', { name: 'Add source' }).click()
      await dlg.waitFor({ state: 'detached', timeout: 240000 })
      await P.p.locator('form span[title]').first().waitFor({ timeout: 10000 })
      expect(before - balance() === 3, `spent ${before - balance()}`)
      const src = sources()[0]; const t = textOf(src)
      for (const n of ['Zorvex', '4,200']) expect(t.includes(n), `speech missing ${n}: ${t.slice(0, 300)}`)
      expect(/on screen/i.test(t) && /86 crore/.test(t) && /1,275/.test(t), `screen text missing: ${t.slice(0, 500)}`)
      expect(src.chunks.some((c) => /^\d+:\d{2}/.test(c.locator ?? '')), 'no time locators')
    })

    await s.check('A2 Big file (100 MB+): sent in many parts, same result; the temp file is gone afterwards', P.p, async () => {
      const before = balance()
      const pending = P.p.waitForResponse((r) => /\/media\/uploads\/[^/]+\/complete/.test(r.url()), { timeout: 400000 })
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      await P.p.getByRole('button', { name: /Upload files, or links/ }).click()
      const dlg = P.p.getByRole('dialog', { name: 'Add sources' }); await dlg.waitFor()
      await dlg.getByLabel('File').setInputFiles(join(dir, 'big.mp4'))
      await dlg.getByRole('button', { name: 'Add source' }).click()
      expect((await pending).status() === 200, 'complete failed')
      await dlg.waitFor({ state: 'detached', timeout: 400000 })
      expect(before - balance() === 3, `spent ${before - balance()}`)
      expect(sources().some((x) => textOf(x).includes('4,200') && textOf(x) !== textOf(sources()[0])) || sources().length >= 2, 'second source missing')
      const left = execFileSync('sh', ['-c', 'ls /tmp/slidesdone-media 2>/dev/null | wc -l; ls "${MEDIA_TMP_DIR:-/nonexistent}" 2>/dev/null | wc -l']).toString()
      console.log('      temp dirs:', left.replace(/\n/g, ' '))
    })

    await s.check('B1 Refusals: a fake .mp4, signed-out visitor — plain sentence, nothing charged', P.p, async () => {
      const before = balance()
      const init = await api.post(P, '/media/uploads', { filename: 'x.mp4', bytes: 5000 }); expect(init.status === 201, `init ${init.status}`)
      const r = await P.ctx.request.put(`http://localhost:4000/api/v1/media/uploads/${init.data.id}/parts/0`, { headers: { Origin: 'http://localhost:3100', 'Content-Type': 'application/octet-stream' }, data: Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.alloc(4996)]) })
      expect(r.status() === 200, `part ${r.status()}`)
      const done = await api.post(P, `/media/uploads/${init.data.id}/complete`)
      expect(done.status === 422 && /not a supported recording/.test(done.body.error.message), JSON.stringify(done.body))
      expect(balance() === before, 'credits changed')
      const anon = await (await b.newContext()).request.post('http://localhost:4000/api/v1/media/uploads', { headers: { Origin: 'http://localhost:3100', 'Content-Type': 'application/json' }, data: { filename: 'a.mp4', bytes: 5000 } })
      expect(anon.status() === 401, `anon ${anon.status()}`)
    })

    await s.check('A3 REAL AI: a deck built from the video carries spoken and on-screen facts', P.p, async () => {
      const src = sources().find((x) => /86 crore/.test(textOf(x))); expect(src, 'video source missing')
      const job = await api.post(P, '/generation/jobs', { prompt: 'A 5 slide company update from my video', slideCount: 5, sourceIds: [src.id], idempotencyKey: `k-${Date.now()}-${Math.random().toString(36).slice(2)}` })
      expect(job.status === 201, `job ${job.status}`)
      let id; for (let i = 0; i < 100; i++) { const v = (await api.get(P, `/generation/jobs/${job.data.id}`)).data; if (v.status === 'completed') { id = v.presentationId; break } if (['failed', 'cancelled'].includes(v.status)) throw new Error(`job ${v.status}: ${v.error}`); await new Promise((r) => setTimeout(r, 3000)) }
      expect(id, 'deck did not finish')
      const doc = (await api.get(P, `/presentations/${id}`)).data.document
      const t = doc.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '))).join(' ')
      expect(/4,200/.test(t) && /86/.test(t), `deck lacks facts: ${t.slice(0, 300)}`)
    })
  } finally { await b.close() }
  return s.done()
}
