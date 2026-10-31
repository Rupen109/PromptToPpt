import { deckLanguage } from '@prompttoppt/validation'

/**
 * Translating the website itself uses Google's free page-translate widget (the visible text of the page is sent to Google to be translated; nothing else).
 * The language the visitor picks in the header (the 13 in SITE_LANGUAGES) is both the language of their decks and the language of this site.
 * English leaves the site as written. The script itself is fetched quietly the first time the language button is visible (the widget only starts translating once a language is chosen), so a choice applies quickly.
 */
const COOKIE = 'googtrans'

/** the codes Google's widget translates to (English is the page's own language) */
const SUPPORTED = new Set(('af sq am ar hy as ay az bm eu be bn bho bs bg ca ceb ny zh-CN zh-TW co hr cs da dv doi nl eo et ee tl fi fr fy gl ka de el gn gu ht ha haw iw hi hmn hu is ig ilo id ga it ja jw kn kk km rw gom ko kri ku ckb ky lo la lv ln lt lg lb mk mai mg ms ml mt mi mr lus mn my ne no or om ps fa pl pt pa qu ro ru sm sa gd nso sr st sn sd si sk sl so es su sw sv tg ta tt te th ti ts tr tk ak uk ur ug uz vi cy xh yi yo zu').split(' '))
/** our language code → Google's, where they differ */
const RENAME: Record<string, string> = { zh: 'zh-CN', he: 'iw', jv: 'jw', nb: 'no', fil: 'tl' }

/** Google's code for one of our language codes, or null when the site should stay as written (English, Auto-detect, or a language Google does not offer) */
export function googleCodeFor(code: string): string | null {
  if (!code || code === 'en' || !deckLanguage(code)) return null
  const g = RENAME[code] ?? code
  return SUPPORTED.has(g) ? g : null
}

/** the language the page is being translated to right now (from Google's cookie), or null */
export function currentTranslation(): string | null {
  const m = new RegExp(`(?:^|; )${COOKIE}=/[^/]+/([^;]+)`).exec(document.cookie)
  return m ? decodeURIComponent(m[1]!) : null
}

const hostVariants = () => {
  const h = location.hostname
  return h === 'localhost' || /^[\d.]+$/.test(h) ? [''] : ['', `; domain=${h}`, `; domain=.${h.replace(/^www\./, '')}`]
}
export function writeTranslationCookie(google: string | null): void {
  for (const d of hostVariants()) document.cookie = google ? `${COOKIE}=/en/${google}; path=/${d}` : `${COOKIE}=; path=/${d}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

let loading: Promise<void> | null = null
/** load Google's widget once; resolves when its (hidden) language list is ready */
export function loadWidget(): Promise<void> {
  if (loading) return loading
  loading = new Promise<void>((resolve, reject) => {
    const w = window as unknown as { googleTranslateElementInit?: () => void; google?: { translate: { TranslateElement: new (o: object, id: string) => unknown } } }
    w.googleTranslateElementInit = () => {
      new w.google!.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element')
      const t0 = Date.now()
      const wait = () => (document.querySelector('select.goog-te-combo') ? resolve() : Date.now() - t0 > 12_000 ? reject(new Error('translate widget did not start')) : void setTimeout(wait, 150))
      wait()
    }
    const s = document.createElement('script')
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
    s.async = true
    s.onerror = () => reject(new Error('translate widget blocked'))
    document.head.appendChild(s)
  }).catch((e) => { loading = null; throw e })
  return loading
}

/** start loading Google's widget ahead of any choice (called once the language button is first on screen, and again when the list is opened), so picking a language does not wait for the download */
export function preloadWidget(): void {
  void loadWidget().catch(() => undefined)
}

/** true while a translation is being set up or applied: the language button shows a spinner */
let busy = false
const listeners = new Set<() => void>()
const setBusy = (v: boolean) => { if (busy !== v) { busy = v; listeners.forEach((l) => l()) } }
export const isTranslating = () => busy
export const onTranslating = (fn: () => void) => { listeners.add(fn); return () => void listeners.delete(fn) }

/** translate the page now (no reload): set Google's cookie, start the widget, and pick the language in its hidden list */
export async function translateTo(google: string): Promise<void> {
  writeTranslationCookie(google)
  await loadWidget()
  const combo = document.querySelector<HTMLSelectElement>('select.goog-te-combo')
  if (combo && combo.value !== google) { combo.value = google; combo.dispatchEvent(new Event('change')) }
  // Google adds "translated-ltr" / "translated-rtl" to <html> once the text has changed; when switching between two languages the class is already there, so give it a moment
  const root = document.documentElement
  const t0 = Date.now()
  await new Promise<void>((done) => { const tick = () => (/translated-(ltr|rtl)/.test(root.className) && Date.now() - t0 > 500) || Date.now() - t0 > 8000 ? done() : void setTimeout(tick, 100); tick() })
}

/** bring the page in line with the chosen language: translate, or go back to the original (needs a reload: Google keeps no way to undo in place) */
export async function syncSiteLanguage(code: string): Promise<void> {
  const g = googleCodeFor(code)
  if (g) { setBusy(true); try { await translateTo(g) } catch { /* blocked or offline: the site stays in English and the deck language still applies */ } finally { setBusy(false) } return }
  if (currentTranslation()) { writeTranslationCookie(null); location.reload() }
}
