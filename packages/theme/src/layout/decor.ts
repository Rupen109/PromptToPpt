import { type Ctx, deco, pal } from './primitives'
import { mix } from '../color'

/**
 * Background ornaments. `dark` = drawn over a dark/primary background (uses onPrimary at low opacity), otherwise the brand
 * colours at low opacity. All ornaments are decorative:true (locked, behind everything, ignored by validators) and low
 * contrast by construction so they can never harm text readability.
 */
export function decor(c: Ctx, dark: boolean, kind = c.style.decor, tone?: string) {
  const { W, H, M } = c
  const k = pal(c)
  const a = tone ?? (dark ? k.onPrimary : k.primary)
  const b = tone ? k.accent : dark ? k.onPrimary : k.accent
  const o = dark ? 0.09 : 0.07
  switch (kind) {
    case 'circles':
      deco(c, a, W * 0.62, -H * 0.38, H * 0.95, H * 0.95, { shape: 'ellipse', opacity: o })
      deco(c, b, -H * 0.12, H * 0.72, H * 0.5, H * 0.5, { shape: 'ellipse', opacity: o * 0.8 })
      break
    case 'dots':
      for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) deco(c, a, W - M - 6 * 40 + q * 40, M + r * 40, 14, 14, { shape: 'ellipse', opacity: dark ? 0.3 : 0.28 })
      break
    case 'diagonal':
      deco(c, a, -W * 0.1, H * 0.84, W * 1.3, H * 0.24, { rotation: -6, opacity: o })
      deco(c, b, -W * 0.1, H * 0.93, W * 1.3, H * 0.1, { rotation: -6, opacity: o * 0.8 })
      break
    case 'grid':
      for (let i = 0; i < 7; i++) deco(c, a, W * 0.62 + i * (W * 0.055), 0, 2, H, { opacity: dark ? 0.1 : 0.08 })
      for (let i = 0; i < 4; i++) deco(c, a, W * 0.62, H * 0.2 + i * (H * 0.2), W * 0.38, 2, { opacity: dark ? 0.1 : 0.08 })
      break
    case 'blobs':
      deco(c, '#000000', W * 0.7, -H * 0.2, H * 0.85, H * 0.85, { shape: 'ellipse', opacity: dark ? 0.16 : 0.12, gradient: { from: dark ? k.onPrimary : k.primary, to: dark ? mix(k.onPrimary, k.accent, 0.5) : k.accent, angle: 135 } })
      deco(c, '#000000', W * 0.82, H * 0.12, H * 0.5, H * 0.5, { shape: 'ellipse', opacity: dark ? 0.14 : 0.1, gradient: { from: dark ? mix(k.onPrimary, k.accent, 0.6) : k.accent, to: dark ? k.onPrimary : k.secondary, angle: 45 } })
      break
    case 'corner':
      deco(c, a, W - H * 0.42, 0, H * 0.42, H * 0.42, { shape: 'triangle', rotation: 90, opacity: dark ? 0.12 : 0.1 })
      deco(c, b, W - H * 0.22, 0, H * 0.22, H * 0.22, { shape: 'triangle', rotation: 90, opacity: dark ? 0.16 : 0.16 })
      break
    case 'stripes':
      for (let i = 0; i < 5; i++) deco(c, a, W - M * 0.6 - i * 34, 0, 14, H, { opacity: (dark ? 0.12 : 0.1) * (1 - i * 0.17) })
      break
    case 'rings':
      for (let i = 0; i < 3; i++) deco(c, a, W * 0.66 - i * 70, -H * 0.3 - i * 70, H * 0.95 + i * 140, H * 0.95 + i * 140, { shape: 'ring', stroke: a, strokeWidth: 3, opacity: (dark ? 0.16 : 0.12) * (1 - i * 0.25) })
      break
    case 'ruled-paper': {
      // notebook page: faint blue rules, a red margin line and punched holes
      const rule = dark ? k.onPrimary : '#3B82F6'
      const gap = Math.round(H / 14)
      for (let y = gap * 2; y < H; y += gap) deco(c, rule, 0, y, W, 3, { opacity: dark ? 0.2 : 0.3 })
      deco(c, '#EF4444', M * 1.45, 0, 4, H, { opacity: dark ? 0.5 : 0.5 })
      for (let i = 0; i < 3; i++) deco(c, a, M * 0.4, H * (0.2 + i * 0.3), 22, 22, { shape: 'ellipse', opacity: dark ? 0.3 : 0.28 })
      break
    }
    case 'chalk': {
      // chalkboard: dusty smudges, a hand-drawn dashed line and little stars
      const chalk = dark ? k.onPrimary : k.primary
      deco(c, chalk, W * 0.55, H * 0.55, W * 0.5, H * 0.6, { shape: 'ellipse', opacity: dark ? 0.1 : 0.06 })
      deco(c, chalk, -W * 0.1, -H * 0.2, W * 0.4, H * 0.5, { shape: 'ellipse', opacity: dark ? 0.1 : 0.06 })
      for (let i = 0; i < 14; i++) deco(c, chalk, W * 0.06 + i * (W * 0.07), H - M * 0.8, W * 0.035, 7, { opacity: dark ? 0.55 : 0.4, radius: 4 })
      ;([[0.88, 0.14, 26], [0.93, 0.3, 16], [0.8, 0.07, 14]] as const).forEach(([x, y, d]) => deco(c, b, W * x, H * y, d, d, { shape: 'triangle', opacity: dark ? 0.6 : 0.5 }))
      break
    }
    case 'blueprint': {
      // fine engineering grid with corner ticks
      const line = dark ? k.onPrimary : k.primary
      const step = Math.round(W / 24)
      for (let x = step; x < W; x += step) deco(c, line, x, 0, 1, H, { opacity: (x / step) % 4 === 0 ? 0.18 : 0.08 })
      for (let y = step; y < H; y += step) deco(c, line, 0, y, W, 1, { opacity: (y / step) % 4 === 0 ? 0.18 : 0.08 })
      for (const [x, y] of [[M * 0.5, M * 0.5], [W - M * 1.5, M * 0.5], [M * 0.5, H - M * 1.5], [W - M * 1.5, H - M * 1.5]] as const) { deco(c, b, x, y + M * 0.5 - 1, M, 3, { opacity: 0.6 }); deco(c, b, x + M * 0.5 - 1, y, 3, M, { opacity: 0.6 }) }
      break
    }
    case 'circuit': {
      // traces with nodes, bleeding in from the right edge
      const rows = [0.18, 0.3, 0.42, 0.54]
      rows.forEach((r, i) => {
        const len = W * (0.16 + i * 0.05)
        deco(c, a, W - len, H * r, len, 3, { opacity: dark ? 0.2 : 0.16 })
        deco(c, b, W - len - 8, H * r - 7, 18, 18, { shape: 'ellipse', opacity: dark ? 0.4 : 0.32 })
        if (i % 2 === 0) deco(c, a, W - len, H * r, 3, H * 0.12, { opacity: dark ? 0.2 : 0.16 })
      })
      break
    }
    case 'confetti': {
      const cols = [a, b, k.secondary]
      let seed = 7
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
      for (let i = 0; i < 26; i++) {
        const x = rnd() < 0.5 ? rnd() * W * 0.25 : W * 0.72 + rnd() * W * 0.28 // keep the middle clear for text
        const y = rnd() * H
        const sz = 12 + rnd() * 18
        deco(c, cols[i % 3]!, x, y, sz, i % 3 === 1 ? sz : sz * 0.4, { shape: i % 4 === 0 ? 'ellipse' : i % 4 === 1 ? 'triangle' : 'rect', rotation: rnd() * 180, opacity: dark ? 0.6 : 0.55 })
      }
      break
    }
    case 'halftone': {
      // print dots shrinking away from the top-right corner
      for (let r = 0; r < 7; r++) for (let q = 0; q < 10; q++) {
        const d = Math.max(0, 22 - (r + (9 - q)) * 1.7)
        if (d < 3) continue
        deco(c, a, W - M * 0.5 - (9 - q) * 36 - d, M * 0.4 + r * 36, d, d, { shape: 'ellipse', opacity: dark ? 0.3 : 0.24 })
      }
      break
    }
    case 'axis': {
      // chart furniture: left axis, tick marks and faint gridlines
      deco(c, a, M * 0.55, H * 0.12, 3, H * 0.76, { opacity: dark ? 0.3 : 0.22 })
      for (let i = 0; i < 6; i++) deco(c, a, M * 0.55, H * 0.12 + i * (H * 0.152), 14, 3, { opacity: dark ? 0.3 : 0.22 })
      for (let i = 1; i < 6; i++) deco(c, a, M * 0.9, H * 0.12 + i * (H * 0.152), W - M * 1.4, 1, { opacity: dark ? 0.07 : 0.06 })
      break
    }
    case 'rules': {
      // editorial hairlines: one under the top margin, one above the bottom margin, with a short heavier mark at the start of each
      const ink = dark ? k.onPrimary : k.textPrimary
      deco(c, ink, M, M * 0.5, W - 2 * M, 2, { opacity: dark ? 0.35 : 0.3 })
      deco(c, ink, M, H - M * 0.5, W - 2 * M, 2, { opacity: dark ? 0.35 : 0.3 })
      deco(c, k.accent, M, M * 0.5 - 2, 56, 6, { opacity: 0.95 })
      deco(c, k.accent, W - M - 56, H - M * 0.5 - 2, 56, 6, { opacity: 0.95 })
      break
    }
    case 'hazard': {
      // safety tape: a solid band along the top and bottom edges with a dense row of near-black chevrons, the way warning tape reads
      const bandH = Math.round(M * 0.46)
      for (const y of [0, H - bandH]) {
        deco(c, k.accent, 0, y, W, bandH, { opacity: 1 })
        for (let x = bandH * 0.3; x < W; x += bandH * 2.1) deco(c, '#111111', x, y + bandH * 0.08, bandH * 0.84, bandH * 0.84, { shape: 'chevron', opacity: 0.92 }) // spaced out: a slide may carry at most ~60 ornaments
      }
      break
    }
    case 'brackets': {
      // editorial corner brackets
      const t = 5, l = H * 0.12
      deco(c, a, M * 0.5, M * 0.5, l, t, { opacity: dark ? 0.6 : 0.55 }); deco(c, a, M * 0.5, M * 0.5, t, l, { opacity: dark ? 0.6 : 0.55 })
      deco(c, a, W - M * 0.5 - l, H - M * 0.5 - t, l, t, { opacity: dark ? 0.6 : 0.55 }); deco(c, a, W - M * 0.5 - t, H - M * 0.5 - l, t, l, { opacity: dark ? 0.6 : 0.55 })
      break
    }
    case 'chevrons': {
      for (let i = 0; i < 5; i++) deco(c, i % 2 ? b : a, W - M - (5 - i) * 62, H - M * 1.1, 52, 52, { shape: 'chevron', opacity: (dark ? 0.2 : 0.16) + i * 0.04 })
      break
    }
    case 'organic': {
      deco(c, a, W * 0.66, -H * 0.18, H * 0.8, H * 0.7, { shape: 'ellipse', rotation: 18, opacity: dark ? 0.12 : 0.09 })
      deco(c, b, W * 0.84, H * 0.5, H * 0.6, H * 0.7, { shape: 'ellipse', rotation: -24, opacity: dark ? 0.11 : 0.09 })
      deco(c, k.secondary, -H * 0.15, H * 0.7, H * 0.55, H * 0.45, { shape: 'ellipse', rotation: 30, opacity: dark ? 0.1 : 0.08 })
      break
    }
    case 'window': {
      // app-window chrome: a title bar with three dots across the top
      deco(c, a, 0, 0, W, M * 0.7, { opacity: dark ? 0.1 : 0.06 })
      ;[k.accent, k.secondary, a].forEach((col, i) => deco(c, col, M * 0.45 + i * 30, M * 0.22, 16, 16, { shape: 'ellipse', opacity: dark ? 0.5 : 0.45 }))
      break
    }
    case 'contours': {
      if (W / H < 1.6) break // these sit beside the copy: only on wide covers
      // nested line-art chevrons bleeding off the right edge (cover ornament)
      const L = H * 0.78
      for (let i = 0; i < 10; i++) {
        const ax = W * 0.68 + i * 34, ay = H * 0.5
        const dx = (L / 2) * Math.SQRT1_2
        const o = (dark ? 0.85 : 0.6) * (1 - i * 0.06)
        deco(c, i % 3 === 0 ? b : a, ax + dx - L / 2, ay - dx - 2.5, L, 5, { rotation: -45, opacity: o })
        deco(c, i % 3 === 0 ? b : a, ax + dx - L / 2, ay + dx - 2.5, L, 5, { rotation: 45, opacity: o })
      }
      break
    }
    case 'hexgrid': {
      if (W / H < 1.6) break // these sit beside the copy: only on wide covers
      // outlined hexagon lattice in the lower-right corner
      const r = H * 0.1
      const cells: [number, number][] = [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [1, 2], [2, 2]]
      cells.forEach(([q, row]) => hexOutline(c, W - M - r * 1.8 * (3 - q) + r, H - M * 0.4 - r * 1.55 * (3 - row), r, a, dark ? 0.5 : 0.4))
      break
    }
    case 'shapes': {
      if (W / H < 1.6) break // these sit beside the copy: only on wide covers
      // flat, playful geometry: half-disc, pill, polygon-ish diamond, ring, burst and cross
      const cols = [k.accent, k.primary, k.secondary]
      deco(c, cols[0]!, W * 0.06, H * 0.58, H * 0.46, H * 0.46, { shape: 'ellipse', opacity: dark ? 0.95 : 0.9 })
      deco(c, dark ? k.background : '#FFFFFF', W * 0.06 - 4, H * 0.58 - 4, H * 0.5, H * 0.23, { opacity: 1 }) // hides the top half: a half-disc
      deco(c, cols[1]!, W * 0.78, H * 0.12, H * 0.14, H * 0.5, { radius: H * 0.07, rotation: -14, opacity: 0.95 })
      deco(c, cols[2]!, W * 0.62, H * 0.62, H * 0.3, H * 0.3, { radius: 34, rotation: 30, opacity: 0.95 })
      deco(c, cols[0]!, W * 0.9, H * 0.7, H * 0.2, H * 0.2, { shape: 'ring', stroke: cols[0]!, strokeWidth: 16, opacity: 0.95 })
      for (let i = 0; i < 6; i++) deco(c, cols[1]!, W * 0.46, H * 0.08, 14, H * 0.2, { radius: 7, rotation: i * 30, opacity: 0.95 })
      deco(c, cols[2]!, W * 0.03, H * 0.08, H * 0.1, 22, { radius: 11, rotation: 45, opacity: 0.95 })
      deco(c, cols[2]!, W * 0.03, H * 0.08, H * 0.1, 22, { radius: 11, rotation: -45, opacity: 0.95 })
      break
    }
    default:
      break
  }
}

/** Ornaments loud enough that they belong on covers only; content slides get a calm background instead. */
export const COVER_ONLY_DECOR = new Set<string>(['shapes', 'contours', 'hexgrid'])

/** Six thin bars forming a hexagon outline (flat-top) around (cx, cy) with circumradius r. */
export function hexOutline(c: Ctx, cx: number, cy: number, r: number, color: string, opacity: number) {
  for (let k = 0; k < 6; k++) {
    const phi = ((30 + 60 * k) * Math.PI) / 180
    const mx = cx + r * Math.cos(Math.PI / 6) * Math.cos(phi)
    const my = cy + r * Math.cos(Math.PI / 6) * Math.sin(phi)
    deco(c, color, mx - r / 2, my - 1.5, r, 3, { rotation: 30 + 60 * k + 90, opacity })
  }
}
