import { ldJson } from '@/lib/seo'

/** Structured data for search and answer engines. Renders on the server, so crawlers see it without running any JavaScript. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(data) }} />
}
