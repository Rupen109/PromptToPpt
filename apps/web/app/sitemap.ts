import type { MetadataRoute } from 'next'

import { DESIGNS } from '@prompttoppt/theme'
import { SITE_URL } from '@/lib/env'
import { BASE_PATH, type Kind, fetchContent } from '@/lib/content'
import { LANDINGS } from '@/lib/template-landing'

const BASE_URL = SITE_URL

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  // Only pages that exist (the old list advertised /blog, /contact, /privacy… which 404).
  const staticPages = [
    { url: BASE_URL, priority: 1.0, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/ai-ppt-maker`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/templates`, priority: 0.8, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/free-tools`, priority: 0.8, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/free-tools/presentation-outline-generator`, priority: 0.8, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/free-tools/pdf-to-presentation`, priority: 0.8, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/free-tools/pdf-to-ppt`, priority: 0.7, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/free-tools/pdf-to-jpg`, priority: 0.7, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/free-tools/sitemap-generator`, priority: 0.7, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/free-tools/youtube-transcript-to-slides`, priority: 0.8, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/free-tools/video-to-slides`, priority: 0.8, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/free-tools/script-to-slides`, priority: 0.8, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/support`, priority: 0.5, changeFrequency: 'yearly' as const },
    { url: `${BASE_URL}/pricing`, priority: 0.8, changeFrequency: 'weekly' as const },
    ...LANDINGS.map((l) => ({ url: `${BASE_URL}/free-templates/${l.slug}`, priority: 0.8, changeFrequency: 'monthly' as const })),
    ...DESIGNS.map((d) => ({ url: `${BASE_URL}/templates/${d.id}`, priority: 0.6, changeFrequency: 'monthly' as const })),
  ]

  // blog, news and guides written in the dashboard (only published ones are listed by the API)
  const posts = await fetchContent<{ kind: Kind; slug: string; updatedAt: string }[]>('/index', 300)
  const content = [
    ...['/blog', '/news', '/guides'].map((p) => ({ url: `${BASE_URL}${p}`, priority: 0.8, changeFrequency: 'daily' as const, lastModified: now })),
    ...(posts.ok ? posts.data.map((p) => ({ url: `${BASE_URL}${BASE_PATH[p.kind]}/${p.slug}`, priority: p.kind === 'news' ? 0.5 : 0.7, changeFrequency: 'weekly' as const, lastModified: new Date(p.updatedAt) })) : []),
  ]

  return [...staticPages.map((page) => ({ ...page, lastModified: now })), ...content]
}
