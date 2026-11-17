import sharp from 'sharp'
import type { Pkg } from './package.ts'
import type { ImageJob } from './walk.ts'
import { IMPORT_LIMITS, type ExtractedPicture } from './types.ts'

/**
 * Pictures of the file, made safe and ready: decoded under a pixel limit (a small file can hold a huge picture), cropped as the slide crops it, mirrored as the slide mirrors it,
 * stretched to the box it fills (what PowerPoint does), capped in size and re-encoded as PNG (when it has transparency) or JPEG. Metadata (EXIF, GPS, colour profiles) is dropped
 * by the re-encode. Anything that cannot be decoded (EMF/WMF/SVG, damaged files, animated formats beyond their first frame) is reported, never thrown.
 */
sharp.cache(false)
sharp.concurrency(1)
sharp.simd(true)

export interface ImageResult { ok: Map<string, ExtractedPicture>; failed: Map<string, string> }

export async function processImages(jobs: Map<string, ImageJob>, pkg: Pkg, deadline: number): Promise<ImageResult> {
  const ok = new Map<string, ExtractedPicture>()
  const failed = new Map<string, string>()
  let total = 0
  for (const job of jobs.values()) {
    if (ok.size >= IMPORT_LIMITS.maxImages) { failed.set(job.ref, 'more pictures than the importer keeps'); continue }
    if (Date.now() > deadline) { failed.set(job.ref, 'out of time'); continue }
    if (job.gradient) {
      try { const r = await gradientPicture(job); total += r.bytes.length; ok.set(job.ref, r) } catch { failed.set(job.ref, 'could not be drawn') }
      continue
    }
    const bytes = pkg.media(job.mediaKey)
    if (!bytes || bytes.length === 0) { failed.set(job.ref, 'missing from the file'); continue }
    try {
      const r = await one(bytes, job)
      if (total + r.bytes.length > IMPORT_LIMITS.maxImageBytes) { failed.set(job.ref, 'picture storage limit reached'); continue }
      total += r.bytes.length
      ok.set(job.ref, r)
    } catch (e) {
      failed.set(job.ref, /pixel limit|Input image exceeds/i.test(String((e as Error).message)) ? 'too large in pixels' : 'could not be decoded')
    }
  }
  return { ok, failed }
}

