import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  const BASE_URL = SITE_URL

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',        // Never expose API routes
          '/_next/',      // Internal Next.js
          '/login',
          '/signup',
          '/editor/',     // App subdomain — separate
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
