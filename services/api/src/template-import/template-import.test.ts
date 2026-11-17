import { strToU8, zipSync } from 'fflate'
import PptxGenJS from 'pptxgenjs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { CANVAS, presentationSchema } from '@prompttoppt/validation'
import { fitText, sanitizeFill, tooLong, type TemplateSceneSlots, type TemplateSlot as DeckSlot } from '../generation/template-deck.ts'
import { SourceError } from '../sources/errors.ts'
import { encodePng } from '../export/png.ts'
import { mapFont, weightHint } from './fonts.ts'
import { apply, groupMap, IDENT, mul, place, readXfrm } from './geom.ts'
import { aspectFor, parsePptxTemplate } from './parse.ts'
import { customGeometry, presetGeometry } from './presets.ts'
import { cxn, group, miniPptx, para, phShape, picture, relsXml, sp, testPng } from './test-fixtures.ts'
import { pendingRef, type UploadedTemplate } from './types.ts'
import { parseXml, findAll } from './xml.ts'

const E = 12700 // one point in EMU; the 16:9 test canvas is 960 x 540 pt, which is 1920 x 1080 canvas px (2 px per point)
const b = (x: number, y: number, w: number, h: number) => ({ x: x * E, y: y * E, w: w * E, h: h * E })
const imp = async (buf: Uint8Array, name = 'deck.pptx') => (await parsePptxTemplate(buf, name)).template
const els = (t: UploadedTemplate, slide = 0) => t.slides[slide]!.slide.elements
const wide = { cx: 960 * E, cy: 540 * E }

describe('units and canvas', () => {
  it('picks the nearest aspect ratio and says when the slide had to be fitted', () => {
    expect(aspectFor(12192000, 6858000)).toEqual({ aspect: '16:9', fitted: false })
    expect(aspectFor(9144000, 6858000)).toEqual({ aspect: '4:3', fitted: false })
    expect(aspectFor(1000, 1000)).toEqual({ aspect: '1:1', fitted: false })
    expect(aspectFor(16, 10)).toEqual({ aspect: '16:9', fitted: true })
  })
  it('converts EMU to canvas px on a 16:9 and a 4:3 file (2 px per point on both)', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [sp(2, 'r', b(100, 50, 200, 100), { fill: 'FF0000' })] }))
    expect(t.aspect).toBe('16:9')
    expect(els(t).find((e) => e.type === 'shape')).toMatchObject({ x: 200, y: 100, width: 400, height: 200 })
    const t43 = await imp(miniPptx({ size: { cx: 720 * E, cy: 540 * E }, slides: [sp(2, 'r', b(100, 50, 200, 100), { fill: 'FF0000' })] }))
    expect(t43.aspect).toBe('4:3')
    expect(t43.canvas).toMatchObject({ width: CANVAS['4:3'].width, height: 1080, fitted: false })
    expect(els(t43).find((e) => e.type === 'shape')).toMatchObject({ x: 200, y: 100, width: 400, height: 200 })
  })
  it('fits a 16:10 file onto the 16:9 canvas without stretching it', async () => {
    const t = await imp(miniPptx({ size: { cx: 1600 * E, cy: 1000 * E }, slides: [sp(2, 'r', b(0, 0, 1600, 1000), { fill: 'FF0000' })] }))
    expect(t.canvas.fitted).toBe(true)
    expect(t.warnings.join(' ')).toMatch(/fitted/)
    const r = els(t).find((e) => e.type === 'shape')!
    expect(r.width / r.height).toBeCloseTo(1.6, 2) // same shape as the original
    expect(r.x).toBeGreaterThan(0) // centred
  })
})

