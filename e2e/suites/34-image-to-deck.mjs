import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { API, EDITOR, expect, launch, suite } from '../lib.mjs'
import { api, person, tsx } from '../kits-lib.mjs'

/**
 * Image → deck with the REAL vision model (Vertex Gemini): pictures with known words and numbers are read, and a deck is built from them.
 * No AI pictures are generated. Flow ids: docs/IMAGE_TO_DECK_FUNCTIONAL_FLOWS.md. (YouTube is not built: see that file.)
 */
const FX = new URL('../fixtures/images/', import.meta.url).pathname
const RESULTS = new URL('../results/', import.meta.url).pathname
const mime = (n) => (n.endsWith('.jpg') ? 'image/jpeg' : 'image/png')
const fx = (n) => ({ name: n, mimeType: mime(n), buffer: readFileSync(join(FX, n)) })

export default async function () {
  const s = suite('34-image-to-deck')
  const b = await launch()
  const P = await person(b, 'imgdeck'); await api.get(P, '/me/entitlements') // Starter, 100 credits
  const balance = () => JSON.parse(tsx(`scripts/qa-remix-check.ts balance ${P.email}`)).balance
  const sources = () => JSON.parse(tsx(`scripts/qa-sources.ts ${P.email}`))
  const textOf = (src) => src.chunks.map((c) => c.text).join('\n')
  const has = (t, ...needles) => needles.filter((n) => !t.toLowerCase().includes(n.toLowerCase()))
  const read = async (name) => { const r = await api.upload(P, '/sources/image', fx(name)); return r }

  try {
    await s.check('A1 Home screen: choose a picture → chip appears, settles to its title, 4 credits spent, source stored as "image"', P.p, async () => {
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      const before = balance()
      await P.p.getByRole('button', { name: /Upload files, or links/ }).click()
      const dlg = P.p.getByRole('dialog', { name: 'Add sources' }); await dlg.waitFor()
      expect((await dlg.getByLabel('File').getAttribute('accept')).includes('.png'), 'picker does not offer pictures')
      expect(/4 credits/.test(await dlg.innerText()), 'dialog does not say a picture costs 4 credits')
      await dlg.getByLabel('File').setInputFiles(join(FX, 'notes.png'))
      await dlg.getByRole('button', { name: 'Add source' }).click()
      await dlg.waitFor({ state: 'detached', timeout: 90000 })
      await P.p.locator('form span[title]').first().waitFor({ timeout: 10000 })
      const spent = before - balance(); expect(spent === 4, `expected 4 credits spent, got ${spent}`)
      const src = sources()[0]; expect(src.type === 'image', `type ${src.type}`)
      await P.p.screenshot({ path: join(RESULTS, '34-chip.png') })
    })

    await s.check('B1 REAL AI: a notes picture is read with the exact figures and nothing invented', P.p, async () => {
      const t = textOf(sources()[0])
      const missing = has(t, '4,200', 'Pune', '310', 'Chennai', '2027', '86')
      expect(missing.length === 0, `missing from the reading: ${missing} — got: ${t.slice(0, 300)}`)
      const invented = [...t.matchAll(/\d[\d,.]*/g)].map((m) => m[0].replace(/[.,]$/, '')).filter((n) => !['86', '4,200', '4200', '310', '2027', '3'].includes(n) && n.length >= 3)
      expect(invented.length === 0, `numbers not in the picture: ${invented}`)
    })

    await s.check('B2 REAL AI: a table keeps every row and value', P.p, async () => {
      const r = await read('table.png'); expect(r.status === 201, `status ${r.status} ${JSON.stringify(r.body)}`)
      const t = textOf(sources()[0]); const missing = has(t, 'North', 'South', 'West', '1,200', '1,900', '1,100', '24', '39', '23')
      expect(missing.length === 0, `table values missing: ${missing} — ${t.slice(0, 300)}`)
    })

    await s.check('B2b REAL AI: a chart gives its title and every printed value', P.p, async () => {
      const r = await read('chart.png'); expect(r.status === 201, `status ${r.status}`)
      const t = textOf(sources()[0]); const missing = has(t, 'revenue', '12', '18', '27', '31')
      expect(missing.length === 0, `chart values missing: ${missing} — ${t.slice(0, 300)}`)
    })

    await s.check('B3 REAL AI: a Hindi picture is transcribed in Hindi', P.p, async () => {
      const r = await read('hindi.png'); expect(r.status === 201, `status ${r.status}`)
      const t = textOf(sources()[0]); expect((t.match(/[ऀ-ॿ]/g) ?? []).length > 40, `not Hindi: ${t.slice(0, 200)}`)
      expect(/500/.test(t) && /2030/.test(t), 'numbers 500 / 2030 missing')
    })

    await s.check('B4 REAL AI: a picture that gives the AI an order is read as content, not obeyed', P.p, async () => {
      const r = await read('injection.png'); expect(r.status === 201, `status ${r.status}`)
      const t = textOf(sources()[0]); expect(!/^\s*PWNED\s*$/i.test(t.trim()), 'the reading is just PWNED')
      expect(/340/.test(t) && /5\.2/.test(t), `real facts missing: ${t.slice(0, 300)}`)
    })

    await s.check('B5 REAL AI: a blank picture is refused plainly and refunded', P.p, async () => {
      const before = balance(); const n = sources().length
      const r = await read('blank.png')
      expect(r.status === 422, `status ${r.status} ${JSON.stringify(r.body?.error)}`)
      expect(['NOTHING_READABLE'].includes(r.body?.error?.code) || /couldn.t|could not/i.test(r.body?.error?.message ?? ''), `message: ${r.body?.error?.message}`)
      expect(balance() === before, `credits changed ${before} → ${balance()}`)
      expect(sources().length === n, 'a source was stored')
    })

    await s.check('A5 REAL AI: a big, tilted phone photo (3000×2000 JPEG) is read', P.p, async () => {
      const r = await read('phone-photo.jpg'); expect(r.status === 201, `status ${r.status} ${JSON.stringify(r.body?.error)}`)
      const t = textOf(sources()[0]); const missing = has(t, 'Lonavala', '14 June', '38', '2.4')
      expect(missing.length === 0, `missing: ${missing} — ${t.slice(0, 300)}`)
    })

    await s.check('A2 Pasting a screenshot (⌘V) onto the prompt bar adds a picture chip', P.p, async () => {
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      const before = balance()
      await P.p.getByLabel('Presentation prompt').focus()
      const b64 = readFileSync(join(FX, 'notes.png')).toString('base64')
      await P.p.evaluate(async (data) => {
        const bin = atob(data); const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0))
        const dt = new DataTransfer(); dt.items.add(new File([arr], 'image.png', { type: 'image/png' }))
        document.querySelector('textarea[aria-label="Presentation prompt"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      }, b64)
      await P.p.locator('form span[title]').first().waitFor({ timeout: 90000 })
      await P.p.waitForFunction(() => !document.querySelector('form .animate-spin'), null, { timeout: 5000 }).catch(() => {})
      await P.p.waitForTimeout(1500)
      const spent = before - balance(); expect(spent === 4, `expected 4 credits spent, got ${spent}`)
    })

    await s.check('C1 UI refusals: HEIC / GIF / SVG / over 8 MB get one plain sentence, nothing is charged', P.p, async () => {
      await P.p.goto(EDITOR + '/', { waitUntil: 'load' })
      const before = balance()
      const tryFile = async (name, mimeType, buffer, re) => {
        await P.p.locator('input[type=file]').first().waitFor({ state: 'attached' }).catch(() => {})
        await P.p.evaluate(async ({ name, mimeType, data }) => {
          const arr = Uint8Array.from(atob(data), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([arr], name, { type: mimeType }))
          document.querySelector('textarea[aria-label="Presentation prompt"]').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        }, { name, mimeType, data: buffer.toString('base64') })
        await P.p.getByRole('alert').filter({ hasText: re }).first().waitFor({ timeout: 8000 })
      }
      await tryFile('IMG_0001.heic', 'image/heic', Buffer.from('xxxx'), /HEIC/)
      await tryFile('anim.gif', 'image/gif', Buffer.from('GIF89a'), /GIF/)
      await tryFile('logo.svg', 'image/svg+xml', Buffer.from('<svg/>'), /SVG/)
      await tryFile('huge.png', 'image/png', Buffer.alloc(9 * 1024 * 1024, 1), /8 MB/)
      expect(balance() === before, 'credits changed')
    })

    await s.check('C1b API: an .exe renamed .png and a 0-byte file are refused with a plain sentence', P.p, async () => {
      const before = balance()
      const a = await api.upload(P, '/sources/image', { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('MZ\x90\x00fake') })
      const e = await api.upload(P, '/sources/image', { name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) })
      expect(a.status === 422 && /not a JPG, PNG or WebP/.test(a.body.error.message), JSON.stringify(a.body))
      expect(e.status === 422, `empty ${e.status}`)
      expect(balance() === before, 'credits changed')
    })

    await s.check('B6 REAL AI: a deck built from the picture-sources carries its facts and cites a source', P.p, async () => {
      const list = sources().filter((x) => x.type === 'image'); expect(list.length >= 3, `only ${list.length} picture sources`)
      const notes = list.find((x) => textOf(x).includes('4,200')); expect(notes, 'notes source missing')
      const job = await api.post(P, '/generation/jobs', { prompt: 'A 5 slide company update for Zorvex Bikes from my picture', slideCount: 5, sourceIds: [notes.id], idempotencyKey: `k-${Date.now()}-${Math.random().toString(36).slice(2)}` })
      expect(job.status === 201, `job ${job.status} ${JSON.stringify(job.body)}`)
      let id; for (let i = 0; i < 100; i++) { const v = (await api.get(P, `/generation/jobs/${job.data.id}`)).data; if (v.status === 'completed') { id = v.presentationId; break } if (['failed', 'cancelled'].includes(v.status)) throw new Error(`job ${v.status}: ${v.error}`); await new Promise((r) => setTimeout(r, 3000)) }
      expect(id, 'deck did not finish')
      const doc = (await api.get(P, `/presentations/${id}`)).data.document
      const out = []; const walk = (v) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk) }; walk(doc.slides.map((sl) => sl.elements))
      const t = out.join(' '); const missing = has(t, '4,200', 'Pune', 'Chennai')
      expect(missing.length === 0, `deck lacks the picture's facts: ${missing}`)
      expect(doc.sources.length >= 1, 'deck cites no source')
      await P.p.goto(`${EDITOR}/edit/${id}`, { waitUntil: 'load' }); await P.p.locator('[data-testid="stage"]').waitFor({ timeout: 20000 })
      await P.p.screenshot({ path: join(RESULTS, '34-deck-from-picture.png') })
    })

    await s.check('C3 out of credits: 402 with the upgrade path, nothing stored', P.p, async () => {
      tsx(`scripts/qa-remix-check.ts setbalance ${P.email} 3`)
      const n = sources().length
      const r = await read('notes.png')
      expect(r.status === 402 && r.body.error.code === 'INSUFFICIENT_CREDITS', `${r.status} ${JSON.stringify(r.body?.error)}`)
      expect(sources().length === n, 'a source was stored')
    })
  } finally {
    await b.close()
  }
  return s.done()
}
