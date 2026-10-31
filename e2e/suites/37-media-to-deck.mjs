import { readFileSync, readdirSync, mkdtempSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, person, tsx } from '../kits-lib.mjs'

/**
 * Audio / video → slides with the REAL model (Vertex Gemini listening to speech made with the Mac's own voices): signed in (credits) and as a free
 * visitor. No AI pictures. Flow ids: docs/MEDIA_TO_DECK_FUNCTIONAL_FLOWS.md.
 */
const FX = new URL('../fixtures/media/', import.meta.url).pathname
const RESULTS = new URL('../results/', import.meta.url).pathname
const mime = (n) => (n.endsWith('.wav') ? 'audio/wav' : n.endsWith('.webm') ? 'video/webm' : 'audio/mp4')
const fx = (n) => ({ name: n, mimeType: mime(n), buffer: readFileSync(join(FX, n)) })

export default async function () {
  const s = suite('37-media-to-deck')
  const b = await launch()
  const P = await person(b, 'mediadeck'); await api.get(P, '/me/entitlements')
  const balance = () => JSON.parse(tsx(`scripts/qa-remix-check.ts balance ${P.email}`)).balance
  const sources = () => JSON.parse(tsx(`scripts/qa-sources.ts ${P.email}`))
  const textOf = (src) => src.chunks.map((c) => c.text).join('\n')
  const missing = (t, ...needles) => needles.filter((n) => !t.toLowerCase().includes(n.toLowerCase()))
  const read = (name) => api.upload(P, '/sources/media', fx(name))

  try {
    await s.check('A1 Home screen: choose a recording → chip settles, 6 credits spent (one 4 MB block), stored as a transcript with time locators', P.p, async () => {
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      const before = balance()
      await P.p.getByRole('button', { name: /Upload files, or links/ }).click()
      const dlg = P.p.getByRole('dialog', { name: 'Add sources' }); await dlg.waitFor()
      expect((await dlg.getByLabel('File').getAttribute('accept')).includes('.m4a'), 'picker does not offer recordings')
      await dlg.getByText('More about file types and credits').click() // the price is in the folded details so the dialog stays short
      expect(/6 credits per 4 MB/.test(await dlg.innerText()), 'dialog does not state the price')
      await dlg.getByLabel('File').setInputFiles(join(FX, 'talk.m4a'))
      await dlg.getByRole('button', { name: 'Add source' }).click()
      await dlg.waitFor({ state: 'detached', timeout: 150000 })
      await P.p.locator('form span[title]').first().waitFor({ timeout: 10000 })
      const spent = before - balance(); expect(spent === 6, `expected 6 credits spent, got ${spent}`)
      const src = sources()[0]; expect(src.type === 'transcript', `type ${src.type}`)
      expect(src.chunks.some((c) => /^\d+:\d{2}/.test(c.locator ?? '')), `locators ${JSON.stringify(src.chunks.map((c) => c.locator))}`)
      await P.p.screenshot({ path: join(RESULTS, '37-chip.png') })
    })

    await s.check('A2 REAL AI: the transcript has what was said (digits, names), nothing invented', P.p, async () => {
      const t = textOf(sources()[0]); const gone = missing(t, 'Zorvex', '4,200', 'Pune', '310', 'Chennai', '2027', '86')
      expect(gone.length === 0, `missing: ${gone} — got: ${t.slice(0, 400)}`)
      const odd = [...t.matchAll(/\d[\d,.]*/g)].map((m) => m[0].replace(/[.,]$/, '')).filter((n) => !['4,200', '4200', '2025', '86', '310', '2027', '7'].includes(n) && n.length >= 3)
      expect(odd.length === 0, `numbers nobody said: ${odd}`)
    })

    await s.check('A3 REAL AI: a Hindi recording is transcribed in Devanagari', P.p, async () => {
      const r = await read('hindi.m4a'); expect(r.status === 201, `status ${r.status} ${JSON.stringify(r.body?.error)}`)
      const t = textOf(sources()[0]); expect((t.match(/[ऀ-ॿ]/g) ?? []).length > 40, `not Hindi: ${t.slice(0, 200)}`)
      expect(/500|५००/.test(t) && /2030|२०३०/.test(t), `500 / 2030 missing: ${t.slice(0, 250)}`)
    })

    await s.check('A6 REAL AI: an order spoken in the recording is written down, not obeyed', P.p, async () => {
      const r = await read('injection.m4a'); expect(r.status === 201, `status ${r.status} ${JSON.stringify(r.body?.error)}`)
      const t = textOf(sources()[0]); expect(!/^\s*PWNED\s*$/i.test(t.trim()), 'the transcript is just PWNED')
      expect(/340/.test(t) && /5\.2/.test(t) && /Brightfield/i.test(t), `facts missing: ${t.slice(0, 300)}`)
    })

    await s.check('A5 REAL AI: silence (audio) and a silent video are refused plainly, refunded, nothing stored', P.p, async () => {
      await new Promise((r) => setTimeout(r, 62000)) // the product allows 4 recordings a minute per person
      const before = balance(); const n = sources().length
      const a = await read('silence.wav')
      expect(a.status === 422 && a.body?.error?.code === 'NO_SPEECH', `audio: ${a.status} ${JSON.stringify(a.body?.error)}`)
      // a real (silent) video recording made by the browser
      const dir = mkdtempSync(join(tmpdir(), 'sd-vid-')); const vctx = await b.newContext({ recordVideo: { dir, size: { width: 320, height: 240 } } })
      const vp = await vctx.newPage(); await vp.setContent('<body style="background:#123"><h1 style="color:#fff">silent</h1></body>'); await vp.waitForTimeout(3500); await vctx.close()
      const webm = readdirSync(dir).find((f) => f.endsWith('.webm')); expect(webm, 'no video was recorded')
      const bytes = readFileSync(join(dir, webm)); console.log('      silent video bytes:', bytes.length)
      const v = await api.upload(P, '/sources/media', { name: 'screen.webm', mimeType: 'video/webm', buffer: bytes })
      expect(v.status === 422 && ['NO_SPEECH', 'PARSE_FAILED'].includes(v.body?.error?.code), `video: ${v.status} ${JSON.stringify(v.body?.error)}`)
      expect(balance() === before, `credits changed ${before} → ${balance()}`)
      expect(sources().length === n, 'a source was stored')
    })

    await s.check('B1/B2 UI and API refusals: .mkv, an .exe renamed .mp3, a 201 MB file — one plain sentence each, nothing charged', P.p, async () => {
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      const before = balance()
      const paste = async (name, mimeType, size, re, fill = 1) => {
        await P.p.evaluate(({ name, mimeType, size, fill }) => {
          const arr = new Uint8Array(size).fill(fill); const dt = new DataTransfer(); dt.items.add(new File([arr], name, { type: mimeType }))
          document.querySelector('textarea[aria-label="Presentation prompt"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        }, { name, mimeType, size, fill })
        await P.p.getByRole('alert').filter({ hasText: re }).first().waitFor({ timeout: 8000 })
      }
      await paste('movie.mkv', 'video/x-matroska', 100, /MKV video is not supported/)
      await paste('long.mp4', 'video/mp4', 201 * 1024 * 1024, /larger than 200 MB/)
      const fake = await api.upload(P, '/sources/media', { name: 'song.mp3', mimeType: 'audio/mpeg', buffer: Buffer.concat([Buffer.from('MZ\x90\x00'), Buffer.alloc(4096)]) })
      expect(fake.status === 422 && /not a supported recording/.test(fake.body.error.message), JSON.stringify(fake.body))
      expect(balance() === before, 'credits changed')
    })

    await s.check('A4 REAL AI: a deck built from the recording carries its facts and cites the transcript', P.p, async () => {
      const src = sources().find((x) => textOf(x).includes('4,200')); expect(src, 'transcript source missing')
      const job = await api.post(P, '/generation/jobs', { prompt: 'A 5 slide company update for Zorvex Bikes from my recording', slideCount: 5, sourceIds: [src.id], idempotencyKey: `k-${Date.now()}-${Math.random().toString(36).slice(2)}` })
      expect(job.status === 201, `job ${job.status} ${JSON.stringify(job.body)}`)
      let id; for (let i = 0; i < 100; i++) { const v = (await api.get(P, `/generation/jobs/${job.data.id}`)).data; if (v.status === 'completed') { id = v.presentationId; break } if (['failed', 'cancelled'].includes(v.status)) throw new Error(`job ${v.status}: ${v.error}`); await new Promise((r) => setTimeout(r, 3000)) }
      expect(id, 'deck did not finish')
      const doc = (await api.get(P, `/presentations/${id}`)).data.document
      const t = doc.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '))).join(' ')
      const gone = missing(t, '4,200', 'Pune', 'Chennai'); expect(gone.length === 0, `deck lacks: ${gone}`)
      expect(doc.sources.some((x) => x.id === src.id), 'deck cites no transcript source')
    })

    await s.check('C1 REAL AI, free visitor: /free-tools/video-to-slides transcribes a small recording without an account and hands it to the editor', null, async () => {
      const v = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage()
      await v.goto(WEB + '/free-tools', { waitUntil: 'load' })
      expect(await v.getByRole('link', { name: /Audio & Video to Slides/ }).count() >= 1, 'not listed on /free-tools')
      await v.goto(WEB + '/free-tools/video-to-slides', { waitUntil: 'load' })
      await v.getByLabel('Choose a recording').setInputFiles(join(FX, 'talk.m4a'))
      await v.getByRole('button', { name: 'Transcribe my recording' }).click()
      const out = v.getByLabel('Cleaned transcript'); await out.waitFor({ timeout: 150000 })
      const t = await out.innerText(); const gone = missing(t, '4,200', 'Pune', 'Chennai'); expect(gone.length === 0, `missing ${gone}: ${t.slice(0, 300)}`)
      await v.screenshot({ path: join(RESULTS, '37-free-tool.png') })
      await Promise.all([v.waitForURL(/localhost:3001\/start\?draft=/, { timeout: 20000 }), v.getByRole('button', { name: /Make slides from this transcript/ }).click()])
      // too-big and wrong-type files are refused on the page, in words
      await v.goto(WEB + '/free-tools/video-to-slides', { waitUntil: 'load' })
      await v.getByLabel('Choose a recording').setInputFiles({ name: 'big.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(5 * 1024 * 1024, 1) })
      await v.getByRole('alert').filter({ hasText: /larger than 4 MB/ }).waitFor({ timeout: 5000 })
      await v.getByLabel('Choose a recording').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
      await v.getByRole('alert').filter({ hasText: /Choose an audio file/ }).waitFor({ timeout: 5000 })
    })
  } finally {
    await b.close()
  }
  return s.done()
}