describe('inheritance: slide -> layout -> master', () => {
  it('a placeholder with no position or size of its own takes them, and its text style, from the master', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [phShape(2, 'Title 1', 'type="title"', null, 'Quarterly review') + phShape(3, 'Content', 'idx="1"', null, 'First point')] }))
    const [title, body] = els(t) as Extract<ReturnType<typeof els>[number], { type: 'text' }>[]
    expect(title).toMatchObject({ type: 'text', role: 'title', fontSize: 88, weight: 700, align: 'left' }) // 44 pt bold from titleStyle
    expect(title!.x).toBeCloseTo(0.07 * 1920 + 14.4, 0) // the master's title box (7% of the slide) less the 0.1 inch text inset
    expect(title!.width).toBeCloseTo(0.86 * 1920 - 28.8, 0)
    expect(body!.fontSize).toBe(56) // 28 pt from bodyStyle
    expect(body!.paragraphs[0]!.list).toBe('bullet') // the master's bullet
    expect(body!.y).toBeGreaterThan(title!.y + title!.height)
  })
  it('the slide wins over the layout and the master (own size, colour, alignment)', async () => {
    const own = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${100 * E}" y="${40 * E}"/><a:ext cx="${400 * E}" cy="${60 * E}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="3000" b="0"><a:solidFill><a:srgbClr val="FF8800"/></a:solidFill></a:rPr><a:t>Own style</a:t></a:r></a:p></p:txBody></p:sp>`
    const t = await imp(miniPptx({ size: wide, slides: [own] }))
    expect(els(t)[0]).toMatchObject({ type: 'text', x: 214.4, y: 87.2, width: 771.2, height: 105.6, fontSize: 60, align: 'center', color: '#FF8800', weight: 300 }) // the box less the default text insets; the master's heading font is "Calibri Light", so its weight is light
  })
  it('the layout placeholder position is used when the slide has none, and a layout list style beats the master', async () => {
    const layout = phShape(2, 'Title 1', 'type="title"', { x: 50 * E, y: 20 * E, w: 300 * E, h: 50 * E }, 'T') + phShape(3, 'Content', 'idx="1"', { x: 60 * E, y: 120 * E, w: 500 * E, h: 300 * E }, 'B').replace('<a:lstStyle/>', '<a:lstStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></a:lstStyle>')
    const t = await imp(miniPptx({ size: wide, layoutShapes: layout, slides: [phShape(2, 'Title 1', 'type="title"', null, 'Hello') + phShape(3, 'Content', 'idx="1"', null, 'World')] }))
    const [title, body] = els(t)
    expect(title).toMatchObject({ x: 114.4, y: 47.2, width: 571.2, height: 85.6 })
    expect(body).toMatchObject({ x: 134.4, y: 247.2, width: 971.2, fontSize: 40 })
  })
  it('master and layout graphics are drawn under the slide, in order, and "hide background graphics" removes them', async () => {
    const t = await imp(miniPptx({ size: wide, masterShapes: sp(20, 'band', b(0, 500, 960, 40), { fill: '112233' }), layoutShapes: sp(21, 'stripe', b(0, 0, 20, 540), { fill: '445566' }), slides: [sp(2, 'card', b(100, 100, 100, 100), { fill: '778899' }), sp(2, 'card', b(100, 100, 100, 100), { fill: '778899' })], slideAttrs: { 1: 'showMasterSp="0"' } }))
    expect(els(t, 0).filter((e) => e.type === 'shape').map((e) => e.fill)).toEqual(['#112233', '#445566', '#778899'])
    expect(els(t, 1).filter((e) => e.type === 'shape').map((e) => e.fill)).toEqual(['#778899'])
    const decor = t.slides[0]!.decor
    expect(decor.length).toBe(3) // every shape is decoration
  })
  it('the shape style (fill and font reference) colours shapes made in PowerPoint without their own fill', async () => {
    const style = '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef><a:fillRef idx="1"><a:schemeClr val="accent2"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>'
    const shape = sp(2, 'Rect', b(100, 100, 200, 100), { style, text: '<a:p><a:r><a:rPr lang="en-US" sz="2000"/><a:t>White on orange</a:t></a:r></a:p>' }).replace('<a:noFill/>', '').replace('<a:ln><a:noFill/></a:ln>', '')
    const t = await imp(miniPptx({ size: wide, slides: [shape] }))
    expect(els(t).find((e) => e.type === 'shape')).toMatchObject({ fill: '#F97316' }) // accent2
    expect(els(t).find((e) => e.type === 'text')).toMatchObject({ color: '#FFFFFF' })
  })
  it('scheme colours follow the master colour map (a dark master maps bg1 to dk1)', async () => {
    const dark = `<p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    const buf = miniPptx({ size: wide, masterBg: dark, slides: [phShape(2, 'Title 1', 'type="title"', null, 'On dark')] })
    // swap the master's colour map: bg1 = dk1, tx1 = lt1
    const files = (await import('fflate')).unzipSync(buf)
    const m = new TextDecoder().decode(files['ppt/slideMasters/slideMaster1.xml']).replace('bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"', 'bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"')
    files['ppt/slideMasters/slideMaster1.xml'] = strToU8(m)
    const t = await imp(zipSync(files))
    expect(t.slides[0]!.slide.background).toMatchObject({ type: 'color', value: '#000000' })
    expect(els(t)[0]).toMatchObject({ color: '#FFFFFF' })
    expect(t.theme.colors.background).toBe('#000000')
  })
})

describe('groups, rotation and flips', () => {
  it('a group scales its children from the child space to its own extent', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [group(10, 'G', { x: 100 * E, y: 100 * E }, { w: 400 * E, h: 200 * E }, { x: 0, y: 0, w: 100 * E, h: 100 * E }, sp(11, 'a', b(10, 10, 50, 20), { fill: 'FF0000' }))] }))
    expect(els(t).find((e) => e.type === 'shape')).toMatchObject({ x: 2 * (100 + 40), y: 2 * (100 + 20), width: 2 * 200, height: 2 * 40 })
  })
  it('nested groups compose, and a rotated group turns what is in it about its own centre', () => {
    const outer = groupMap({ x: 0, y: 0, w: 200, h: 100, rot: 90, flipH: false, flipV: false, chX: 0, chY: 0, chW: 200, chH: 100 })
    // a child at the top-left corner of a 200x100 box rotated 90 deg clockwise about (100, 50) lands at the top-right of a 100x200 footprint
    const [x, y] = apply(outer, 0, 0)
    expect(x).toBeCloseTo(150, 6); expect(y).toBeCloseTo(-50, 6)
    const inner = groupMap({ x: 10, y: 10, w: 100, h: 50, rot: 0, flipH: false, flipV: false, chX: 0, chY: 0, chW: 50, chH: 25 })
    const both = mul(outer, inner)
    const p = place(both, { x: 0, y: 0, w: 10, h: 10, rot: 0, flipH: false, flipV: false, chX: 0, chY: 0, chW: 0, chH: 0 })
    expect(p.rot).toBeCloseTo(90, 6) // the group's rotation
    expect(p.w).toBeCloseTo(20, 6); expect(p.h).toBeCloseTo(20, 6) // scaled 2x
  })
  it('a mirrored group flips its children and reverses their own rotation', () => {
    const g = groupMap({ x: 0, y: 0, w: 100, h: 100, rot: 0, flipH: true, flipV: false, chX: 0, chY: 0, chW: 100, chH: 100 })
    const p = place(g, { x: 10, y: 10, w: 20, h: 20, rot: 30, flipH: false, flipV: false, chX: 0, chY: 0, chW: 0, chH: 0 })
    expect(p.cx).toBeCloseTo(80, 6) // 20 from the right edge now
    expect(p.flipH).toBe(true)
    expect(p.rot).toBeCloseTo(330, 6) // -30
  })
  it('end to end: a rotated group and a rotated shape inside a scaled group', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [group(10, 'G', { x: 300 * E, y: 100 * E }, { w: 200 * E, h: 100 * E }, { x: 0, y: 0, w: 200 * E, h: 100 * E }, sp(11, 'a', b(0, 0, 100, 100), { fill: 'FF0000', rot: 10 }), { rot: 20 })] }))
    const a = els(t).find((e) => e.type === 'shape')!
    expect(a.rotation).toBeCloseTo(30, 1)
    expect(a.width).toBe(200); expect(a.height).toBe(200)
  })
  it('lines and connectors keep their direction through flips, as a thin rotated rectangle', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [cxn(2, b(100, 100, 200, 100), '000000', 25400) + cxn(3, b(100, 100, 200, 100), 'FF0000', 25400, { flipV: true })] }))
    const [down, up] = els(t).filter((e) => e.type === 'shape')
    expect(down!.shape).toBe('line')
    expect(down!.rotation).toBeCloseTo(26.57, 1) // atan(100/200)
    expect(up!.rotation).toBeCloseTo(-26.57, 1)
    expect(down!.height).toBe(4) // 2 pt line = 4 px
    expect(down!.width).toBeCloseTo(Math.hypot(400, 200), 0)
  })
})

