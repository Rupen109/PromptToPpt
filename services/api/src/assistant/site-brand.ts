import { BlockedUrlError } from '../sources/ssrf.ts'
import { BrandReadError, findBrand } from '../brand/find.ts'

/** What the assistant gets back from reading a company website: only what was really found, or the reason nothing was. */
export interface SiteBrand {
  host: string
  name: string | null
  primary: string | null
  accent: string | null
  /** the site had one brand colour only: the accent is derived from it */
  accentDerived: boolean
  heading: { family: string; original: string; exact: boolean } | null
  body: { family: string; original: string; exact: boolean } | null
  logo: { url: string; aspect: number } | null
  /** few brand signals on the static page (often a script-rendered site) */
  confidence: 'high' | 'low'
}
export type SiteBrandResult = { ok: true; brand: SiteBrand } | { ok: false; say: string }
type Finder = typeof findBrand

const WINDOW_MS = 3_600_000
const MAX_READS = 10
const hits = new Map<string, { count: number; resetAt: number }>()
/** the same allowance as the Brand tab's website lookup (10 an hour per person), kept apart so the chat cannot be used to get around it */
function takeSlot(userId: string, now = Date.now()): boolean {
  const e = hits.get(userId)
  if (!e || e.resetAt <= now) { hits.set(userId, { count: 1, resetAt: now + WINDOW_MS }); return true }
  return ++e.count <= MAX_READS
}
export const resetSiteBrandLimit = () => hits.clear()

/** Reads a website's brand for the assistant: SSRF-safe, size-limited, no model, no credits. Every failure is a sentence the person can act on, never an exception. */
export async function readSiteBrandForAssist(userId: string, raw: string, find: Finder = findBrand): Promise<SiteBrandResult> {
  const text = raw.trim()
  if (!text || /\s/.test(text)) return { ok: false, say: 'I need a website address to read, like example.com.' }
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`
  if (!takeSlot(userId)) return { ok: false, say: 'You have looked up a lot of websites in the last hour. Please wait a little while and try again.' }
  try {
    const p = await find(userId, url)
    return { ok: true, brand: { host: new URL(p.sourceUrl).hostname.replace(/^www\./, ''), name: p.name, primary: p.colors.primary, accent: p.colors.accent, accentDerived: p.colors.accentDerived, heading: p.fonts.heading, body: p.fonts.body, logo: p.logo, confidence: p.confidence } }
  } catch (e) {
    if (e instanceof BlockedUrlError) return { ok: false, say: e.message }
    const msg = (e as Error).message
    return { ok: false, say: e instanceof BrandReadError || /^Invalid URL/.test(msg) ? msg : 'I could not read that website, so nothing was changed. Check the address and try again.' }
  }
}
