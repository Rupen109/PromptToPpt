import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { SourceError } from '../sources/errors.ts'
import { cxn, miniPptx, para, picture, sp, testPng } from '../template-import/test-fixtures.ts'
import { profileFromRaw, rankPalette } from './from-file.ts'
import { cleanPdfFontName, readPdfBrand, usableTitle } from './read-pdf.ts'
import { nameFromFile } from './file-types.ts'
import { readPptxBrand } from './read-pptx.ts'
import { brandPdf, type PdfPageSpec } from './test-brand-pdf.ts'

const E = 12700
const b = (x: number, y: number, w: number, h: number) => ({ x: x * E, y: y * E, w: w * E, h: h * E })
const wide = { cx: 960 * E, cy: 540 * E }
const NAVY: [number, number, number] = [10, 37, 64], ORANGE: [number, number, number] = [255, 90, 31], WHITE: [number, number, number] = [255, 255, 255]

/** a branded page: navy header band, orange card, a small logo in the top-right corner */
const page = (o: Partial<PdfPageSpec> = {}): PdfPageSpec => ({
  bg: WHITE,
  rects: [{ x: 0, y: 440, w: 960, h: 100, fill: NAVY }, { x: 40, y: 100, w: 220, h: 200, fill: ORANGE }],
  texts: [{ x: 60, y: 480, size: 44, text: 'Acme Robotics', font: 'Helvetica-Bold', color: WHITE }, { x: 60, y: 60, size: 14, text: 'Body copy that explains the plan in a few words', font: 'Times-Roman' }],
  images: [{ x: 880, y: 485, w: 60, h: 50, px: 64, rgb: ORANGE }],
  ...o,
})