describe('shapes', () => {
  it('maps preset shapes, rounded corners, arrows and custom outlines into the editor shape model', () => {
    expect(presetGeometry('roundRect', { adj: 50000 }, 200, 100)).toEqual({ kind: 'basic', shape: 'rect', radius: 50 })
    expect(presetGeometry('ellipse', {}, 10, 10)).toEqual({ kind: 'basic', shape: 'ellipse' })
    expect(presetGeometry('rightArrow', {}, 200, 100).kind).toBe('poly')
    expect(presetGeometry('star5', {}, 100, 100)).toEqual({ kind: 'path', id: 'star5' })
    expect(presetGeometry('donut', {}, 100, 100)).toMatchObject({ kind: 'ring' })
    expect(presetGeometry('arc', {}, 100, 100).kind).toBe('none')
    expect(presetGeometry('somethingNew', {}, 100, 100).kind).toBe('rect-fallback')
  })
  it('flattens custom geometry (lines, curves) to at most 64 corners, as fractions of the box', () => {
    const x = parseXml('<spPr><custGeom><pathLst><path w="100" h="100"><moveTo><pt x="0" y="0"/></moveTo><lnTo><pt x="100" y="0"/></lnTo><cubicBezTo><pt x="100" y="60"/><pt x="60" y="100"/><pt x="0" y="100"/></cubicBezTo><close/></path></pathLst></custGeom></spPr>')
    const g = customGeometry(findAll(x, 'spPr')[0])!
    expect(g.points.length).toBeGreaterThan(5); expect(g.points.length).toBeLessThanOrEqual(64)
    expect(Math.max(...g.points.flat())).toBeLessThanOrEqual(1.0001)
    expect(customGeometry(findAll(parseXml('<spPr><custGeom><pathLst><path w="100" h="100"><moveTo><pt x="l" y="t"/></moveTo></path></pathLst></custGeom></spPr>'), 'spPr')[0])).toBeNull()
  })
  it('a custom outline with 130,000 points is simplified to 64 corners, and one unreadable object never fails the whole slide', async () => {
    const pts = Array.from({ length: 130000 }, (_, i) => `<a:lnTo><a:pt x="${i % 1000}" y="${(i * 7) % 1000}"/></a:lnTo>`).join('')
    const cg = `<a:custGeom><a:avLst/><a:pathLst><a:path w="1000" h="1000"><a:moveTo><a:pt x="0" y="0"/></a:moveTo>${pts}<a:close/></a:path></a:pathLst></a:custGeom>`
    const t = await imp(miniPptx({ size: wide, slides: [sp(2, 'big', b(0, 0, 100, 100), { fill: 'FF0000', custGeom: cg }) + sp(3, 'ok', b(200, 0, 100, 100), { fill: '00FF00' })] }))
    const shapes = els(t).filter((e) => e.type === 'shape')
    expect(shapes).toHaveLength(2)
    expect(shapes[0]!.points!.length).toBeLessThanOrEqual(64)
  }, 30_000)
  it('fill, gradient, outline, opacity and rotation are kept; an invisible shape is dropped', async () => {
    const grad = '<a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="5400000"/></a:gradFill>'
    const alpha = '<a:solidFill><a:srgbClr val="00FF00"><a:alpha val="40000"/></a:srgbClr></a:solidFill>'
    const t = await imp(miniPptx({ size: wide, slides: [sp(2, 'g', b(10, 10, 100, 100), { fillXml: grad, line: '000000', lineW: 25400 }) + sp(3, 'a', b(200, 10, 100, 100), { fillXml: alpha, rot: 45 }) + sp(4, 'none', b(300, 10, 100, 100), {})] }))
    const [g, a, ...rest] = els(t)
    expect(g).toMatchObject({ gradient: { from: '#FF0000', to: '#0000FF', angle: 180 }, stroke: '#000000', strokeWidth: 4 })
    expect(a).toMatchObject({ fill: '#00FF00', opacity: 0.4, rotation: 45 })
    expect(rest).toHaveLength(0)
  })
  it('a multi-stop gradient background is drawn once as a picture (the editor gradient has two colours)', async () => {
    const bg = '<p:bg><p:bgPr><a:gradFill><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="50000"><a:srgbClr val="00FF00"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="0"/></a:gradFill><a:effectLst/></p:bgPr></p:bg>'
    const r = await parsePptxTemplate(miniPptx({ size: wide, slideBg: { 0: bg }, slides: [sp(2, 'x', b(0, 0, 10, 10), { fill: '000000' })] }), 'g.pptx')
    const s = r.template.slides[0]!.slide
    expect(s.background?.type).toBe('image')
    expect(r.pictures).toHaveLength(1)
    const raw = await sharp(r.pictures[0]!.bytes).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number) => [raw.data[(x * raw.info.channels)]!, raw.data[x * raw.info.channels + 1]!, raw.data[x * raw.info.channels + 2]!]
    expect(px(2)[0]).toBeGreaterThan(220) // red on the left
    expect(px(raw.info.width - 3)[2]).toBeGreaterThan(220) // blue on the right
    expect(px(Math.round(raw.info.width / 2))[1]).toBeGreaterThan(200) // green in the middle
  })
})

