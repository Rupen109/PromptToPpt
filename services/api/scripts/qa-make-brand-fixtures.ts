/**
 * QA only: writes the files the browser suite 70-brand-from-sources reads a brand from (built in code with the importer's and the PDF reader's test fixtures):
 *   acme-brand.pptx   light deck: orange #E4572E + teal #17BEBB, Montserrat headings, Lato text, a logo on the master, a photo on slide 1
 *   acme-dark.pptx    dark navy deck with a vivid amber and teal, Georgia + "Segoe UI" (replaced), a logo
 *   acme-brand.pdf    navy header band + orange card, white title text, Helvetica-Bold / Times-Roman, the same small logo in the top-right of every page
 *   scan.pdf          one page that is only a picture (a blue page): no text, no fonts
 *   locked.pdf        asks for a password
 * Usage: tsx scripts/qa-make-brand-fixtures.ts <output directory>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brandPdf } from '../src/brand/test-brand-pdf.ts'
import { miniPptx, para, picture, sp, testPng } from '../src/template-import/test-fixtures.ts'

const out = process.argv[2]
if (!out) { console.error('Usage: qa-make-brand-fixtures <dir>'); process.exit(1) }
mkdirSync(out, { recursive: true })
const E = 12700
const b = (x: number, y: number, w: number, h: number) => ({ x: x * E, y: y * E, w: w * E, h: h * E })
const MASTER_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>'
const logo = picture(30, 'Logo', b(830, 20, 100, 50), 'rId5')

const light = (n: number) => sp(2, 'card', b(60, 130, 300, 260), { fill: 'E4572E' }) + sp(3, 'strip', b(0, 500, 960, 40), { fill: '17BEBB' }) + sp(4, 't', b(60, 40, 700, 70), { txBox: true, text: para(`Acme Robotics ${n}`, { sz: 34, b: true, color: 'E4572E', font: 'Montserrat' }) }) + sp(5, 'b', b(400, 150, 480, 120), { txBox: true, text: para('Body copy about the plan, set in the brand text font.', { sz: 18, font: 'Lato' }) })
writeFileSync(join(out, 'acme-brand.pptx'), miniPptx({
  size: { cx: 960 * E, cy: 540 * E }, theme: { major: 'Montserrat', minor: 'Lato', colors: { accent1: 'E4572E', accent2: '17BEBB', accent3: '2E86AB', accent4: 'F6C90E', accent5: '8E44AD', accent6: '27AE60' } },
  masterShapes: logo, slides: [1, 2, 3, 4].map(light) , extraFiles: { 'ppt/slideMasters/_rels/slideMaster1.xml.rels': MASTER_RELS }, media: { 'logo.png': testPng(200, 100, [228, 87, 46]) },
}))

const dark = (n: number) => sp(2, 'panel', b(50, 120, 380, 300), { fill: '1E293B' }) + sp(3, 'bar', b(50, 440, 380, 14), { fill: 'F59E0B' }) + sp(4, 'dot', b(470, 140, 120, 120), { prst: 'ellipse', fill: '14B8A6' }) + sp(5, 't', b(60, 40, 700, 60), { txBox: true, text: para(`Orbit ${n}`, { sz: 32, b: true, color: 'F8FAFC', font: 'Georgia' }) }) + sp(6, 'b', b(470, 290, 420, 120), { txBox: true, text: para('Text in a font the editor replaces.', { sz: 16, color: 'CBD5E1', font: 'Segoe UI' }) })
writeFileSync(join(out, 'acme-dark.pptx'), miniPptx({
  size: { cx: 960 * E, cy: 540 * E }, theme: { major: 'Georgia', minor: 'Segoe UI', colors: { dk1: 'F8FAFC', lt1: '0B1220', dk2: '1E293B', lt2: '0F172A', accent1: '14B8A6', accent2: 'F59E0B' } },
  masterBg: '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="0B1220"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>', masterShapes: logo, slides: [1, 2, 3].map(dark), extraFiles: { 'ppt/slideMasters/_rels/slideMaster1.xml.rels': MASTER_RELS }, media: { 'logo.png': testPng(200, 100, [20, 184, 166]) },
}))

type C = [number, number, number]
const NAVY: C = [10, 37, 64], ORANGE: C = [255, 90, 31], WHITE: C = [255, 255, 255]
const page = () => ({ bg: WHITE, rects: [{ x: 0, y: 440, w: 960, h: 100, fill: NAVY }, { x: 40, y: 100, w: 260, h: 220, fill: ORANGE }], texts: [{ x: 60, y: 480, size: 44, text: 'Acme Robotics', font: 'Helvetica-Bold' as const, color: WHITE }, { x: 340, y: 260, size: 16, text: 'Body copy that explains the plan in a few words', font: 'Times-Roman' as const }], images: [{ x: 840, y: 470, w: 100, h: 50, px: 96, rgb: ORANGE }] })
writeFileSync(join(out, 'acme-brand.pdf'), brandPdf({ title: 'Acme Robotics brand', pages: [page(), page(), page()] }))
writeFileSync(join(out, 'scan.pdf'), brandPdf({ pages: [{ images: [{ x: 0, y: 0, w: 960, h: 540, px: 64, rgb: [20, 120, 200] }] }] }))
writeFileSync(join(out, 'locked.pdf'), brandPdf({ password: 'secret', pages: [page()] }))
console.log(`wrote the brand fixtures to ${out}`)
