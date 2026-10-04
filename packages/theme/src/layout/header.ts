import { type Ctx, deco, emphasised, pal, rect, shape, text, para } from './primitives'
import { contrastRatio, mix } from '../color'

/**
 * Title treatment for a content slide (the template's `header` style). Returns the y where the slide body should start.
 * `width` narrows the title for split layouts. Titles bottom-anchor in their box where an ornament sits below them, so
 * the ornament hugs the text whether the title is one line or two.
 */
export function header(c: Ctx, title: string, o: { width?: number; size?: number; x?: number } = {}): number {
  const { M } = c
  const k = pal(c)
  const x = o.x ?? M
  const w = o.width ?? c.W - 2 * M
  const size = o.size ?? 60
  const ornament = c.style.header === 'bar' || c.style.header === 'underline' ? k.secondary : k.accent
  switch (c.style.header) {
    case 'underline': {
      text(c, 'title', [para(title)], x, M, w, 140, size, { valign: 'bottom', min: 34 })
      rect(c, ornament, x, M + 152, 160, 8, { radius: 4, animate: 'accent' })
      return M + 152 + 8 + 36
    }
    case 'rule': {
      text(c, 'title', [para(title)], x, M, w, 140, size, { valign: 'bottom', min: 34 })
      rect(c, mix(k.textSecondary, c.bodyBg, 0.8), x, M + 152, w, 3)
      return M + 152 + 3 + 32
    }
    case 'side': {
      deco(c, k.primary, 0, 0, 22, c.H, { opacity: 1 })
      text(c, 'title', [para(title)], x + 14, M + 6, w - 14, 150, size, { min: 34 })
      return M + 6 + 150 + 20
    }
    case 'dot': {
      shape(c, ornament, x, M + 14, 30, 30, { shape: 'ellipse', animate: 'accent' })
      text(c, 'title', [para(title)], x + 54, M, w - 54, 150, size, { min: 34 })
      return M + 150 + 16
    }
    case 'accent': {
      // the key words of the heading in the accent colour, over a hairline rule
      const col = [k.accent, k.primary, k.secondary].find((x) => contrastRatio(x, c.bodyBg) >= 3) ?? k.textPrimary
      rect(c, mix(k.textSecondary, c.bodyBg, 0.8), 0, M * 0.5, c.W, 2)
      text(c, 'title', [emphasised(title, col)], x, M + 8, w, 150, size, { valign: 'middle', min: 34 })
      return M + 8 + 150 + 20
    }
    case 'italic': {
      // editorial: the last word is set in italic, with a short accent rule beneath
      const words = title.trim().split(/\s+/)
      const last = words.length > 1 ? words.pop()! : ''
      const runs = last ? [{ text: words.join(' ') + ' ' }, { text: last, italic: true }] : [{ text: title }]
      text(c, 'title', [{ runs }], x, M, w, 140, size, { valign: 'bottom', min: 34 })
      rect(c, ornament, x, M + 152, 120, 6, { radius: 3, animate: 'accent' })
      return M + 152 + 6 + 36
    }
    case 'none': {
      text(c, 'title', [para(title)], x, M, w, 160, Math.round(size * 1.08), { min: 34 })
      return M + 160 + 16
    }
    default: {
      rect(c, ornament, x, M, 96, 10, { radius: 5, animate: 'accent' })
      text(c, 'title', [para(title)], x, M + 36, w, 150, size, { min: 34 })
      return M + 36 + 150 + 24
    }
  }
}
