import { type Card, type Kind, hrefOf, listPosts, siteUrl } from './content'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const TITLE: Record<Kind, [string, string]> = { blog: ['SlidesDone Blog', 'Articles on making better presentations with AI.'], news: ['SlidesDone Tech News', 'Short tech and AI news with links to the original stories.'], guide: ['SlidesDone Guides', 'How to use SlidesDone.'] }

/** RSS 2.0 feed of the newest posts of a kind */
export async function rssFor(kind: Kind, path: string): Promise<Response> {
  const r = await listPosts(kind, { pageSize: 30 })
  const items: Card[] = r.ok ? r.data.items : []
  const [title, description] = TITLE[kind]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>\n<title>${esc(title)}</title>\n<link>${esc(siteUrl(path))}</link>\n<description>${esc(description)}</description>\n<atom:link href="${esc(siteUrl(`${path}/rss.xml`))}" rel="self" type="application/rss+xml"/>\n${items.map((p) => `<item><title>${esc(p.title)}</title><link>${esc(siteUrl(hrefOf(p)))}</link><guid isPermaLink="true">${esc(siteUrl(hrefOf(p)))}</guid>${p.publishedAt ? `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : ''}<description>${esc(p.summary)}</description></item>`).join('\n')}\n</channel></rss>\n`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
}
