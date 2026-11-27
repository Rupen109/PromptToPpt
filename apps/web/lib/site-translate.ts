import { deckLanguage } from '@prompttoppt/validation/languages' // the language list alone: the package root also holds every Zod schema (about 100 KB) that no page of the website needs

/**
 * Translating the website itself uses Google's free page-translate widget (the visible text of the page is sent to Google to be translated; nothing else).
 * The language the visitor picks in the header (those in SITE_LANGUAGES) is both the language of their decks and the language of this site.
 * English leaves the site as written. The script is fetched only when the visitor shows interest (focus or press on the language button) or already chose a language: a plain visit loads nothing from Google (no third-party script, no Google cookies), which keeps the page fast.
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

/**
 * Start loading Google's widget ahead of the choice, so picking a language does not wait for it. Measured: a pick with the widget not loaded yet takes
 * about 4.6 s to show the new language (download + start-up, longer far from the server); with it loaded, about 0.9 s. Called when the visitor reaches for
 * the language button (hover, focus or press: on a computer, hover comes a second or more before the pick) and, for likely switchers only, when the page is idle.
 */
export function preloadWidget(): void {
  void loadWidget().catch(() => undefined)
}

/**
 * Visitors whose browser is set to one of our other languages are the ones likely to switch, so for them the widget is loaded quietly once the page
 * is idle. Everyone else (an English browser) still loads nothing from Google until they reach for the language button: no third-party script and
 * no Google cookies on a plain visit, which keeps the page fast.
 */
export function likelyToTranslate(): boolean {
  const langs = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  return langs.some((l) => { const code = (l ?? '').toLowerCase().split('-')[0] ?? ''; return code !== 'en' && googleCodeFor(code) !== null })
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

/**
 * Back to the page as written, in place: Google's own "show original" button (in its hidden toolbar) puts every text node back at once — measured 29 ms,
 * against a full page reload before (slow far from the server). If the widget ever stops offering that button, or the text does not come back, reload.
 */
async function restoreOriginal(): Promise<void> {
  writeTranslationCookie(null)
  const root = document.documentElement
  const frame = document.querySelector<HTMLIFrameElement>('iframe.goog-te-banner-frame, iframe[id$=".container"], iframe.skiptranslate')
  const restore = frame?.contentDocument?.querySelector<HTMLElement>('[id$=".restore"], button[id*="restore"]')
  if (restore) {
    restore.click()
    const t0 = Date.now()
    await new Promise<void>((done) => { const tick = () => (!/translated-(ltr|rtl)/.test(root.className) || Date.now() - t0 > 1500 ? done() : void setTimeout(tick, 50)); tick() })
    if (!/translated-(ltr|rtl)/.test(root.className)) return
  }
  location.reload()
}

/** bring the page in line with the chosen language: translate, or go back to the original */
export async function syncSiteLanguage(code: string): Promise<void> {
  const g = googleCodeFor(code)
  if (g) { setBusy(true); try { await translateTo(g) } catch { /* blocked or offline: the site stays in English and the deck language still applies */ } finally { setBusy(false) } return }
  if (currentTranslation() || /translated-(ltr|rtl)/.test(document.documentElement.className)) { setBusy(true); try { await restoreOriginal() } finally { setBusy(false) } }
}
