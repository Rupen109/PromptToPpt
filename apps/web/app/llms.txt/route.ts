import { llms } from '@/lib/llms'

export const revalidate = 3600

/**
 * /llms.txt: a short, plain-text guide to the site for AI assistants (the llms.txt convention). It is cheap to publish and harmless; it is not a proven ranking
 * signal, so the real work for answer engines is crawlable pages, direct answers and structured data (see lib/faq.ts, lib/seo.ts and robots.ts).
 */
export const GET = () => llms(false)
