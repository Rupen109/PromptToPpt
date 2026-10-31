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

const ORG_ID = `${SITE_URL}/#organization`
const SITE_ID = `${SITE_URL}/#website`
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