describe('brand from a PDF', () => {
  it('reads the colours it draws (neutrals out), fonts, repeated corner logo and name', async () => {
    const r = await readPdfBrand(brandPdf({ title: 'Acme Robotics brand', pages: [page(), page(), page()] }), 'x.pdf')
    const hexes = r.colors.map((c) => c.hex)
    expect(hexes).toContain('#0A2540'); expect(hexes).toContain('#FF5A1F')
    const p = profileFromRaw(r, 'x.pdf')
    expect(p.colors.palette.slice(0, 2).sort()).toEqual(['#0A2540', '#FF5A1F'])
    expect(p.colors.palette).not.toContain('#FFFFFF'); expect(p.colors.palette).not.toContain('#000000')
    expect(p.colors.primary).toBe('#0A2540'); expect(p.colors.accent).toBe('#FF5A1F'); expect(p.colors.accentDerived).toBe(false)
    expect(p.confidence).toBe('high')
    expect(p.name).toBe('Acme Robotics brand')
    expect(r.logo).toMatchObject({ mime: 'image/png', width: 64, height: 64 })
    expect(r.logo!.why).toMatch(/3\/3 pages/)
    expect(p.layouts.available).toBe(true) // a PDF with real text can be kept as a design too
    expect(p.layouts.reason).toMatch(/approximation/)
  })
  it('fonts: largest type is the heading, the most used small type the body; replaced fonts are named', async () => {
    const r = await readPdfBrand(brandPdf({ pages: [page({ texts: [{ x: 60, y: 480, size: 44, text: 'Acme Robotics', font: 'Helvetica-Bold' }, { x: 60, y: 60, size: 14, text: 'Body copy that explains the plan in a few words', font: 'Courier' }] })] }), 'x.pdf')
    const p = profileFromRaw(r, 'x.pdf')
    expect(p.fonts.heading).toMatchObject({ original: 'Helvetica', family: 'Helvetica', exact: true })
    expect(p.fonts.body).toMatchObject({ original: 'Courier', family: 'Space Mono', exact: false })
    expect(p.notes.join(' ')).toMatch(/Courier was replaced by Space Mono/)
  })
  it('name: falls back to the biggest words on page 1 when the title is junk', async () => {
    const r = await readPdfBrand(brandPdf({ title: 'Microsoft PowerPoint - Presentation1.pptx', pages: [page()] }), 'x.pdf')
    expect(r.name).toBeNull(); expect(r.nameAlt).toBe('Acme Robotics')
    expect(profileFromRaw(r, 'x.pdf').name).toBe('Acme Robotics')
    expect(profileFromRaw(r, 'Zenith_brand_2026.pdf').name).toBe('Zenith') // a meaningful file name beats the words of the first page
  })
  it('a JPEG logo (stored as DCT, the way PowerPoint and cameras do) is decoded and kept as a PNG', async () => {
    const jpeg = await sharp({ create: { width: 96, height: 96, channels: 3, background: { r: 228, g: 87, b: 46 } } }).jpeg().toBuffer()
    const r = await readPdfBrand(brandPdf({ pages: [page({ images: [{ x: 880, y: 485, w: 60, h: 50, px: 96, rgb: ORANGE, jpeg }] }), page({ images: [{ x: 880, y: 485, w: 60, h: 50, px: 96, rgb: ORANGE, jpeg }] })] }), 'x.pdf')
    expect(r.logo).toMatchObject({ mime: 'image/png', width: 96, height: 96 })
    expect(r.logo!.why).toMatch(/2\/2 pages/)
  })
  it('a lone small picture on one page is only a weak guess: a big photo is never the logo', async () => {
    const r = await readPdfBrand(brandPdf({ pages: [page({ images: [{ x: 100, y: 100, w: 500, h: 300, px: 64, rgb: [120, 80, 60] }] })] }), 'x.pdf')
    expect(r.logo).toBeNull()
  })
  it('photo colours are not brand colours when the PDF also has text and shapes', async () => {
    const r = await readPdfBrand(brandPdf({ pages: [page({ images: [{ x: 300, y: 100, w: 500, h: 300, px: 64, rgb: [30, 200, 60] }] })] }), 'x.pdf')
    expect(r.colors.map((c) => c.hex)).not.toContain('#1EC83C')
  })
  it('a picture-only PDF still gives colours from the page and says fonts could not be read', async () => {
    const r = await readPdfBrand(brandPdf({ pages: [{ images: [{ x: 0, y: 0, w: 960, h: 540, px: 64, rgb: [20, 120, 200] }] }] }), 'scan.pdf')
    expect(r.facts.pictureOnly).toBe(true)
    const p = profileFromRaw(r, 'scan.pdf')
    expect(p.colors.primary).toBe('#1478C8')
    expect(p.fonts.heading).toBeNull()
    expect(p.notes.join(' ')).toMatch(/page pictures/)
  })
  it('black-and-white text only: no brand colours, says so, and does not invent any', async () => {
    const r = await readPdfBrand(brandPdf({ pages: [{ bg: WHITE, texts: [{ x: 50, y: 400, size: 30, text: 'Plain', font: 'Helvetica' }], gray: [{ x: 0, y: 0, w: 960, h: 30, level: 0.5 }] }] }), 'bw.pdf')
    const p = profileFromRaw(r, 'bw.pdf')
    expect(p.colors.primary).toBeNull(); expect(p.confidence).toBe('low')
    expect(p.notes.join(' ')).toMatch(/only black, white and grey/)
  })
  it('refuses a password-protected PDF, a corrupt one and a non-PDF with a sentence for the person', async () => {
    await expect(readPdfBrand(brandPdf({ password: 'secret', pages: [page()] }), 'p.pdf')).rejects.toThrow(/password protected/)
    await expect(readPdfBrand(new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf'), 'c.pdf')).rejects.toBeInstanceOf(SourceError)
    await expect(readPdfBrand(new TextEncoder().encode('hello'), 'h.pdf')).rejects.toThrow(/not a PDF/)
  })
  it('only the first pages are looked at, and a huge page count is refused', async () => {
    const r = await readPdfBrand(brandPdf({ pages: Array.from({ length: 30 }, () => page()) }), 'long.pdf')
    expect(r.facts).toMatchObject({ units: 30, looked: 12 })
  })
  it('cleans PDF font names and titles', () => {
    expect(cleanPdfFontName('ABCDEF+Open-Sans-Bold')).toBe('Open Sans')
    expect(cleanPdfFontName('ArialMT')).toBe('Arial')
    expect(cleanPdfFontName('TimesNewRomanPSMT')).toBe('Times New Roman')
    expect(cleanPdfFontName('Montserrat-SemiBold')).toBe('Montserrat')
    expect(cleanPdfFontName('Calibri-Light')).toBe('Calibri')
    expect(cleanPdfFontName('Symbol')).toBeNull(); expect(cleanPdfFontName('Wingdings-Regular')).toBeNull(); expect(cleanPdfFontName('g_d0_f1')).toBeNull()
    expect(usableTitle('Microsoft PowerPoint - Q3 plan.pptx')).toBe('Q3 plan'); expect(usableTitle('Untitled')).toBeNull(); expect(usableTitle('2024_11_03')).toBeNull(); expect(usableTitle(undefined)).toBeNull()
  })
})

const logoDeck = (extra: { theme?: Parameters<typeof miniPptx>[0]['theme']; slideCount?: number } = {}) => {
  const logo = picture(30, 'Logo', b(850, 20, 80, 40), 'rId5')
  const slides = Array.from({ length: extra.slideCount ?? 4 }, (_, i) =>
    sp(2, 'card', b(60, 120, 300, 260), { fill: 'E4572E' }) + sp(3, 'strip', b(0, 500, 960, 40), { fill: '17BEBB' }) + sp(4, 't', b(60, 40, 600, 60), { txBox: true, text: para(`Slide ${i + 1}`, { sz: 32, b: true, color: 'E4572E', font: 'Montserrat' }) }) + (i === 0 ? picture(5, 'Hero', b(400, 120, 500, 300), 'rId6') : ''))
  return miniPptx({
    size: wide, theme: { major: 'Montserrat', minor: 'Lato', colors: { accent1: 'E4572E', accent2: '17BEBB', accent3: '2E86AB', accent4: 'F6C90E', accent5: '8E44AD', accent6: '27AE60', ...(extra.theme?.colors ?? {}) } },
    masterShapes: logo, slides,
    slideRels: Object.fromEntries(slides.map((_, i) => [i, i === 0 ? [{ id: 'rId6', type: 'image', target: '../media/hero.png' }] : []])),
    extraFiles: { 'ppt/slideMasters/_rels/slideMaster1.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>` },
    media: { 'logo.png': testPng(160, 80, [228, 87, 46]), 'hero.png': testPng(500, 300, [40, 120, 200]) },
  })
}

describe('brand from a PowerPoint', () => {
  it('colours: the colours the slides really show lead, the theme fills in; fonts and name; logo on the master', async () => {
    const r = await readPptxBrand(logoDeck(), 'Acme_Brand_Template_2026.pptx')
    const p = profileFromRaw(r, 'Acme_Brand_Template_2026.pptx')
    expect(p.colors.primary).toBe('#E4572E')
    expect(p.colors.palette).toContain('#17BEBB')
    expect(p.colors.palette).not.toContain('#FFFFFF')
    expect(p.name).toBe('Acme')
    expect(p.fonts.heading).toMatchObject({ original: 'Montserrat', family: 'Montserrat', exact: true })
    expect(p.fonts.body).toMatchObject({ original: 'Lato', family: 'Lato', exact: true })
    expect(r.logo).toMatchObject({ mime: 'image/png', width: 160, height: 80, aspect: 2 })
    expect(r.logo!.why).toMatch(/4\/4 slides, on the master/)
    expect(p.layouts.available).toBe(true)
    expect(p.confidence).toBe('high')
  })
  it('a deck that ignores its theme still gives its true colours (usage beats the theme slots)', async () => {
    const slides = [0, 1].map(() => sp(2, 'big', b(0, 0, 960, 540), { fill: '00A86B' }) + sp(3, 'small', b(100, 100, 100, 100), { fill: 'FF6F00' }))
    const r = await readPptxBrand(miniPptx({ size: wide, theme: { colors: { accent1: '4472C4', accent2: 'ED7D31' } }, slides }), 'x.pptx')
    const p = profileFromRaw(r, 'x.pptx')
    expect(p.colors.primary).toBe('#00A86B')
    expect(p.colors.palette).toContain('#FF6F00')
  })
  it('the stock Office design is flagged: it is probably not a brand', async () => {
    const r = await readPptxBrand(miniPptx({ size: wide, theme: { major: 'Calibri Light', minor: 'Calibri', colors: { accent1: '4472C4', accent2: 'ED7D31' } }, slides: [sp(2, 'a', b(50, 50, 100, 100), { fill: '4472C4' })] }), 'x.pptx')
    const p = profileFromRaw(r, 'x.pptx')
    expect(r.facts.stockOffice).toBe(true); expect(p.confidence).toBe('low'); expect(p.notes.join(' ')).toMatch(/standard theme/)
  })
  it('fonts that are not available are replaced and the original is kept and named', async () => {
    const r = await readPptxBrand(miniPptx({ size: wide, theme: { major: 'Gotham Bold', minor: 'Proxima Nova' }, slides: [sp(2, 't', b(50, 50, 500, 80), { txBox: true, text: para('Hello', { sz: 30 }) })] }), 'x.pptx')
    const p = profileFromRaw(r, 'x.pptx')
    expect(p.fonts.heading).toMatchObject({ original: 'Gotham Bold', exact: false })
    expect(p.fonts.body).toMatchObject({ original: 'Proxima Nova', exact: false })
    expect(p.notes.join(' ')).toMatch(/Gotham Bold was replaced by/)
  })
  it('a photo is never the logo; with no small repeated picture there is none', async () => {
    const slides = [0, 1, 2].map(() => picture(5, 'Hero', b(300, 100, 500, 300), 'rId6') + sp(2, 'c', b(10, 10, 100, 100), { fill: 'E4572E' }))
    const r = await readPptxBrand(miniPptx({ size: wide, slides, slideRels: { 0: [{ id: 'rId6', type: 'image', target: '../media/hero.png' }], 1: [{ id: 'rId6', type: 'image', target: '../media/hero.png' }], 2: [{ id: 'rId6', type: 'image', target: '../media/hero.png' }] }, media: { 'hero.png': testPng(500, 300) } }), 'x.pptx')
    expect(r.logo).toBeNull()
  })
  it('lines count as colour too, and a tiny stroke does not outweigh a big fill', async () => {
    const r = await readPptxBrand(miniPptx({ size: wide, slides: [sp(2, 'big', b(0, 0, 600, 400), { fill: '2E86AB' }) + cxn(3, b(0, 450, 900, 0), 'E4572E', 12700)] }), 'x.pptx')
    expect(profileFromRaw(r, 'x.pptx').colors.primary).toBe('#2E86AB')
  })
  it('refuses a non-PowerPoint, an old .ppt and a corrupt zip with a sentence', async () => {
    await expect(readPptxBrand(new TextEncoder().encode('PK\u0003\u0004 not really'), 'x.pptx')).rejects.toBeInstanceOf(SourceError)
    await expect(readPptxBrand(new TextEncoder().encode('hello world'), 'x.pptx')).rejects.toBeInstanceOf(SourceError)
  })
  it('names: from the file name, cleaned', () => {
    expect(nameFromFile('Acme_Brand_Template_2026.pptx')).toBe('Acme')
    expect(nameFromFile('Q3 Review - FINAL v2.pptx')).toBe('Q3 Review')
    expect(nameFromFile('template.pptx')).toBeNull(); expect(nameFromFile('scan_0001.pdf')).toBeNull(); expect(nameFromFile('Presentation1.pptx')).toBeNull()
  })
})

describe('palette ranking', () => {
  it('drops neutrals, merges shades of one colour, keeps the heavier exact value first', () => {
    const r = rankPalette([
      { hex: '#E4572E', weight: 500, source: 'fill' }, { hex: '#E8603A', weight: 100, source: 'fill' }, { hex: '#FFFFFF', weight: 9000, source: 'background' }, { hex: '#222222', weight: 800, source: 'text' },
      { hex: '#17BEBB', weight: 200, source: 'fill' }, { hex: '#808080', weight: 400, source: 'fill' },
    ])
    expect(r.map((x) => x.hex)).toEqual(['#E4572E', '#17BEBB'])
  })
  it('one brand colour only: the accent is derived and the card says it was derived', () => {
    const p = profileFromRaw({ kind: 'pdf', name: null, colors: [{ hex: '#E4572E', weight: 100, source: 'fill' }], fonts: [], logo: null, notes: [], facts: { units: 1, looked: 1, hasText: false, stockOffice: false, pictureOnly: false } }, 'x.pdf')
    expect(p.colors.primary).toBe('#E4572E'); expect(p.colors.accentDerived).toBe(true)
  })
})
