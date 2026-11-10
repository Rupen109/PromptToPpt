import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { securityHeaders } from '../../scripts/csp.mjs'

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker / ECS Fargate (see apps/web/Dockerfile).
  output: 'standalone',
  // Monorepo: trace files from the repo root so workspace packages are included in the standalone output.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@prompttoppt/api-client', '@prompttoppt/ui', '@prompttoppt/validation', '@prompttoppt/theme', '@prompttoppt/types', '@prompttoppt/analytics'],
  poweredByHeader: false,
  // The stylesheet (Tailwind, small) blocks the first paint, and fetching it is one more round trip. Measured on a mobile-like connection (150 ms, 1.6 Mbps): first paint 490 ms with the CSS inside the HTML
  // against 890 ms with a separate file, even though the page is 13 KB heavier compressed (the styles are also repeated in the page data: known limit of this experimental flag, see next docs inlineCss).
  experimental: { inlineCss: true },
  // template pictures are drawn into exports (PDF/PNG/JPG/HTML) by the editor on another origin, which needs CORS
  // decks saved before the pictures moved from /ppt to /morph-templates still point at the old address
  async rewrites() {
    return [{ source: '/ppt/:path*', destination: '/morph-templates/:path*' }]
  },
  async headers() {
    const sec = (securityHeaders({
      app: 'web', dev: process.env.NODE_ENV !== 'production',
      apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000', webUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000', editorUrl: process.env.NEXT_PUBLIC_EDITOR_URL ?? 'http://localhost:3001',
    })).map(([key, value]) => ({ key, value }))
    return [
      { source: '/:path*', headers: sec },
      // the Morph templates' own pictures: drawn into exports by the editor on another origin, so they need CORS too — the address always carries ?v=MORPH_ART_VERSION, so a year-long immutable cache is safe (a new picture bumps the version)
      { source: '/morph-templates/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      // the menu and the Morph pages' stills: same file names when a still is redone, so a day fresh and a week of instant-then-refresh (stale-while-revalidate), instead of the default "check every time"
      { source: '/morph-posters/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }] },
      { source: '/ppt/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cache-Control', value: 'public, max-age=86400' }] }, // the old address, see rewrites
      { source: '/template-assets/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }, { key: 'Cache-Control', value: 'public, max-age=86400' }] },
    ]
  },
}

export default nextConfig
