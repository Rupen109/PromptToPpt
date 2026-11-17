/**
 * The cover left where a picture was picked up. It is built from the page's background MODEL (a smooth colour surface fitted to the parts of the slide
 * that are known to be background: see picture-detect.ts `fitBackground`), not from the pixels just outside the box, which may belong to other shapes
 * (a row of chevrons right under the photo, a card beside it). Browser only (canvas); the maths is in picture-detect.ts.
 */
import { downscale, fitBackground, SMALL_WIDTH, type Img, type Rect } from './picture-detect'
import type { Box } from './model'
import type { CoverPatch } from './render'

export interface ModelCover { /** the area to fill (page points): the picture plus a little more on every side that has only background beyond it */ box: Box; bg: string; patch: CoverPatch | null }
const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`

/**
 * `canvas` = the drawn page, `pxPerPt` its scale, `pic` = the picture's box and `pad` how far the cover may reach past it (page points: it must hide the picture's
 * soft edge), `keep` = boxes of other things (text lines, other pictures) that must not feed the model. A side with another shape right beyond the picture (a row of
 * chevrons that starts at the photo's lower edge) gets no padding at all: the cover would eat into that shape. Returns null when the page has no background the model
 * can describe (then the caller falls back to reading the pixels around the box).
 */
export function modelCover(canvas: HTMLCanvasElement, pxPerPt: number, pic: Box, page: { w: number; h: number }, pad: number, keep: Box[]): ModelCover | null {
  const g = canvas.getContext('2d', { willReadFrequently: true })
  if (!g) return null
  const raw = g.getImageData(0, 0, canvas.width, canvas.height)
  const full: Img = { data: raw.data, w: raw.width, h: raw.height }
  const small = downscale(full, SMALL_WIDTH), f = full.w / small.w
  const toSmall = (b: Box): Rect => ({ x: (b.x * pxPerPt) / f, y: (b.y * pxPerPt) / f, w: (b.w * pxPerPt) / f, h: (b.h * pxPerPt) / f })
  const bg = fitBackground(small, [...keep.map(toSmall), toSmall(pic)])
  if (bg.support < 0.15) return null
  // which sides may be padded: the strip just beyond the picture must still be background (as the model sees it)
  const padPx = Math.max(1, Math.round(pad * pxPerPt))
  const offBg = (x0: number, y0: number, x1: number, y1: number): number => {
    let n = 0, off = 0
    for (let y = Math.max(0, y0); y < Math.min(full.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(full.w, x1); x += 2) {
      const o = (y * full.w + x) * 4, m = bg.at(x / f, y / f); n++
      if (Math.hypot(full.data[o]! - m[0], full.data[o + 1]! - m[1], full.data[o + 2]! - m[2]) > 22) off++
    }
    return n ? off / n : 0
  }
  const px0 = Math.round(pic.x * pxPerPt), py0 = Math.round(pic.y * pxPerPt), px1 = Math.round((pic.x + pic.w) * pxPerPt), py1 = Math.round((pic.y + pic.h) * pxPerPt)
  const padL = offBg(px0 - padPx, py0, px0, py1) > 0.3 ? 0 : pad, padR = offBg(px1, py0, px1 + padPx, py1) > 0.3 ? 0 : pad
  const padT = offBg(px0, py0 - padPx, px1, py0) > 0.3 ? 0 : pad, padB = offBg(px0, py1, px1, py1 + padPx) > 0.3 ? 0 : pad
  const bx = Math.max(0, pic.x - padL), by = Math.max(0, pic.y - padT)
  const box: Box = { x: bx, y: by, w: Math.min(page.w, pic.x + pic.w + padR) - bx, h: Math.min(page.h, pic.y + pic.h + padB) - by }
  // does the model describe the places around the box? Ring just outside it: of the pixels that look like background, how far off is the model?
  const ring = (() => {
    const b = toSmall(box), r = 3, errs: number[] = []
    const probe = (x: number, y: number): void => {
      const xi = Math.round(x), yi = Math.round(y)
      if (xi < 0 || yi < 0 || xi >= small.w || yi >= small.h) return
      const o = (yi * small.w + xi) * 4, m = bg.at(xi, yi)
      const e = Math.hypot(small.data[o]! - m[0], small.data[o + 1]! - m[1], small.data[o + 2]! - m[2])
      if (e <= 14) errs.push(e)
      else errs.push(NaN)
    }
    for (let x = b.x; x < b.x + b.w; x += 2) { probe(x, b.y - r); probe(x, b.y + b.h + r) }
    for (let y = b.y; y < b.y + b.h; y += 2) { probe(b.x - r, y); probe(b.x + b.w + r, y) }
    const good = errs.filter((e) => !Number.isNaN(e))
    return { share: errs.length ? good.length / errs.length : 0, mean: good.length ? good.reduce((s, v) => s + v, 0) / good.length : 99 }
  })()
  if (ring.share < 0.25 || ring.mean > 7) return null // the surroundings are mostly something else, or the model is off there: not a page the model can speak for
  // the model over the box, in canvas pixels
  const x0 = Math.max(0, Math.floor(box.x * pxPerPt)), y0 = Math.max(0, Math.floor(box.y * pxPerPt))
  const w = Math.min(canvas.width - x0, Math.ceil(box.w * pxPerPt)), h = Math.min(canvas.height - y0, Math.ceil(box.h * pxPerPt))
  if (w < 2 || h < 2) return null
  const at = (px: number, py: number): [number, number, number] => bg.at((x0 + px) / f, (y0 + py) / f)
  const c00 = at(0, 0), c10 = at(w - 1, 0), c01 = at(0, h - 1), c11 = at(w - 1, h - 1)
  let spread = 0
  for (const a of [c00, c10, c01, c11]) for (const b of [c00, c10, c01, c11]) spread = Math.max(spread, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
  const mid = at(w >> 1, h >> 1)
  if (spread < 3) return { box, bg: hex(mid[0], mid[1], mid[2]), patch: null } // flat enough: one colour is exact
  // a gradient: the plane is linear, so a small picture is enough (the viewer scales it smoothly)
  const k = Math.min(1, 800 / Math.max(w, h)), pw = Math.max(2, Math.round(w * k)), ph = Math.max(2, Math.round(h * k))
  const out = document.createElement('canvas'); out.width = pw; out.height = ph
  const oc = out.getContext('2d')!, img = oc.createImageData(pw, ph)
  for (let j = 0; j < ph; j++) for (let i = 0; i < pw; i++) {
    const c = at((i / (pw - 1)) * (w - 1), (j / (ph - 1)) * (h - 1)), o = (j * pw + i) * 4
    img.data[o] = Math.max(0, Math.min(255, Math.round(c[0]))); img.data[o + 1] = Math.max(0, Math.min(255, Math.round(c[1]))); img.data[o + 2] = Math.max(0, Math.min(255, Math.round(c[2]))); img.data[o + 3] = 255
  }
  oc.putImageData(img, 0, 0)
  const url = out.toDataURL('image/png'); out.width = 0
  const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { box, bg: hex(mid[0], mid[1], mid[2]), patch: { url, bytes } }
}
