import type { Metadata } from 'next'
import { SITE_URL } from './env'

export const SITE_NAME = 'SlidesDone'
export const SUPPORT_MAIL = 'support@slidesdone.app'

/** JSON for a <script type="application/ld+json">: "<" is escaped so content can never close the tag. */
export const ldJson = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c')

export interface Faq { q: string; a: string }

export const faqLd = (faqs: readonly Faq[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
})

/** Breadcrumb trail: [name, path] pairs, first is Home. */
export const breadcrumbLd = (trail: readonly (readonly [string, string])[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE_URL}${path}` })),
})

export const ORG_ID = `${SITE_URL}/#organization`
export const SITE_ID = `${SITE_URL}/#website`
const APP_ID = `${SITE_URL}/#software`

/** Who we are, the website, and the product: one connected graph that search and answer engines can read (every page carries it via the root layout). */
export const siteGraph = () => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: SITE_NAME,
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/android-chrome-512x512.png`, width: 512, height: 512 },
      contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: SUPPORT_MAIL, url: `${SITE_URL}/support`, availableLanguage: ['English'] }],
    },
    { '@type': 'WebSite', '@id': SITE_ID, url: SITE_URL, name: SITE_NAME, inLanguage: 'en', publisher: { '@id': ORG_ID } },
    {
      '@type': 'SoftwareApplication',
      '@id': APP_ID,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: 'AI presentation maker: describe a topic or add a PDF, Word, Excel, PowerPoint, email, web link or video, and get a designed, editable deck in seconds.',
      featureList: [
        'AI presentation generation from a prompt, document, web page or video',
        'Editable slides (text, shapes, tables, charts, pictures) in the browser',
        'Designer templates, light and dark',
        'Export to PowerPoint (PPTX), PDF, PNG, JPG and HTML on paid plans',
        'Share links and live collaboration',
      ],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', description: 'Free plan with monthly credits' },
      publisher: { '@id': ORG_ID },
    },
  ],
})

/** Text cut at a word boundary to at most `max` characters, so search results show a whole sentence instead of a cut-off one. */
export function fit(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`
}

/**
 * One FREE web tool as search and answer engines should read it: a free browser app (WebApplication, price 0) by us, how to use it (HowTo), where it sits (breadcrumbs)
 * and its questions (FAQPage). Built from the same title, intro, steps and FAQs the page shows, so the data never says more than the page.
 */
export const toolGraph = (t: { path: string; title: string; intro: string; steps: readonly { title: string; text: string }[]; faqs: readonly Faq[] }) => {
  const url = `${SITE_URL}${t.path}`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication', '@id': `${url}#tool`, name: t.title, url, description: t.intro,
        applicationCategory: 'BusinessApplication', operatingSystem: 'Any (runs in the browser)', browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        provider: { '@id': ORG_ID }, isPartOf: { '@id': SITE_ID },
      },
      {
        '@type': 'HowTo', '@id': `${url}#howto`, name: `How to use the ${t.title}`, tool: { '@id': `${url}#tool` },
        step: t.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.title, text: s.text })),
      },
      { ...breadcrumbLd([['Home', '/'], ['Free tools', '/free-tools'], [t.title, t.path]]), '@context': undefined },
      { ...faqLd(t.faqs), '@context': undefined },
    ],
  }
}

/** The site's share picture (1200 × 630): every page's social card shows it unless the page has its own. */
export const OG_IMAGE = { url: '/og-image.png', width: 1200, height: 630, alt: 'SlidesDone — AI Presentation Maker' }

/**
 * A page's metadata with its SHARE card made from its own title, description and canonical address (Open Graph + Twitter). Next.js replaces nested metadata
 * like openGraph instead of merging it (docs: generate-metadata, "Merging"), so a page that set none showed the home page's title and description, and a page
 * that set its own lost the picture. Every page's metadata goes through here; what a page sets itself still wins.
 */
export function withShare(m: Metadata): Metadata {
  const t = m.title
  const own = typeof t === 'string' ? t : t && typeof t === 'object' ? ('absolute' in t && t.absolute) || ('default' in t && t.default) || '' : ''
  const absolute = !!t && typeof t === 'object' && 'absolute' in t
  // (a title that already names the brand, like the home page's, is not given it twice)
  const title = own ? (absolute || own.includes(SITE_NAME) ? own : `${own} | ${SITE_NAME}`) : undefined
  const description = typeof m.description === 'string' ? m.description : undefined
  const canonical = m.alternates?.canonical
  const url = typeof canonical === 'string' ? canonical : canonical instanceof URL ? canonical.toString() : undefined
  const og = (m.openGraph ?? {}) as Record<string, unknown>
  const tw = (m.twitter ?? {}) as Record<string, unknown>
  return {
    ...m,
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_US', ...(title ? { title } : {}), ...(description ? { description } : {}), ...(url ? { url } : {}), images: [OG_IMAGE], ...og } as Metadata['openGraph'],
    twitter: { card: 'summary_large_image', ...(title ? { title } : {}), ...(description ? { description } : {}), images: [OG_IMAGE.url], ...tw } as Metadata['twitter'],
  }
}

/** The first wording that fits in `max` characters (a title is rewritten shorter, never cut off with "…"); the last one is cut only if none fits. */
export function firstFit(options: readonly string[], max: number): string {
  return options.find((o) => o.length <= max) ?? fit(options[options.length - 1]!, max)
}
