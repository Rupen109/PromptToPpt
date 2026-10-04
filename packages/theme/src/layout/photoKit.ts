import type { SlideContent, SlideElement } from '@prompttoppt/validation'
import { contrastRatio, mix } from '../color'
import { decor, hexOutline } from './decor'
import { type Ctx, deco, emphasised, isDark, pal, para, rect, text } from './primitives'
import type { Bg, TitleKind } from './title'

/** A catalogue picture placed on a slide. */
export interface Photo { src: string; alt: string; attribution?: { source: string; license: string; url?: string } }

type ImageElementT = Extract<SlideElement, { type: 'image' }>
type Clip = ImageElementT['clip']
const hexa = (hex: string, a: number) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`

/** Layouts that have a photographic composition. */
export const PHOTO_LAYOUTS = ['title', 'section-divider', 'thank-you', 'quote', 'big-number'] as const

/**
 * Photo slides sit on the SAME ground as the design's body slides (its own background, tint included) with the design's own
 * text colours — a light design stays light and a dark design stays dark from the first slide to the last.
 */
export const groundOf = (c: Ctx) => (c.style.bodyBackground === 'tint' ? mix(pal(c).background, pal(c).primary, 0.035) : pal(c).background)
const inkOf = groundOf
/** A decorative accent that is actually visible on the ground. */
function accentOn(c: Ctx, ground: string) {
  const k = pal(c)
  return [k.accent, k.primary, k.secondary, k.textPrimary].find((x) => contrastRatio(x, ground) >= 3) ?? k.textPrimary
}
/** Wide canvases get side-by-side compositions; 4:3 and 1:1 stack the picture above the text. */
const isWide = (c: Ctx) => c.W / c.H >= 1.6

/** Crop used for a rectangular picture, by the design's photo style (circle becomes an arch: circles only suit squares). */
export const clipFor = (style: Ctx['style']['photo']): Clip => (style === 'hex' ? 'hex' : style === 'split' ? 'diagonal-flip' : style === 'diagonal' ? 'diagonal' : style === 'arch' || style === 'circle' ? 'arch' : 'none')

interface PicOpts { rotation?: number; clip?: Clip; overlay?: ImageElementT['overlay']; kb?: boolean; radius?: number; float?: boolean }
export function picture(c: Ctx, ph: Photo, x: number, y: number, w: number, h: number, o: PicOpts = {}): void {
  const type = o.float ? 'float' : o.kb === false ? 'zoom' : 'kenburns'
  const animation = c.motion.entrance === 'none' && !o.float && o.kb === false ? undefined : { type, delay: 0, duration: type === 'zoom' ? 700 : type === 'float' ? 7000 : 24000 }
  c.els.push({
    type: 'image', id: c.id(), x, y, width: w, height: h, rotation: o.rotation ?? 0, locked: false, zIndex: c.z++, opacity: 1,
    src: ph.src, alt: ph.alt, fit: 'cover', clip: o.clip ?? 'none', ...(ph.attribution ? { attribution: ph.attribution } : {}),
    ...(o.radius !== undefined ? { radius: o.radius } : {}),
    ...(o.overlay ? { overlay: o.overlay } : {}),
    ...(animation ? { animation } : {}),
  } as ImageElementT)
}

/** Title / section / thank-you slide with a photograph. Returns the slide background (the ink the text is judged against). */
export function photoTitle(c: Ctx, content: { title: string; subtitle?: string | undefined }, kind: TitleKind, ph: Photo): Bg {
  const { W, H, M } = c
  const style = c.style.photo
  const ink = inkOf(c)
  const accent = accentOn(c, ink)
  const wide = isWide(c)
  const size = kind === 'title' ? 84 : 72
  if (style === 'wash') return washTitle(c, content, kind, ph)
  if (style === 'banner') return bannerTitle(c, content, kind, ph)
  if (style === 'hex') return hexTitle(c, content, kind, ph)
  const gradient = (angle: number, a: number, b: number) => ({ from: hexa(ink, a), to: hexa(ink, b), angle, opacity: 1 })
  const copy = (x: number, y: number, w: number, h: number, align: 'left' | 'center' = 'left') => {
    const subH = content.subtitle ? 130 : 0
    rect(c, accent, align === 'center' ? x + w / 2 - 60 : x, y, 120, 10, { radius: 5, animate: 'accent' })
    text(c, 'title', [para(content.title)], x, y + 34, w, h - subH - 34, size, { color: 'textPrimary', valign: 'middle', min: 40, align })
    if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], x, y + h - subH + 6, w, subH - 6, 32, { color: 'textSecondary', min: 20, align, animate: 'body' })
  }

  if (!wide && style !== 'frame') {
    // stacked: picture on top fading into the ink, copy underneath
    const ph_h = H * 0.56
    if (style === 'circle' || style === 'arch') {
      const d = Math.min(W * 0.5, H * 0.42)
      picture(c, ph, (W - d) / 2, M * 0.8, style === 'circle' ? d : d * 0.9, d, { clip: style === 'circle' ? 'circle' : 'arch', float: style === 'circle' })
      copy(M, M * 0.8 + d + 40, W - 2 * M, H - (M * 0.8 + d + 40) - M, 'center')
    } else {
      picture(c, ph, 0, 0, W, ph_h, { overlay: gradient(180, 0.1, 1) })
      copy(M, H * 0.46, W - 2 * M, H * 0.46 - M * 0.4)
    }
    return { value: ink }
  }

  switch (style) {
    case 'polaroid': {
      // a print stuck on the slide: white border, slight tilt, strip of tape
      const pw = H * 0.78, tilt = 3
      const px = W - M - pw - 20, py = (H - pw * 1.12) / 2
      rect(c, '#FFFFFF', px, py, pw, pw * 1.12, { radius: 6, rotation: tilt, opacity: 1 })
      picture(c, ph, px + pw * 0.05, py + pw * 0.05, pw * 0.9, pw * 0.9, { rotation: tilt, radius: 2 })
      rect(c, accent, px + pw / 2 - 70, py - 18, 140, 34, { radius: 3, rotation: tilt - 4, opacity: 0.6 })
      copy(M, H / 2 - 230, W * 0.46 - M, 460)
      break
    }
    case 'split': {
      picture(c, ph, W * 0.43, 0, W * 0.57 + 80, H, { clip: 'diagonal-flip', overlay: gradient(90, 0.35, 0) })
      copy(M, H / 2 - 230, W * 0.4 - M, 460)
      break
    }
    case 'circle': {
      const d = H * 0.76
      deco(c, accent, W - M - d - 40, (H - d) / 2 - 40, d + 80, d + 80, { shape: 'ring', stroke: accent, strokeWidth: 3, opacity: 0.5 })
      picture(c, ph, W - M - d, (H - d) / 2, d, d, { clip: 'circle', float: true })
      copy(M, H / 2 - 230, W * 0.46 - M, 460)
      break
    }
    case 'arch': {
      picture(c, ph, W * 0.6, H * 0.08, W * 0.3, H * 0.84, { clip: 'arch' })
      copy(M, H / 2 - 230, W * 0.5 - M, 460)
      break
    }
    case 'diagonal': {
      picture(c, ph, W * 0.38, 0, W * 0.62 + 60, H, { clip: 'diagonal', overlay: gradient(90, 0.3, 0) })
      copy(M, H / 2 - 230, W * 0.4 - M, 460)
      break
    }
    case 'frame': {
      const inset = Math.round(H * 0.06)
      picture(c, ph, inset, inset, W - 2 * inset, H - 2 * inset, { overlay: gradient(180, 0.05, 0.3), radius: Math.min(c.theme.radius, 28) })
      // a solid card carries the words, so the picture can stay vivid around it
      const pw = W * 0.72, ph2 = H * 0.56
      rect(c, ink, (W - pw) / 2, (H - ph2) / 2, pw, ph2, { radius: Math.min(c.theme.radius, 28), opacity: 0.94 })
      copy((W - pw) / 2 + 70, (H - ph2) / 2 + 40, pw - 140, ph2 - 80, 'center')
      break
    }
    default: {
      // full-bleed
      picture(c, ph, 0, 0, W, H, { overlay: gradient(90, 0.95, 0.3) })
      copy(M, H / 2 - 230, W * 0.6, 460)
    }
  }
  return { value: ink }
}

/** Quote beside a tall picture (stacked on narrow canvases). */
export function photoQuote(c: Ctx, s: Extract<SlideContent, { layout: 'quote' }>, ph: Photo): Bg {
  const { W, H, M } = c
  const ink = inkOf(c)
  const accent = accentOn(c, ink)
  const clip = clipFor(c.style.photo)
  const radius = Math.min(c.theme.radius, 28)
  if (isWide(c)) {
    const pw = W * 0.34
    picture(c, ph, M, M, pw, H - 2 * M, { clip, ...(clip === 'none' ? { radius } : {}) })
    const x = M + pw + 90
    rect(c, accent, x, H * 0.2, 120, 10, { radius: 5, animate: 'accent' })
    text(c, 'quote', [para(`“${s.quote}”`)], x, H * 0.24, W - x - M, H * 0.44, 60, { color: 'textPrimary', valign: 'middle', min: 30 })
    if (s.attribution) text(c, 'caption', [para(`— ${s.attribution}`)], x, H * 0.72, W - x - M, H * 0.1, 32, { color: 'textSecondary', min: 18 })
  } else {
    picture(c, ph, M, M, W - 2 * M, H * 0.34, { clip: clip === 'arch' ? 'arch' : 'none', radius })
    const y = M + H * 0.34 + 50
    rect(c, accent, M, y, 120, 10, { radius: 5, animate: 'accent' })
    text(c, 'quote', [para(`“${s.quote}”`)], M, y + 30, W - 2 * M, H - y - 30 - M - 90, 54, { color: 'textPrimary', valign: 'middle', min: 28 })
    if (s.attribution) text(c, 'caption', [para(`— ${s.attribution}`)], M, H - M - 80, W - 2 * M, 80, 30, { color: 'textSecondary', min: 18 })
  }
  return { value: ink }
}

/** One huge number beside a picture. */
export function photoNumber(c: Ctx, s: Extract<SlideContent, { layout: 'big-number' }>, ph: Photo): Bg {
  const { W, H, M } = c
  const ink = inkOf(c)
  const accent = accentOn(c, ink)
  const clip = clipFor(c.style.photo)
  const wide = isWide(c)
  const x = M
  const pw = wide ? W * 0.38 : W - 2 * M
  if (wide) picture(c, ph, W - M - pw, M, pw, H - 2 * M, { clip, ...(clip === 'none' ? { radius: Math.min(c.theme.radius, 28) } : {}) })
  else picture(c, ph, M, M, pw, H * 0.3, { clip: 'none', radius: Math.min(c.theme.radius, 28) })
  const top = wide ? M : M + H * 0.3 + 30
  const w = wide ? W - 2 * M - pw - 80 : W - 2 * M
  const hh = H - top - M
  if (s.title) text(c, 'heading', [para(s.title)], x, top, w, hh * 0.1, 40, { color: accent, min: 22, uppercase: true, tracking: 3 })
  text(c, 'metric', [para(s.value)], x, top + hh * 0.1, w, hh * 0.38, 240, { color: 'textPrimary', valign: 'middle', min: 80, weight: 900 })
  text(c, 'heading', [para(s.label)], x, top + hh * 0.5, w, hh * 0.18, 44, { color: 'textPrimary', min: 24 })
  if (s.context.length) text(c, 'body', s.context.map((t) => para(t, 'bullet')), x, top + hh * 0.7, w, hh * 0.3, 30, { color: 'textSecondary', min: 18 })
  return { value: ink }
}


// ── covers inspired by editorial AI-deck covers ─────────────────────────────────────────────────

/** Cinematic duotone: the photo under a gradient from a deep tone of the brand colour to the accent, copy on the dark side. */
function washTitle(c: Ctx, content: { title: string; subtitle?: string | undefined }, kind: TitleKind, ph: Photo): Bg {
  const { W, H, M } = c
  const k = pal(c)
  // dark designs wash in their own ground colour (a deep green stays green); light ones in a deep tone of the brand colour
  const deep = isDark(k.background) ? mix(k.background, '#000000', 0.2) : mix(k.primary, '#000000', 0.62)
  const wide = isWide(c)
  const fg = '#FFFFFF'
  const soft = mix('#FFFFFF', deep, 0.2)
  picture(c, ph, 0, 0, W, H, { overlay: wide ? { from: hexa(deep, 0.95), to: hexa(k.accent, 0.4), angle: 100, opacity: 1 } : { from: hexa(k.accent, 0.35), to: hexa(deep, 0.96), angle: 180, opacity: 1 } })
  const x = wide ? M * 1.6 : M
  const w = wide ? W * 0.52 : W - 2 * M
  const y = wide ? H * 0.2 : H * 0.42
  const h = wide ? H * 0.55 : H * 0.46
  const size = kind === 'title' ? 84 : 72
  const subH = content.subtitle ? 140 : 0
  c.decoTop = true
  decor(c, true, undefined, '#FFFFFF') // light line-work over the dark wash
  c.decoTop = false
  rect(c, k.accent, x, y, 110, 8, { radius: 4, animate: 'accent' })
  text(c, 'title', [para(content.title)], x, y + 30, w, h - subH - 30, size, { color: fg, valign: 'middle', min: 40 })
  if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], x, y + h - subH + 6, w, subH - 6, 32, { color: soft, min: 20, animate: 'body' })
  return { value: deep }
}

/** A rounded photo band across the top, the title (with an emphasised phrase) beneath it. */
function bannerTitle(c: Ctx, content: { title: string; subtitle?: string | undefined }, kind: TitleKind, ph: Photo): Bg {
  const { W, H, M } = c
  const ink = inkOf(c)
  const accent = accentOn(c, ink)
  decor(c, isDark(ink))
  const bandH = H * (isWide(c) ? 0.5 : 0.4)
  const inset = Math.round(M * 0.35)
  picture(c, ph, inset, inset, W - 2 * inset, bandH, { radius: Math.min(c.theme.radius, 28) + 6 })
  const y = inset + bandH + 36
  const size = kind === 'title' ? 76 : 68
  const subH = content.subtitle ? 110 : 0
  const hh = H - y - M * 0.9
  text(c, 'title', [emphasised(content.title, accent)], M, y, W - 2 * M, hh - subH, size, { valign: 'top', min: 36 })
  if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], M, y + hh - subH + 4, W - 2 * M, subH, 30, { color: 'textSecondary', min: 18, animate: 'body' })
  return { value: ink }
}

/** Photograph cropped to a hexagon with an outlined hex lattice, serif-friendly copy on the left. */
function hexTitle(c: Ctx, content: { title: string; subtitle?: string | undefined }, kind: TitleKind, ph: Photo): Bg {
  const { W, H, M } = c
  const ink = inkOf(c)
  const accent = accentOn(c, ink)
  const wide = isWide(c)
  const d = wide ? H * 0.86 : Math.min(W * 0.62, H * 0.4)
  const px = wide ? W - M - d : (W - d) / 2
  const py = wide ? (H - d) / 2 : M * 0.8
  decor(c, isDark(ink))
  const lattice: [number, number][] = wide ? [[-0.82, 0.5], [0.95, -0.5]] : []
  for (const [ox, oy] of lattice) hexOutline(c, px + d / 2 + ox * d * 0.72, py + d / 2 + oy * d * 0.86, d * 0.2, accent, 0.5)
  picture(c, ph, px, py, d, d, { clip: 'hex' })
  const size = kind === 'title' ? 80 : 68
  const subH = content.subtitle ? 120 : 0
  if (wide) {
    rect(c, accent, M, H / 2 - 200, 110, 8, { radius: 4, animate: 'accent' })
    text(c, 'title', [para(content.title)], M, H / 2 - 170, W - M * 2 - d - 60, 340 - subH, size, { valign: 'middle', min: 38 })
    if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], M, H / 2 + 170 - subH, W - M * 2 - d - 60, subH, 30, { color: 'textSecondary', min: 18, animate: 'body' })
  } else {
    const y = py + d + 40
    text(c, 'title', [para(content.title)], M, y, W - 2 * M, H - y - M - subH, size, { valign: 'middle', min: 34, align: 'center' })
    if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], M, H - M - subH, W - 2 * M, subH, 28, { color: 'textSecondary', min: 18, align: 'center', animate: 'body' })
  }
  return { value: ink }
}
