/** Helpers for the full AI-edit QA (e2e/ai-full-qa.mjs): reading a saved deck the way a person sees it. */

/** a colour as the slide draws it: a hex, or a theme name through the SLIDE's own overrides first (a slide on a hand-picked colour gets readable text colours of its own) */
export const hexOf = (doc, c, slide) => {
  if (!c || typeof c !== 'string') return null
  if (c.startsWith('#')) return c.toUpperCase()
  const v = slide?.themeOverrides?.[c] ?? doc.theme?.colors?.[c]
  return v ? String(v).toUpperCase() : null
}
export const rgb = (h) => { const n = parseInt(String(h).replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
export const lum = (h) => { if (!h) return null; const [r, g, b] = rgb(h); return (r * 299 + g * 587 + b * 114) / 1000 }
const rel = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const contrast = (a, b) => { if (!a || !b || !a.startsWith('#') || !b.startsWith('#')) return null; const x = rel(a), y = rel(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
export const hue = (h) => { const [r, g, b] = rgb(h).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return { h: 0, s: 0 }; let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; x *= 60; if (x < 0) x += 360; return { h: x, s: mx ? d / mx : 0 } }
export const isGreen = (h) => { const { h: x, s } = hue(h); return x >= 75 && x <= 165 && s > 0.25 }
export const isRed = (h) => { const [r, g, b] = rgb(h); return r > 170 && g < 90 && b < 90 }

export const S = (doc, n) => doc.slides[n - 1]
export const byId = (doc, id) => doc.slides.find((s) => s.id === id)
export const posOf = (doc, id) => doc.slides.findIndex((s) => s.id === id) + 1
export const plain = (e) => (e.paragraphs ?? []).map((p) => (p.runs ?? []).map((r) => r.text ?? '').join('')).join('\n')
export const texts = (s) => (s.elements ?? []).filter((e) => e.type === 'text' && !e.decorative && plain(e).trim())
export const images = (s) => (s.elements ?? []).filter((e) => e.type === 'image' && !e.decorative)
/** every visible text run on a slide with its effective colour */
export const runs = (doc, s) => texts(s).flatMap((e) => (e.paragraphs ?? []).flatMap((p) => (p.runs ?? []).filter((r) => (r.text ?? '').trim()).map((r) => ({ el: e, text: r.text, color: hexOf(doc, r.color ?? p.color ?? e.color ?? 'textPrimary', s), bold: !!r.bold || (e.weight ?? 400) >= 700, size: r.fontSize ?? e.fontSize }))))
export const allRuns = (doc) => doc.slides.flatMap((s) => runs(doc, s))
export const bgOf = (doc, s) => { const b = s.background; if (!b) return hexOf(doc, 'background'); if (b.type === 'color') return hexOf(doc, b.value); return JSON.stringify(b) }
export const bgLum = (doc, s) => { const b = bgOf(doc, s); return b?.startsWith('#') ? lum(b) : null }
/** the slide's words: every string in its content (not notes or sources), else its text boxes */
export function words(s) {
  const out = []
  const walk = (v, k) => { if (k === 'speakerNotes' || k === 'sources' || k === 'layout') return; if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => walk(x)); else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk) }
  if (s.content) walk(s.content)
  const fromBoxes = texts(s).map(plain).join(' ')
  const c = out.join(' ')
  return (c.trim().length >= fromBoxes.trim().length * 0.5 ? c : fromBoxes).replace(/\s+/g, ' ').trim()
}
export const wordCount = (s) => words(s).split(' ').filter(Boolean).length
export const layoutOf = (s) => s.content?.layout ?? s.layoutId ?? '?'
/** how many points (bullets, steps, items) a slide has, per group */
export function points(s) {
  const c = s.content ?? {}
  const g = {}
  for (const [k, v] of Object.entries(c)) {
    if (Array.isArray(v) && k !== 'sources') g[k] = v.length
    else if (v && typeof v === 'object' && Array.isArray(v.bullets)) g[k] = v.bullets.length
  }
  if (Array.isArray(c.quadrants)) g.quadrantBullets = c.quadrants.reduce((n, q) => n + (q.bullets?.length ?? 0), 0)
  return g
}
const sig = (s) => JSON.stringify({ c: { ...(s.content ?? {}), speakerNotes: undefined }, e: s.elements, b: s.background, l: s.layoutId, t: s.transition, fx: s.effects, lk: s.locked })
/** slide numbers (as they were BEFORE) of slides that changed, ignoring the ones listed */
export function changedOthers(b, a, exceptIds = []) {
  const out = []
  b.slides.forEach((s, i) => { if (exceptIds.includes(s.id)) return; const x = byId(a, s.id); if (!x) out.push(`${i + 1} (deleted)`); else if (sig(x) !== sig(s)) out.push(String(i + 1)) })
  return out
}
export const themeSame = (b, a) => JSON.stringify(b.theme) === JSON.stringify(a.theme)
export const colorsSame = (b, a) => JSON.stringify(b.theme.colors) === JSON.stringify(a.theme.colors)
export const slideBgsSame = (b, a) => b.slides.every((s) => { const x = byId(a, s.id); return !x || JSON.stringify(x.background) === JSON.stringify(s.background) })
/** numbers (2+ digits, decimals, %) in `after` that appear nowhere in `before` */
export function newFigures(beforeText, afterText) {
  const nums = (t) => (t.match(/\d[\d,.]*\d%?|\d+%/g) ?? []).map((x) => x.replace(/,/g, '')).filter((x) => x.length >= 2)
  const had = new Set(nums(beforeText))
  return [...new Set(nums(afterText))].filter((x) => !had.has(x))
}
export const deckText = (doc) => doc.slides.map((s) => words(s) + ' ' + (s.speakerNotes ?? s.content?.speakerNotes ?? '')).join(' ')
export const majority = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1); return [...m.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] }
export const notesOf = (s) => s.speakerNotes ?? s.content?.speakerNotes ?? ''
