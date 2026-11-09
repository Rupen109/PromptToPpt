#!/usr/bin/env node
/**
 * Morph template importer: a PowerPoint (.pptx) Morph deck -> the geometry of every object on every slide, and which objects are the SAME object on consecutive slides.
 *
 *   node scripts/morph-import.mjs <deck.pptx> <out.json> [--hash-media]
 *
 * It reads only the slide XML and the media's bytes (to tell whether two pictures are the same picture); it copies no picture. The output is a plain data file that
 * packages/theme/src/morph-templates turns into slides: positions are canvas pixels on a 1920 x 1080 slide, text keeps its size, colour, weight, spacing and anchor.
 *
 * Matching (what PowerPoint's Morph calls "the same object"): the same picture, or the same text, on two consecutive slides is one object (one id). Anything else is new on its
 * slide. A template's hand-written overrides (`pairs`) can join objects the importer cannot tell are the same.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { unzipSync, strFromU8 } from 'fflate'

const [file, out] = process.argv.slice(2)
if (!file || !out) { console.error('usage: node scripts/morph-import.mjs <deck.pptx> <out.json>'); process.exit(1) }
const zip = unzipSync(new Uint8Array(readFileSync(file)))
const text = (name) => (zip[name] ? strFromU8(zip[name]) : '')

// ── a small XML reader (the decks are well-formed; this is all the importer needs) ──
function parse(xml) {
  const root = { name: '#root', attrs: {}, children: [], text: '' }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  let m
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1]
    if (m[2]) { stack.pop(); continue }
    if (m[3]) {
      const attrs = {}
      for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '')
      const node = { name: m[3], attrs, children: [], text: '' }
      top.children.push(node)
      if (!m[5]) stack.push(node)
    } else if (m[6] !== undefined) top.text += decode(m[6])
    else if (m[1] !== undefined) top.text += m[1]
  }
  return root
}
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&')
const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : [])
const kid = (n, name) => kids(n, name)[0]
const find = (n, name, acc = []) => { for (const c of n.children) { if (c.name === name) acc.push(c); find(c, name, acc) } return acc }

// ── slide size, slide order ──
const pres = parse(text('ppt/presentation.xml'))
const sz = find(pres, 'p:sldSz')[0].attrs
const SW = +sz.cx, SH = +sz.cy
const PX = 1920 / SW // EMU -> canvas px (the canvas is 1920 wide)
const presRels = Object.fromEntries(find(parse(text('ppt/_rels/presentation.xml.rels')), 'Relationship').map((r) => [r.attrs.Id, r.attrs.Target]))
const order = find(pres, 'p:sldId').map((s) => presRels[s.attrs['r:id']]).filter(Boolean)

const hashOf = new Map()
const mediaHash = (target) => {
  const key = 'ppt/' + target.replace(/^\.\.\//, '')
  if (!hashOf.has(key)) hashOf.set(key, zip[key] ? createHash('sha1').update(zip[key]).digest('hex').slice(0, 8) : 'missing')
  return hashOf.get(key)
}

const colorOf = (fillNode) => {
  const solid = kid(fillNode, 'a:solidFill')
  const c = solid && (kid(solid, 'a:srgbClr') || kid(solid, 'a:schemeClr'))
  if (!c) return null
  const hex = c.attrs.val && /^[0-9a-f]{6}$/i.test(c.attrs.val) ? '#' + c.attrs.val.toUpperCase() : null
  const alpha = kid(c, 'a:alpha')
  return hex ? { hex, ...(alpha ? { alpha: +alpha.attrs.val / 100000 } : {}) } : null
}

/** the transform of a (possibly grouped) object, as canvas pixels: through every enclosing group's scale and rotation, innermost first */
function box(spPr, tf) {
  const xf = spPr && (kid(spPr, 'a:xfrm') || kid(spPr, 'p:xfrm'))
  if (!xf) return null
  const off = kid(xf, 'a:off'), ext = kid(xf, 'a:ext')
  if (!off || !ext) return null
  let w = +ext.attrs.cx, h = +ext.attrs.cy
  let cx = +off.attrs.x + w / 2, cy = +off.attrs.y + h / 2
  let rot = (+xf.attrs.rot || 0) / 60000
  for (const g of tf) {
    cx = g.ox + (cx - g.cx) * g.sx; cy = g.oy + (cy - g.cy) * g.sy; w *= g.sx; h *= g.sy
    if (g.rot) { // a rotated group turns what is in it about the group's own centre
      const gx = g.ox + g.ex / 2, gy = g.oy + g.ey / 2, a = (g.rot * Math.PI) / 180, dx = cx - gx, dy = cy - gy
      cx = gx + dx * Math.cos(a) - dy * Math.sin(a); cy = gy + dx * Math.sin(a) + dy * Math.cos(a); rot += g.rot
    }
  }
  return { x: (cx - w / 2) * PX, y: (cy - h / 2) * PX, w: w * PX, h: h * PX, rot: Math.round(rot * 100) / 100, flipH: xf.attrs.flipH === '1', flipV: xf.attrs.flipV === '1' }
}

