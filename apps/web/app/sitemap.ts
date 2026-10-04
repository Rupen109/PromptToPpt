import type { MetadataRoute } from 'next'

import { DESIGNS } from '@prompttoppt/theme'
import { SITE_URL } from '@/lib/env'

const BASE_URL = SITE_URL

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  // Only pages that exist (the old list advertised /blog, /contact, /privacy… which 404).
  const staticPages = [
    { url: BASE_URL, priority: 1.0, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/ai-ppt-maker`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/templates`, priority: 0.8, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/pricing`, priority: 0.8, changeFrequency: 'weekly' as const },
    ...DESIGNS.map((d) => ({ url: `${BASE_URL}/templates/${d.id}`, priority: 0.6, changeFrequency: 'monthly' as const })),
  ]

  return staticPages.map((page) => ({
    ...page,
    lastModified: now,
  }))
}
