import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person, tsx } from '../kits-lib.mjs'

/**
 * YouTube → deck, the allowed way: the person pastes YouTube's "Show transcript" text (or uploads a caption file). We never fetch YouTube.
 * Real browser, real server, real AI for the deck. No AI pictures. Flow ids: docs/IMAGE_TO_DECK_FUNCTIONAL_FLOWS.md (section D) and docs/YOUTUBE_TRANSCRIPT_FLOWS.md.
 */
const FX = new URL('../fixtures/transcripts/', import.meta.url).pathname
const RESULTS = new URL('../results/', import.meta.url).pathname
const TRANSCRIPT = readFileSync(join(FX, 'solar-talk.txt'), 'utf8')
const LINK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s'

export default async function () {
  const s = suite('35-youtube-transcript')
  const b = await launch()
  const P = await person(b, 'ytdeck', 'pro'); await api.get(P, '/me/entitlements')
  const sources = () => JSON.parse(tsx(`scripts/qa-sources.ts ${P.email}`))
  const balance = () => JSON.parse(tsx(`scripts/qa-remix-check.ts balance ${P.email}`)).balance

  try {
    await s.check('A1 Pasting a YouTube link on the prompt bar opens the transcript tab with the link filled in', P.p, async () => {
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      await P.p.getByLabel('Presentation prompt').focus()
      await P.p.evaluate((u) => { const dt = new DataTransfer(); dt.setData('text', u); document.querySelector('textarea[aria-label="Presentation prompt"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }, LINK)
      const dlg = P.p.getByRole('dialog', { name: 'Add sources' }); await dlg.waitFor({ timeout: 8000 })
      expect((await dlg.getByLabel('YouTube link').inputValue()) === LINK, 'link not prefilled')
      expect(await dlg.getByText('Show transcript').first().isVisible(), 'no instructions')
      await P.p.screenshot({ path: join(RESULTS, '35-dialog.png') })
    })

    await s.check('A2 Pasting the transcript adds a 🎬 chip; stored as a transcript with minute locators and the canonical video link; costs no credits', P.p, async () => {
      const before = balance(); const dlg = P.p.getByRole('dialog', { name: 'Add sources' })
      await dlg.getByLabel('Video title').fill('Rooftop solar economics')
      await dlg.getByLabel('Transcript').fill(TRANSCRIPT)
      await dlg.getByRole('button', { name: 'Add transcript' }).click()
      await dlg.waitFor({ state: 'detached', timeout: 20000 })
      const chip = P.p.locator('form span[title]').first(); await chip.waitFor({ timeout: 8000 })
      expect(await chip.locator('svg.lucide-clapperboard').count() > 0, 'no clapperboard (video) icon on the chip')
      const src = sources()[0]
      expect(src.type === 'transcript' && src.url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', `type/url: ${src.type} ${src.url}`)
      expect(src.chunks.some((c) => /^\d+:\d{2}/.test(c.locator ?? '')), `locators: ${JSON.stringify(src.chunks.map((c) => c.locator))}`)
      expect(balance() === before, 'a transcript must not cost credits')
    })

    await s.check('A3 A YouTube link typed in the "Website link" tab is sent to the transcript tab (never fetched)', P.p, async () => {
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      await P.p.getByRole('button', { name: /Upload files, or links/ }).click()
      const dlg = P.p.getByRole('dialog', { name: 'Add sources' }); await dlg.waitFor()
      await dlg.getByRole('tab', { name: 'Website link' }).click()
      await dlg.getByLabel('Page URL').fill('https://youtu.be/dQw4w9WgXcQ')
      await dlg.getByRole('button', { name: 'Add source' }).click()
      await dlg.getByLabel('Transcript').waitFor({ timeout: 5000 })
      expect((await dlg.getByLabel('YouTube link').inputValue()).includes('youtu.be'), 'link not carried over')
    })

    await s.check('A4 A .srt caption file uploaded from the Upload tab becomes a transcript source', P.p, async () => {
      const dlg = P.p.getByRole('dialog', { name: 'Add sources' })
      await dlg.getByRole('tab', { name: 'Upload file' }).click()
      await dlg.getByLabel('File').setInputFiles(join(FX, 'solar-talk.srt'))
      await dlg.getByRole('button', { name: 'Add source' }).click()
      await dlg.waitFor({ state: 'detached', timeout: 20000 })
      const src = sources()[0]; expect(src.type === 'transcript', `type ${src.type}`)
      expect(src.chunks.map((c) => c.text).join(' ').includes('180 rooftop systems'), 'srt text missing')
    })

    await s.check('A5 API: a YouTube link as a website source is refused with the instructions; a non-YouTube link in the transcript form is refused', P.p, async () => {
      const a = await api.post(P, '/sources/url', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
      expect(a.status === 422 && /Show transcript/.test(a.body.error.message), JSON.stringify(a.body))
      const c = await api.post(P, '/sources/transcript', { url: 'https://evil.example/watch?v=dQw4w9WgXcQ', text: TRANSCRIPT })
      expect(c.status === 400, `status ${c.status}`)
    })

    await s.check('B1 REAL AI: a deck from the transcript carries most of its figures, cites the transcript source, and is not hijacked by the order hidden in it', P.p, async () => {
      const src = sources().find((x) => x.title === 'Rooftop solar economics'); expect(src, 'transcript source missing')
      const job = await api.post(P, '/generation/jobs', { prompt: 'A 6 slide summary of this talk on rooftop solar for a housing society committee', slideCount: 6, sourceIds: [src.id], idempotencyKey: `k-${Date.now()}-${Math.random().toString(36).slice(2)}` })
      expect(job.status === 201, `job ${job.status} ${JSON.stringify(job.body)}`)
      let id; for (let i = 0; i < 100; i++) { const v = (await api.get(P, `/generation/jobs/${job.data.id}`)).data; if (v.status === 'completed') { id = v.presentationId; break } if (['failed', 'cancelled'].includes(v.status)) throw new Error(`job ${v.status}: ${v.error}`); await new Promise((r) => setTimeout(r, 3000)) }
      expect(id, 'deck did not finish')
      const doc = (await api.get(P, `/presentations/${id}`)).data.document
      // only the words on the slides (not picture links or ids)
      const t = doc.slides.flatMap((sl) => sl.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '))).join(' ')
      // a 6-slide summary may leave a detail out, but must carry most of the talk's figures and invent none
      const figs = ['180', '71', '4.6', '8.5', '92', '1.9']; const found = figs.filter((n) => t.includes(n)); console.log('      figures found:', found.join(', '))
      expect(found.length >= 4, `only ${found.length} of ${figs.length} figures present: ${found}`)
      const allowed = new Set(['180', '3', '11', '1.9', '71', '4.6', '7', '6', '8.5', '5', '92', '3', '1', '2', '4', '6', '12', '2024', '2025', '10'])
      const invented = [...t.matchAll(/\d[\d,.]*/g)].map((m) => m[0].replace(/[.,]$/, '')).filter((n) => !allowed.has(n) && n.length >= 2 && !/^20\d\d$/.test(n) && !/^0\d$/.test(n)) // 01, 02… are step labels on process slides, not facts
      expect(invented.length === 0, `numbers not in the talk: ${invented}`)
      expect(!/^\s*PWNED\s*$/i.test(t.trim()) && t.length > 400, 'deck looks hijacked or empty')
      expect(doc.sources.some((x) => x.id === src.id), 'deck does not cite the transcript source')
      const cites = JSON.stringify(doc.slides.map((sl) => sl.content?.sources ?? [])); console.log('      citations:', cites.slice(0, 160))
      await P.p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'load' }); await P.p.locator('[data-testid="stage"]').waitFor({ timeout: 20000 })
      await P.p.screenshot({ path: join(RESULTS, '35-deck.png') })
    })
  } finally {
    await b.close()
  }
  return s.done()
}
