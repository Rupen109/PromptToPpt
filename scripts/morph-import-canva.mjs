#!/usr/bin/env node
/**
 * Reads the choreography of a Canva Morph deck (a public Canva "view" link, as SlidesCarnival embeds them) when no PowerPoint file exists.
 *
 *   node scripts/morph-import-canva.mjs <canva view?embed url> <out.ts> <EXPORT_NAME> [--font "Display" --body-font "Body"]
 *
 * The viewer draws every slide as ordinary page elements, so each slide is opened in a headless browser and every picture, line and text box is measured where it rests:
 * position, size, rotation, opacity, and the text's size, weight, case, spacing and colour. The result has the same shape as scripts/morph-import.mjs makes from a PPTX
 * (geometry and text styling only; pictures are named by a hash of their address and never downloaded), and objects are matched between slides the same way: the same picture,
 * or the same words, is the same object on the next slide.
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { launch } from '../e2e/lib.mjs'

const [url, out, name] = process.argv.slice(2)
const fi = process.argv.indexOf('--font')
const FONT = fi > 0 ? process.argv[fi + 1] : 'Sans'
const bi = process.argv.indexOf('--body-font')
const BODY_FONT = bi > 0 ? process.argv[bi + 1] : FONT
if (!url || !out || !name) { console.error('usage: morph-import-canva.mjs <url> <out.ts> <NAME> [--font "Family"]'); process.exit(1) }
const PX2PT = 0.75
const r1 = (n) => Math.round(n * 10) / 10

/** runs in the page: everything of the slide on screen */
const scrape = () => {
  const num = (s) => parseFloat(s) || 0
  const hexToRgb = (h) => { const v = h.replace('#', ''); const f = v.length === 3 ? v.split('').map((c) => c + c).join('') : v; return `rgb(${parseInt(f.slice(0, 2), 16)}, ${parseInt(f.slice(2, 4), 16)}, ${parseInt(f.slice(4, 6), 16)})` }
  const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(',').map((x) => parseFloat(x)); return { hex: '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(), a } }
  const bg = [...document.querySelectorAll('div')].find((d) => { const r = d.getBoundingClientRect(); const c = getComputedStyle(d).backgroundColor; return r.width >= 1900 && r.height >= 1060 && c !== 'rgb(255, 255, 255)' && c !== 'rgba(0, 0, 0, 0)' })
  if (!bg) return null
  // the page: the nearest ancestor of the background that also holds the slide's pictures and words
  let root = bg.parentElement
  while (root && root !== document.body && !root.querySelector('img, span')) root = root.parentElement
  /** rotation (degrees) and mirroring accumulated up to the page, and the product of the opacities */
  const chain = (el) => { let rot = 0, flip = false, op = 1; for (let e = el; e && e !== root; e = e.parentElement) { const cs = getComputedStyle(e); op *= num(cs.opacity === '' ? '1' : cs.opacity); const t = cs.transform; if (t && t !== 'none') { const m = t.match(/matrix\(([^)]+)\)/); if (m) { const [a, b, c, d] = m[1].split(',').map(parseFloat); const det = a * d - b * c; if (Math.abs(Math.hypot(a, b) - 1) < 0.02 || Math.abs(b) > 0.001) { rot += (Math.atan2(b, a) * 180) / Math.PI * (det < 0 ? -1 : 1); if (det < 0) flip = !flip } } } } return { rot, flip, op } }
  const geometry = (el) => {
    const br = el.getBoundingClientRect(); const { rot, flip, op } = chain(el)
    let w = br.width, h = br.height
    if (Math.abs(rot) > 0.5 && el.offsetWidth) { w = el.offsetWidth; h = el.offsetHeight }
    const cx = br.x + br.width / 2, cy = br.y + br.height / 2
    return { x: cx - w / 2, y: cy - h / 2, w, h, rot, flip, op }
  }
  const objects = []
  root.querySelectorAll('*').forEach((el) => {
    if (el.closest('button') || el === bg) return
    const br = el.getBoundingClientRect()
    if (br.width < 1 || br.height < 1) return
    const tag = el.tagName.toLowerCase()
    if (tag === 'img') {
      const src = el.getAttribute('src') || ''
      if (!src || /static\.canva\.com/.test(src)) return
      const g = geometry(el)
      // a picture inside a clipping frame (a thumbnail, a gallery tile) shows only the frame's window: that window is the object, and what the frame hides is recorded as a crop
      let clip = null
      for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (/hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY) || (cs.clipPath && cs.clipPath !== 'none')) {
          const r = e.getBoundingClientRect()
          if (r.width < g.w - 2 || r.height < g.h - 2) clip = clip ? { x: Math.max(clip.x, r.x), y: Math.max(clip.y, r.y), x2: Math.min(clip.x2, r.x + r.width), y2: Math.min(clip.y2, r.y + r.height) } : { x: r.x, y: r.y, x2: r.x + r.width, y2: r.y + r.height }
        }
      }
      let crop = null
      if (clip && Math.abs(g.rot) < 0.5 && clip.x2 > clip.x && clip.y2 > clip.y) {
        const cx = Math.max(clip.x, g.x), cy = Math.max(clip.y, g.y), cx2 = Math.min(clip.x2, g.x + g.w), cy2 = Math.min(clip.y2, g.y + g.h)
        if (cx2 > cx && cy2 > cy) { crop = { l: (cx - g.x) / g.w, t: (cy - g.y) / g.h, r: (g.x + g.w - cx2) / g.w, b: (g.y + g.h - cy2) / g.h }; g.x = cx; g.y = cy; g.w = cx2 - cx; g.h = cy2 - cy }
      }
      el.setAttribute('data-imp', String(objects.length))
      objects.push({ kind: 'image', imp: objects.length, src: src.split('?')[0], alt: el.getAttribute('alt') || '', crop, ...g })
    } else if (tag === 'svg') {
      const path = el.querySelector('path'); const sw = path ? num(path.getAttribute('stroke-width')) : 0
      const stroke = rgb(getComputedStyle(el).stroke)
      const fillAttr = path ? (path.getAttribute('fill') || getComputedStyle(path).fill) : null
      const fillC = fillAttr && fillAttr !== 'none' ? rgb(fillAttr.startsWith('#') ? hexToRgb(fillAttr) : fillAttr) : null
      if (path && sw > 0 && br.height <= 14 && stroke) objects.push({ kind: 'line', color: stroke.hex, ...geometry(el) })
      else if (path && fillC && br.width >= 60 && br.height >= 60) objects.push({ kind: 'line', color: fillC.hex, fillAlpha: fillC.a * num(path.getAttribute('fill-opacity') || '1'), ...geometry(el) })
    } else if (el.children.length === 0 && el.textContent.trim() && (tag === 'span' || tag === 'p')) {
      const cs = getComputedStyle(el)
      if (el.textContent.trim().length === 1 && br.height < 20 && br.y > 1060) return // the viewer's own bar
      const c = rgb(cs.color)
      objects.push({ kind: 'text', text: el.textContent.trim(), ...geometry(el), px: num(cs.fontSize), weight: num(cs.fontWeight), upper: cs.textTransform === 'uppercase', spacing: cs.letterSpacing === 'normal' ? 0 : num(cs.letterSpacing), align: cs.textAlign, lh: cs.lineHeight === 'normal' ? null : num(cs.lineHeight), color: c ? c.hex : '#FFFFFF', italic: cs.fontStyle === 'italic' })
    }
  })
  const bc = rgb(getComputedStyle(bg).backgroundColor)
  return { background: bc ? bc.hex : null, objects }
}

