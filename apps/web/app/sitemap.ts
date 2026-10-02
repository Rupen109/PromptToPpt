import type { MetadataRoute } from 'next'

const BASE_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://prompttoppt.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticPages = [
    { url: BASE_URL, priority: 1.0, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/ai-ppt-maker`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/ai-presentation-maker`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/ppt-generator`, priority: 0.9, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/text-to-ppt`, priority: 0.8, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/pdf-to-ppt`, priority: 0.8, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/templates`, priority: 0.8, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/pricing`, priority: 0.8, changeFrequency: 'weekly' as const },
    { url: `${BASE_URL}/blog`, priority: 0.7, changeFrequency: 'daily' as const },
    { url: `${BASE_URL}/contact`, priority: 0.5, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/faq`, priority: 0.6, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/about`, priority: 0.5, changeFrequency: 'monthly' as const },
    { url: `${BASE_URL}/privacy`, priority: 0.3, changeFrequency: 'yearly' as const },
    { url: `${BASE_URL}/terms`, priority: 0.3, changeFrequency: 'yearly' as const },
  ]

  return staticPages.map((page) => ({
    ...page,
    lastModified: now,
  }))
}