async function one(bytes: Uint8Array, job: ImageJob): Promise<ExtractedPicture> {
  const base = () => sharp(bytes, { limitInputPixels: IMPORT_LIMITS.maxSourcePixels, failOn: 'error', sequentialRead: true, animated: false })
  const meta = await base().metadata()
  if (!meta.width || !meta.height || !meta.format || !['jpeg', 'png', 'webp', 'gif', 'tiff', 'heif', 'avif'].includes(meta.format)) throw new Error('unsupported')
  if (meta.width * meta.height > IMPORT_LIMITS.maxSourcePixels) throw new Error('pixel limit')
  const swapped = (meta.orientation ?? 1) >= 5
  const sw = swapped ? meta.height : meta.width, sh = swapped ? meta.width : meta.height
  let pipe = base().rotate() // follow the camera's orientation flag, then forget it
  let cw = sw, ch = sh
  const c = job.crop
  if (c && (c.l > 0 || c.t > 0 || c.r > 0 || c.b > 0)) {
    const l = Math.max(0, Math.round(sw * Math.max(0, c.l))), t = Math.max(0, Math.round(sh * Math.max(0, c.t)))
    const w = Math.max(1, Math.round(sw * (1 - Math.max(0, c.l) - Math.max(0, c.r)))), h = Math.max(1, Math.round(sh * (1 - Math.max(0, c.t) - Math.max(0, c.b))))
    cw = Math.min(w, sw - l); ch = Math.min(h, sh - t)
    if (cw < 1 || ch < 1) throw new Error('empty crop')
    pipe = pipe.extract({ left: l, top: t, width: cw, height: ch })
  }
  if (job.flipV) pipe = pipe.flip()
  if (job.flipH) pipe = pipe.flop()
  // as large as the box needs, never larger than the picture itself has (no pretend sharpness)
  const k = Math.min(1, cw / job.outW, ch / job.outH)
  const ow = Math.max(8, Math.round(job.outW * k)), oh = Math.max(8, Math.round(job.outH * k))
  pipe = pipe.resize(Math.min(ow, IMPORT_LIMITS.maxImageSide), Math.min(oh, IMPORT_LIMITS.maxImageSide), { fit: 'fill', kernel: 'lanczos3' })
  if (job.duotone) {
    // PowerPoint's duotone: the picture in two colours, the shadows one and the highlights the other
    const grey = await pipe.clone().greyscale().raw().toBuffer({ resolveWithObject: true })
    const [d, l] = job.duotone.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const) as [readonly [number, number, number], readonly [number, number, number]]
    const { width, height, channels } = grey.info
    const rgb = Buffer.alloc(width * height * 3)
    for (let i = 0; i < width * height; i++) { const v = grey.data[i * channels]! / 255; rgb[i * 3] = d[0] + (l[0] - d[0]) * v; rgb[i * 3 + 1] = d[1] + (l[1] - d[1]) * v; rgb[i * 3 + 2] = d[2] + (l[2] - d[2]) * v }
    const jpg = await sharp(rgb, { raw: { width, height, channels: 3 } }).jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true })
    return { ref: job.ref, bytes: new Uint8Array(jpg.data), mime: 'image/jpeg', width: jpg.info.width, height: jpg.info.height }
  }
  const alpha = !!meta.hasAlpha
  let out = alpha ? await pipe.clone().png({ compressionLevel: 9, effort: 4 }).toBuffer({ resolveWithObject: true }) : await pipe.clone().jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  if (out.data.length > 6 * 1024 * 1024) out = alpha ? await pipe.clone().resize(Math.round(out.info.width * 0.6), Math.round(out.info.height * 0.6)).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true }) : await pipe.clone().jpeg({ quality: 70, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  if (out.data.length > 8 * 1024 * 1024) throw new Error('too big')
  return { ref: job.ref, bytes: new Uint8Array(out.data), mime: alpha ? 'image/png' : 'image/jpeg', width: out.info.width, height: out.info.height }
}

/** A gradient with any stops drawn as a picture (PowerPoint backgrounds often have three stops or a radial fill, which the editor's two-colour gradient cannot hold). */
async function gradientPicture(job: ImageJob): Promise<ExtractedPicture> {
  const g = job.gradient!
  const w = job.outW, h = job.outH
  const stops = g.stops.map((s) => ({ pos: s.pos, rgb: [parseInt(s.hex.slice(1, 3), 16), parseInt(s.hex.slice(3, 5), 16), parseInt(s.hex.slice(5, 7), 16)] as const })).sort((a, b) => a.pos - b.pos)
  const at = (t: number): [number, number, number] => {
    if (t <= stops[0]!.pos) return [...stops[0]!.rgb]
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1]!, b = stops[i]!
      if (t <= b.pos) { const k = b.pos === a.pos ? 1 : (t - a.pos) / (b.pos - a.pos); return [a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k, a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k, a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k] }
    }
    return [...stops[stops.length - 1]!.rgb]
  }
  const lut = Array.from({ length: 1024 }, (_, i) => at(i / 1023))
  const rgb = Buffer.alloc(w * h * 3)
  const rad = (g.angle * Math.PI) / 180, dx = Math.cos(rad), dy = Math.sin(rad)
  const extent = Math.abs(w * dx) + Math.abs(h * dy) || 1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = g.radial ? Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2)) / Math.SQRT2 : ((x + 0.5 - w / 2) * dx + (y + 0.5 - h / 2) * dy) / extent + 0.5
    const c = lut[Math.max(0, Math.min(1023, Math.round(t * 1023)))]!
    const o = (y * w + x) * 3
    rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2]
  }
  const out = await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  return { ref: job.ref, bytes: new Uint8Array(out.data), mime: 'image/jpeg', width: out.info.width, height: out.info.height }
}
