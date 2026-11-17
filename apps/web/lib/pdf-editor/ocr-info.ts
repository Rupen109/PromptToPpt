/** Numbers and names the page copy quotes about the text finder; kept apart from ocr.ts so showing them does not load any OCR code. */
/** where the self-hosted files live; the version is in the folder name so they can be cached for a year (apps/web/public/ocr/<version>/) */
export const OCR_BASE = '/ocr/7.0.0'
/**
 * Where the reading models (<code>.traineddata.gz) are fetched from. Default: our own folder (same origin, same CSP). Set NEXT_PUBLIC_OCR_LANG_BASE to a
 * full URL of an asset host (CORS: Access-Control-Allow-Origin for this site) to serve some or all models from there instead; see docs/FREE_TOOLS_PLAN.md.
 */
export const OCR_LANG_BASE = (process.env.NEXT_PUBLIC_OCR_LANG_BASE || `${OCR_BASE}/lang`).replace(/\/+$/, '')
/** download on first use (worker + wasm core + English model), as served with compression; shown to the visitor */
export const OCR_DOWNLOAD_MB = 4
/** the page is read from a copy about this wide (pixels): sharp enough for slide text, fast enough on a laptop */
export const OCR_WIDTH = 1600
/** Arabic and Hindi: 2400 px (2.25 times the pixels, about twice the time) */
export const OCR_WIDTH_SCRIPT = 2400
/** the longest the extra passes (labels, numbers, small lines) may run for one page, in ms; what is read by then is kept and the page is marked as partly read */
export const OCR_BUDGET_MS = 90_000

/**
 * Languages of the text in a picture. `models` are the Tesseract "fast" models loaded together (Hindi and Arabic also load English for digits and
 * Latin words); `mb` is the download of the model files as served (gzip), so the visitor can see it before choosing.
 */
export interface OcrLanguage { code: string; name: string; models: string[]; mb: number; rtl: boolean; /** BCP-47 prefix of the site / document language that selects it automatically */ lang: string; /** width (px) of the copy that is read, when not OCR_WIDTH: the small fast models of Arabic and Hindi read the same page better from a bigger copy (measured: docs/FREE_TOOLS_PLAN.md part C) */ width?: number }
export const OCR_LANGUAGES: OcrLanguage[] = [
  { code: 'eng', name: 'English', models: ['eng'], mb: 2.0, rtl: false, lang: 'en' },
  { code: 'spa', name: 'Spanish', models: ['spa'], mb: 1.1, rtl: false, lang: 'es' },
  { code: 'fra', name: 'French', models: ['fra'], mb: 0.6, rtl: false, lang: 'fr' },
  { code: 'deu', name: 'German', models: ['deu'], mb: 0.9, rtl: false, lang: 'de' },
  { code: 'por', name: 'Portuguese', models: ['por'], mb: 1.0, rtl: false, lang: 'pt' },
  { code: 'ita', name: 'Italian', models: ['ita'], mb: 1.3, rtl: false, lang: 'it' },
  { code: 'hin', name: 'Hindi', models: ['hin', 'eng'], mb: 2.9, rtl: false, lang: 'hi', width: OCR_WIDTH_SCRIPT },
  { code: 'ara', name: 'Arabic', models: ['ara', 'eng'], mb: 2.7, rtl: true, lang: 'ar', width: OCR_WIDTH_SCRIPT },
]
export const languageOf = (code: string): OcrLanguage => OCR_LANGUAGES.find((l) => l.code === code) ?? OCR_LANGUAGES[0]!
/** the language to start with: the document / site language when a model exists for it, else English */
export function defaultOcrLanguage(htmlLang: string | undefined): string {
  const l = (htmlLang ?? '').toLowerCase()
  return OCR_LANGUAGES.find((x) => l === x.lang || l.startsWith(`${x.lang}-`))?.code ?? 'eng'
}
