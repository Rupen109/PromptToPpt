/**
 * How a picture is shown beyond its frame: zoom and position, light adjustments, a shadow, and the shapes it can be cut to. ONE place, read by the editor's canvas (CSS) and by the exporter
 * (which bakes the same values into the exported picture), so what is on the screen and what is in the PowerPoint file are the same numbers.
 */
export const PICTURE_SHADOWS = {
  none: null,
  soft: { dy: 8, blur: 24, alpha: 0.25 },
  strong: { dy: 14, blur: 40, alpha: 0.45 },
} as const
export type PictureShadow = keyof typeof PICTURE_SHADOWS

export interface PictureFilter { brightness: number; contrast: number; grayscale: number; /** 0 = no colour, 1 = as it is, 2 = twice as vivid */ saturation?: number | undefined; /** -1 cool (bluer) … 0 … 1 warm (more golden) */ warmth?: number | undefined; /** soft-focus blur, canvas units */ blur?: number | undefined }
export const NO_FILTER: Required<PictureFilter> = { brightness: 1, contrast: 1, grayscale: 0, saturation: 1, warmth: 0, blur: 0 }

type M3 = [[number, number, number], [number, number, number], [number, number, number]]
const mul = (a: M3, b: M3): M3 => a.map((r) => ([0, 1, 2] as const).map((j) => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j])) as M3
/** CSS `saturate(s)` (Filter Effects spec), in sRGB; grayscale(g) is saturate(1 - g) */
const saturateM = (s: number): M3 => [[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s], [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]]
/** warmth: red and a little green up, blue down (cool: the other way), the way a photo's white balance moves */
const warmthM = (w: number): M3 => [[1 + 0.14 * w, 0, 0], [0, 1 + 0.03 * w, 0], [0, 0, 1 - 0.14 * w]]

/**
 * The colour of a picture as ONE 3×3 matrix on its red, green and blue (sRGB): black-and-white, then saturation, then warmth. The screen draws it with an SVG colour matrix and the
 * exporter bakes it with the same numbers (sharp `recomb`), so the picture in the PowerPoint file has the colours the screen shows. Null = the colours are untouched.
 */
export function pictureColorMatrix(f: Partial<PictureFilter> | undefined): M3 | null {
  if (!f) return null
  const g = f.grayscale ?? 0, s = f.saturation ?? 1, w = f.warmth ?? 0
  if (g <= 0 && s === 1 && w === 0) return null
  return mul(warmthM(w), mul(saturateM(s), saturateM(1 - g)))
}
/** the `values` of an SVG feColorMatrix (4×5) for a 3×3 colour matrix */
export const colorMatrixValues = (m: M3): string => [...m.map((r) => [...r.map((v) => Math.round(v * 10000) / 10000), 0, 0]), [0, 0, 0, 1, 0]].flat().join(' ')

/** the corner points of the cut shapes, as fractions of the frame (the screen draws them as CSS polygons, the exporter as an image mask) */
export const CLIP_POLYGONS = {
  diagonal: [[0.16, 0], [1, 0], [0.84, 1], [0, 1]],
  'diagonal-flip': [[0, 0], [0.84, 0], [1, 1], [0.16, 1]],
  hex: [[0.25, 0.03], [0.75, 0.03], [1, 0.5], [0.75, 0.97], [0.25, 0.97], [0, 0.5]],
} as const

const pct = (n: number) => `${Math.round(n * 10000) / 100}%`
/** the CSS clip-path polygon of a cut shape */
export const clipPolygonCss = (key: keyof typeof CLIP_POLYGONS): string => `polygon(${CLIP_POLYGONS[key].map(([x, y]) => `${pct(x)} ${pct(y)}`).join(', ')})`

/**
 * The CSS `filter` of the light adjustments, or undefined when there are none: brightness and contrast, then the colour matrix (`colorId`: the id of the SVG filter that holds
 * `pictureColorMatrix`, drawn next to the picture), in that order, the order the exporter bakes them.
 */
