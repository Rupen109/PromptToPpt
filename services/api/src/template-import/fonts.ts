import { SUPPORTED_FONTS } from '@prompttoppt/theme'

/** Maps a typeface named in a file to the nearest font this app supports. Nothing is dropped silently: the caller keeps the original name beside the replacement. */
const SUPPORTED = new Map(SUPPORTED_FONTS.map((f) => [f.toLowerCase(), f]))

const TABLE: Record<string, string> = {
  'segoe ui': 'Inter', aptos: 'Inter', 'aptos display': 'Inter', 'helvetica neue': 'Inter', 'sf pro': 'Inter', 'san francisco': 'Inter', roboto: 'Inter', 'open sans': 'Nunito Sans', 'source sans pro': 'Nunito Sans', 'source sans 3': 'Nunito Sans', 'noto sans': 'Inter',
  tahoma: 'Verdana', 'trebuchet ms': 'Work Sans', 'century gothic': 'Outfit', futura: 'Outfit', 'gill sans mt': 'Lato', 'gill sans': 'Lato', candara: 'Lato', corbel: 'Lato', 'franklin gothic book': 'Work Sans', 'franklin gothic medium': 'Work Sans', 'myriad pro': 'Lato', avenir: 'Nunito Sans', 'avenir next': 'Nunito Sans', 'lucida sans': 'Verdana', 'lucida grande': 'Verdana', 'microsoft sans serif': 'Arial', 'ms gothic': 'Arial', 'arial unicode ms': 'Arial', 'arial narrow': 'Arial', 'arial black': 'Montserrat', 'bahnschrift': 'Work Sans', 'verdana pro': 'Verdana', 'calibri': 'Calibri',
  cambria: 'Lora', 'cambria math': 'Lora', constantia: 'Lora', 'palatino linotype': 'Lora', palatino: 'Lora', 'book antiqua': 'Lora', garamond: 'Lora', baskerville: 'Source Serif 4', 'baskerville old face': 'Source Serif 4', 'bookman old style': 'Lora', 'century schoolbook': 'Merriweather', 'times': 'Times New Roman', rockwell: 'Merriweather', 'rockwell extra bold': 'Merriweather', didot: 'Playfair Display', bodoni: 'Playfair Display', 'bodoni mt': 'Playfair Display', 'perpetua': 'Lora', 'sitka text': 'Source Serif 4', 'sitka heading': 'Source Serif 4', 'sitka banner': 'Source Serif 4',
  impact: 'Anton', 'haettenschweiler': 'Bebas Neue', 'franklin gothic demi cond': 'Oswald', 'franklin gothic heavy': 'Oswald', 'agency fb': 'Oswald', 'bebas': 'Bebas Neue',
  consolas: 'Space Mono', 'courier new': 'Space Mono', courier: 'Space Mono', 'lucida console': 'Space Mono', menlo: 'Space Mono', monaco: 'Space Mono', 'cascadia code': 'Space Mono', 'cascadia mono': 'Space Mono', 'sf mono': 'Space Mono',
  'brush script mt': 'Playfair Display', 'segoe script': 'Playfair Display', 'lucida handwriting': 'Playfair Display', 'comic sans ms': 'Nunito Sans', 'ink free': 'Nunito Sans',
}

/** words PowerPoint adds to a family name for a weight/width; they say how heavy the text should be, not which family it is */
const SUFFIX = /\s+(light|semilight|semi light|thin|extralight|extra light|medium|semibold|semi bold|demibold|demi|bold|extrabold|extra bold|heavy|black|ultra|condensed|cond|narrow)$/i

/** Weight a font NAME implies (300 light … 900 black); null when it says nothing. */
export function weightHint(name: string): number | null {
  const n = name.toLowerCase()
  if (/\b(thin|extra ?light|ultra ?light)\b/.test(n)) return 200
  if (/\b(light|semi ?light)\b/.test(n)) return 300
  if (/\b(black|heavy|extra ?bold|ultra)\b/.test(n)) return 900
  if (/\b(semi ?bold|demi ?bold|demi)\b/.test(n)) return 600
  if (/\bmedium\b/.test(n)) return 500
  if (/\bbold\b/.test(n)) return 700
  return null
}

export interface FontMatch { original: string; mapped: string; replaced: boolean }

export function mapFont(original: string): FontMatch {
  const name = original.trim()
  const lower = name.toLowerCase()
  const direct = SUPPORTED.get(lower)
  if (direct) return { original: name, mapped: direct, replaced: false }
  const base = name.replace(SUFFIX, '').replace(SUFFIX, '').trim()
  const b = base.toLowerCase()
  const sup = SUPPORTED.get(b)
  if (sup) return { original: name, mapped: sup, replaced: false } // "Calibri Light" -> Calibri: same family, the weight goes on the text
  const t = TABLE[lower] ?? TABLE[b]
  if (t) return { original: name, mapped: t, replaced: true }
  if (/mono|courier|consol|code|typewriter/.test(b)) return { original: name, mapped: 'Space Mono', replaced: true }
  if (/script|hand|brush|marker|calligraph/.test(b)) return { original: name, mapped: 'Playfair Display', replaced: true }
  if (/sans|gothic|grotesk|grotesque|arial|helvet|segoe|ui$/.test(b)) return { original: name, mapped: 'Inter', replaced: true }
  if (/serif|roman|times|garamond|georgia|palat|book|cambria|didot|bodoni|caslon|antiqua|slab|mincho|song/.test(b)) return { original: name, mapped: 'Lora', replaced: true }
  return { original: name, mapped: 'Inter', replaced: true }
}
