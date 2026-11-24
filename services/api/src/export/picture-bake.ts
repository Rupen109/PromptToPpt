import sharp, { type Sharp } from 'sharp'
import { PICTURE_SHADOWS, isCropped, pictureColorMatrix, pictureOutline, pictureOutlineSvg, pictureWindow, type SlideElement } from '@prompttoppt/validation'

type ImageEl = Extract<SlideElement, { type: 'image' }>

/**
 * A PowerPoint picture can only be a rectangle or an ellipse with its own colours. Everything else a picture can be in the editor (zoomed into, brightened, black and white, cut to an arch,
 * a hexagon, angled sides, rounded corners, with a shadow) is BAKED into the exported picture here, from the same numbers the screen uses (`pictureWindow` and the helpers in
 * packages/validation), so the file shows what the editor shows. A picture with none of these is left alone (placed as it is, as before).
 */
export const needsBake = (el: ImageEl): boolean => !!el.border || isCropped(el.crop) || (el.zoom ?? 1) > 1 || (el.focus !== undefined && (el.focus.x !== 0.5 || el.focus.y !== 0.5)) || !!el.filter || (!!el.shadow && el.shadow !== 'none') || (el.clip !== 'none' && el.clip !== 'circle') || (el.clip === 'circle' && ((el.zoom ?? 1) > 1))

