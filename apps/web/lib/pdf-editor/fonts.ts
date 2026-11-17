/**
 * The fonts new text can use. Three are the standard PDF fonts (nothing embedded, nothing downloaded). Six are open-licence fonts (SIL OFL 1.1) served
 * from /pdf-fonts/ as static TrueType files (Latin + Latin Extended, regular / bold / italic / bold italic, about 30 to 65 KB each, see the README there):
 * they are fetched only when one is chosen or used, loaded into the page with FontFace so the screen draws the very same glyphs, and embedded in the saved
 * file as SUBSETS (only the letters used), so a file grows by a few KB, not by the font.
 * Layout features (kerning, ligatures) are removed from the files and switched off on screen, so the width the screen measures is the advance the PDF writes.
 */
import type { Family } from './model'

export type FontStyle = 'regular' | 'bold' | 'italic' | 'bolditalic'
export interface FontDef {
  id: Family
  label: string
  css: string
  /** where the first baseline sits inside a text box (share of the font size, from the top, for a 1.2 line height) */
  baseline: number
  /** standard PDF font: not embedded */
  std: boolean
  group: 'sans' | 'serif' | 'mono'
}

export const FONT_DEFS: FontDef[] = [
  { id: 'sans', label: 'Helvetica', css: 'Helvetica, Arial, "Liberation Sans", sans-serif', baseline: 0.94, std: true, group: 'sans' },
  { id: 'serif', label: 'Times', css: '"Times New Roman", Times, "Liberation Serif", serif', baseline: 0.93, std: true, group: 'serif' },
  { id: 'mono', label: 'Courier', css: '"Courier New", Courier, "Liberation Mono", monospace', baseline: 0.87, std: true, group: 'mono' },
  { id: 'inter', label: 'Inter', css: '"SDPdf-inter", Helvetica, Arial, sans-serif', baseline: 0.9638, std: false, group: 'sans' },
  { id: 'jakarta', label: 'Plus Jakarta Sans', css: '"SDPdf-jakarta", Helvetica, Arial, sans-serif', baseline: 1.008, std: false, group: 'sans' },
  { id: 'roboto', label: 'Roboto', css: '"SDPdf-roboto", Helvetica, Arial, sans-serif', baseline: 0.9418, std: false, group: 'sans' },
  { id: 'opensans', label: 'Open Sans', css: '"SDPdf-opensans", Helvetica, Arial, sans-serif', baseline: 0.9879, std: false, group: 'sans' },
  { id: 'lora', label: 'Lora (serif)', css: '"SDPdf-lora", "Times New Roman", Times, serif', baseline: 0.966, std: false, group: 'serif' },
  { id: 'jbmono', label: 'JetBrains Mono', css: '"SDPdf-jbmono", "Courier New", Courier, monospace', baseline: 0.96, std: false, group: 'mono' },
]
const BY_ID = new Map(FONT_DEFS.map((f) => [f.id, f]))
export const fontDef = (id: Family): FontDef => BY_ID.get(id) ?? FONT_DEFS[0]!
export const styleOf = (bold: boolean, italic: boolean): FontStyle => (bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'regular')
export const fontUrl = (id: Family, style: FontStyle): string => `/pdf-fonts/${id}-${style}.ttf`

// ---------- the screen: FontFace ----------
const faces = new Map<string, Promise<boolean>>()
/** load one face into the page (once). Resolves false when the file cannot be fetched: the screen then falls back to the stack's next font. */
export function ensureFont(id: Family, bold: boolean, italic: boolean): Promise<boolean> {
  const def = fontDef(id)
  if (def.std || typeof document === 'undefined') return Promise.resolve(true)
  const style = styleOf(bold, italic), key = `${id}:${style}`
  let p = faces.get(key)
  if (!p) {
    p = (async () => {
      try {
        const face = new FontFace(`SDPdf-${id}`, `url(${fontUrl(id, style)})`, { weight: bold ? '700' : '400', style: italic ? 'italic' : 'normal' })
        await face.load(); document.fonts.add(face); return true
      } catch { faces.delete(key); return false }
    })()
    faces.set(key, p)
  }
  return p
}
/** every style of a family that a text uses (base style and any spans) */
export const ensureFonts = (id: Family, styles: [boolean, boolean][]): Promise<boolean[]> => Promise.all(styles.map(([b, i]) => ensureFont(id, b, i)))

// ---------- the file: bytes for embedding ----------
const bytes = new Map<string, Promise<Uint8Array>>()
export function fontBytes(id: Family, style: FontStyle): Promise<Uint8Array> {
  const key = `${id}:${style}`
  let p = bytes.get(key)
  if (!p) {
    p = fetch(fontUrl(id, style)).then(async (r) => { if (!r.ok) throw new Error(`font ${key}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()) })
    p.catch(() => bytes.delete(key))
    bytes.set(key, p)
  }
  return p
}

// ---------- picking the closest font to the one the page uses ----------
/** from a PDF font name ("ABCDEF+PlusJakartaSans-Bold", "ArialMT", "Georgia"): the family that looks closest, or null to use the generic sans / serif / mono guess */
export function closestFont(name: string): Family | null {
  const n = name.replace(/^[A-Z]{6}\+/, '').replace(/[-_\s]/g, '').toLowerCase()
  if (/jakarta/.test(n)) return 'jakarta'
  if (/^inter(?!national)|interdisplay|intervar/.test(n)) return 'inter'
  if (/roboto(?!mono|slab)/.test(n)) return 'roboto'
  if (/opensans|^notosans(?!mono)|segoeui|calibri|carlito|verdana|tahoma|lato|sourcesans/.test(n)) return 'opensans'
  if (/^lora|merriweather|georgia|cambria|palatino|bookantiqua|garamond|baskerville/.test(n)) return 'lora'
  if (/jetbrains|firacode|sourcecodepro|robotomono|consolas|menlo|dejavusansmono|ibmplexmono/.test(n)) return 'jbmono'
  return null
}
