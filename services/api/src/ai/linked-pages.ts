import { BlockedUrlError, SourceError, type Extracted } from '../sources/extract.ts'
import { readLink } from '../sources/link.ts'

export interface LinkedPage {
  id: string
  url: string
  status: 'read' | 'failed'
  title: string
  /** page text, capped — it goes into the prompt as untrusted DATA */
  text: string
  /** user-safe reason when status is failed */
  reason?: string
}

/** Indirection so tests can stub network reads. */
export const pageReader = { read: (url: string): Promise<Extracted> => readLink(url) }

const PER_PAGE_CHARS = 12_000

/**
 * Reads the pages a user linked in their message, with the SAME SSRF-safe fetcher as deck sources (public hosts only,
 * redirects re-checked, size/time caps). Never throws: a page that can't be read is reported, not guessed at.
 */
export async function readLinkedPages(urls: string[]): Promise<LinkedPage[]> {
  return Promise.all(
    urls.map(async (url, i): Promise<LinkedPage> => {
      const id = `link${i + 1}`
      try {
        const ex = await Promise.race([pageReader.read(url), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('The page took too long to load.')), 15_000).unref())])
        const text = ex.parts.map((p) => p.text).join('\n\n').slice(0, PER_PAGE_CHARS)
        if (text.trim().length < 80) return { id, url, status: 'failed', title: ex.title, text: '', reason: 'The page has no readable text (it may need JavaScript or a login).' }
        return { id, url, status: 'read', title: ex.title || url, text }
      } catch (e) {
        const msg = (e as Error).message
        const safe = e instanceof BlockedUrlError || e instanceof SourceError || /^(Could not|The page|That URL|Page is|The page took)/.test(msg) ? msg : 'The page could not be read.'
        return { id, url, status: 'failed', title: url, text: '', reason: safe }
      }
    }),
  )
}
