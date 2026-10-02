import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const BASE_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://prompttoppt.com'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',        // Never expose API routes
          '/_next/',      // Internal Next.js
          '/dashboard/',  // Authenticated pages
          '/editor/',     // App subdomain — separate
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
