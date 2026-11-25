import { MORPH_CATEGORIES } from '@/lib/morph-categories'
import type { MetadataRoute } from 'next'

import { DESIGNS } from '@prompttoppt/theme'
import { SITE_URL } from '@/lib/env'
import { BASE_PATH, type Kind, fetchContent } from '@/lib/content'
import { LANDINGS } from '@/lib/template-landing'
import { FREE_TOOLS } from '@/lib/free-tool-list'
import { pageDate } from '@/lib/page-dates'

const BASE_URL = SITE_URL

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Only pages that exist (the old list advertised /blog, /contact, /privacy… which 404).
  const staticPages = [
    { url: BASE_URL, priority: 1.0, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/ai-ppt-maker`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/templates`, priority: 0.8, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/morph-animation-templates`, priority: 0.9, changeFrequency: 'weekly' as const },
    ...MORPH_CATEGORIES.map((c) => ({ url: `${BASE_URL}/morph-animation-templates/${c.slug}`, priority: 0.8, changeFrequency: 'weekly' as const })),
    { url: `${BASE_URL}/free-tools`, priority: 0.8, changeFrequency: 'weekly' as const },
    ...FREE_TOOLS.map((t) => ({ url: `${BASE_URL}${t.href}`, priority: 0.8, changeFrequency: 'monthly' as const })),
    { url: `${BASE_URL}/support`, priority: 0.5, changeFrequency: 'yearly' as const },
    { url: `${BASE_URL}/about`, priority: 0.6, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/faq`, priority: 0.7, changeFrequency: 'monthly' as const },
    ...['/legal', '/terms', '/privacy', '/cookies', '/refunds'].map((p) => ({ url: `${BASE_URL}${p}`, priority: 0.3, changeFrequency: 'yearly' as const })),
    { url: `${BASE_URL}/pricing`, priority: 0.8, changeFrequency: 'weekly' as const },
    ...LANDINGS.map((l) => ({ url: `${BASE_URL}/free-templates/${l.slug}`, priority: 0.8, changeFrequency: 'monthly' as const })),
    ...DESIGNS.map((d) => ({ url: `${BASE_URL}/templates/${d.id}`, priority: 0.6, changeFrequency: 'monthly' as const })),
  ]

  // blog, news and guides written in the dashboard (only published ones are listed by the API)
  const posts = await fetchContent<{ kind: Kind; slug: string; updatedAt: string }[]>('/index', 300)
  // a list page changed when its newest article did (no article yet: no date)
  const newest = (kind: Kind) => { const ds = posts.ok ? posts.data.filter((p) => p.kind === kind).map((p) => +new Date(p.updatedAt)) : []; return ds.length ? { lastModified: new Date(Math.max(...ds)) } : {} }
  const content = [
    ...([['/blog', 'blog'], ['/news', 'news'], ['/guides', 'guide']] as const).map(([p, k]) => ({ url: `${BASE_URL}${p}`, priority: 0.8, changeFrequency: 'daily' as const, ...newest(k) })),
    ...(posts.ok ? posts.data.map((p) => ({ url: `${BASE_URL}${BASE_PATH[p.kind]}/${p.slug}`, priority: p.kind === 'news' ? 0.5 : 0.7, changeFrequency: 'weekly' as const, lastModified: new Date(p.updatedAt) })) : []),
  ]

  // Only REAL dates: a page's last change from git (lib/page-dates.ts), an article's own update time; a page whose date is unknown carries none
  // ("now" on every request told search engines every page changed every time, so they learned to ignore the dates).
  const dated = staticPages.map((p) => { const d = pageDate(new URL(p.url).pathname || '/'); return d ? { ...p, lastModified: d } : p })
  return [...dated, ...content]
}
