/**
 * QA only: writes two small designed .pptx files (built in code with the importer's test fixtures) for the browser suite 69-deck-from-file-design:
 *   midnight-orbit.pptx  dark, Georgia + "Segoe UI" (a font the editor replaces), teal accent, circles and bars, a photo
 *   citrus-paper.pptx    light, "Gill Sans MT" (replaced), orange accent, a side panel, a photo
 *   chart-deck.pptx      a cover, a bar chart slide holding another person's figures (Zorblax 7717 / 8828 / 9939) and a closing slide (built with pptxgenjs: a real chart part)
 *   orbit-deck.pdf, picture-pages.pdf   a text PDF, and a deck saved as one picture per page
 * Usage: tsx scripts/qa-make-design-fixtures.ts <output directory>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import pptxgen from 'pptxgenjs'
import { picturePagesPdf, sampleDeckPdf } from '../src/template-import/pdf-fixtures.ts'
import { miniPptx, para, picture, sp, testPng } from '../src/template-import/test-fixtures.ts'

const out = process.argv[2]
if (!out) { console.error('Usage: qa-make-design-fixtures <dir>'); process.exit(1) }
mkdirSync(out, { recursive: true })
const E = 12700
const b = (x: number, y: number, w: number, h: number) => ({ x: x * E, y: y * E, w: w * E, h: h * E })
const txt = (id: number, name: string, box: ReturnType<typeof b>, text: string) => sp(id, name, box, { txBox: true, text })

// ── dark
const dark = miniPptx({
  size: { cx: 960 * E, cy: 540 * E },
  theme: { major: 'Georgia', minor: 'Segoe UI', colors: { dk1: '0B1220', lt1: 'FFFFFF', accent1: '14B8A6', accent2: 'F59E0B', dk2: '0B1220' } },
  masterBg: '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>',
  slides: [
    sp(2, 'Ring', b(640, -120, 520, 520), { prst: 'ellipse', fill: '14B8A6' }) + sp(3, 'Ring2', b(700, 330, 300, 300), { prst: 'ellipse', fill: '1E293B' }) + sp(4, 'Bar', b(60, 130, 90, 8), { fill: '14B8A6' }) +
      txt(5, 'Title', b(60, 160, 620, 150), para('Mission to Mars: the crew briefing', { sz: 44, b: true, color: 'FFFFFF', font: 'Georgia' })) + txt(6, 'Sub', b(60, 330, 560, 60), para('Seven things every engineer should know', { sz: 20, color: '94A3B8' })) + txt(7, 'Brand', b(60, 470, 300, 26), para('ORBIT LABS · 2031', { sz: 11, color: '14B8A6' })),
    sp(2, 'Bar', b(60, 54, 70, 6), { fill: '14B8A6' }) + txt(3, 'Title', b(60, 70, 840, 70), para('Why the launch window matters', { sz: 32, b: true, color: 'FFFFFF', font: 'Georgia' })) +
      txt(4, 'Body', b(60, 160, 520, 300), para('Fuel use falls when planets line up', { sz: 20, color: 'E2E8F0', bullet: true }) + para('A missed window costs two years', { sz: 20, color: 'E2E8F0', bullet: true }) + para('Crews train for each minute of the plan', { sz: 20, color: 'E2E8F0', bullet: true }) + para('Backups exist for every system on board', { sz: 20, color: 'E2E8F0', bullet: true })) +
      picture(5, 'Photo', b(620, 160, 280, 300), 'rId5') + txt(6, 'Brand', b(60, 490, 300, 24), para('ORBIT LABS · 2031', { sz: 11, color: '14B8A6' })),
    sp(2, 'Panel', b(60, 150, 400, 300), { prst: 'roundRect', fill: '1E293B' }) + sp(3, 'Panel2', b(500, 150, 400, 300), { prst: 'roundRect', fill: '1E293B' }) + txt(4, 'Title', b(60, 60, 840, 70), para('Two ways to fly', { sz: 32, b: true, color: 'FFFFFF', font: 'Georgia' })) +
      txt(5, 'H1', b(84, 170, 350, 40), para('Fast transfer', { sz: 22, b: true, color: '14B8A6' })) + txt(6, 'T1', b(84, 220, 350, 200), para('More fuel, shorter trip, tighter schedule for the whole crew.', { sz: 18, color: 'E2E8F0' })) +
      txt(7, 'H2', b(524, 170, 350, 40), para('Slow transfer', { sz: 22, b: true, color: 'F59E0B' })) + txt(8, 'T2', b(524, 220, 350, 200), para('Less fuel, longer trip, more room for supplies and science.', { sz: 18, color: 'E2E8F0' })) + txt(9, 'Brand', b(60, 490, 300, 24), para('ORBIT LABS · 2031', { sz: 11, color: '14B8A6' })),
    sp(2, 'Ring', b(60, 120, 300, 300), { prst: 'ellipse', fill: '14B8A6' }) + txt(3, 'Big', b(80, 220, 260, 110), para('180', { sz: 72, b: true, color: '0B1220', algn: 'ctr', font: 'Georgia' })) + txt(4, 'Cap', b(400, 190, 480, 140), para('days of travel between Earth and Mars on the slow route', { sz: 26, color: 'FFFFFF' })) + txt(5, 'Brand', b(60, 490, 300, 24), para('ORBIT LABS · 2031', { sz: 11, color: '14B8A6' })),
    sp(2, 'Ring', b(-160, 260, 520, 520), { prst: 'ellipse', fill: '14B8A6' }) + txt(3, 'Thanks', b(60, 190, 840, 110), para('Thank you', { sz: 60, b: true, color: 'FFFFFF', algn: 'ctr', font: 'Georgia' })) + txt(4, 'Mail', b(260, 320, 440, 40), para('crew@orbitlabs.example', { sz: 20, color: '94A3B8', algn: 'ctr' })) + txt(5, 'Brand', b(60, 490, 300, 24), para('ORBIT LABS · 2031', { sz: 11, color: '14B8A6' })),
  ],
  slideRels: { 1: [{ id: 'rId5', type: 'image', target: '../media/rocket.png' }] },
  media: { 'rocket.png': testPng(560, 600, [120, 60, 200]) },
})

// ── light
const light = miniPptx({
  size: { cx: 960 * E, cy: 540 * E },
  theme: { major: 'Gill Sans MT', minor: 'Gill Sans MT', colors: { dk1: '2B2118', lt1: 'FFFFFF', accent1: 'EA580C', accent2: '0F766E', dk2: '2B2118', lt2: 'F8F5EF' } },
  masterBg: '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="F8F5EF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>',
  slides: [
    sp(2, 'Panel', b(560, 0, 400, 540), { fill: 'EA580C' }) + picture(3, 'Photo', b(600, 80, 320, 380), 'rId5') + txt(4, 'Title', b(60, 150, 480, 170), para('Autumn market guide for the whole town', { sz: 40, b: true, color: '2B2118' })) + txt(5, 'Sub', b(60, 340, 460, 70), para('Stalls, music and food on the green', { sz: 20, color: '6B5B4B' })) + txt(6, 'Brand', b(60, 470, 300, 26), para('GREEN MARKET CO.', { sz: 11, color: 'EA580C', b: true })),
    sp(2, 'Bar', b(60, 60, 8, 60), { fill: 'EA580C' }) + txt(3, 'Title', b(84, 56, 800, 70), para('Plan your visit', { sz: 34, b: true, color: '2B2118' })) +
      txt(4, 'Body', b(84, 150, 780, 300), para('Arrive early for the best choice of stalls', { sz: 22, color: '2B2118', bullet: true }) + para('Bring a bag and small change', { sz: 22, color: '2B2118', bullet: true }) + para('Music starts at noon on the green', { sz: 22, color: '2B2118', bullet: true })) + txt(5, 'Brand', b(60, 490, 300, 24), para('GREEN MARKET CO.', { sz: 11, color: 'EA580C', b: true })),
    sp(2, 'Card', b(60, 150, 270, 280), { prst: 'roundRect', fill: 'FFFFFF', line: 'E7DFD2' }) + sp(3, 'Card2', b(345, 150, 270, 280), { prst: 'roundRect', fill: 'FFFFFF', line: 'E7DFD2' }) + sp(4, 'Card3', b(630, 150, 270, 280), { prst: 'roundRect', fill: 'FFFFFF', line: 'E7DFD2' }) +
      txt(5, 'Title', b(60, 50, 840, 70), para('Three things to try', { sz: 34, b: true, color: '2B2118' })) +
      txt(6, 'H1', b(80, 170, 230, 40), para('Cheese', { sz: 22, b: true, color: 'EA580C' })) + txt(7, 'T1', b(80, 220, 230, 190), para('Local farms bring fresh cheese every week.', { sz: 17, color: '2B2118' })) +
      txt(8, 'H2', b(365, 170, 230, 40), para('Bread', { sz: 22, b: true, color: '0F766E' })) + txt(9, 'T2', b(365, 220, 230, 190), para('Sourdough sells out before noon most days.', { sz: 17, color: '2B2118' })) +
      txt(10, 'H3', b(650, 170, 230, 40), para('Honey', { sz: 22, b: true, color: 'EA580C' })) + txt(11, 'T3', b(650, 220, 230, 190), para('Taste three kinds from the hills nearby.', { sz: 17, color: '2B2118' })) + txt(12, 'Brand', b(60, 490, 300, 24), para('GREEN MARKET CO.', { sz: 11, color: 'EA580C', b: true })),
    sp(2, 'Panel', b(0, 0, 330, 540), { fill: '0F766E' }) + txt(3, 'Big', b(20, 190, 290, 120), para('120', { sz: 80, b: true, color: 'FFFFFF', algn: 'ctr' })) + txt(4, 'Cap', b(380, 190, 520, 140), para('stalls fill the green every second Saturday', { sz: 28, color: '2B2118' })) + txt(5, 'Brand', b(380, 490, 300, 24), para('GREEN MARKET CO.', { sz: 11, color: 'EA580C', b: true })),
    sp(2, 'Bar', b(0, 440, 960, 100), { fill: 'EA580C' }) + txt(3, 'Thanks', b(60, 150, 840, 110), para('See you at the market', { sz: 54, b: true, color: '2B2118', algn: 'ctr' })) + txt(4, 'Mail', b(260, 290, 440, 40), para('hello@greenmarket.example', { sz: 20, color: '6B5B4B', algn: 'ctr' })) + txt(5, 'Brand', b(60, 470, 300, 24), para('GREEN MARKET CO.', { sz: 11, color: 'FFFFFF', b: true })),
  ],
  slideRels: { 0: [{ id: 'rId5', type: 'image', target: '../media/market.png' }] },
  media: { 'market.png': testPng(640, 760, [250, 160, 40]) },
})

writeFileSync(join(out, 'midnight-orbit.pptx'), dark)
writeFileSync(join(out, 'citrus-paper.pptx'), light)
const g = new pptxgen(); g.layout = 'LAYOUT_WIDE'
let sl = g.addSlide(); sl.background = { color: 'F8FAFC' }
sl.addText('Zorblax Annual Report', { x: 0.8, y: 2.4, w: 11.5, h: 1.2, fontSize: 44, bold: true, color: '0F172A' })
sl.addText('A summary of the Zorblax year', { x: 0.8, y: 3.7, w: 11.5, h: 0.6, fontSize: 20, color: '475569' })
sl = g.addSlide(); sl.background = { color: 'F8FAFC' }
sl.addText('Zorblax revenue by region', { x: 0.6, y: 0.4, w: 12, h: 0.9, fontSize: 32, bold: true, color: '0F172A' })
sl.addChart('bar', [{ name: 'Zorblax sales', labels: ['Zorblax North', 'Zorblax South', 'Zorblax East'], values: [7717, 8828, 9939] }], { x: 0.8, y: 1.5, w: 8, h: 4.8, chartColors: ['C0392B'], showLegend: false, showValue: true })
sl.addText('Why it moved', { x: 9.2, y: 1.6, w: 3.6, h: 0.5, fontSize: 18, bold: true, color: '0F172A' })
sl.addText('Zorblax grew in every region.', { x: 9.2, y: 2.2, w: 3.6, h: 1.2, fontSize: 16, color: '334155' })
sl = g.addSlide(); sl.background = { color: '0F172A' }
sl.addText('Thank you', { x: 0.8, y: 2.8, w: 11.5, h: 1.4, fontSize: 54, bold: true, color: 'FFFFFF', align: 'center' })
writeFileSync(join(out, 'chart-deck.pptx'), Buffer.from(await g.write({ outputType: 'nodebuffer' }) as Buffer))
writeFileSync(join(out, 'orbit-deck.pdf'), sampleDeckPdf())
writeFileSync(join(out, 'picture-pages.pdf'), picturePagesPdf())
console.log(`wrote ${join(out, 'midnight-orbit.pptx')} and ${join(out, 'citrus-paper.pptx')}`)
