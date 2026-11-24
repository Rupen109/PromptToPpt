import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { Presentation, TextElement } from '@prompttoppt/validation'
import { buildPptx } from './pptx.ts'
import { makeDeck, signUp } from '../test-utils.ts'

async function slideXml(doc: Presentation) {
  const files = unzipSync(new Uint8Array(await buildPptx(doc, async () => null)))
  return Object.entries(files).filter(([n]) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(([, b]) => strFromU8(b)).join('\n')
}
/** the run properties (<a:rPr …>) of the run that holds `text` */
const rPrOf = (xml: string, text: string) => new RegExp(`<a:r><a:rPr([^>]*)>(?:(?!</a:r>).)*<a:t>${text}</a:t>`).exec(xml)?.[1] ?? null
/** one text box on the first slide, with the given role and runs */
function withBox(doc: Presentation, role: TextElement['role'], runs: TextElement['paragraphs'][number]['runs']): Presentation {
  const s = doc.slides[0]!
  const el = { id: 'wf', type: 'text', role, x: 100, y: 100, width: 1200, height: 200, zIndex: 50, rotation: 0, opacity: 1, locked: false, fontSize: 40, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', paragraphs: [{ runs }] } as unknown as TextElement
  return { ...doc, slides: [{ ...s, elements: [...s.elements, el] }, ...doc.slides.slice(1)] }
}

describe('PPTX export: single words keep their own style, and a box is as bold / italic as on screen', () => {
  it('one bold word, one coloured word, one underlined word in a body text', async () => {
    const u = await signUp('pptxwf'); const { doc } = await makeDeck(u.id, 1)
    const xml = await slideXml(withBox(doc, 'body', [{ text: 'Grow ' }, { text: 'revenue', bold: true }, { text: ' with ' }, { text: 'care', color: '#DC2626', underline: true }]))
    expect(rPrOf(xml, 'revenue')).toMatch(/b="1"/)
    expect(rPrOf(xml, 'Grow ')).not.toMatch(/b="1"/)
    expect(rPrOf(xml, 'care')).toMatch(/u="sng"/)
    expect(xml).toMatch(/<a:rPr[^>]*>(?:(?!<\/a:r>).)*<a:srgbClr val="DC2626"\/>(?:(?!<\/a:r>).)*<a:t>care<\/a:t>/)
  })
  it('a subtitle is bold in the file as on screen; a word set to normal weight is not', async () => {
    const u = await signUp('pptxwf'); const { doc } = await makeDeck(u.id, 1)
    const xml = await slideXml(withBox(doc, 'subtitle', [{ text: 'Seed ' }, { text: 'round', bold: false }]))
    expect(rPrOf(xml, 'Seed ')).toMatch(/b="1"/)
    expect(rPrOf(xml, 'round')).not.toMatch(/b="1"/)
  })
  it('a quote is italic in the file; a word set upright is not', async () => {
    const u = await signUp('pptxwf'); const { doc } = await makeDeck(u.id, 1)
    const xml = await slideXml(withBox(doc, 'quote', [{ text: 'Less is ' }, { text: 'more', italic: false }]))
    expect(rPrOf(xml, 'Less is ')).toMatch(/i="1"/)
    expect(rPrOf(xml, 'more')).not.toMatch(/i="1"/)
  })
})

describe('PPTX export: a turned object is turned the same way in PowerPoint', () => {
  it('a box turned -90 (a quarter turn back) is written as 270° (PowerPoint keeps 0..360); an upright box has no turn', async () => {
    const u = await signUp('pptxrot'); const { doc } = await makeDeck(u.id, 1)
    const turned = withBox(doc, 'body', [{ text: 'Sideways' }])
    ;(turned.slides[0]!.elements.at(-1) as { rotation: number }).rotation = -90
    const xml = await slideXml(turned)
    const sp = /<p:sp>(?:(?!<\/p:sp>).)*Sideways(?:(?!<\/p:sp>).)*<\/p:sp>/s.exec(xml)?.[0] ?? ''
    expect(sp).toMatch(/<a:xfrm rot="16200000"/)
    const upright = await slideXml(withBox(doc, 'body', [{ text: 'Upright' }]))
    expect(/<p:sp>(?:(?!<\/p:sp>).)*Upright/s.exec(upright)?.[0] ?? '').not.toMatch(/rot="-/)
  })
})

describe('PPTX export: a mirrored picture or shape is mirrored in PowerPoint; text never is', () => {
  it('a shape flipped left-right and turned writes flipH and its turn on the same frame', async () => {
    const u = await signUp('pptxflip'); const { doc } = await makeDeck(u.id, 1)
    const s0 = doc.slides[0]!
    const shape = { id: 'fl', type: 'shape', shape: 'triangle', x: 100, y: 100, width: 300, height: 200, zIndex: 60, rotation: -30, opacity: 1, locked: false, fill: '#DC2626', radius: 0, flipH: true }
    const txt = { id: 'ft', type: 'text', role: 'body', x: 600, y: 100, width: 600, height: 120, zIndex: 61, rotation: 0, opacity: 1, locked: false, fontSize: 40, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', flipH: true, paragraphs: [{ runs: [{ text: 'NeverMirrored' }] }] }
    const xml = await slideXml({ ...doc, slides: [{ ...s0, elements: [...s0.elements, shape, txt] as never }] })
    expect(xml).toMatch(/<a:xfrm flipH="1" rot="19800000">/)
    expect(/<p:sp>(?:(?!<\/p:sp>).)*NeverMirrored/s.exec(xml)?.[0] ?? '').not.toMatch(/flipH/)
  })
})

describe('PPTX export: borders and lines as on screen', () => {
  it('a dashed border is PowerPoint\'s dash, a dotted line its dot; a line is straight and as thick as on screen; a gradient shape keeps its border', async () => {
    const u = await signUp('pptxdash'); const { doc } = await makeDeck(u.id, 1)
    const s0 = doc.slides[0]!
    const base = { zIndex: 60, rotation: 0, opacity: 1, locked: false, radius: 0 }
    const els = [
      { ...base, id: 'd1', type: 'shape', shape: 'rect', x: 100, y: 100, width: 300, height: 200, fill: '#FFFFFF', stroke: '#111111', strokeWidth: 4, strokeDash: 'dash' },
      { ...base, id: 'd2', type: 'shape', shape: 'line', x: 100, y: 500, width: 600, height: 8, fill: '#DC2626', strokeDash: 'dot' },
      { ...base, id: 'd3', type: 'shape', shape: 'rect', x: 900, y: 100, width: 300, height: 200, fill: '#FFFFFF', gradient: { from: '#000000', to: '#FFFFFF', angle: 90 }, stroke: '#2563EB', strokeWidth: 6 },
    ]
    const xml = await slideXml({ ...doc, slides: [{ ...s0, elements: [...s0.elements, ...els] as never }] })
    expect(xml).toMatch(/<a:prstDash val="dash"\/>/)
    expect(xml).toMatch(/<a:prstDash val="sysDot"\/>/)
    // the line: no height (straight), 8 px thick = 4 pt (50800 EMU: a slide pixel is half a point), through the middle of its box
    const line = /<p:cxnSp>(?:(?!<\/p:cxnSp>).)*<\/p:cxnSp>|<p:sp>(?:(?!<\/p:sp>).)*prst="line"(?:(?!<\/p:sp>).)*<\/p:sp>/s.exec(xml)?.[0] ?? ''
    expect(line).toMatch(/<a:ext cx="\d+" cy="0"\/>/)
    expect(line).toMatch(/<a:ln w="50800"/)
    // the gradient shape: its picture AND an outline in its border colour
    expect(xml).toMatch(/<a:srgbClr val="2563EB"\/>/)
  })
})

describe('PPTX export: line spacing as on screen (measured in real PowerPoint, 2026-11-23)', () => {
  it('PowerPoint\'s 1.0 is 1.2 × the size, so the file writes the screen\'s line height ÷ 1.2; a box with none set gets the deck\'s normal 1.3', async () => {
    const u = await signUp('pptxlh'); const { doc } = await makeDeck(u.id, 1)
    const unset = await slideXml(withBox(doc, 'body', [{ text: 'NormalSpacing' }]))
    const box = (xml: string, word: string) => xml.split('<p:sp>').find((sp) => sp.includes(word)) ?? ''
    const val = (sp: string) => Number(/<a:lnSpc><a:spcPct val="(\d+)"\/>/.exec(sp)?.[1])
    expect(val(box(unset, 'NormalSpacing'))).toBeCloseTo(108333, -2) // 1.3 / 1.2
    const dbl = { ...doc, slides: [{ ...doc.slides[0]!, elements: [...doc.slides[0]!.elements, { id: 'dl', type: 'text', role: 'body', x: 100, y: 400, width: 800, height: 200, zIndex: 51, rotation: 0, opacity: 1, locked: false, fontSize: 40, align: 'left', valign: 'top', color: 'textPrimary', bullet: '•', lineHeight: 2, paragraphs: [{ runs: [{ text: 'DoubleSpaced' }] }] }] as never }] }
    expect(val(box(await slideXml(dbl), 'DoubleSpaced'))).toBeCloseTo(166667, -2) // 2 / 1.2
  })
})

describe('PPTX export: text effects as on screen', () => {
  it('a highlighted word has PowerPoint\'s highlight; the box\'s outline is on its letters and its shadow under them', async () => {
    const u = await signUp('pptxfx'); const { doc } = await makeDeck(u.id, 1)
    const fx = withBox(doc, 'body', [{ text: 'Grow ' }, { text: 'Marked', highlight: '#FFF176' } as never, { text: ' rest' }])
    const el = fx.slides[0]!.elements.at(-1) as unknown as Record<string, unknown>
    el['textShadow'] = 'soft'; el['textOutline'] = { color: '#DC2626', width: 2 }
    const xml = await slideXml(fx)
    const sp = xml.split('<p:sp>').find((x) => x.includes('Marked')) ?? ''
    expect(sp).toMatch(/<a:highlight><a:srgbClr val="FFF176"\/><\/a:highlight>(?:(?!<\/a:r>).)*<a:t>Marked<\/a:t>/s)
    expect(sp).toMatch(/<a:ln w="12700"><a:solidFill><a:srgbClr val="DC2626"\/>/) // 2 px = 1 pt
    expect(sp).toMatch(/<a:outerShdw[^>]*dir="5400000"/)
  })
})

describe('PPTX export: justified text is justified in PowerPoint', () => {
  it('algn="just" on its paragraphs', async () => {
    const u = await signUp('pptxjust'); const { doc } = await makeDeck(u.id, 1)
    const j = withBox(doc, 'body', [{ text: 'JustifiedWords' }]); (j.slides[0]!.elements.at(-1) as { align: string }).align = 'justify'
    const sp = (await slideXml(j)).split('<p:sp>').find((x) => x.includes('JustifiedWords')) ?? ''
    expect(sp).toMatch(/algn="just"/)
  })
})

describe('PPTX export: a shape\'s shadow', () => {
  it('an outer shadow straight down on the shape, the pictures\' soft preset', async () => {
    const u = await signUp('pptxshsh'); const { doc } = await makeDeck(u.id, 1)
    const s0 = doc.slides[0]!
    const el = { id: 'ss', type: 'shape', shape: 'rect', x: 100, y: 100, width: 300, height: 200, zIndex: 60, rotation: 0, opacity: 1, locked: false, fill: '#2563EB', radius: 0, shadow: 'soft', label: 'ShadowedBox' }
    const xml = await slideXml({ ...doc, slides: [{ ...s0, elements: [...s0.elements, el] as never }] })
    const sp = xml.split('<p:sp>').find((x) => x.includes('2563EB')) ?? ''
    expect(sp).toMatch(/<a:outerShdw[^>]*dist="50800"[^>]*dir="5400000"/) // 8 px down = 4 pt
  })
})

describe('gradient picture: radial = the middle\'s colour fading to the corners (as CSS radial-gradient)', () => {
  it('centre is the start colour, a corner the end colour, half-way between', async () => {
    const { gradientPng } = await import('./png.ts')
    const sharp = (await import('sharp')).default
    const png = Buffer.from(gradientPng('#FF0000', '#0000FF', 0, 1, 96, 'radial').split('base64,')[1]!, 'base64')
    const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => { const i = (y * 96 + x) * 4; return [data[i], data[i + 1], data[i + 2]] }
    expect(px(48, 48)[0]).toBeGreaterThan(240); expect(px(48, 48)[2]).toBeLessThan(15)
    expect(px(0, 0)[2]).toBeGreaterThan(240); expect(px(95, 95)[0]).toBeLessThan(15)
  })
})

describe('PPTX export: a picture\'s rounded corners', () => {
  it('a plain photo with the deck\'s radius is a rounded rectangle in PowerPoint and stays a JPEG (no PNG baking)', async () => {
    const u = await signUp('pptxrr'); const { doc } = await makeDeck(u.id, 1)
    const s0 = doc.slides[0]!
    const jpeg = Buffer.from(await (await import('sharp')).default({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 80, b: 40 } } }).jpeg().toBuffer())
    const el = { id: 'rr', type: 'image', x: 100, y: 100, width: 800, height: 400, zIndex: 60, rotation: 0, opacity: 1, locked: false, src: 'https://images.example/p.jpg', alt: 'p', fit: 'cover', clip: 'none', radius: 20 }
    const file = await buildPptx({ ...doc, slides: [{ ...s0, elements: [...s0.elements, el] as never }] }, async () => ({ data: `image/jpeg;base64,${jpeg.toString('base64')}`, w: 64, h: 48 }))
    const files = unzipSync(new Uint8Array(file))
    const xml = Object.entries(files).filter(([n]) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(([, b]) => strFromU8(b)).join('')
    expect(xml).toMatch(/name="[^"]*rr"[\s\S]*?<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 5000"\/>/)
    expect(Object.keys(files).some((n) => /^ppt\/media\/.*\.jpe?g$/.test(n))).toBe(true)
  })
})
