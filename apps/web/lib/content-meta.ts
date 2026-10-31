import type { Metadata } from 'next'
import { type Full, absImage, hrefOf, type Kind } from './content'

const WHERE: Record<Kind, string> = { blog: 'SlidesDone Blog', news: 'SlidesDone Tech News', guide: 'SlidesDone Guides' }
/** page title, description, canonical and social card of an article; posts that are not found are kept out of search */
export function articleMetadata(p: Full | null, kind: Kind): Metadata {
  if (!p) return { title: 'Not found', robots: { index: false } }
  const title = p.seoTitle || p.title
  const description = p.seoDescription || p.summary
  const image = absImage(p.coverUrl)
  return {
    title,
    description,
    alternates: { canonical: hrefOf(p) },
    openGraph: { type: 'article', title, description, siteName: WHERE[kind], publishedTime: p.publishedAt ?? undefined, modifiedTime: p.updatedAt, authors: [p.authorName], tags: p.tags, ...(image ? { images: [{ url: image }] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  }
}
