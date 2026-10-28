/**
 * Wikipedia as a free source of facts. The host is built from a validated language code (letters only) and is always *.wikipedia.org, so there is
 * no user-controlled URL here (unlike pasted links, which go through safeFetch). Text comes back as plain extracts, never HTML.
 */
export interface WikiPage { title: string; url: string; text: string }
type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>

const UA = 'SlidesDone/1.0 (https://slidesdone.com; support@slidesdone.com) research'
const MAX_CHARS_PER_PAGE = 9000

/** "pt-BR" → "pt", "EN" → "en"; anything that is not 2–3 letters falls back to English. */
export function wikiLang(language: string | undefined): string {
  const first = (language ?? 'en').toLowerCase().split(/[-_]/)[0] ?? 'en'
  return /^[a-z]{2,3}$/.test(first) ? first : 'en'
}

async function getJson(url: string, f: FetchLike): Promise<any> {
  const res = await f(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`wikipedia ${res.status}`)
  const text = await res.text()
  if (text.length > 2_000_000) throw new Error('wikipedia answer too large')
  return JSON.parse(text)
}

async function searchIn(lang: string, query: string, take: number, f: FetchLike): Promise<WikiPage[]> {
  const host = `https://${lang}.wikipedia.org/w/api.php`
  const found = await getJson(`${host}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${take}&srnamespace=0&srprop=&format=json&formatversion=2`, f)
  const titles: string[] = (found?.query?.search ?? []).map((r: { title: string }) => r.title).slice(0, take)
  const pages = await Promise.all(titles.map(async (title): Promise<WikiPage | null> => {
    try {
      const j = await getJson(`${host}?action=query&prop=extracts|info&inprop=url&explaintext=1&exsectionformat=plain&exchars=${MAX_CHARS_PER_PAGE}&redirects=1&titles=${encodeURIComponent(title)}&format=json&formatversion=2`, f)
      const p = j?.query?.pages?.[0]
      const text = String(p?.extract ?? '').replace(/\n{3,}/g, '\n\n').trim()
      if (!p || p.missing || text.length < 200) return null // stubs and disambiguation pages are not worth a source
      const url = typeof p.fullurl === 'string' && p.fullurl.startsWith(`https://${lang}.wikipedia.org/`) ? p.fullurl : `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, '_'))}`
      return { title: String(p.title).slice(0, 200), url, text }
    } catch {
      return null
    }
  }))
  return pages.filter((p): p is WikiPage => p !== null)
}

/** Best pages for a topic: the deck's language first, English when that language has nothing. */
export async function searchWikipedia(query: string, language: string | undefined, take = 3, f: FetchLike = fetch as FetchLike): Promise<WikiPage[]> {
  const lang = wikiLang(language)
  // some language codes have no Wikipedia edition (the host does not exist): that is "nothing found", not an outage
  const first = await searchIn(lang, query, take, f).catch((e) => { if (lang === 'en') throw e; return [] as WikiPage[] })
  if (first.length > 0 || lang === 'en') return first
  return searchIn('en', query, take, f)
}
