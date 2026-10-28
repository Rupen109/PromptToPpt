/**
 * Languages a deck can be written in. The AI models write all of them; the list only decides what the picker offers and which ones read right-to-left.
 * `code` is the ISO 639-1 (else 639-3) code stored in the deck's `language` field; it also picks the Wikipedia edition used for research.
 */
export interface DeckLanguage { code: string; name: string; native: string; rtl?: true }

export const DECK_LANGUAGES: readonly DeckLanguage[] = [
  { code: 'en', name: 'English', native: 'English' }, { code: 'hi', name: 'Hindi', native: 'हिन्दी' }, { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' }, { code: 'bn', name: 'Bengali', native: 'বাংলা' }, { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' }, { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' }, { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' }, { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ' }, { code: 'as', name: 'Assamese', native: 'অসমীয়া' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली' }, { code: 'si', name: 'Sinhala', native: 'සිංහල' }, { code: 'ur', name: 'Urdu', native: 'اردو', rtl: true },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', rtl: true }, { code: 'ks', name: 'Kashmiri', native: 'کٲشُر', rtl: true }, { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्' },
  { code: 'ar', name: 'Arabic', native: 'العربية', rtl: true }, { code: 'he', name: 'Hebrew', native: 'עברית', rtl: true }, { code: 'fa', name: 'Persian', native: 'فارسی', rtl: true },
  { code: 'ps', name: 'Pashto', native: 'پښتو', rtl: true }, { code: 'ku', name: 'Kurdish', native: 'Kurdî' }, { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'zh', name: 'Chinese (Simplified)', native: '简体中文' }, { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' }, { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' }, { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' }, { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' }, { code: 'ms', name: 'Malay', native: 'Bahasa Melayu' }, { code: 'tl', name: 'Filipino', native: 'Filipino' },
  { code: 'km', name: 'Khmer', native: 'ខ្មែរ' }, { code: 'lo', name: 'Lao', native: 'ລາວ' }, { code: 'my', name: 'Burmese', native: 'မြန်မာ' },
  { code: 'mn', name: 'Mongolian', native: 'Монгол' }, { code: 'jv', name: 'Javanese', native: 'Basa Jawa' }, { code: 'su', name: 'Sundanese', native: 'Basa Sunda' },
  { code: 'es', name: 'Spanish', native: 'Español' }, { code: 'pt', name: 'Portuguese', native: 'Português' }, { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' }, { code: 'it', name: 'Italian', native: 'Italiano' }, { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'ru', name: 'Russian', native: 'Русский' }, { code: 'uk', name: 'Ukrainian', native: 'Українська' }, { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'cs', name: 'Czech', native: 'Čeština' }, { code: 'sk', name: 'Slovak', native: 'Slovenčina' }, { code: 'sl', name: 'Slovenian', native: 'Slovenščina' },
  { code: 'hr', name: 'Croatian', native: 'Hrvatski' }, { code: 'sr', name: 'Serbian', native: 'Српски' }, { code: 'bs', name: 'Bosnian', native: 'Bosanski' },
  { code: 'bg', name: 'Bulgarian', native: 'Български' }, { code: 'mk', name: 'Macedonian', native: 'Македонски' }, { code: 'ro', name: 'Romanian', native: 'Română' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' }, { code: 'el', name: 'Greek', native: 'Ελληνικά' }, { code: 'sq', name: 'Albanian', native: 'Shqip' },
  { code: 'sv', name: 'Swedish', native: 'Svenska' }, { code: 'da', name: 'Danish', native: 'Dansk' }, { code: 'no', name: 'Norwegian', native: 'Norsk' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' }, { code: 'is', name: 'Icelandic', native: 'Íslenska' }, { code: 'et', name: 'Estonian', native: 'Eesti' },
  { code: 'lv', name: 'Latvian', native: 'Latviešu' }, { code: 'lt', name: 'Lithuanian', native: 'Lietuvių' }, { code: 'be', name: 'Belarusian', native: 'Беларуская' },
  { code: 'ca', name: 'Catalan', native: 'Català' }, { code: 'gl', name: 'Galician', native: 'Galego' }, { code: 'eu', name: 'Basque', native: 'Euskara' },
  { code: 'ga', name: 'Irish', native: 'Gaeilge' }, { code: 'cy', name: 'Welsh', native: 'Cymraeg' }, { code: 'gd', name: 'Scottish Gaelic', native: 'Gàidhlig' },
  { code: 'mt', name: 'Maltese', native: 'Malti' }, { code: 'lb', name: 'Luxembourgish', native: 'Lëtzebuergesch' }, { code: 'af', name: 'Afrikaans', native: 'Afrikaans' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' }, { code: 'am', name: 'Amharic', native: 'አማርኛ' }, { code: 'ha', name: 'Hausa', native: 'Hausa' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' }, { code: 'ig', name: 'Igbo', native: 'Igbo' }, { code: 'zu', name: 'Zulu', native: 'isiZulu' },
  { code: 'xh', name: 'Xhosa', native: 'isiXhosa' }, { code: 'so', name: 'Somali', native: 'Soomaali' }, { code: 'mg', name: 'Malagasy', native: 'Malagasy' },
  { code: 'rw', name: 'Kinyarwanda', native: 'Ikinyarwanda' }, { code: 'sn', name: 'Shona', native: 'chiShona' }, { code: 'st', name: 'Sesotho', native: 'Sesotho' },
  { code: 'ti', name: 'Tigrinya', native: 'ትግርኛ' }, { code: 'ny', name: 'Chichewa', native: 'Chichewa' }, { code: 'ka', name: 'Georgian', native: 'ქართული' },
  { code: 'hy', name: 'Armenian', native: 'Հայերեն' }, { code: 'az', name: 'Azerbaijani', native: 'Azərbaycan' }, { code: 'kk', name: 'Kazakh', native: 'Қазақ' },
  { code: 'uz', name: 'Uzbek', native: 'Oʻzbek' }, { code: 'ky', name: 'Kyrgyz', native: 'Кыргызча' }, { code: 'tg', name: 'Tajik', native: 'Тоҷикӣ' },
  { code: 'tk', name: 'Turkmen', native: 'Türkmen' }, { code: 'tt', name: 'Tatar', native: 'Татар' }, { code: 'ug', name: 'Uyghur', native: 'ئۇيغۇرچە', rtl: true },
  { code: 'ht', name: 'Haitian Creole', native: 'Kreyòl ayisyen' }, { code: 'qu', name: 'Quechua', native: 'Runasimi' }, { code: 'haw', name: 'Hawaiian', native: 'ʻŌlelo Hawaiʻi' },
  { code: 'mi', name: 'Māori', native: 'Te Reo Māori' }, { code: 'sm', name: 'Samoan', native: 'Gagana Samoa' }, { code: 'eo', name: 'Esperanto', native: 'Esperanto' },
  { code: 'la', name: 'Latin', native: 'Latina' }, { code: 'yi', name: 'Yiddish', native: 'ייִדיש', rtl: true }, { code: 'dv', name: 'Divehi', native: 'ދިވެހި', rtl: true },
  { code: 'bo', name: 'Tibetan', native: 'བོད་ཡིག' }, { code: 'ceb', name: 'Cebuano', native: 'Cebuano' }, { code: 'co', name: 'Corsican', native: 'Corsu' },
  { code: 'fy', name: 'Frisian', native: 'Frysk' }, { code: 'gom', name: 'Konkani', native: 'कोंकणी' }, { code: 'mai', name: 'Maithili', native: 'मैथिली' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो' }, { code: 'doi', name: 'Dogri', native: 'डोगरी' }, { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ' },
]

const BY_CODE = new Map(DECK_LANGUAGES.map((l) => [l.code.toLowerCase(), l]))

/** Accepts "pt-BR", "EN", "zh-tw": exact code first, then the part before the dash. Unknown → undefined. */
export function deckLanguage(code: string | undefined | null): DeckLanguage | undefined {
  if (!code) return undefined
  const c = code.toLowerCase()
  return BY_CODE.get(c) ?? BY_CODE.get(c.split(/[-_]/)[0]!)
}

export const isRtlLanguage = (code: string | undefined | null) => deckLanguage(code)?.rtl === true