export function pictureFilterCss(f: Partial<PictureFilter> | undefined, colorId?: string): string | undefined {
  if (!f) return undefined
  const b = f.brightness ?? 1, c = f.contrast ?? 1
  const parts = [b !== 1 ? `brightness(${b})` : '', c !== 1 ? `contrast(${c})` : '', colorId && (pictureColorMatrix(f) || (f.blur ?? 0) > 0) ? `url(#${colorId})` : ''].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

/** the CSS that zooms into a picture around a point of it (the frame keeps its size; 1 = not zoomed; the focus point stays where it is) */
export function pictureZoomCss(zoom: number | undefined, focus: { x: number; y: number } | undefined): { objectPosition?: string; transform?: string; transformOrigin?: string } {
  const fx = focus?.x ?? 0.5, fy = focus?.y ?? 0.5
  const z = zoom ?? 1
  return {
    ...(fx !== 0.5 || fy !== 0.5 ? { objectPosition: `${pct(fx)} ${pct(fy)}` } : {}),
    ...(z !== 1 ? { transform: `scale(${z})`, transformOrigin: `${pct(fx)} ${pct(fy)}` } : {}),
  }
}

export interface PictureCrop { x: number; y: number; w: number; h: number }
/** a crop that really cuts something off (the whole picture is no crop) */
export const isCropped = (c: PictureCrop | undefined): c is PictureCrop => !!c && (c.x > 0.001 || c.y > 0.001 || c.w < 0.999 || c.h < 0.999)
/** The picture element's style inside a frame that clips it: the cut-out rectangle is stretched to the frame (the frame is sized to the cut-out, so it is not distorted). */
export function cropImgCss(c: PictureCrop): { position: 'absolute'; width: string; height: string; left: string; top: string; objectFit: 'fill'; maxWidth: 'none' } {
  return { position: 'absolute', width: `${pct(1 / c.w)}`, height: `${pct(1 / c.h)}`, left: `${pct(-c.x / c.w)}`, top: `${pct(-c.y / c.h)}`, objectFit: 'fill', maxWidth: 'none' }
}

/** the CSS drop shadow of a named shadow (applied OUTSIDE the cut shape, so it follows the shape) */
export function pictureShadowCss(shadow: PictureShadow | undefined): string | undefined {
  const s = shadow ? PICTURE_SHADOWS[shadow] : null
  return s ? `drop-shadow(0 ${s.dy}px ${s.blur}px rgba(0,0,0,${s.alpha}))` : undefined
}

/**
 * The part of the picture that is visible, in the picture's own pixels, for a frame of `box` pixels: what `object-fit` cover (or contain) shows, then the zoom around the focus point.
 * `window` is the region to cut out of the picture; `canvas` is where the picture sits inside the frame (for `contain`, with empty bands).
 */
export function pictureWindow(src: { w: number; h: number }, box: { w: number; h: number }, o: { fit: 'cover' | 'contain'; zoom?: number | undefined; focus?: { x: number; y: number } | undefined }) {
  const z = Math.max(1, o.zoom ?? 1), fx = o.focus?.x ?? 0.5, fy = o.focus?.y ?? 0.5
  const s = o.fit === 'cover' ? Math.max(box.w / src.w, box.h / src.h) : Math.min(box.w / src.w, box.h / src.h)
  const cw = src.w * s, ch = src.h * s // the picture as drawn, in frame pixels
  const ox = o.fit === 'cover' ? -(cw - box.w) * fx : (box.w - cw) / 2, oy = o.fit === 'cover' ? -(ch - box.h) * fy : (box.h - ch) / 2
  // the visible region of the frame after zooming around the focus point (in frame pixels), then back into picture pixels
  const wx = fx * box.w * (1 - 1 / z), wy = fy * box.h * (1 - 1 / z), ww = box.w / z, wh = box.h / z
  return { scale: s, drawn: { w: cw, h: ch }, offset: { x: ox, y: oy }, frameWindow: { x: wx, y: wy, w: ww, h: wh } }
}

/**
 * The outline of a picture's frame as an SVG shape (frame size w × h, in whatever units the caller draws in): its cut shape (circle, arch, diagonal, hexagon) or its
 * rectangle with rounded corners. ONE geometry for the exporter's mask, a picture's border on the screen and in the exported picture. A border is drawn as a stroke TWICE
 * its width along this outline: the frame's clip cuts the outer half, so the border sits inside the frame and follows its shape exactly.
 */
export function pictureOutline(clip: string | undefined, w: number, h: number, radius = 0): { tag: 'ellipse' | 'path' | 'polygon' | 'rect'; attrs: Record<string, string | number> } {
  if (clip === 'circle') return { tag: 'ellipse', attrs: { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 } }
  if (clip === 'arch') { const r = Math.min(w / 2, h); return { tag: 'path', attrs: { d: `M0 ${h} L0 ${r} A ${r} ${r} 0 0 1 ${w} ${r} L${w} ${h} Z` } } }
  if (clip === 'diagonal' || clip === 'diagonal-flip' || clip === 'hex') return { tag: 'polygon', attrs: { points: CLIP_POLYGONS[clip].map(([x, y]) => `${x * w},${y * h}`).join(' ') } }
  const r = Math.min(Math.max(0, radius), w / 2, h / 2)
  return { tag: 'rect', attrs: { x: 0, y: 0, width: w, height: h, rx: r, ry: r } }
}
/** the outline as SVG markup (for the exporter) */
export const pictureOutlineSvg = (o: ReturnType<typeof pictureOutline>, paint: string) => `<${o.tag} ${Object.entries(o.attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} ${paint}/>`

/** how much a picture is blurred, at most (canvas units; the same number is the CSS / SVG blur's standard deviation and the exporter's) */
export const PICTURE_BLUR_MAX = 30

/**
 * The rounding of a picture's corners, as the slide draws it: a plain (uncut) picture takes its own radius, else the deck's (theme) radius; a circle or another cut shape
 * has its own outline instead (0 here). ONE rule for the screen, the exporter's baked pictures and PowerPoint's own rounded rectangle.
 */
export function pictureRadius(el: { clip?: string | undefined; radius?: number | undefined }, themeRadius: number): number {
  if (el.clip && el.clip !== 'none') return 0
  return Math.max(0, el.radius ?? themeRadius)
}
/** PowerPoint's rounded-rectangle `adj` (corner radius ÷ the shorter side × 100000, at most 50000) for a corner radius on a w × h frame: the exact same corners */
export const pptRoundAdj = (radius: number, w: number, h: number) => Math.round(Math.min(50000, Math.max(0, (radius / Math.max(1, Math.min(w, h))) * 100000)))