/** the frame's cut shape as a white mask (none for a plain rectangle): the shared outline (validation picture.ts), the same one the border follows */
const svgMask = (el: ImageEl, w: number, h: number, k: number): string | null => {
  const radius = (el.radius ?? 0) * k
  if ((!el.clip || el.clip === 'none') && radius <= 0) return null
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${pictureOutlineSvg(pictureOutline(el.clip, w, h, radius), 'fill="#fff"')}</svg>`
}

/** the picture as it appears in its frame, as a PNG, plus how much room (canvas units) its shadow needs around the frame */
export async function bakePicture(bytes: Buffer, el: ImageEl): Promise<{ png: Buffer; pad: number }> {
  const k = Math.min(1.5, 2400 / Math.max(el.width, el.height)) // pixels per canvas unit
  const bw = Math.max(1, Math.round(el.width * k)), bh = Math.max(1, Math.round(el.height * k))
  const base = await sharp(bytes).rotate().toBuffer({ resolveWithObject: true })
  const src = { w: base.info.width, h: base.info.height }
  const win = pictureWindow(src, { w: bw, h: bh }, { fit: el.fit, ...(el.zoom !== undefined ? { zoom: el.zoom } : {}), ...(el.focus ? { focus: el.focus } : {}) })
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  let img: Sharp
  if (isCropped(el.crop)) {
    // a cut-out rectangle (fractions of the whole picture), stretched to the frame exactly as the screen draws it
    const c = el.crop
    const left = clamp(Math.round(c.x * src.w), 0, src.w - 1), top = clamp(Math.round(c.y * src.h), 0, src.h - 1)
    img = sharp(base.data).extract({ left, top, width: clamp(Math.round(c.w * src.w), 1, src.w - left), height: clamp(Math.round(c.h * src.h), 1, src.h - top) }).resize(bw, bh, { fit: 'fill' })
  } else if (el.fit === 'cover') {
    // the visible region of the picture, in the picture's own pixels
    const left = clamp(Math.round((win.frameWindow.x - win.offset.x) / win.scale), 0, src.w - 1), top = clamp(Math.round((win.frameWindow.y - win.offset.y) / win.scale), 0, src.h - 1)
    const width = clamp(Math.round(win.frameWindow.w / win.scale), 1, src.w - left), height = clamp(Math.round(win.frameWindow.h / win.scale), 1, src.h - top)
    img = sharp(base.data).extract({ left, top, width, height }).resize(bw, bh, { fit: 'fill' })
  } else {
    // contain: the whole picture sits in the frame with empty bands; the zoom window is cut from that
    const drawn = await sharp(base.data).resize(Math.round(win.drawn.w), Math.round(win.drawn.h), { fit: 'fill' }).png().toBuffer()
    const canvas = await sharp({ create: { width: bw, height: bh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: drawn, left: Math.round(win.offset.x), top: Math.round(win.offset.y) }]).png().toBuffer()
    const fw = win.frameWindow
    img = sharp(canvas).extract({ left: clamp(Math.round(fw.x), 0, bw - 1), top: clamp(Math.round(fw.y), 0, bh - 1), width: clamp(Math.round(fw.w), 1, bw), height: clamp(Math.round(fw.h), 1, bh) }).resize(bw, bh, { fit: 'fill' })
  }
  const f = el.filter
  if (f && (f.brightness !== 1 || f.contrast !== 1)) img = sharp(await img.ensureAlpha().png().toBuffer()).linear([f.brightness * f.contrast, f.brightness * f.contrast, f.brightness * f.contrast, 1], [128 * (1 - f.contrast), 128 * (1 - f.contrast), 128 * (1 - f.contrast), 0]) // brightness, then contrast: the CSS filters' formula
  // the colour (black and white, saturation, warmth): the very matrix the screen draws (packages/validation picture.ts), in sRGB as the screen's SVG filter is
  const colour = pictureColorMatrix(f)
  if (colour) img = sharp(await img.ensureAlpha().png().toBuffer()).recomb(colour)
  // a soft-focus blur: the same standard deviation as the screen's (in this picture's pixels), edges extended, never faded
  if (f && (f.blur ?? 0) > 0) {
    // the edge pixels are copied outwards first (3 standard deviations), blurred, then cut back: the screen's edgeMode="duplicate", so the frame's edges never fade
    // colour and see-through are blurred apart, in float precision (the integer kernel sums a little under 1: a solid picture's edges sank to 253 of 255)
    const sigma = Math.max(0.3, (f.blur ?? 0) * k), pad = Math.ceil(sigma * 3)
    const flat = await img.ensureAlpha().png().toBuffer()
    const soften = async (b: Buffer) => sharp(await sharp(b).extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' }).blur({ sigma, precision: 'float' }).png().toBuffer()).extract({ left: pad, top: pad, width: bw, height: bh }).raw().toBuffer()
    const rgb = await soften(await sharp(flat).removeAlpha().png().toBuffer())
    const alpha = await soften(await sharp(flat).extractChannel(3).png().toBuffer())
    img = sharp(rgb, { raw: { width: bw, height: bh, channels: 3 } }).joinChannel(alpha, { raw: { width: bw, height: bh, channels: 1 } })
  }
  let out = await img.ensureAlpha().png().toBuffer()
  // a border: twice its width along the frame's outline, the mask below cuts the outer half (as the screen's clip does)
  if (el.border) {
    const col = /^#[0-9a-f]{6}$/i.test(el.border.color) ? el.border.color : '#000000'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}" viewBox="0 0 ${bw} ${bh}">${pictureOutlineSvg(pictureOutline(el.clip, bw, bh, (el.radius ?? 0) * k), `fill="none" stroke="${col}" stroke-width="${el.border.width * 2 * k}"`)}</svg>`
    out = await sharp(out).composite([{ input: Buffer.from(svg) }]).png().toBuffer()
  }
  const mask = svgMask(el, bw, bh, k)
  if (mask) out = await sharp(out).composite([{ input: Buffer.from(mask), blend: 'dest-in' }]).png().toBuffer()
  const sh = el.shadow ? PICTURE_SHADOWS[el.shadow] : null
  if (!sh) return { png: out, pad: 0 }
  // a shadow: the picture's own outline, black, blurred, a little lower, behind the picture on a canvas with room for it
  const pad = Math.ceil((sh.blur * 1.3 + sh.dy) * k)
  const silhouette = await sharp(out).linear([0, 0, 0, sh.alpha], [0, 0, 0, 0]).png().toBuffer() // black, as see-through as the shadow should be, in the picture's own outline
  const blurred = await sharp(await sharp({ create: { width: bw + 2 * pad, height: bh + 2 * pad, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: silhouette, left: pad, top: pad + Math.round(sh.dy * k) }]).png().toBuffer()).blur(Math.max(0.5, (sh.blur * k) / 2)).png().toBuffer()
  const png = await sharp(blurred).composite([{ input: out, left: pad, top: pad }]).png().toBuffer()
  return { png, pad: pad / k }
}

/**
 * A slide's background picture as the screen shows it (packages/ui SlideBackground): cover-fitted to the slide, centred (PowerPoint stretches a background picture to the
 * slide, which distorted any picture of another shape), and softened by the same blur as a picture's (edges copied outwards, float precision). JPEG: a photo stays small.
 * `w × h` = the slide in canvas units (one unit = one pixel here, as the blur's units).
 */
export async function backgroundPicture(bytes: Buffer, w: number, h: number, blur = 0): Promise<string> {
  let out = await sharp(bytes).rotate().resize(w, h, { fit: 'cover', position: 'centre' }).removeAlpha().png().toBuffer()
  if (blur > 0) {
    const pad = Math.ceil(blur * 3)
    out = await sharp(await sharp(out).extend({ top: pad, bottom: pad, left: pad, right: pad, extendWith: 'copy' }).blur({ sigma: blur, precision: 'float' }).png().toBuffer()).extract({ left: pad, top: pad, width: w, height: h }).png().toBuffer()
  }
  return `image/jpeg;base64,${(await sharp(out).jpeg({ quality: 86 }).toBuffer()).toString('base64')}`
}