describe('text', () => {
  it('keeps mixed runs (bold, italic, underline, colour), bullets, alignment, anchor and line spacing', async () => {
    const text = `<a:p><a:pPr algn="ctr"><a:lnSpc><a:spcPct val="150000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" sz="2000" b="1"/><a:t>Bold </a:t></a:r><a:r><a:rPr lang="en-US" sz="2000"><a:solidFill><a:srgbClr val="CC0000"/></a:solidFill></a:rPr><a:t>red </a:t></a:r><a:r><a:rPr lang="en-US" sz="2000" i="1" u="sng"/><a:t>italic</a:t></a:r></a:p>${para('One', { bullet: true, sz: 20 })}${para('Two', { bullet: true, sz: 20 })}`
    const t = await imp(miniPptx({ size: wide, slides: [sp(2, 'tb', b(100, 100, 400, 200), { txBox: true, text, body: ' wrap="square" anchor="ctr"' })] }))
    const el = els(t)[0]! as Extract<ReturnType<typeof els>[number], { type: 'text' }>
    expect(el).toMatchObject({ fontSize: 40, align: 'center', valign: 'middle', lineHeight: 1.8 })
    expect(el.paragraphs[0]!.runs).toEqual([{ text: 'Bold ', bold: true }, { text: 'red ', color: '#CC0000' }, { text: 'italic', italic: true, underline: true }])
    expect(el.paragraphs.map((p) => p.list)).toEqual([undefined, 'bullet', 'bullet'])
  })
  it('applies autofit shrink (fontScale), insets, and widens a box whose text does not wrap', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [
      sp(2, 'shrunk', b(100, 100, 300, 100), { txBox: true, text: para('Shrunk text', { sz: 40 }), bodyInner: '<a:normAutofit fontScale="50000" lnSpcReduction="20000"/>' }) +
      sp(3, 'inset', b(100, 300, 300, 100), { txBox: true, text: para('Inset', { sz: 20 }), body: ' wrap="square" lIns="127000" tIns="63500" rIns="127000" bIns="63500"' }) +
      sp(4, 'nowrap', b(100, 450, 50, 30), { txBox: true, text: para('This line never wraps', { sz: 20 }), body: ' wrap="none"' }),
    ] }))
    const [shrunk, inset, nowrap] = els(t) as Extract<ReturnType<typeof els>[number], { type: 'text' }>[]
    expect(shrunk!.fontSize).toBe(40) // 40 pt x 50% = 20 pt = 40 px
    expect(inset).toMatchObject({ x: 200 + 20, y: 600 + 10, width: 600 - 40, height: 200 - 20 }) // 10 pt side and 5 pt top insets
    expect(nowrap!.width).toBeGreaterThan(300)
  })
  it('uses the heading font role only for the theme\'s heading font, and records fonts that were replaced', async () => {
    const t = await imp(miniPptx({ size: wide, theme: { major: 'Segoe UI Semibold', minor: 'Calibri' }, slides: [phShape(2, 'Title 1', 'type="title"', null, 'Heading text') + phShape(3, 'Content', 'idx="1"', null, 'Body text')] }))
    expect(t.theme.fonts).toEqual({ heading: 'Inter', body: 'Calibri' })
    expect(t.fonts.find((f) => f.original === 'Segoe UI Semibold')).toMatchObject({ mapped: 'Inter', replaced: true, role: 'heading' })
    expect(t.fonts.find((f) => f.original === 'Calibri')).toMatchObject({ mapped: 'Calibri', replaced: false, role: 'body' })
    expect(t.warnings.join(' ')).toMatch(/Segoe UI Semibold became Inter/)
    expect((els(t)[0] as { role: string }).role).toBe('title')
    expect((els(t)[1] as { role: string }).role).toBe('body')
  })
  it('hyperlinks keep only real http(s) targets', async () => {
    const link = `<a:p><a:r><a:rPr lang="en-US" sz="2000"><a:hlinkClick r:id="rId7"/></a:rPr><a:t>site</a:t></a:r><a:r><a:rPr lang="en-US" sz="2000"><a:hlinkClick r:id="rId8"/></a:rPr><a:t> bad</a:t></a:r></a:p>`
    const t = await imp(miniPptx({ size: wide, slides: [sp(2, 'l', b(10, 10, 300, 50), { txBox: true, text: link })], slideRels: { 0: [{ id: 'rId7', type: 'hyperlink', target: 'https://example.com/a', external: true }, { id: 'rId8', type: 'hyperlink', target: 'javascript:alert(1)', external: true }] } }))
    const runs = (els(t)[0] as { paragraphs: { runs: { link?: string }[] }[] }).paragraphs[0]!.runs
    expect(runs[0]!.link).toBe('https://example.com/a')
    expect(runs[1]!.link).toBeUndefined()
  })
  it('maps fonts to the nearest supported one and keeps the weight a name implies', () => {
    expect(mapFont('Calibri')).toEqual({ original: 'Calibri', mapped: 'Calibri', replaced: false })
    expect(mapFont('Calibri Light')).toMatchObject({ mapped: 'Calibri', replaced: false })
    expect(mapFont('arial')).toMatchObject({ mapped: 'Arial', replaced: false })
    expect(mapFont('Segoe UI')).toMatchObject({ mapped: 'Inter', replaced: true })
    expect(mapFont('Cambria')).toMatchObject({ mapped: 'Lora', replaced: true })
    expect(mapFont('Impact')).toMatchObject({ mapped: 'Anton', replaced: true })
    expect(mapFont('Consolas')).toMatchObject({ mapped: 'Space Mono', replaced: true })
    expect(mapFont('Some Unknown Serif Display')).toMatchObject({ mapped: 'Lora', replaced: true })
    expect(mapFont('Totally Unknown')).toMatchObject({ mapped: 'Inter', replaced: true })
    expect(weightHint('Segoe UI Light')).toBe(300); expect(weightHint('Arial Black')).toBe(900); expect(weightHint('Calibri')).toBeNull()
  })
})

