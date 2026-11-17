import { num, type XNode } from './xml.ts'

/** Colour reading for DrawingML: srgbClr / schemeClr / sysClr / prstClr / hslClr with the modifiers PowerPoint writes (lumMod, lumOff, tint, shade, satMod, alpha...). */
export interface Rgb { r: number; g: number; b: number }
export interface Colour { hex: string; alpha: number }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const to2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
export const toHex = (c: Rgb) => `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`.toUpperCase()
export const fromHex = (h: string): Rgb => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
export const luminance = (c: Rgb) => 0.2126 * (c.r / 255) ** 2.2 + 0.7152 * (c.g / 255) ** 2.2 + 0.0722 * (c.b / 255) ** 2.2
export const isDark = (hex: string) => luminance(fromHex(hex)) < 0.18
export const mix = (a: string, b: string, t: number): string => { const x = fromHex(a), y = fromHex(b); return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t }) }

function toHsl({ r, g, b }: Rgb) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  return { h, s, l }
}
function fromHsl({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t: number) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 }
}

const PRESET: Record<string, string> = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', orange: 'FFA500', purple: '800080', pink: 'FFC0CB', brown: 'A52A2A', cyan: '00FFFF', magenta: 'FF00FF',
  darkBlue: '00008B', darkGreen: '006400', darkRed: '8B0000', lightGray: 'D3D3D3', lightGrey: 'D3D3D3', darkGray: 'A9A9A9', darkGrey: 'A9A9A9', silver: 'C0C0C0', gold: 'FFD700', navy: '000080', teal: '008080', lime: '00FF00', maroon: '800000', olive: '808000', aqua: '00FFFF', fuchsia: 'FF00FF',
}

/** The theme a colour is read against: scheme colours by name (accent1, dk1 ...) and the master's colour map (bg1 -> lt1, tx1 -> dk1 ...). */
export interface ColourContext { scheme: Record<string, string>; map: Record<string, string>; /** colour a `phClr` stands for (from a style reference) */ ph?: string | undefined }
export const DEFAULT_MAP: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' }

function applyMods(base: Rgb, node: XNode): Colour {
  let c = base, alpha = 1
  for (const m of node.c) {
    const v = num(m.a['val'], 100000) / 100000
    if (m.n === 'alpha') alpha = clamp01(v)
    else if (m.n === 'alphaMod') alpha = clamp01(alpha * v)
    else if (m.n === 'alphaOff') alpha = clamp01(alpha + v)
    else if (m.n === 'lumMod') { const h = toHsl(c); h.l = clamp01(h.l * v); c = fromHsl(h) }
    else if (m.n === 'lumOff') { const h = toHsl(c); h.l = clamp01(h.l + v); c = fromHsl(h) }
    else if (m.n === 'satMod') { const h = toHsl(c); h.s = clamp01(h.s * v); c = fromHsl(h) }
    else if (m.n === 'satOff') { const h = toHsl(c); h.s = clamp01(h.s + v); c = fromHsl(h) }
    else if (m.n === 'hueMod') { const h = toHsl(c); h.h = (((h.h * (1 + (v - 1) * 0.5)) % 1) + 1) % 1; c = fromHsl(h) } // PowerPoint shows a much smaller hue shift than the specification's multiplication: half strength matches its own rendering of the Office themes
    else if (m.n === 'hueOff') { const h = toHsl(c); h.h = (h.h + num(m.a['val']) / 21600000 + 1) % 1; c = fromHsl(h) }
    else if (m.n === 'tint') c = { r: c.r + (255 - c.r) * (1 - v), g: c.g + (255 - c.g) * (1 - v), b: c.b + (255 - c.b) * (1 - v) } // toward white
    else if (m.n === 'shade') c = { r: c.r * v, g: c.g * v, b: c.b * v } // toward black
    else if (m.n === 'inv') c = { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b }
    else if (m.n === 'gray') { const y = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b; c = { r: y, g: y, b: y } }
  }
  return { hex: toHex(c), alpha }
}

/** A colour element (`srgbClr`, `schemeClr`, ...) -> #RRGGBB and alpha. Null when it cannot be resolved. */
export function colourOf(node: XNode | undefined, ctx: ColourContext): Colour | null {
  if (!node) return null
  const v = node.a['val'] ?? ''
  let base: string | null = null
  if (node.n === 'srgbClr') base = /^[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null
  else if (node.n === 'sysClr') base = /^[0-9a-f]{6}$/i.test(node.a['lastClr'] ?? '') ? node.a['lastClr']!.toUpperCase() : v === 'window' ? 'FFFFFF' : v === 'windowText' ? '000000' : null
  else if (node.n === 'prstClr') base = PRESET[v] ?? null
  else if (node.n === 'schemeClr') {
    if (v === 'phClr') base = ctx.ph?.replace('#', '') ?? null
    else { const key = ctx.map[v] ?? v; base = ctx.scheme[key] ?? ctx.scheme[v] ?? null }
  } else if (node.n === 'hslClr') {
    const rgb = fromHsl({ h: num(node.a['hue']) / 21600000, s: num(node.a['sat']) / 100000, l: num(node.a['lum']) / 100000 })
    base = toHex(rgb).slice(1)
  } else if (node.n === 'scrgbClr') {
    const f = (x: string) => Math.round(Math.min(1, Math.max(0, num(node.a[x]) / 100000)) * 255)
    base = toHex({ r: f('r'), g: f('g'), b: f('b') }).slice(1)
  }
  if (!base) return null
  return applyMods(fromHex('#' + base), node)
}

const COLOUR_NODES = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'hslClr', 'scrgbClr'])
/** the first colour child of a fill-like element (solidFill, a gradient stop, a line, a font reference) */
export const colourIn = (n: XNode | undefined, ctx: ColourContext): Colour | null => { const c = n?.c.find((x) => COLOUR_NODES.has(x.n)); return c ? colourOf(c, ctx) : null }
