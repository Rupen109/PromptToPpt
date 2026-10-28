import { SUPPORTED_FONTS } from '@prompttoppt/theme'

export interface MappedFont { family: string; original: string; /** the exact font is available (otherwise `family` is the closest one we can render) */ exact: boolean }

/** Well-known commercial / system faces → the closest font we can render (and PPTX can map). */
const ALIASES: [RegExp, string][] = [
  [/proxima|gotham|montserrat|museo sans/i, 'Montserrat'], [/avenir|nunito|mulish|lato/i, 'Nunito Sans'], [/futura|outfit|jost|century gothic/i, 'Outfit'],
  [/circular|dm sans|inter tight|graphik|sf pro|sf ui|san francisco|helvetica|akzidenz|neue haas|open sans|roboto|arial/i, 'Inter'],
  [/source sans|segoe|calibri|myriad|frutiger|ibm plex sans/i, 'IBM Plex Sans'], [/poppins/i, 'Poppins'], [/raleway/i, 'Raleway'], [/work sans/i, 'Work Sans'],
  [/space grotesk|grotesk|manrope/i, 'Manrope'], [/sora/i, 'Sora'], [/jakarta/i, 'Plus Jakarta Sans'],
  [/playfair|didot|bodoni|abril|dm serif|recoleta/i, 'Playfair Display'], [/fraunces/i, 'Fraunces'],
  [/merriweather|noto serif|source serif|charter|literata|crimson|libre baskerville|baskerville|georgia|garamond|palatino|cambria|times|lora|serif/i, 'Lora'],
  [/bebas|anton|impact|league gothic|oswald|condensed|din /i, 'Oswald'], [/mono|courier|consolas|menlo|fira code|jetbrains/i, 'Space Mono'],
]

/** Maps a font found on a website to one we support; `exact` says whether it is the very same font. */
export function mapFont(original: string, role: 'heading' | 'body' = 'body'): MappedFont {
  const direct = SUPPORTED_FONTS.find((f) => f.toLowerCase() === original.toLowerCase())
  if (direct) return { family: direct, original, exact: true }
  for (const [re, to] of ALIASES) if (re.test(original)) return { family: role === 'heading' && to === 'Lora' ? 'Playfair Display' : to, original, exact: false }
  return { family: role === 'heading' ? 'Plus Jakarta Sans' : 'Inter', original, exact: false }
}
