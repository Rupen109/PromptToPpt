import { deckLanguage } from '@prompttoppt/validation'
import { EDITOR_URL } from './env'

/** The language the visitor picked in the site header. It is the language of the decks they create. English until they choose otherwise; 'auto' = detect it from what they type. */
const KEY = 'slidesdone:deck-language'
const EVENT = 'slidesdone:deck-language-changed'

export const DEFAULT_LANGUAGE = 'en'

/** The languages the website offers (its own text is translated into them, and decks are written in them). English first. `label` is how the language names itself. */
export const SITE_LANGUAGES = [
  { code: 'en', name: 'English', label: 'English' },
  { code: 'de', name: 'German', label: 'Deutsch' },
  { code: 'es', name: 'Spanish', label: 'Español' },
  { code: 'fr', name: 'French', label: 'Français' },
  { code: 'hi', name: 'Hindi', label: 'हिन्दी' },
  { code: 'id', name: 'Indonesian', label: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', label: 'Italiano' },
  { code: 'zh', name: 'Chinese', label: '中文' },
  { code: 'pl', name: 'Polish', label: 'Polski' },
  { code: 'pt', name: 'Portuguese', label: 'Português' },
  { code: 'vi', name: 'Vietnamese', label: 'Tiếng Việt' },
  { code: 'hu', name: 'Hungarian', label: 'Magyar' },
  { code: 'sv', name: 'Swedish', label: 'Svenska' },
] as const
const OFFERED = new Set<string>(SITE_LANGUAGES.map((l) => l.code))

export function getDeckLanguage(): string {
  try {
    const v = localStorage.getItem(KEY)
    return v && OFFERED.has(v) && deckLanguage(v) ? v : DEFAULT_LANGUAGE // anything saved earlier that is no longer offered falls back to English
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function setDeckLanguage(code: string): void {
  if (!OFFERED.has(code)) code = DEFAULT_LANGUAGE
  try {
    if (code && code !== DEFAULT_LANGUAGE) localStorage.setItem(KEY, code)
    else localStorage.removeItem(KEY) // English is the default, nothing to remember
  } catch {
    /* private mode: the choice lasts until the page is closed */
  }
  window.dispatchEvent(new Event(EVENT))
}

export const onDeckLanguageChange = (fn: () => void) => { window.addEventListener(EVENT, fn); window.addEventListener('storage', fn); return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', fn) } }

/** Where the editor picks up a draft made on this site; the chosen language travels as a plain code (it is not private). */
export function editorStartUrl(draftId: string): string {
  const lang = getDeckLanguage()
  return `${EDITOR_URL}/start?draft=${encodeURIComponent(draftId)}&lang=${encodeURIComponent(lang)}`
}
