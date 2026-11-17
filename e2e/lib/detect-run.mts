/** the picture finder as pictures.ts runs it (small copy -> findPhotos -> refineRect), for Node tests; see detect-fixtures.mjs */
import { resizeTo } from './detect-fixtures.mjs'
import { downscale, findPhotos, refineRect, SMALL_WIDTH, TILE, type Img, type Rect } from '../../apps/web/lib/pdf-editor/picture-detect.ts'

export function detectOn(full0: Img, text0: Rect[], strict = false, width = Number(process.env.DETECT_WIDTH || 1600)): (Rect & { maybe: boolean })[] {
  const { img: full, k: kk } = resizeTo(full0, width)
  const text = text0.map((t) => ({ x: t.x * kk, y: t.y * kk, w: t.w * kk, h: t.h * kk }))
  const small = downscale(full, SMALL_WIDTH)
  const k = small.w / full.w
  const cands = findPhotos(small, text.map((t) => ({ x: t.x * k, y: t.y * k, w: t.w * k, h: t.h * k })), strict, process.env.OLD ? undefined : { img: full, scale: 1 / k })
  return cands.map((c) => ({ ...refineRect(full, { x: c.rect.x / k, y: c.rect.y / k, w: c.rect.w / k, h: c.rect.h / k }, text, Math.ceil((2.5 * TILE) / k)), maybe: !!c.maybe })).map((r) => ({ ...r, x: r.x / kk, y: r.y / kk, w: r.w / kk, h: r.h / kk }))
}
