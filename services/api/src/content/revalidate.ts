import { env } from '../env.ts'

/** the website pages a post shows up on: its own page, its list and the feeds */
export const pathsFor = (kind: string, slug: string) => { const base = kind === 'guide' ? '/guides' : `/${kind}`; return [base, `${base}/${slug}`, ...(kind === 'guide' ? [] : [`${base}/rss.xml`]), '/sitemap.xml'] }

/**
 * Tell the website that blog / news / guides changed so it rebuilds those pages now. Best effort: if the website is down or the hook is not set up,
 * nothing breaks, the pages just refresh when their cache runs out (about a minute). The website also loads the given pages once so the next visitor gets the new version.
 */
export async function notifyWebsite(paths: string[] = []): Promise<void> {
  if (!env.WEB_REVALIDATE_URL || !env.REVALIDATE_SECRET) return
  try {
    await fetch(env.WEB_REVALIDATE_URL, { method: 'POST', headers: { 'x-revalidate-secret': env.REVALIDATE_SECRET, 'Content-Type': 'application/json' }, body: JSON.stringify({ paths }), signal: AbortSignal.timeout(10_000) })
  } catch (e) {
    console.warn('[content] website refresh failed:', (e as Error).message)
  }
}
