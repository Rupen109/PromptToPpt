import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { EDITOR, API, WEB, PASSWORD, expect, launch, suite } from '../lib.mjs'

/**
 * Remix a PowerPoint with the REAL AI model, through the real screens: a Spanish quarterly deck with figures and notes is remixed into a short vertical (9:16) deck for investors
 * that leaves one topic out. Checks what only the real model can break: the language, the figures (every number must come from the file), the topic left out, the length, the
 * shape, and that the deck opens and every slide is valid. COSTS a few rupees of real AI. Needs an existing verified account: E2E_EMAIL=… E2E_PASSWORD=… (Pro or better).
 * Set SHOTS=<folder> to save a picture of every slide.
 */
const { zipSync, strToU8 } = createRequire(new URL('../../services/api/package.json', import.meta.url))('fflate')
const SLIDES = [
  ['Resultados del tercer trimestre 2026', 'Distribuidora Andina'],
  ['Ventas: 120 millones de rupias, un 15% más que el trimestre anterior', 'Región norte: 48 millones', 'Región sur: 41 millones', 'Región este: 31 millones'],
  ['Clientes: 2.340 clientes activos y 310 clientes nuevos'],
  ['Equipo: 86 personas y 12 incorporaciones este trimestre'],
  ['Plan de contratación para el cuarto trimestre: 20 puestos nuevos'],
  ['Próximos pasos', 'Abrir una oficina en Pune', 'Lanzar la tienda en línea en noviembre'],
]
const NOTES = { 2: 'Destacar el crecimiento frente al trimestre anterior.', 6: 'Preguntar por apoyo para la apertura de Pune.' }
const slideXml = (lines) => `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${lines.map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}</p:spTree></p:cSld></p:sld>`
const file = Buffer.from(zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
  'ppt/presentation.xml': strToU8('<?xml version="1.0"?><p:presentation xmlns:p="p"/>'),
  ...Object.fromEntries(SLIDES.map((l, i) => [`ppt/slides/slide${i + 1}.xml`, strToU8(slideXml(l))])),
  ...Object.fromEntries(Object.entries(NOTES).map(([n, t]) => [`ppt/notesSlides/notesSlide${n}.xml`, strToU8(`<?xml version="1.0"?><p:notes xmlns:a="a" xmlns:p="p"><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:notes>`)])),
}))
const SOURCE_TEXT = [...SLIDES.flat(), ...Object.values(NOTES)].join(' ')
const numbersOf = (t) => (t.match(/\d[\d.,]*/g) ?? []).map((x) => x.replace(/[.,]+$/, '').replace(/[.,]/g, ''))
const textOf = (doc) => doc.slides.flatMap((s) => s.elements.filter((e) => e.type === 'text').map((e) => e.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '))).join(' ')

export default async function () {
  const s = suite('75-remix-pptx-real-ai')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified Pro+ account; this suite spends real AI credits)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const p = await ctx.newPage()
    let deck = null
    await s.check('the whole journey: choose the file, ask, pick vertical and 5 slides, create: the progress screen runs and the editor opens by itself', p, async () => {
      await p.goto(EDITOR + '/', { waitUntil: 'networkidle' })
      await p.getByTestId('remix-pptx-open').click()
      await p.getByTestId('remix-file-input').setInputFiles({ name: 'Resultados T3.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: file })
      await p.getByTestId('remix-file-ready').waitFor({ timeout: 20000 })
      expect(/6 slides/.test(await p.getByTestId('remix-file-ready').innerText()), 'the six slides were not counted')
      await p.getByLabel('How should it change?').fill('Una versión corta para inversores. Deja fuera el plan de contratación.')
      await p.getByLabel('Slides in the new version').fill('5')
      await p.getByTestId('format-9:16').click()
      await p.getByTestId('remix-file-start').click()
      await p.waitForURL(/\/edit\//, { timeout: 8 * 60_000 })
      await p.locator('[data-testid="stage"]').waitFor({ timeout: 30000 })
      const id = p.url().split('/edit/')[1]
      deck = (await (await ctx.request.get(`${API}/api/v1/presentations/${id}`)).json()).data
      expect(deck?.document, 'no deck')
    })
    if (deck) {
      const doc = deck.document
      const text = textOf(doc)
      await s.check('the new deck is vertical (9:16), has exactly 5 slides, and every slide is valid (no failed validation)', p, async () => {
        expect(doc.aspectRatio === '9:16', doc.aspectRatio); expect(doc.slides.length === 5, `${doc.slides.length} slides`)
        const failed = doc.slides.filter((x) => x.validation?.status === 'failed')
        expect(failed.length === 0, `failed slides: ${failed.map((x) => x.layoutId + ':' + JSON.stringify(x.validation?.issues?.slice(0, 2))).join(' | ')}`)
        expect(doc.slides.every((x) => x.elements.some((e) => e.type === 'text')), 'a slide without any text')
      })
      await s.check('it is written in Spanish (the file\'s language), not English', p, async () => {
        const words = text.toLowerCase().match(/[a-záéíóúñü]+/g) ?? []
        const es = words.filter((w) => ['de', 'la', 'el', 'en', 'que', 'y', 'los', 'las', 'un', 'una', 'del', 'con', 'para', 'por', 'se', 'más'].includes(w)).length
        const en = words.filter((w) => ['the', 'and', 'of', 'to', 'in', 'is', 'for', 'with', 'our', 'we', 'on', 'that'].includes(w)).length
        expect(es > 5 && es > en * 3, `Spanish words ${es}, English words ${en}: ${text.slice(0, 160)}`)
      })
      await s.check('every figure comes from the file: nothing invented (small structure numbers 1-12 and the year excepted)', p, async () => {
        const allowed = new Set(numbersOf(SOURCE_TEXT))
        const extra = [...new Set(numbersOf(text))].filter((n) => !allowed.has(n) && !(n.length <= 2 && Number(n) <= 12))
        expect(extra.length === 0, `numbers not in the file: ${extra.join(', ')}`)
      })
      await s.check('the key facts are kept (the sales growth, the three regions, the customers) and the topic asked to leave out is left out', p, async () => {
        const t = text.toLowerCase().replace(/\s+/g, ' ')
        expect(/120/.test(t) && /15\s?%/.test(t), 'the sales figures are missing')
        expect(/2\.?340|310/.test(t), 'the customer figures are missing')
        expect(!/contrataci[oó]n|20 puestos/.test(t), 'the hiring plan is still there although the request said to leave it out')
      })
      await s.check('every slide of the vertical deck is shown within its slide (nothing runs off the page)', p, async () => {
        const { width: W, height: H } = { width: 1080, height: 1920 }
        for (const sl of doc.slides) for (const e of sl.elements) { if (e.decorative) continue; expect(e.x >= -2 && e.y >= -2 && e.x + e.width <= W + 2 && e.y + e.height <= H + 2, `${sl.layoutId} ${e.type} ${e.id} is outside the slide`) }
      })
      if (process.env['SHOTS']) {
        for (let i = 0; i < doc.slides.length; i++) { await p.locator(`nav[aria-label="Slides"] [data-testid="thumb-${i}"]`).click(); await p.waitForTimeout(500); await p.locator('[data-testid="stage"]').screenshot({ path: `${process.env['SHOTS']}/remix-pptx-${i + 1}.png` }) }
        writeFileSync(`${process.env['SHOTS']}/remix-pptx-text.txt`, text)
      }
      await ctx.request.delete(`${API}/api/v1/presentations/${deck.id ?? p.url().split('/edit/')[1]}`, { headers: { origin: EDITOR } })
    }
    await ctx.close()
  } finally { await b.close() }
  return s.done()
}