function paragraphs(txBody) {
  const out = []
  for (const p of kids(txBody, 'a:p')) {
    const pPr = kid(p, 'a:pPr')
    const lnSpc = pPr && kid(pPr, 'a:lnSpc') && kid(kid(pPr, 'a:lnSpc'), 'a:spcPct')
    const runs = []
    for (const r of p.children) {
      if (r.name === 'a:br') { runs.push({ t: '\n' }); continue }
      if (r.name !== 'a:r' && r.name !== 'a:fld') continue
      const t = kid(r, 'a:t')?.text ?? ''
      const rPr = kid(r, 'a:rPr')
      const latin = rPr && kid(rPr, 'a:latin')
      runs.push({
        t, sz: rPr?.attrs.sz ? +rPr.attrs.sz / 100 : null, b: rPr?.attrs.b === '1', i: rPr?.attrs.i === '1', u: !!rPr?.attrs.u && rPr.attrs.u !== 'none',
        cap: rPr?.attrs.cap && rPr.attrs.cap !== 'none' ? rPr.attrs.cap : null, spc: rPr?.attrs.spc ? +rPr.attrs.spc / 100 : null, font: latin?.attrs.typeface ?? null, color: rPr ? colorOf(rPr)?.hex ?? null : null,
      })
    }
    const joined = runs.map((r) => r.t).join('')
    if (!joined.trim()) { out.push(null); continue } // an empty paragraph keeps its place only as a gap
    out.push({ algn: pPr?.attrs.algn ?? 'l', lnSpc: lnSpc ? +lnSpc.attrs.val / 100000 : null, runs })
  }
  return out
}

