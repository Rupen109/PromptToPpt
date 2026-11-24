import { zipSync, strToU8 } from 'fflate'
import { encodePng } from '../export/png.ts'

/**
 * Test helpers: build small .pptx files in code (no binary fixtures). `miniPptx` writes a complete, valid package around the shape XML a test gives it, with a real
 * master (placeholders, text styles, background), layouts and theme, so tests can exercise inheritance, groups, crops and slots exactly.
 */
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const rels = (items: { id: string; type: string; target: string; external?: boolean }[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map((r) => `<Relationship Id="${r.id}" Type="${REL}/${r.type}" Target="${r.target}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`

export const themeXml = (o: { major?: string; minor?: string; colors?: Partial<Record<string, string>> } = {}) => {
  const c = { dk1: '000000', lt1: 'FFFFFF', dk2: '1F2937', lt2: 'F3F4F6', accent1: '2563EB', accent2: 'F97316', accent3: '10B981', accent4: 'FACC15', accent5: '8B5CF6', accent6: 'EC4899', hlink: '0563C1', folHlink: '954F72', ...o.colors }
  const clr = (k: string) => (k === 'dk1' ? `<a:dk1><a:sysClr val="windowText" lastClr="${c.dk1}"/></a:dk1>` : k === 'lt1' ? `<a:lt1><a:sysClr val="window" lastClr="${c.lt1}"/></a:lt1>` : `<a:${k}><a:srgbClr val="${(c as Record<string, string>)[k]}"/></a:${k}>`)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test"><a:themeElements><a:clrScheme name="Test">${['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(clr).join('')}</a:clrScheme><a:fontScheme name="Test"><a:majorFont><a:latin typeface="${o.major ?? 'Calibri Light'}"/></a:majorFont><a:minorFont><a:latin typeface="${o.minor ?? 'Calibri'}"/></a:minorFont></a:fontScheme><a:fmtScheme name="Test"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`
}

const txStyles = `<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="228600" indent="-228600" algn="l"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="1000"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="•"/><a:defRPr sz="2800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL="685800" indent="-228600"><a:buChar char="–"/><a:defRPr sz="2400"/></a:lvl2pPr></p:bodyStyle><p:otherStyle><a:defPPr/><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles>`

export interface Box { x: number; y: number; w: number; h: number }
/** a placeholder shape on a master or layout */
export const phShape = (id: number, name: string, ph: string, box: Box | null, text = '', extra = '', body = '') =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph ${ph}/></p:nvPr></p:nvSpPr><p:spPr>${box ? `<a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.w}" cy="${box.h}"/></a:xfrm>` : ''}${extra}</p:spPr><p:txBody><a:bodyPr${body}/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`

export interface MiniOpts {
  /** EMU; default 16:9 (12192000 x 6858000) */
  size?: { cx: number; cy: number }
  theme?: Parameters<typeof themeXml>[0]
  /** XML inside the master's spTree after the placeholders */
  masterShapes?: string
  masterBg?: string
  /** layout shapes (default: a "Title and Content" layout with title and body placeholders that carry no position of their own) */
  layoutShapes?: string
  layoutName?: string
  slides: string[]
  /** extra attributes on <p:sld> (show="0") by slide index */
  slideAttrs?: Record<number, string>
  /** slide-level extras after spTree (background) */
  slideBg?: Record<number, string>
  /** extra relationships per slide, e.g. images */
  slideRels?: Record<number, { id: string; type: string; target: string; external?: boolean }[]>
  media?: Record<string, Uint8Array>
  extraFiles?: Record<string, string | Uint8Array>
  defaultTextStyle?: string
}

export function miniPptx(o: MiniOpts): Uint8Array {
  const size = o.size ?? { cx: 12192000, cy: 6858000 }
  const W = size.cx, H = size.cy
  const files: Record<string, Uint8Array> = {}
  const put = (n: string, s: string | Uint8Array) => { files[n] = typeof s === 'string' ? strToU8(s) : s }
  const CT = 'application/vnd.openxmlformats-officedocument.presentationml'
  put('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${o.slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT}.slide+xml"/>`).join('')}</Types>`)
  put('_rels/.rels', rels([{ id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' }]))
  put('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${o.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${10 + i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/>${o.defaultTextStyle ?? '<p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:defaultTextStyle>'}</p:presentation>`)
  put('ppt/_rels/presentation.xml.rels', rels([{ id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' }, ...o.slides.map((_, i) => ({ id: `rId${10 + i}`, type: 'slide', target: `slides/slide${i + 1}.xml` }))]))
  put('ppt/theme/theme1.xml', themeXml(o.theme))
  const tb: Box = { x: Math.round(W * 0.07), y: Math.round(H * 0.07), w: Math.round(W * 0.86), h: Math.round(H * 0.18) }
  const bb: Box = { x: Math.round(W * 0.07), y: Math.round(H * 0.3), w: Math.round(W * 0.86), h: Math.round(H * 0.58) }
  put('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster ${NS}><p:cSld>${o.masterBg ?? '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${phShape(2, 'Title Placeholder 1', 'type="title"', tb, 'Click to edit Master title style')}${phShape(3, 'Text Placeholder 2', 'type="body" idx="1"', bb, 'Click to edit Master text styles')}${phShape(4, 'Date Placeholder 3', 'type="dt" sz="half" idx="2"', { x: 838200, y: 6356350, w: 2743200, h: 365125 }, '1/1/2026')}${phShape(5, 'Footer Placeholder 4', 'type="ftr" sz="quarter" idx="3"', { x: 4038600, y: 6356350, w: 4114800, h: 365125 }, 'Footer')}${phShape(6, 'Slide Number Placeholder 5', 'type="sldNum" sz="quarter" idx="4"', { x: 8610600, y: 6356350, w: 2743200, h: 365125 }, '‹#›')}${o.masterShapes ?? ''}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>${txStyles}</p:sldMaster>`)
  put('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' }]))
  put('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout ${NS} type="obj"><p:cSld name="${o.layoutName ?? 'Title and Content'}"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${o.layoutShapes ?? `${phShape(2, 'Title 1', 'type="title"', null, 'Click to edit Master title style')}${phShape(3, 'Content Placeholder 2', 'idx="1"', null, 'Click to edit Master text styles')}`}</p:spTree></p:cSld></p:sldLayout>`)
  put('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]))
  o.slides.forEach((tree, i) => {
    put(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld ${NS}${o.slideAttrs?.[i] ? ' ' + o.slideAttrs[i] : ''}><p:cSld>${o.slideBg?.[i] ?? ''}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${tree}</p:spTree></p:cSld></p:sld>`)
    put(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels([{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, ...(o.slideRels?.[i] ?? [])]))
  })
  for (const [n, b] of Object.entries(o.media ?? {})) put(`ppt/media/${n}`, b)
  for (const [n, b] of Object.entries(o.extraFiles ?? {})) put(n, b)
  return zipSync(files)
}

/** a plain rectangle / text box / picture / group / line on a slide (EMU) */
export const sp = (id: number, name: string, b: Box, o: { prst?: string; fill?: string; line?: string; lineW?: number; rot?: number; flipH?: boolean; flipV?: boolean; text?: string; body?: string; adj?: string; style?: string; txBox?: boolean; custGeom?: string; fillXml?: string; bodyInner?: string } = {}) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr${o.txBox ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${o.rot ? ` rot="${Math.round(o.rot * 60000)}"` : ''}${o.flipH ? ' flipH="1"' : ''}${o.flipV ? ' flipV="1"' : ''}><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/></a:xfrm>${o.custGeom ?? `<a:prstGeom prst="${o.prst ?? 'rect'}"><a:avLst>${o.adj ?? ''}</a:avLst></a:prstGeom>`}${o.fillXml ?? (o.fill ? `<a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill>` : '<a:noFill/>')}${o.line ? `<a:ln w="${o.lineW ?? 12700}"><a:solidFill><a:srgbClr val="${o.line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>'}</p:spPr>${o.style ?? ''}${o.text !== undefined ? `<p:txBody><a:bodyPr${o.body ?? ' wrap="square"'}${o.bodyInner ? `>${o.bodyInner}</a:bodyPr>` : '/>'}<a:lstStyle/>${o.text}</p:txBody>` : ''}</p:sp>`
export const para = (text: string, o: { sz?: number; b?: boolean; i?: boolean; color?: string; algn?: string; bullet?: boolean; font?: string } = {}) =>
  `<a:p><a:pPr${o.algn ? ` algn="${o.algn}"` : ''}${o.bullet ? ' marL="342900" indent="-342900"' : ''}>${o.bullet ? '<a:buChar char="•"/>' : ''}</a:pPr><a:r><a:rPr lang="en-US"${o.sz ? ` sz="${o.sz * 100}"` : ''}${o.b ? ' b="1"' : ''}${o.i ? ' i="1"' : ''}>${o.color ? `<a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill>` : ''}${o.font ? `<a:latin typeface="${o.font}"/>` : ''}</a:rPr><a:t>${text}</a:t></a:r></a:p>`
export const picture = (id: number, name: string, b: Box, rid: string, o: { crop?: { l?: number; t?: number; r?: number; b?: number }; rot?: number; flipH?: boolean; prst?: string; descr?: string } = {}) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}" descr="${o.descr ?? ''}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/>${o.crop ? `<a:srcRect l="${(o.crop.l ?? 0) * 1000}" t="${(o.crop.t ?? 0) * 1000}" r="${(o.crop.r ?? 0) * 1000}" b="${(o.crop.b ?? 0) * 1000}"/>` : ''}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm${o.rot ? ` rot="${Math.round(o.rot * 60000)}"` : ''}${o.flipH ? ' flipH="1"' : ''}><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/></a:xfrm><a:prstGeom prst="${o.prst ?? 'rect'}"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
export const group = (id: number, name: string, off: { x: number; y: number }, ext: { w: number; h: number }, ch: { x: number; y: number; w: number; h: number }, children: string, o: { rot?: number; flipH?: boolean } = {}) =>
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm${o.rot ? ` rot="${Math.round(o.rot * 60000)}"` : ''}${o.flipH ? ' flipH="1"' : ''}><a:off x="${off.x}" y="${off.y}"/><a:ext cx="${ext.w}" cy="${ext.h}"/><a:chOff x="${ch.x}" y="${ch.y}"/><a:chExt cx="${ch.w}" cy="${ch.h}"/></a:xfrm></p:grpSpPr>${children}</p:grpSp>`
export const cxn = (id: number, b: Box, color = '000000', w = 19050, o: { flipH?: boolean; flipV?: boolean; dash?: string } = {}) =>
  `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm${o.flipH ? ' flipH="1"' : ''}${o.flipV ? ' flipV="1"' : ''}><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${w}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${o.dash ? `<a:prstDash val="${o.dash}"/>` : ''}</a:ln></p:spPr></p:cxnSp>`

/** a small valid PNG (a colour ramp) of the given size */
export function testPng(w = 64, h = 48, tint = [200, 80, 40]): Uint8Array {
  const px = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; px[i] = Math.round((tint[0]! * x) / w); px[i + 1] = Math.round((tint[1]! * y) / h); px[i + 2] = tint[2]!; px[i + 3] = 255 }
  return new Uint8Array(encodePng(w, h, px))
}
export { rels as relsXml }
