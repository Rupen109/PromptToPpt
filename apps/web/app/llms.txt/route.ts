import { SITE_URL } from '@/lib/env'
import { BASE_PATH, type Kind, fetchContent } from '@/lib/content'
import { GENERAL_FAQS } from '@/lib/faq'
import { LANDINGS } from '@/lib/template-landing'
import { FREE_TOOLS } from '@/lib/free-tool-list'
import { SITE_NAME, SUPPORT_MAIL } from '@/lib/seo'

export const revalidate = 3600

/**
 * /llms.txt: a short, plain-text guide to the site for AI assistants (the llms.txt convention). It is cheap to publish and harmless; it is not a proven ranking
 * signal, so the real work for answer engines is crawlable pages, direct answers and structured data (see lib/faq.ts, lib/seo.ts and robots.ts).
 */
export async function GET() {
  const posts = await fetchContent<{ kind: Kind; slug: string; title?: string; updatedAt: string }[]>('/index', 300)
  const guides = posts.ok ? posts.data.filter((p) => p.kind === 'guide').slice(0, 20) : []
  const articles = posts.ok ? posts.data.filter((p) => p.kind === 'blog').slice(0, 20) : []
  const post = (p: { kind: Kind; slug: string; title?: string }) => `- [${p.title ?? p.slug}](${SITE_URL}${BASE_PATH[p.kind]}/${p.slug})`
  const body = `# ${SITE_NAME}

> ${SITE_NAME} is an AI presentation maker (an AI PPT maker and AI deck generator). You describe a topic, or add a PDF, Word, Excel, PowerPoint, email, web link, Google Doc or YouTube video, and it builds a designed, editable slide deck in seconds. Decks are edited in the browser, shared by link, and exported to PowerPoint (PPTX), PDF, PNG, JPG and HTML on paid plans. There is a free plan.

## Key pages
- [Home](${SITE_URL}/): what ${SITE_NAME} does and how to start
- [AI PPT maker](${SITE_URL}/ai-ppt-maker): how to make a PowerPoint presentation with AI
- [Pricing](${SITE_URL}/pricing): the free plan and the paid plans, with current prices
- [Templates](${SITE_URL}/templates): designer-made presentation templates
- [Morph animation templates](${SITE_URL}/morph-animation-templates): presentation templates where every slide change is one smooth movement, in six families (business and strategy, pitch and investor, marketing and campaigns, product launch, technology, education), each with live previews and answers to common questions
- [Free tools](${SITE_URL}/free-tools): free presentation and PDF tools, no sign-up (listed below)
- [Support](${SITE_URL}/support): contact us, ${SUPPORT_MAIL}

- [Terms of Service](${SITE_URL}/terms), [Privacy Policy](${SITE_URL}/privacy), [Cookie notice](${SITE_URL}/cookies), [Cancellation and refund policy](${SITE_URL}/refunds): the legal documents (index: [Legal](${SITE_URL}/legal))

## Free tools (no sign-up)
${FREE_TOOLS.map((t) => `- [${t.name}](${SITE_URL}${t.href}): ${t.text}`).join('\n')}

## Free template collections
${LANDINGS.map((l) => `- [Free ${l.keyword}](${SITE_URL}/free-templates/${l.slug}): also ${l.also.join(', ')}`).join('\n')}

## Answers to common questions
${GENERAL_FAQS.map((f) => `### ${f.q}\n${f.a}`).join('\n\n')}
${guides.length ? `\n## Guides\n${guides.map(post).join('\n')}\n` : ''}${articles.length ? `\n## Blog\n${articles.map(post).join('\n')}\n` : ''}
## Optional
- [Sitemap](${SITE_URL}/sitemap.xml)
- [Blog feed](${SITE_URL}/blog/rss.xml)
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
