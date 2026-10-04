/**
 * Lazy web-font loading. Templates use many families, but a deck needs only two — so we inject a Google Fonts stylesheet
 * for exactly the fonts in use (once per family set), instead of shipping 20 families to every visitor.
 * System/Office fonts (Arial, Georgia…) need no loading.
 */
const SYSTEM = new Set(['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Calibri'])
/** Weights each family actually ships. Google Fonts rejects the WHOLE request if one family is asked for a weight it lacks. */
const FAMILY_WEIGHTS: Record<string, number[]> = {
  Inter: [400, 500, 600, 700, 800, 900], 'Plus Jakarta Sans': [400, 500, 600, 700, 800], 'Space Grotesk': [400, 500, 600, 700], Sora: [400, 500, 600, 700, 800],
  Poppins: [400, 500, 600, 700, 800, 900], Montserrat: [400, 500, 600, 700, 800, 900], Lato: [400, 700, 900], Outfit: [400, 500, 600, 700, 800, 900],
  'DM Sans': [400, 500, 600, 700, 800, 900], Manrope: [400, 500, 600, 700, 800], 'Playfair Display': [400, 500, 600, 700, 800, 900], Lora: [400, 500, 600, 700],
  'DM Serif Display': [400], Fraunces: [400, 500, 600, 700, 800, 900], 'Work Sans': [400, 500, 600, 700, 800, 900], Raleway: [400, 500, 600, 700, 800, 900],
  'Nunito Sans': [400, 500, 600, 700, 800, 900], 'IBM Plex Sans': [400, 500, 600, 700], Merriweather: [400, 700, 900], 'Source Serif 4': [400, 500, 600, 700, 800, 900],
  'Bebas Neue': [400], Oswald: [400, 500, 600, 700], 'Space Mono': [400, 700], 'Archivo Narrow': [400, 500, 600, 700], 'JetBrains Mono': [400, 500, 700],
}
const loaded = new Set<string>()

/** Google Fonts stylesheet URL for the given families (null if they are all system fonts). Shared by the live app and the HTML export. */
export function fontsHref(families: string[]): string | null {
  const want = [...new Set(families)].filter((f) => !SYSTEM.has(f))
  if (want.length === 0) return null
  return `https://fonts.googleapis.com/css2?${want.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@${(FAMILY_WEIGHTS[f] ?? [400, 700]).join(';')}`).join('&')}&display=swap`
}

export function ensureFonts(families: string[]) {
  if (typeof document === 'undefined') return
  const want = [...new Set(families)].filter((f) => !SYSTEM.has(f) && !loaded.has(f))
  if (want.length === 0) return
  want.forEach((f) => loaded.add(f))
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.crossOrigin = 'anonymous' // lets html-to-image read the rules to embed the fonts into PNG / PDF exports
  link.href = fontsHref(want)!
  document.head.appendChild(link)
}
