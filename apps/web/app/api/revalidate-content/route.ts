import { timingSafeEqual } from 'node:crypto'
import { revalidatePath, revalidateTag } from 'next/cache'

const PATH = /^\/(?:blog|news|guides)(?:\/[a-z0-9-]{1,80}|\/rss\.xml)?$|^\/sitemap\.xml$/

/**
 * Called by our API when a post is published, changed, unpublished or deleted: drops the cached blog / news / guides pages, then loads the pages that
 * changed once so the next visitor (including the owner clicking "View on the website") gets the new version, not the old one.
 */
export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const given = req.headers.get('x-revalidate-secret') ?? ''
  if (!secret || secret.length < 16 || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) return new Response('Not found', { status: 404 })
  const body = (await req.json().catch(() => null)) as { paths?: unknown } | null
  const paths = (Array.isArray(body?.paths) ? body.paths : []).filter((p): p is string => typeof p === 'string' && PATH.test(p)).slice(0, 8)
  revalidateTag('content', { expire: 0 })
  for (const p of ['/blog', '/news', '/guides']) revalidatePath(p, 'layout')
  revalidatePath('/sitemap.xml')
  const origin = new URL(req.url).origin
  for (const p of paths) await fetch(`${origin}${p}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) }).then((r) => r.body?.cancel()).catch(() => undefined)
  return Response.json({ ok: true, warmed: paths.length })
}
