import { decor } from './decor'
import { type Ctx, deco, onBg, pal, para, rect, stopsOf, text, titleBg, isDark } from './primitives'
import { mix } from '../color'

export type TitleKind = 'title' | 'section-divider' | 'thank-you'
export interface Bg {
  value: string
  gradient?: { from: string; to: string; angle: number } | undefined
}

/**
 * The nine title compositions. Each one defines the whole slide (background, panels, ornaments, text placement), so two
 * templates with the same colours but different `title` styles genuinely look different. Returns the slide background.
 */
export function titleSlide(c: Ctx, content: { title: string; subtitle?: string | undefined }, kind: TitleKind): Bg {
  const { W, H, M } = c
  const k = pal(c)
  const innerW = W - 2 * M
  const tb = titleBg(c)
  const dark = isDark(tb.value)
  const fg = onBg(c, stopsOf(tb))
  const fgSoft = dark ? mix(fg, tb.value, 0.18) : fg
  const accent = dark ? k.secondary : k.accent
  const size = kind === 'title' ? 84 : 72
  const lightBg = k.background
  const sub = (x: number, y: number, w: number, color: string, align: 'left' | 'center' | 'right' = 'left', h = 130) => {
    if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], x, y, w, h, 32, { color, align, min: 20, animate: 'body' })
  }
  const grad = (from: string, to: string, angle = 135) => ({ from, to, angle })

  switch (c.style.title) {
    case 'split': {
      const pw = W * 0.6
      deco(c, tb.value, 0, 0, pw, H, { opacity: 1, ...(tb.gradient ? { gradient: tb.gradient } : {}) })
      deco(c, '#000000', W * 0.64, H * 0.16, H * 0.68, H * 0.68, { shape: 'ellipse', gradient: grad(k.primary, k.accent), opacity: 0.95 })
      deco(c, k.secondary, W * 0.64 + H * 0.42, H * 0.12, H * 0.26, H * 0.26, { shape: 'ellipse', opacity: 0.95 })
      deco(c, k.primary, W * 0.6 + 40, H * 0.1, H * 0.78, H * 0.78, { shape: 'ring', stroke: k.primary, strokeWidth: 3, opacity: 0.25 })
      rect(c, accent, M, H / 2 - 150, 120, 12, { radius: 6, animate: 'accent' })
      text(c, 'title', [para(content.title)], M, H / 2 - 110, pw - 2 * M, 280, size, { color: fg, valign: 'middle', min: 40 })
      sub(M, H / 2 + 190, pw - 2 * M, fgSoft)
      return { value: lightBg }
    }
    case 'center': {
      decor(c, dark)
      deco(c, fg, W / 2 - H * 0.62, H / 2 - H * 0.62, H * 1.24, H * 1.24, { shape: 'ring', stroke: fg, strokeWidth: 3, opacity: 0.1 })
      deco(c, fg, W / 2 - H * 0.48, H / 2 - H * 0.48, H * 0.96, H * 0.96, { shape: 'ring', stroke: fg, strokeWidth: 3, opacity: 0.07 })
      rect(c, accent, W / 2 - 60, H / 2 - 190, 120, 12, { radius: 6, animate: 'accent' })
      text(c, 'title', [para(content.title)], M * 2, H / 2 - 150, W - 4 * M, 270, size, { color: fg, align: 'center', valign: 'middle', min: 40 })
      sub(M * 3, H / 2 + 150, W - 6 * M, fgSoft, 'center')
      return tb
    }
    case 'band': {
      decor(c, false)
      const bh = H * 0.34
      deco(c, tb.value, 0, H * 0.3, W, bh, { opacity: 1, ...(tb.gradient ? { gradient: tb.gradient } : {}) })
      deco(c, accent, 0, H * 0.3 + bh, W * 0.22, 14, { opacity: 1 })
      text(c, 'title', [para(content.title)], M, H * 0.3 + 20, innerW * 0.88, bh - 40, size, { color: fg, valign: 'middle', min: 40 })
      if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], M, H * 0.3 + bh + 44, innerW * 0.8, 130, 32, { color: 'textSecondary', min: 20, animate: 'body' })
      return { value: lightBg }
    }
    case 'frame': {
      decor(c, dark)
      const inset = Math.round(H * 0.055)
      deco(c, 'none', inset, inset, W - 2 * inset, H - 2 * inset, { stroke: fg, strokeWidth: 3, opacity: 0.55 })
      for (const [x, y] of [[inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]] as const) deco(c, accent, x - 12, y - 12, 24, 24, { opacity: 1 })
      text(c, 'title', [para(content.title)], inset + 80, H / 2 - 150, W - 2 * inset - 160, 280, size, { color: fg, align: 'center', valign: 'middle', min: 40 })
      sub(inset + 120, H / 2 + 150, W - 2 * inset - 240, fgSoft, 'center')
      return tb
    }
    case 'diagonal': {
      deco(c, tb.value, W * 0.6, -H * 0.2, W * 0.62, H * 1.5, { rotation: 14, opacity: 1, ...(tb.gradient ? { gradient: tb.gradient } : {}) })
      deco(c, accent, W * 0.57, -H * 0.2, 22, H * 1.5, { rotation: 14, opacity: 1 })
      rect(c, k.accent, M, H / 2 - 170, 120, 12, { radius: 6, animate: 'accent' })
      text(c, 'title', [para(content.title)], M, H / 2 - 130, W * 0.44, 300, size, { valign: 'middle', min: 40 })
      if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], M, H / 2 + 190, W * 0.44, 130, 32, { color: 'textSecondary', min: 20, animate: 'body' })
      return { value: lightBg }
    }
    case 'minimal': {
      decor(c, false)
      rect(c, k.textPrimary, M, M, innerW, 4)
      rect(c, k.accent, M, H * 0.3, 40, 40, { radius: Math.min(8, c.theme.radius) })
      text(c, 'title', [para(content.title)], M, H * 0.36, innerW * 0.86, H * 0.42, kind === 'title' ? 96 : 80, { valign: 'bottom', min: 44 })
      if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], M, H * 0.8, innerW * 0.7, 120, 32, { color: 'textSecondary', min: 20, animate: 'body' })
      return { value: lightBg }
    }
    case 'badge': {
      decor(c, dark)
      deco(c, '#000000', W * 0.62, H * 0.16, H * 0.68, H * 0.68, { shape: 'ellipse', gradient: grad(accent, k.secondary, 135), opacity: 0.95 })
      deco(c, fg, W * 0.62 - 36, H * 0.16 - 36, H * 0.68 + 72, H * 0.68 + 72, { shape: 'ring', stroke: fg, strokeWidth: 3, opacity: 0.2 })
      text(c, 'title', [para(content.title)], M, H / 2 - 150, W * 0.52, 300, size, { color: fg, valign: 'middle', min: 40 })
      sub(M, H / 2 + 170, W * 0.5, fgSoft)
      return tb
    }
    case 'stack': {
      decor(c, dark)
      rect(c, accent, M, M, 16, H - 2 * M, { radius: 4, animate: 'accent' })
      text(c, 'title', [para(content.title)], M + 56, M, innerW - 56, H * 0.62, kind === 'title' ? 120 : 96, { color: fg, valign: 'bottom', weight: 900, uppercase: true, tracking: 2, min: 44, lineHeight: 1.05 })
      if (content.subtitle) text(c, 'subtitle', [para(content.subtitle)], M + 56, H * 0.74, innerW * 0.7, 140, 32, { color: fgSoft, min: 20, animate: 'body' })
      return tb
    }
    default: {
      // 'bar' — the classic left-aligned composition
      decor(c, dark)
      rect(c, accent, M, H / 2 - 150, 120, 12, { radius: 6, animate: 'accent' })
      text(c, 'title', [para(content.title)], M, H / 2 - 110, innerW * 0.8, 260, size, { color: fg, valign: 'middle', min: 40 })
      sub(M, H / 2 + 170, innerW * 0.7, fgSoft)
      return tb
    }
  }
}

