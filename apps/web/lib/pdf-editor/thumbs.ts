/**
 * Page rail thumbnails that show the visitor's edits. The original page is drawn once per file page at low resolution (a small JPEG); a page that has
 * edits is then composed on a canvas: that picture, then every item (covers, pictures, shapes, pen lines, highlights, text) scaled down, in page space
 * (the extra turn is applied by the rail with CSS, like for any thumbnail). Browser only.
 */
import { HIGHLIGHT_OPACITY, type Anno, type PageState, pageSize } from './model'
import { baselineAt, cssFont, hasRtl, lineStyles, stretches, textLines } from './text'

export const THUMB_W = 224

const load = (url: string): Promise<HTMLImageElement | null> => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url })

function drawAnno(c: CanvasRenderingContext2D, a: Anno, k: number, imgs: Map<string, HTMLImageElement | null>): void {
  c.save()
  switch (a.kind) {
    case 'whiteout': { const im = a.patch ? imgs.get(a.patch.url) : null; if (im) c.drawImage(im, a.x * k, a.y * k, a.w * k, a.h * k); else { c.fillStyle = a.color; c.fillRect(a.x * k, a.y * k, a.w * k, a.h * k) } break }
    case 'highlight': c.globalCompositeOperation = 'multiply'; c.globalAlpha = HIGHLIGHT_OPACITY; c.fillStyle = a.color; c.fillRect(a.x * k, a.y * k, a.w * k, a.h * k); break
    case 'image': { const im = imgs.get(a.url); if (im) c.drawImage(im, a.x * k, a.y * k, a.w * k, a.h * k); break }
    case 'shape': {
      c.lineWidth = Math.max(0.5, a.width * k); c.strokeStyle = a.stroke; if (a.fill) c.fillStyle = a.fill
      c.beginPath()
      if (a.shape === 'rect') c.rect(a.x * k, a.y * k, a.w * k, a.h * k); else c.ellipse((a.x + a.w / 2) * k, (a.y + a.h / 2) * k, (a.w / 2) * k, (a.h / 2) * k, 0, 0, Math.PI * 2)
      if (a.fill) c.fill()
      if (a.width > 0) c.stroke()
      break
    }
    case 'path': {
      c.strokeStyle = a.color; c.lineWidth = Math.max(0.5, a.width * k); c.lineCap = 'round'; c.lineJoin = 'round'
      const pts = a.points.map(([nx, ny]) => [(a.x + nx * a.w) * k, (a.y + ny * a.h) * k] as const)
      c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); if (pts.length === 1) c.lineTo(pts[0]![0] + 0.01, pts[0]![1]); c.stroke()
      if (a.variant === 'arrow' && pts.length >= 2) {
        const p = pts[0]!, q = pts.at(-1)!, ang = Math.atan2(q[1] - p[1], q[0] - p[0]), len = Math.max(8, a.width * 4) * k
        c.beginPath(); for (const s of [-1, 1]) { c.moveTo(q[0], q[1]); c.lineTo(q[0] - len * Math.cos(ang + s * 0.5), q[1] - len * Math.sin(ang + s * 0.5)) } c.stroke()
      }
      break
    }
    case 'text': {
      c.fillStyle = a.color; c.textBaseline = 'alphabetic'; c.fontKerning = 'none'
      const rtl = hasRtl(a.text); c.direction = rtl ? 'rtl' : 'ltr'; c.textAlign = rtl ? 'right' : 'left'
      textLines(a).forEach((line, i) => {
        const y = (a.y + baselineAt(a, i)) * k
        if (rtl) { c.font = cssFont(a.fam, a.bold, a.italic, a.size * k); c.fillText(line, (a.x + a.w) * k, y); return }
        let x = a.x * k
        for (const s of stretches(line, lineStyles(a, i))) { c.font = cssFont(a.fam, s.bold, s.italic, a.size * k); c.fillText(s.text, x, y); x += c.measureText(s.text).width }
      })
      break
    }
  }
  c.restore()
}

/** a thumbnail of `page` (without its extra turn) with all its items drawn on `base` (the original page picture, or null for a blank page); resolves with a JPEG blob URL */
export async function composeThumb(page: PageState, base: string | null): Promise<string> {
  const { w, h } = pageSize(page.geom), k = THUMB_W / w
  const canvas = document.createElement('canvas'); canvas.width = THUMB_W; canvas.height = Math.max(1, Math.round(h * k))
  const c = canvas.getContext('2d')!
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height)
  const urls = new Set<string>(); if (base) urls.add(base)
  for (const a of page.annos) { if (a.kind === 'image') urls.add(a.url); if (a.kind === 'whiteout' && a.patch) urls.add(a.patch.url) }
  const imgs = new Map<string, HTMLImageElement | null>(await Promise.all([...urls].map(async (u) => [u, await load(u)] as const)))
  const b = base ? imgs.get(base) : null
  if (b) c.drawImage(b, 0, 0, canvas.width, canvas.height)
  for (const a of page.annos) drawAnno(c, a, k, imgs)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8))
  canvas.width = 0
  if (!blob) throw new Error('thumbnail failed')
  return URL.createObjectURL(blob)
}