describe('pictures', () => {
  // left half red, right half blue
  const halves = () => { const w = 200, h = 100, px = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; px[i] = x < w / 2 ? 255 : 0; px[i + 2] = x < w / 2 ? 0 : 255; px[i + 3] = 255 } return new Uint8Array(encodePng(w, h, px)) }
  const mean = async (bytes: Uint8Array) => (await sharp(bytes).stats()).channels.map((c) => Math.round(c.mean))
  const deck = (pic: string) => miniPptx({ size: wide, slides: [pic], slideRels: { 0: [{ id: 'rId5', type: 'image', target: '../media/p.png' }] }, media: { 'p.png': halves() } })

  it('bakes the crop (srcRect) into the stored picture and stretches it to its box', async () => {
    const r = await parsePptxTemplate(deck(picture(2, 'Pic', b(100, 100, 100, 100), 'rId5', { crop: { l: 50 } })), 'p.pptx') // keep only the blue half
    const [red, , blue] = await mean(r.pictures[0]!.bytes)
    expect(red!).toBeLessThan(10); expect(blue!).toBeGreaterThan(245)
    const img = els(r.template).find((e) => e.type === 'image')!
    expect(img).toMatchObject({ width: 200, height: 200, fit: 'cover', radius: 0 })
    expect(r.pictures[0]!.width / r.pictures[0]!.height).toBeCloseTo(1, 1) // stretched to the 1:1 box, as PowerPoint does
    expect(pendingRef((img as { src?: string }).src)).toBe(r.pictures[0]!.ref)
  })
  it('flips a mirrored picture and sets circle / rounded masks', async () => {
    const r = await parsePptxTemplate(deck(picture(2, 'Flip', b(100, 100, 100, 50), 'rId5', { flipH: true }) + picture(3, 'Round', b(300, 100, 100, 100), 'rId5', { prst: 'ellipse' })), 'p.pptx')
    const flipped = r.pictures.find((p) => p.width / p.height > 1.5)!
    const raw = await sharp(flipped.bytes).raw().toBuffer({ resolveWithObject: true })
    expect(raw.data[0]!).toBeLessThan(60) // top-left is now the blue side
    expect(els(r.template).find((e) => e.type === 'image' && e.clip === 'circle')).toBeTruthy()
  })
  it('stores nothing hotlinked: every picture src is a pending asset, no external URLs', async () => {
    const r = await parsePptxTemplate(deck(picture(2, 'Pic', b(100, 100, 100, 100), 'rId5')), 'p.pptx')
    for (const e of els(r.template)) if (e.type === 'image') expect(e.src).toMatch(/^https:\/\/pending-asset\.invalid\//)
  })
  it('a picture that cannot be decoded becomes the editor placeholder with a warning, never a crash', async () => {
    const buf = miniPptx({ size: wide, slides: [picture(2, 'Bad', b(100, 100, 100, 100), 'rId5')], slideRels: { 0: [{ id: 'rId5', type: 'image', target: '../media/p.png' }] }, media: { 'p.png': strToU8('this is not a picture') } })
    const t = await imp(buf)
    const img = els(t).find((e) => e.type === 'image')!
    expect((img as { src?: string }).src).toBeUndefined()
    expect(t.slides[0]!.warnings.join(' ')).toMatch(/placeholder/)
  })
  it('a decompression-bomb picture (huge pixel count in a small file) is refused by the pixel limit', async () => {
    const w = 9000, h = 9000 // 81 megapixels of one colour: a few KB as PNG, far over the limit
    const png = await sharp({ create: { width: w, height: h, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer()
    const t = await imp(miniPptx({ size: wide, slides: [picture(2, 'Bomb', b(100, 100, 100, 100), 'rId5')], slideRels: { 0: [{ id: 'rId5', type: 'image', target: '../media/p.png' }] }, media: { 'p.png': new Uint8Array(png) } }))
    expect((els(t).find((e) => e.type === 'image') as { src?: string }).src).toBeUndefined()
    expect(t.warnings.join(' ')).toMatch(/could not be imported/)
  }, 30_000)
  it('marks a big unique photo replaceable and logos / repeated pictures as design', async () => {
    const logo = picture(3, 'Logo', b(860, 20, 60, 30), 'rId5')
    const slides = [0, 1, 2, 3].map((i) => (i === 0 ? picture(2, 'Hero', b(300, 100, 500, 300), 'rId6') : '') + logo + sp(9, 't', b(20, 20, 200, 40), { txBox: true, text: para(`Slide ${i}`, { sz: 24 }) }))
    const rel = (i: number) => [{ id: 'rId5', type: 'image', target: '../media/logo.png' }, ...(i === 0 ? [{ id: 'rId6', type: 'image', target: '../media/hero.png' }] : [])]
    const t = await imp(miniPptx({ size: wide, slides, slideRels: { 0: rel(0), 1: rel(1), 2: rel(2), 3: rel(3) }, media: { 'logo.png': testPng(60, 30), 'hero.png': halves() } }))
    const pics = t.slides[0]!.pictures
    expect(pics.find((p) => p.width > 500)).toMatchObject({ replaceable: true, kind: 'photo' })
    expect(pics.find((p) => p.width < 200)).toMatchObject({ replaceable: false, kind: 'logo' })
    expect(t.slides[0]!.decor).toContain(pics.find((p) => p.width < 200)!.elementId)
  })
})

describe('tables, charts, SmartArt', () => {
  const tbl = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="T"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${100 * E}" y="${100 * E}"/><a:ext cx="${400 * E}" cy="${120 * E}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="1"/><a:gridCol w="1"/></a:tblGrid>${[['Plan', 'Price'], ['Starter', '$10'], ['Team', '$40']].map((r, i) => `<a:tr h="1">${r.map((c) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${c}</a:t></a:r></a:p></a:txBody><a:tcPr>${i === 0 ? '<a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill>' : ''}</a:tcPr></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  it('imports a table as a table element with its header, rows and header colour', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [tbl] }))
    expect(els(t)[0]).toMatchObject({ type: 'table', header: ['Plan', 'Price'], rows: [['Starter', '$10'], ['Team', '$40']], headerFill: '#1F4E79', x: 200, y: 200, width: 800, height: 240 })
  })
  it('cuts a table that is wider than the model allows, and says so', async () => {
    const wideTbl = tbl.replace('<a:gridCol w="1"/><a:gridCol w="1"/>', '<a:gridCol w="1"/>'.repeat(10)).replace(/<a:tr h="1">(.*?)<\/a:tr>/g, (_m, cells: string) => `<a:tr h="1">${cells.repeat(5)}</a:tr>`)
    const t = await imp(miniPptx({ size: wide, slides: [wideTbl] }))
    expect((els(t)[0] as { header: string[] }).header).toHaveLength(8)
    expect(t.slides[0]!.warnings.join(' ')).toMatch(/cut to 8/)
  })
  it('imports a bar chart as a chart element', async () => {
    const chart = `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Revenue</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>25</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`
    const frame = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${100 * E}" y="${100 * E}"/><a:ext cx="${400 * E}" cy="${250 * E}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId6"/></a:graphicData></a:graphic></p:graphicFrame>`
    const t = await imp(miniPptx({ size: wide, slides: [frame], slideRels: { 0: [{ id: 'rId6', type: 'chart', target: '../charts/chart1.xml' }] }, extraFiles: { 'ppt/charts/chart1.xml': chart } }))
    expect(els(t)[0]).toMatchObject({ type: 'chart', chartType: 'bar', labels: ['Q1', 'Q2'], series: [{ name: 'Revenue', values: [10, 25] }] })
    expect(t.warnings.join(' ')).toMatch(/Charts/)
  })
  it('imports the drawing PowerPoint saves for SmartArt as plain shapes, moved to the frame\'s place', async () => {
    const frame = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="Diagram"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${100 * E}" y="${100 * E}"/><a:ext cx="${400 * E}" cy="${200 * E}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rId6" r:lo="rId7" r:qs="rId8" r:cs="rId9"/></a:graphicData></a:graphic></p:graphicFrame>`
    const data = `<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:extLst><a:ext xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="rId10" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst></dgm:dataModel>`
    const drawing = `<dsp:drawing xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/><dsp:sp modelId="{1}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr><a:xfrm><a:off x="${10 * E}" y="${20 * E}"/><a:ext cx="${100 * E}" cy="${50 * E}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="2563EB"/></a:solidFill></dsp:spPr><dsp:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1800"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Step one</a:t></a:r></a:p></dsp:txBody></dsp:sp></dsp:spTree></dsp:drawing>`
    const t = await imp(miniPptx({ size: wide, slides: [frame], slideRels: { 0: [{ id: 'rId6', type: 'diagramData', target: '../diagrams/data1.xml' }, { id: 'rId10', type: 'diagramDrawing', target: '../diagrams/drawing1.xml' }] }, extraFiles: { 'ppt/diagrams/data1.xml': data, 'ppt/diagrams/drawing1.xml': drawing } }))
    const card = els(t).find((e) => e.type === 'shape')!
    expect(card).toMatchObject({ x: 2 * 110, y: 2 * 120, width: 200, height: 100, fill: '#2563EB' })
    expect(els(t).find((e) => e.type === 'text')).toMatchObject({ color: '#FFFFFF' })
    expect(t.warnings.join(' ')).toMatch(/SmartArt/)
  })
})

describe('slots, chrome and decoration', () => {
  const content = (n: number) => phShape(2, 'Title 1', 'type="title"', null, `Slide title ${n}`) + phShape(3, 'Content', 'idx="1"', null, ['Alpha opens the story', 'Beta follows it closely', 'Gamma carries it forward', 'Delta closes the whole thing'][n - 1]!) // one-paragraph body
  it('classifies title, subtitle, bullets, body, numbers, details and labels, with room, lines and sample', async () => {
    const bullets = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${['Fast onboarding', 'Clear pricing', 'Friendly support'].map((x) => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${x}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`
    const slide = phShape(2, 'Title 1', 'type="title"', null, 'Why choose us') + bullets + sp(5, 'Stat', b(100, 400, 200, 80), { txBox: true, text: para('42%', { sz: 54, b: true }) }) + sp(6, 'Mail', b(400, 480, 300, 40), { txBox: true, text: para('hello@example.com', { sz: 16 }) }) + sp(7, 'Card', b(400, 400, 150, 50), { prst: 'roundRect', fill: '2563EB', text: para('Speed', { sz: 16, color: 'FFFFFF' }) })
    const t = await imp(miniPptx({ size: wide, slides: [slide] }))
    const by = (role: string) => t.slides[0]!.slots.filter((s) => s.role === role)
    expect(by('title')[0]).toMatchObject({ sample: 'Why choose us', lines: 1, detail: false, numeric: false, ticker: false })
    expect(by('title')[0]!.maxChars).toBeGreaterThan(12)
    expect(by('bullets')[0]).toMatchObject({ lines: 3 })
    expect(by('bullets')[0]!.maxLines).toBeGreaterThanOrEqual(3)
    expect(by('number')[0]).toMatchObject({ sample: '42%', numeric: true })
    expect(t.slides[0]!.slots.find((s) => s.sample.includes('@'))).toMatchObject({ detail: true })
    expect(by('label')[0]).toMatchObject({ sample: 'Speed' })
    for (const s of t.slides[0]!.slots) expect(s.id).toBe(s.elementId)
    expect(t.slides[0]!.name).toBe('Why choose us')
  })
  it('footer / date placeholders and text repeated on most slides are chrome, not slots; slide numbers become the deck footer', async () => {
    const ftr = (n: number) => phShape(8, 'Footer', 'type="ftr" idx="3"', null, 'Acme Corp confidential') + phShape(9, 'Num', 'type="sldNum" idx="4"', null, String(n))
    const brand = sp(10, 'brand', b(20, 20, 150, 30), { txBox: true, text: para('ACME', { sz: 14, b: true }) })
    const slides = [1, 2, 3, 4].map((n) => content(n) + ftr(n) + brand)
    const t = await imp(miniPptx({ size: wide, slides }))
    for (const s of t.slides) {
      expect(s.slots.map((x) => x.sample)).not.toContain('ACME')
      expect(s.slots.map((x) => x.sample)).not.toContain('Acme Corp confidential')
      expect(s.slots.find((x) => x.role === 'title')).toBeTruthy()
    }
    expect(t.chrome.map((c) => c.sample).sort()).toEqual(['ACME', 'Acme Corp confidential'])
    expect(t.chrome.every((c) => c.refs.length === 4)).toBe(true)
    // slide numbers are not frozen into the slides: the viewer draws them
    expect(els(t).some((e) => e.type === 'text' && e.paragraphs[0]!.runs[0]!.text === '1')).toBe(false)
    expect(t.theme.style?.footer).toBe('number')
  })
  it('exposes the same slot shape as the Morph templates, so fitText / sanitizeFill / tooLong work on it unchanged', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [content(1)] }))
    const slots: DeckSlot[] = t.slides[0]!.slots // (compile-time: assignable to template-deck's TemplateSlot)
    const scenes: TemplateSceneSlots[] = [{ scene: 'slide-1', title: 'one', purpose: 'p', slots }]
    const title = slots.find((s) => s.sample.startsWith('Slide title'))!
    const fill = { title: 'x', chrome: {}, scenes: [{ scene: 'slide-1', fields: { [title.id]: 'A very long new title '.repeat(20) } }] }
    expect(tooLong(fill, scenes)).toHaveLength(1)
    const out = sanitizeFill(fill, scenes, { allowedNumbers: new Set(), figuresAllowed: false })
    expect(out.fields['slide-1']![title.id]!.length).toBeLessThanOrEqual(title.maxChars)
    expect(fitText('short', 100)).toBe('short')
  })
  it('hidden slides are skipped with a note and the slide numbers keep their gap', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [content(1), content(2), content(3)], slideAttrs: { 1: 'show="0"' } }))
    expect(t.slides.map((s) => s.n)).toEqual([1, 3])
    expect(t.stats).toMatchObject({ sourceSlides: 3, importedSlides: 2, hiddenSlides: 1 })
    expect(t.warnings.join(' ')).toMatch(/1 hidden slide was skipped/)
  })
})

describe('limits and safety', () => {
  const header = (n: number) => [...Array(n).keys()].map(() => content())
  const content = () => sp(2, 'x', b(10, 10, 50, 50), { fill: 'FF0000' })
  it('imports at most 80 slides and reports the rest as skipped', async () => {
    const t = await imp(miniPptx({ size: wide, slides: header(85) }))
    expect(t.slides).toHaveLength(80)
    expect(t.stats).toMatchObject({ sourceSlides: 85, importedSlides: 80, skippedSlides: 5 })
    expect(t.warnings.join(' ')).toMatch(/first 80 slides/)
  })
  it('caps a slide at 400 elements, dropping the smallest decoration first and never words', async () => {
    const many = [...Array(450).keys()].map((i) => sp(i + 10, 'd', b(i % 90, Math.floor(i / 90) * 10, 5 + (i % 7), 5), { fill: '123456' })).join('')
    const t = await imp(miniPptx({ size: wide, slides: [many + sp(2, 'words', b(100, 400, 400, 60), { txBox: true, text: para('Keep these words', { sz: 24 }) })] }))
    expect(els(t).length).toBeLessThanOrEqual(400)
    expect(els(t).some((e) => e.type === 'text')).toBe(true)
  })
  it('refuses what is not a readable .pptx with a sentence for the person', async () => {
    const reject = async (bytes: Uint8Array, name: string, re: RegExp) => { const e = await parsePptxTemplate(bytes, name).catch((x: unknown) => x); expect(e).toBeInstanceOf(SourceError); expect((e as Error).message).toMatch(re) }
    await reject(strToU8('plain text'), 'a.pptx', /not a PowerPoint/)
    await reject(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]), 'old.ppt', /Old \.ppt files are not supported/)
    const enc = new Uint8Array(4096); enc.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); enc.set(Buffer.from('EncryptedPackage', 'utf16le'), 600)
    await reject(enc, 'locked.pptx', /password protected/)
    await reject(zipSync({ 'word/document.xml': strToU8('<w/>') }), 'doc.pptx', /Word or Excel/)
    await reject(zipSync({ 'readme.txt': strToU8('hi') }), 'x.pptx', /not a valid PowerPoint/)
    const good = miniPptx({ size: wide, slides: [content()] })
    await reject(good.slice(0, Math.floor(good.length / 2)), 'cut.pptx', /could not be opened|not a valid|damaged/)
    await reject(new Uint8Array(16 * 1024 * 1024).fill(0x50), 'big.pptx', /larger than 15 MB/)
  })
  it('refuses a zip bomb before inflating it (declared sizes and the total are checked)', async () => {
    const seven = new Uint8Array(7 * 1024 * 1024).fill(0x20)
    const files: Record<string, Uint8Array> = {}
    for (let i = 1; i <= 14; i++) files[`ppt/slides/slide${i}.xml`] = seven // 98 MB inflated from a few KB
    files['ppt/presentation.xml'] = strToU8('<p:presentation xmlns:p="x"/>')
    const bomb = zipSync(files, { level: 9 })
    expect(bomb.length).toBeLessThan(300_000)
    await expect(parsePptxTemplate(bomb, 'bomb.pptx')).rejects.toThrow(/too large or unusual/)
  })
  it('refuses XML that declares entities (entity bombs / XXE) and never expands them', async () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;">]><p:sld xmlns:p="x"><p:cSld>&b;</p:cSld></p:sld>'
    const files = (await import('fflate')).unzipSync(miniPptx({ size: wide, slides: [content()] }))
    files['ppt/slides/slide1.xml'] = strToU8(evil)
    await expect(parsePptxTemplate(zipSync(files), 'evil.pptx')).rejects.toThrow(/unsafe XML/)
    expect(() => parseXml('<a>&xxe;</a>')).not.toThrow()
    expect(parseXml('<a>&xxe;&amp;</a>').c[0]!.t).toBe('&xxe;&') // a name the document defines is never looked up (it stays as text); the standard entities decode
  })
  it('bounds XML work (node count and depth)', () => {
    expect(() => parseXml('<a>'.repeat(500) + '</a>'.repeat(500))).toThrow(/too deeply nested/)
  })
  it('never follows an external link or relationship: a linked picture is left out with a warning', async () => {
    const t = await imp(miniPptx({ size: wide, slides: [picture(2, 'Linked', b(10, 10, 100, 100), 'rId5')], slideRels: { 0: [{ id: 'rId5', type: 'image', target: 'http://127.0.0.1:1/secret.png', external: true }] } }))
    expect(els(t).find((e) => e.type === 'image')).toBeUndefined()
    expect(t.slides[0]!.warnings.join(' ')).toMatch(/left out|linked/i)
  })
})

describe('whole-deck output', () => {
  const rich = () => {
    const slides = [0, 1, 2].map((i) =>
      phShape(2, 'Title 1', 'type="title"', null, `Heading ${i}`) + phShape(3, 'Content', 'idx="1"', null, 'A point') +
      sp(5, 'card', b(100 + i * 30, 380, 160, 80), { prst: 'roundRect', fill: '2563EB', text: para('Card', { color: 'FFFFFF', sz: 18 }) }) +
      group(6, 'g', { x: 600 * E, y: 380 * E }, { w: 200 * E, h: 80 * E }, { x: 0, y: 0, w: 100 * E, h: 40 * E }, sp(7, 'a', b(0, 0, 40, 40), { fill: 'F97316', prst: 'ellipse' }) + sp(8, 'b', b(50, 0, 40, 40), { fill: '10B981', prst: 'triangle' }), { rot: 10 }))
    return miniPptx({ size: wide, slides, masterShapes: sp(30, 'band', b(0, 520, 960, 20), { fill: '0F172A' }) })
  }
  it('every slide validates against the real presentation schema, elements are in z-order with unique ids', async () => {
    const t = await imp(rich())
    for (const s of t.slides) {
      const r = presentationSchema.safeParse({ schemaVersion: 1, id: 'x', title: 't', aspectRatio: t.aspect, language: 'en', theme: t.theme, slides: [s.slide] })
      expect(r.success, JSON.stringify(r.success ? '' : r.error.issues.slice(0, 3))).toBe(true)
      const ids = s.slide.elements.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(s.slide.elements.map((e) => e.zIndex)).toEqual(s.slide.elements.map((_, i) => i + 1))
      for (const sl of s.slots) expect(ids).toContain(sl.elementId)
      for (const d of s.decor) expect(ids).toContain(d)
    }
    expect(t.theme.id).toMatch(/^uploaded-[0-9a-f]{8}$/)
    expect(t.source).toMatchObject({ kind: 'pptx', filename: 'deck.pptx' })
  })
  it('is deterministic: the same file gives the same template twice', async () => {
    const a = await parsePptxTemplate(rich(), 'deck.pptx'), c = await parsePptxTemplate(rich(), 'deck.pptx')
    expect(JSON.stringify(c.template)).toBe(JSON.stringify(a.template))
    expect(c.pictures.map((p) => p.ref)).toEqual(a.pictures.map((p) => p.ref))
  })
  it('reads a deck written by pptxgenjs (master with slide number and footer, shapes, table, cropped picture, mixed runs)', async () => {
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_16x9'
    pptx.defineSlideMaster({ title: 'MASTER', background: { color: 'F8FAFC' }, objects: [{ rect: { x: 0, y: 5.2, w: 10, h: 0.43, fill: { color: '1E3A8A' } } }, { text: { text: 'Acme Corp', options: { x: 0.4, y: 5.25, w: 3, h: 0.3, color: 'FFFFFF', fontSize: 10 } } }], slideNumber: { x: 9.2, y: 5.25, color: 'FFFFFF', fontSize: 10 } })
    for (let i = 1; i <= 3; i++) {
      const s = pptx.addSlide({ masterName: 'MASTER' })
      s.addText(`Slide ${i} title`, { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 32, bold: true, color: '0F172A', fontFace: 'Arial' })
      s.addText([{ text: 'Mixed ', options: { bold: true } }, { text: 'runs ', options: { color: 'CC0000' } }, { text: 'here', options: { italic: true } }], { x: 0.5, y: 1.2, w: 6, h: 0.5, fontSize: 18, fontFace: 'Arial' })
      s.addText([{ text: 'First', options: { bullet: true } }, { text: 'Second', options: { bullet: true } }], { x: 0.5, y: 2, w: 4, h: 1.2, fontSize: 16, fontFace: 'Arial' })
      s.addShape(pptx.ShapeType.roundRect, { x: 5.5, y: 2, w: 2, h: 1, fill: { color: '2563EB' }, line: { color: '1E40AF', width: 2 }, rectRadius: 0.2 })
      s.addShape(pptx.ShapeType.line, { x: 5.5, y: 3.4, w: 3, h: 0, line: { color: 'EF4444', width: 3 } })
      s.addTable([[{ text: 'A' }, { text: 'B' }], [{ text: '1' }, { text: '2' }]], { x: 0.5, y: 3.4, w: 4, colW: [2, 2] })
      if (i === 1) s.addImage({ data: `data:image/png;base64,${Buffer.from(testPng(240, 120)).toString('base64')}`, x: 7.5, y: 0.3, w: 2, h: 1, sizing: { type: 'crop', x: 0.5, y: 0, w: 1.0, h: 1 } })
    }
    const buf = new Uint8Array(await pptx.write({ outputType: 'nodebuffer' }) as Buffer)
    const r = await parsePptxTemplate(buf, 'gen.pptx')
    const t = r.template
    expect(t.slides).toHaveLength(3)
    expect(t.theme.colors.background).toBe('#F8FAFC')
    expect(t.theme.style?.footer).toBe('number')
    const s1 = t.slides[0]!
    expect(s1.slots.find((s) => s.role === 'title')).toMatchObject({ sample: 'Slide 1 title' })
    expect(s1.slide.elements.some((e) => e.type === 'table')).toBe(true)
    expect(s1.slide.elements.some((e) => e.type === 'image')).toBe(true)
    expect(t.chrome.map((c) => c.sample)).toContain('Acme Corp')
    expect(r.pictures.length).toBe(1)
    const roundRect = s1.slide.elements.find((e) => e.type === 'shape' && e.shape === 'rect' && e.radius > 0)
    expect(roundRect).toBeTruthy()
  })
  it('relsXml helper stays valid (guards the fixture builder itself)', () => {
    expect(relsXml([{ id: 'rId1', type: 'slide', target: 's.xml' }])).toContain('Target="s.xml"')
    expect(readXfrm(undefined)).toBeNull()
    expect(mul(IDENT, IDENT)).toEqual(IDENT)
  })
})