const b = await launch()
const page = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage()
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(8000)
const total = await page.evaluate(() => { const m = document.body.innerText.match(/\b\d+\s*\/\s*(\d+)\b/); return m ? Number(m[1]) : 0 })
if (!total) { console.error('could not read the number of slides'); process.exit(1) }
const raw = []
for (let n = 1; n <= total; n++) {
  if (n > 1) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(6500) }
  const s = await page.evaluate(scrape)
  if (!s) { console.error('slide', n, 'not readable'); process.exit(1) }
  // a picture can be in the page and still not be painted (covered, clipped away, not loaded): hiding it changes nothing on screen. Only painted pictures are visible.
  for (const o of s.objects) {
    if (o.kind !== 'image') continue
    const x = Math.max(0, Math.round(o.x)), y = Math.max(0, Math.round(o.y)), x2 = Math.min(1920, Math.round(o.x + o.w)), y2 = Math.min(1080, Math.round(o.y + o.h))
    if (x2 - x < 8 || y2 - y < 8) continue // wholly off the slide: it is never seen here anyway
    const clip = { x, y, width: x2 - x, height: y2 - y }
    const before = await page.screenshot({ clip })
    // the picture is drawn at a low and a high resolution, stacked: hide every picture in the same place together
    const same = (r) => `(function(){var t=${JSON.stringify([o.x, o.y, o.w, o.h])};return [...document.querySelectorAll('img')].filter(function(e){var b=e.getBoundingClientRect();return Math.abs(b.x-t[0])<4&&Math.abs(b.y-t[1])<4&&Math.abs(b.width-t[2])<4&&Math.abs(b.height-t[3])<4||e.getAttribute('data-imp')==='${o.imp}'})})()`
    await page.evaluate((js) => { window.__hid = eval(js); window.__hid.forEach((e) => { e.dataset.vis = e.style.visibility; e.style.visibility = 'hidden' }) }, same())
    const after = await page.screenshot({ clip })
    await page.evaluate(() => { (window.__hid || []).forEach((e) => { e.style.visibility = e.dataset.vis || '' }) })
    if (Buffer.compare(before, after) === 0) o.op = 0
  }
  raw.push(s)
  console.log(`slide ${n}/${total}: ${s.objects.length} objects`)
}
await b.close()