/** a custom shape's first outline as corners (fractions of its box); curves are followed to their end points */
function outline(spPr) {
  const path = find(spPr, 'a:path')[0]
  if (!path) return null
  const w = +path.attrs.w || 1, h = +path.attrs.h || 1
  const pts = []
  for (const c of path.children) {
    if (c.name === 'a:close') break
    const ps = kids(c, 'a:pt')
    const last = ps[ps.length - 1]
    if ((c.name === 'a:moveTo' || c.name === 'a:lnTo' || c.name === 'a:cubicBezTo' || c.name === 'a:quadBezTo') && last) pts.push([Math.round((+last.attrs.x / w) * 1000) / 1000, Math.round((+last.attrs.y / h) * 1000) / 1000])
  }
  // a rectangle written as five points closes on its first: drop the repeat
  if (pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop()
  return pts.length >= 3 ? pts : null
}

function walk(nodes, tf, acc) {
  for (const n of nodes) {
    const name = n.name
    if (name === 'mc:AlternateContent') { const choice = kid(n, 'mc:Choice') ?? kid(n, 'mc:Fallback'); if (choice) walk(choice.children, tf, acc); continue }
    if (name === 'p:grpSp') {
      const gp = kid(n, 'p:grpSpPr'); const xf = gp && kid(gp, 'a:xfrm')
      if (!xf) { walk(n.children, tf, acc); continue }
      const off = kid(xf, 'a:off').attrs, ext = kid(xf, 'a:ext').attrs, choff = kid(xf, 'a:chOff').attrs, chext = kid(xf, 'a:chExt').attrs
      let g = { ox: +off.x, oy: +off.y, ex: +ext.cx, ey: +ext.cy, cx: +choff.x, cy: +choff.y, sx: +chext.cx ? +ext.cx / +chext.cx : 1, sy: +chext.cy ? +ext.cy / +chext.cy : 1, rot: (+xf.attrs.rot || 0) / 60000 }
      // an enclosing group's own transform applies on top
      walk(n.children, [g, ...tf], acc)
      continue
    }
    if (name !== 'p:sp' && name !== 'p:pic' && name !== 'p:cxnSp') continue
    const spPr = kid(n, 'p:spPr')
    const b = box(spPr, tf)
    if (!b) continue
    const nv = find(n, 'p:cNvPr')[0]?.attrs ?? {}
    const geom = spPr && kid(spPr, 'a:prstGeom')?.attrs.prst
    const cust = spPr && !!kid(spPr, 'a:custGeom')
    // a picture is a <p:pic>, or a shape filled with a picture (Google Slides exports masked and staging copies that way); its transparency is kept: PowerPoint parks an invisible
    // copy of a picture off the slide so the visible one has something to fly to and fade into
    const fillPic = spPr && kid(spPr, 'a:blipFill')
    if (name === 'p:pic' || fillPic) {
      const bf = name === 'p:pic' ? kid(n, 'p:blipFill') : fillPic
      const blip = bf && kid(bf, 'a:blip')
      const alphaNode = blip && kid(blip, 'a:alphaModFix')
      const src = bf && kid(bf, 'a:srcRect')?.attrs
      acc.push({ kind: 'image', ...b, media: blip?.attrs['r:embed'] ?? null, alpha: alphaNode?.attrs.amt !== undefined ? +alphaNode.attrs.amt / 100000 : 1, geom: cust ? 'rect' : geom ?? 'rect', crop: src ? { l: +(src.l ?? 0) / 1000, t: +(src.t ?? 0) / 1000, r: +(src.r ?? 0) / 1000, b: +(src.b ?? 0) / 1000 } : null, name: nv.name })
      continue
    }
    const tx = kid(n, 'p:txBody')
    const paras = tx ? paragraphs(tx) : []
    const hasText = paras.some(Boolean)
    const fill = spPr && (kid(spPr, 'a:noFill') ? null : colorOf(spPr))
    const ln = spPr && kid(spPr, 'a:ln')
    const lineColor = ln && !kid(ln, 'a:noFill') ? colorOf(ln)?.hex ?? null : null
    if (hasText) {
      const bp = kid(tx, 'a:bodyPr')?.attrs ?? {}
      acc.push({ kind: 'text', ...b, paras, anchor: bp.anchor ?? 't', name: nv.name })
    } else if (fill || lineColor) {
      acc.push({ kind: 'shape', ...b, geom: cust ? 'custom' : geom ?? 'rect', fill: fill?.hex ?? null, alpha: fill?.alpha ?? 1, line: lineColor, poly: cust ? outline(spPr) : null, name: nv.name })
    }
  }
}

// ── read every slide ──
const slides = order.map((target, index) => {
  const path = 'ppt/' + target.replace(/^\.\//, '')
  const xml = parse(text(path))
  const relsName = path.replace('slides/', 'slides/_rels/') + '.rels'
  const rels = Object.fromEntries(find(parse(text(relsName)), 'Relationship').map((r) => [r.attrs.Id, r.attrs.Target]))
  const tree = find(xml, 'p:spTree')[0]
  const objs = []
  walk(tree.children, [], objs)
  const bgNode = find(xml, 'p:bg')[0]
  const bgColor = bgNode ? colorOf(find(bgNode, 'p:bgPr')[0] ?? bgNode) : null
  const trans = find(xml, 'p:transition')[0]
  const morph = find(xml, 'p159:morph')[0]
  const dur = trans?.attrs['p14:dur'] ?? null
  objs.forEach((o, z) => {
    o.z = z
    if (o.kind === 'image') { const t = rels[o.media]; o.file = t ? t.replace(/^\.\.\//, '') : null; o.hash = t ? mediaHash(t) : 'none' }
    o.key = o.kind === 'image' ? 'i:' + o.hash : o.kind === 'text' ? 't:' + o.paras.filter(Boolean).map((p) => p.runs.map((r) => r.t).join('')).join('\n').replace(/\s+/g, ' ').trim().toLowerCase() : null
  })
  return { n: index + 1, background: bgColor?.hex ?? null, transition: { speed: trans?.attrs.spd ?? null, durationMs: dur ? +dur : null, morph: morph?.attrs.option ?? null }, objects: objs }
})

// ── ids: which object on one slide is the SAME object on the next ──
// 1. the same picture, or the same words, is the same object.
// 2. what is left over pairs up when it is the same kind of thing at a similar size and place (this is how PowerPoint's Morph treats a picture that flies off the slide and the
//    transparent copy it is parked as: they are different files, but one object).
let counter = 0
const short = (s) => createHash('sha1').update(s).digest('hex').slice(0, 5)
const fontSize = (o) => o.kind === 'text' ? Math.max(0, ...o.paras.filter(Boolean).flatMap((p) => p.runs.map((r) => r.sz ?? 0))) : 0
const distance = (a, b) => {
  const lr = (x, y) => Math.abs(Math.log((Math.max(1, x)) / Math.max(1, y)))
  const cx = (o) => o.x + o.w / 2, cy = (o) => o.y + o.h / 2
  return lr(a.w, b.w) + lr(a.h, b.h) + Math.hypot(cx(a) - cx(b), cy(a) - cy(b)) / 1920
}
const SIMILAR = 0.9 // below this a leftover pair is "the same object"
for (let i = 0; i < slides.length; i++) {
  const prev = slides[i - 1]
  const cur = slides[i].objects
  if (prev) {
    const claimed = new Set()
    const byKey = new Map()
    for (const o of prev.objects) if (o.key) { const l = byKey.get(o.key) ?? []; l.push(o); byKey.set(o.key, l) }
    for (const o of cur) { const list = o.key ? byKey.get(o.key) : null; if (list && list.length) { const m = list.shift(); o.id = m.id; claimed.add(m) } }
    // leftovers, closest first
    const pairs = []
    for (const o of cur) if (!o.id && (o.kind === 'image' || o.kind === 'text')) for (const m of prev.objects) {
      if (claimed.has(m) || m.kind !== o.kind) continue
      if (o.kind === 'text') { const fa = fontSize(o), fb = fontSize(m); if (!fa || !fb || Math.max(fa, fb) / Math.min(fa, fb) > 1.35) continue }
      const d = distance(o, m)
      if (d < SIMILAR) pairs.push({ d, o, m })
    }
    pairs.sort((x, y) => x.d - y.d)
    for (const { o, m } of pairs) { if (o.id || claimed.has(m)) continue; o.id = m.id; claimed.add(m) }
  }
  for (const o of cur) if (!o.id) o.id = (o.kind === 'image' ? 'img' : o.kind === 'text' ? 'txt' : 'shp') + '-' + short(String(o.key ?? counter)) + '-' + ++counter
}

for (const s of slides) for (const o of s.objects) { delete o.key; delete o.media; delete o.name }
const media = {}
for (const s of slides) for (const o of s.objects) if (o.kind === 'image' && o.file) media[o.hash] = o.file
// positions to a tenth of a pixel, sizes to a hundredth of a point: enough to be exact on screen, small enough to live in the repository
const round = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v)
const data = { source: file.split('/').pop(), canvas: { w: 1920, h: 1080 }, slides, media }
if (out.endsWith('.ts')) {
  // a TypeScript module: `export const <NAME>_DATA`, typed by morph-templates/types.ts
  const name = (out.split('/').pop() ?? 'template').replace(/\.ts$/, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  writeFileSync(out, `// Generated by scripts/morph-import.mjs from ${data.source}: geometry only, no pictures. Do not edit by hand (the template's own words and pictures are in ../templates).\nimport type { TemplateData } from '../types'\n\nexport const ${name}_DATA: TemplateData = ${JSON.stringify(data, round, 1).replace(/\n\s+/g, ' ')}\n`)
} else writeFileSync(out, JSON.stringify(data, round, 1))
const total = slides.reduce((n, s) => n + s.objects.length, 0)
console.log(`${slides.length} slides, ${total} objects, ${Object.keys(media).length} distinct pictures -> ${out}`)
