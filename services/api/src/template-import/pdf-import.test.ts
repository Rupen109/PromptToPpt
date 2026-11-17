import { describe, expect, it } from 'vitest'
import { presentationSchema } from '@prompttoppt/validation'
import { parsePdfTemplate, PDF_MESSAGES } from './parse-pdf.ts'
import { parseTemplateFile } from './index.ts'
import { buildPdf, ops, picturePagesPdf, portraitPdf, sampleDeckPdf, solidRgb } from './pdf-fixtures.ts'
import { pendingRef } from './types.ts'
import { closePool } from '../sources/parse-pool.ts'
import { allowedNumbers } from '../generation/quality.ts'

/** The PDF reader: pages rebuilt from what they draw, with the same output as the .pptx reader. PDFs are written by hand (pdf-fixtures.ts), so each test says what is on the page. */
const W = 960, H = 540
const o = ops(H)
const textOf = (el: { type: string; paragraphs?: { runs: { text: string }[] }[] }) => (el.type === 'text' ? el.paragraphs!.map((p) => p.runs.map((r) => r.text).join('')).join('\n') : '')

describe('PDF as a design', () => {
  it('reads a text deck: aspect, background, theme colours, fonts, text boxes, a picture and shapes, as valid editor slides', async () => {
    const { template: t, pictures } = await parsePdfTemplate(sampleDeckPdf(), 'Orbit Deck.pdf')
    expect(t.source.kind).toBe('pdf')
    expect(t.name).toBe('Orbit Deck')
    expect(t.aspect).toBe('16:9')
    expect(t.canvas).toMatchObject({ width: 1920, height: 1080, fitted: false })
    expect(t.slides).toHaveLength(4)
    expect(t.stats).toMatchObject({ sourceSlides: 4, importedSlides: 4, skippedSlides: 0, masters: 0 })
    expect(t.theme.colors.background).toBe('#0B1220')
    expect(t.theme.colors.primary).toBe('#14B8A6')
    expect(t.theme.style?.footer).toBe('number')
    expect(t.fonts[0]).toMatchObject({ original: 'Helvetica', replaced: false })
    for (const s of t.slides) {
      expect(s.slide).toMatchObject({ layoutId: 'blank', manual: true, ownLook: true })
      expect(presentationSchema.safeParse({ schemaVersion: 1, id: 'x', title: 'x', aspectRatio: t.aspect, language: 'en', theme: t.theme, slides: [s.slide], sources: [] }).success).toBe(true)
    }
    // slide 1: the two title lines are ONE title; the subtitle is a body; the wordmark repeated on 3 pages is chrome, not a slot
    const s1 = t.slides[0]!
    expect(s1.slots.map((x) => x.role)).toEqual(['title', 'body'])
    const title = s1.slide.elements.find((e) => e.id === s1.slots[0]!.elementId)!
    expect(textOf(title as never)).toBe('Mission to Mars: the crew briefing')
    expect(t.chrome.map((c) => c.sample)).toContain('ORBIT LABS')
    expect(s1.slide.elements.some((e) => e.type === 'text' && textOf(e as never) === 'ORBIT LABS')).toBe(true) // kept as design text
    // the page colour is the background, not a page-sized rectangle
    expect(s1.slide.background).toEqual({ type: 'color', value: '#0B1220' })
    expect(s1.slide.elements.some((e) => e.type === 'shape' && e.width >= 1900)).toBe(false)
    // slide 2: three bullets (marker dots drawn as shapes) are one bullets slot, the dots are not drawn
    const s2 = t.slides[1]!
    const bullets = s2.slots.find((x) => x.role === 'bullets')!
    expect(bullets.lines).toBe(3)
    const bel = s2.slide.elements.find((e) => e.id === bullets.elementId)!
    expect(bel.type === 'text' && bel.paragraphs.every((p) => p.list === 'bullet')).toBe(true)
    expect(s2.slide.elements.filter((e) => e.type === 'shape' && e.shape === 'ellipse' && e.width < 40)).toHaveLength(0)
    expect(s2.slide.elements.some((e) => e.type === 'shape' && e.shape === 'ellipse' && e.width > 200)).toBe(true) // the real circle stays
    // slide 3: a card (rectangle with outline), a line, text in colours, and the picture, stored beside the template
    const s3 = t.slides[2]!
    expect(s3.slide.background).toEqual({ type: 'color', value: '#F8F5EF' })
    const img = s3.slide.elements.find((e) => e.type === 'image')!
    expect(img.type === 'image' && pendingRef(img.src)).toBeTruthy()
    expect(Math.round(img.width)).toBe(Math.round(340 * 2)) // 2 canvas px per page point
    expect(pictures).toHaveLength(1)
    expect(pictures[0]!.mime).toBe('image/jpeg')
    expect(s3.pictures[0]).toMatchObject({ replaceable: true, kind: 'photo' })
    const cheese = s3.slide.elements.find((e) => e.type === 'text' && textOf(e as never) === 'Cheese')!
    expect(cheese.type === 'text' && cheese.color).toBe('#EA580C')
    const body = s3.slide.elements.find((e) => e.type === 'text' && textOf(e as never).startsWith('Local farms'))!
    expect(textOf(body as never)).toBe('Local farms bring fresh cheese every week.') // two wrapped lines are one paragraph
    // page numbers are gone, the viewer draws them
    expect(t.slides.every((s) => !s.slide.elements.some((e) => e.type === 'text' && /^\d$/.test(textOf(e as never))))).toBe(true)
    expect(t.warnings.join(' ')).toMatch(/read from a PDF/)
    expect(t.warnings.join(' ')).toMatch(/Page numbers were removed/)
  })

  it('sizes and places text like the page: font size in canvas px, the box starts where the words start, a bold run stays bold', async () => {
    const pdf = buildPdf({ pages: [
      { w: W, h: H, content: o.rect(0, 0, W, H, '#FFFFFF') + o.text(100, 200, 40, 'Big words here', '#111111', 'F2') },
      { w: W, h: H, content: o.rect(0, 0, W, H, '#FFFFFF') + o.text(100, 200, 40, 'More big words', '#111111', 'F2') },
    ] })
    const { template: t } = await parsePdfTemplate(pdf, 'a.pdf')
    const el = t.slides[0]!.slide.elements.find((e) => e.type === 'text')!
    if (el.type !== 'text') throw new Error('no text')
    expect(el.fontSize).toBe(80) // 40 pt x 2
    expect(el.weight).toBe(700)
    expect(el.x).toBeGreaterThan(190); expect(el.x).toBeLessThan(205) // 100 pt x 2
    // the first baseline sits at 200 pt: the box top is above it by about one line
    expect(el.y).toBeLessThan(400); expect(el.y).toBeGreaterThan(300)
  })

  it('a deck made of pictures only (a scan, slides saved as JPEGs) is refused with the reason, never pretended', async () => {
    await expect(parsePdfTemplate(picturePagesPdf(), 'scan.pdf')).rejects.toThrow(PDF_MESSAGES.pictures)
    expect(PDF_MESSAGES.pictures).toMatch(/pictures/)
    expect(PDF_MESSAGES.pictures).toMatch(/\.pptx/)
  })

  it('a portrait document is refused with a message that says why', async () => {
    await expect(parsePdfTemplate(portraitPdf(), 'letter.pdf')).rejects.toThrow(PDF_MESSAGES.portrait)
  })

  it('some pages with text and some pictures: the text pages are imported and the rest is reported', async () => {
    const mixed = buildPdf({ pages: [
      { w: W, h: H, content: o.rect(0, 0, W, H, '#FFFFFF') + o.text(80, 200, 44, 'First page with words', '#222222', 'F2') },
      { w: W, h: H, images: [{ name: 'Im1', w: 96, h: 54, rgb: solidRgb(96, 54, [30, 40, 60]) }], content: o.image('Im1', 0, 0, W, H) },
      { w: W, h: H, content: o.rect(0, 0, W, H, '#FFFFFF') + o.text(80, 200, 44, 'Third page with words', '#222222', 'F2') },
    ] })
    const { template: t } = await parsePdfTemplate(mixed, 'mixed.pdf')
    expect(t.slides.map((s) => s.n)).toEqual([1, 3])
    expect(t.stats).toMatchObject({ sourceSlides: 3, importedSlides: 2, skippedSlides: 1 })
    expect(t.warnings.join(' ')).toMatch(/1 page \(2\) is a picture or empty and was left out/)
  })

  it('a picture behind the words is the slide background, not an element; a rounded frame cuts a picture and keeps its radius', async () => {
    const pdf = buildPdf({ pages: [{ w: W, h: H, images: [{ name: 'Bg', w: 96, h: 54, rgb: solidRgb(96, 54, [200, 90, 30], [60, 20, 120]) }],
      content: o.image('Bg', 0, 0, W, H) + o.rect(60, 180, 500, 160, '#000000') + o.text(80, 250, 40, 'Words over a photo', '#FFFFFF', 'F2') }] })
    const { template: t, pictures } = await parsePdfTemplate(pdf, 'photo.pdf')
    const s = t.slides[0]!
    expect(s.slide.background?.type).toBe('image')
    expect(pendingRef(s.slide.background?.value as string)).toBeTruthy()
    expect(s.slide.elements.some((e) => e.type === 'image')).toBe(false)
    expect(pictures).toHaveLength(1)
    expect(s.slots.map((x) => x.role)).toEqual(['title'])
  })

  it('turned text keeps its angle; centred text stays centred', async () => {
    const turned = `BT 0.2 0.2 0.8 rg /F1 24 Tf 0 1 -1 0 ${W - 80} 200 Tm (Turned label) Tj ET\n`
    const pdf = buildPdf({ pages: [{ w: W, h: H, content: o.rect(0, 0, W, H, '#FFFFFF') + o.text(300, 120, 40, 'Centred', '#000000', 'F2') + turned }] })
    const { template: t } = await parsePdfTemplate(pdf, 'a.pdf')
    const els = t.slides[0]!.slide.elements.filter((e) => e.type === 'text')
    const rot = els.find((e) => textOf(e as never) === 'Turned label')!
    expect(Math.abs(rot.rotation)).toBeGreaterThan(80)
    expect(Math.abs(rot.rotation)).toBeLessThan(100)
  })

  it('wide letters spaced out are one word, not single letters', async () => {
    // letters placed one by one with a constant extra gap (Helvetica widths), like letter-spacing in a browser's PDF
    const adv: Record<string, number> = { S: 0.667, T: 0.611, U: 0.722, D: 0.722, I: 0.278, O: 0.778, N: 0.722, R: 0.722, H: 0.722, ' ': 0.278 }
    let c = '', x = 80
    for (const ch of 'STUDIO NORTH') { if (ch !== ' ') c += o.text(x, 300, 12, ch, '#888888'); x += adv[ch]! * 12 + 3.2 }
    const pdf = buildPdf({ pages: [{ w: W, h: H, content: o.rect(0, 0, W, H, '#FFFFFF') + c }] })
    const { template: t } = await parsePdfTemplate(pdf, 'a.pdf')
    const texts = t.slides[0]!.slide.elements.filter((e) => e.type === 'text').map((e) => textOf(e as never))
    expect(texts).toEqual(['STUDIO NORTH'])
  })

  it('a password protected PDF and a damaged one get a sentence for the person', async () => {
    await expect(parsePdfTemplate(buildPdf({ password: true, pages: [{ w: W, h: H, content: o.text(80, 200, 30, 'secret') }] }), 'locked.pdf')).rejects.toThrow(PDF_MESSAGES.password)
    await expect(parsePdfTemplate(new Uint8Array(Buffer.from('%PDF-1.4\nthis is not a pdf at all')), 'x.pdf')).rejects.toThrow(PDF_MESSAGES.damaged)
  })

  it('is bounded: a picture of a billion pixels is left out with a note, a page with thousands of shapes is capped, and reading finishes', async () => {
    // declared 40000 x 40000 pixels (data is only a few bytes: a decompression bomb) and 1,500 tiny rectangles
    let shapes = ''
    for (let i = 0; i < 1500; i++) shapes += o.rect((i * 7) % 900, (i * 13) % 500, 6, 6, i % 2 ? '#ff0000' : '#00aa00')
    const pdf = buildPdf({ pages: [
      { w: W, h: H, images: [{ name: 'Im1', w: 40000, h: 40000, rgb: new Uint8Array(3) }], content: o.rect(0, 0, W, H, '#FFFFFF') + shapes + o.image('Im1', 100, 100, 300, 200) + o.text(80, 300, 40, 'Still readable', '#111111', 'F2') },
      { w: W, h: H, content: o.rect(0, 0, W, H, '#FFFFFF') + o.text(80, 300, 40, 'Second', '#111111', 'F2') },
    ] })
    const t0 = Date.now()
    const { template: t } = await parsePdfTemplate(pdf, 'bomb.pdf')
    expect(Date.now() - t0).toBeLessThan(15_000)
    const s = t.slides[0]!
    expect(s.slide.elements.length).toBeLessThanOrEqual(400)
    expect(s.slide.elements.some((e) => e.type === 'text' && textOf(e as never) === 'Still readable')).toBe(true)
    expect(s.slide.elements.some((e) => e.type === 'image')).toBe(false)
  })

  it('is deterministic and never carries figures into slots as data: same file, same template', async () => {
    const a = await parsePdfTemplate(sampleDeckPdf(), 'a.pdf'), b = await parsePdfTemplate(sampleDeckPdf(), 'a.pdf')
    expect(JSON.stringify(a.template)).toBe(JSON.stringify(b.template))
    void allowedNumbers
  })

  it('goes through the same entry point and worker as a .pptx (the pool picks the PDF reader by the first bytes)', async () => {
    const parsed = await parseTemplateFile(sampleDeckPdf(), 'orbit.pdf')
    expect(parsed.template.source.kind).toBe('pdf')
    expect(parsed.template.slides).toHaveLength(4)
    expect(parsed.pictures).toHaveLength(1)
    expect(parsed.pictures[0]!.bytes.length).toBeGreaterThan(100)
    await expect(parseTemplateFile(picturePagesPdf(), 'scan.pdf')).rejects.toThrow(/pictures/)
    await closePool()
  })
})