// ── matching: the same picture (address) or the same words is the same object on the next slide ──
const norm = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase()
// one picture is served at several sizes: its identity is the asset id inside the address
const assetId = (src) => (decodeURIComponent(src).match(/uri:ifs:\/\/M\/([0-9a-f-]{36})/) ?? decodeURIComponent(src).match(/\/(MA[\w-]{8,})\/\d+\//) ?? [])[1] ?? src
const hashOf = (src) => createHash('sha1').update(assetId(src)).digest('hex').slice(0, 8)
const dist = (a, b) => Math.hypot((a.x + a.w / 2 - b.x - b.w / 2) / 1920, (a.y + a.h / 2 - b.y - b.h / 2) / 1080) + Math.abs(Math.log((a.w * a.h + 1) / (b.w * b.h + 1))) * 0.15
let seq = 0
const mk = (p) => `${p}-${(++seq).toString(36)}`
const media = {}
const slides = []
for (let n = 0; n < raw.length; n++) {
  const prev = n ? slides[n - 1].objects : []
  const taken = new Set()
  const order = { image: 0, line: 1, text: 2 }
  const sorted = raw[n].objects.map((o, i) => ({ o, i })).sort((a, b) => order[a.o.kind] - order[b.o.kind] || a.i - b.i).map((x) => x.o)
  const objs = sorted.map((o, z) => {
    const base = { kind: o.kind === 'line' ? 'shape' : o.kind, x: r1(o.x), y: r1(o.y), w: r1(o.w), h: r1(o.h), rot: r1(o.rot), z }
    if (o.flip) base.flipH = true
    if (o.kind === 'image') { const hash = hashOf(o.src); media[hash] = o.src; return { ...base, hash, file: o.src, alpha: r1(o.op * 10) / 10, geom: 'rect', crop: o.crop ? { l: r1(o.crop.l * 1000) / 1000, t: r1(o.crop.t * 1000) / 1000, r: r1(o.crop.r * 1000) / 1000, b: r1(o.crop.b * 1000) / 1000 } : null, _key: 'i:' + hash, _src: o } }
    if (o.kind === 'line') return { ...base, geom: 'rect', fill: o.color, line: null, alpha: r1(o.op * (o.fillAlpha ?? 1) * 100) / 100, _key: 'l', _src: o }
    return {
      ...base, anchor: 'top', alpha: r1(o.op * 100) / 100,
      paras: [{ algn: o.align === 'center' ? 'ctr' : o.align === 'right' || o.align === 'end' ? 'r' : 'l', lnSpc: o.lh && o.px ? r1((o.lh / o.px) * 100) / 100 : null, runs: [{ t: o.text, sz: r1(o.px * PX2PT), b: o.weight >= 600, i: o.italic, cap: o.upper ? 'all' : null, spc: o.spacing ? r1(o.spacing * PX2PT) : null, font: o.px >= 30 || o.px <= 16 ? FONT : BODY_FONT, color: o.color }] }],
      _key: 't:' + norm(o.text), _src: o,
    }
  })
  // first pass: same key, nearest on the previous slide; second pass: leftovers of the same kind, near enough
  const pair = (a, b) => { a.id = b.id; taken.add(b) }
  for (const o of objs) {
    const cands = prev.filter((p) => !taken.has(p) && p._key === o._key)
    if (cands.length) pair(o, cands.sort((a, b) => dist(o, a) - dist(o, b))[0])
  }
  for (const o of objs) {
    if (o.id) continue
    const cands = prev.filter((p) => !taken.has(p) && p.kind === o.kind && p.kind !== 'image' && (o.kind !== 'text' || (Math.max(p._src.px, o._src.px) / Math.max(1, Math.min(p._src.px, o._src.px)) <= 1.35)))
    const best = cands.sort((a, b) => dist(o, a) - dist(o, b))[0]
    if (best && dist(o, best) < 0.9) pair(o, best)
  }
  for (const o of objs) if (!o.id) o.id = mk(o.kind === 'image' ? 'img' : o.kind === 'text' ? 'txt' : 'shp')
  slides.push({ n: n + 1, background: raw[n].background, transition: { speed: null, durationMs: null, morph: null }, objects: objs })
}
for (const s of slides) for (const o of s.objects) { delete o._key; delete o._src }
const data = { source: new URL(url).pathname, canvas: { w: 1920, h: 1080 }, slides, media }
const header = `// Generated by scripts/morph-import-canva.mjs from a Canva Morph deck: geometry only, no pictures. Do not edit by hand (the template's own words and pictures are in ../templates).\nimport type { TemplateData } from '../types'\n\nexport const ${name}: TemplateData = ${JSON.stringify(data)}\n`
writeFileSync(out.startsWith('/') ? out : join(dirname(fileURLToPath(import.meta.url)), '..', out), header)
console.log(`${slides.length} slides, ${slides.reduce((n, s) => n + s.objects.length, 0)} objects, ${Object.keys(media).length} distinct pictures -> ${out}`)
