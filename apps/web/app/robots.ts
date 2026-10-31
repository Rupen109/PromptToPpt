import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/env'

/** Pages that are only for signed-in people or are internal: never useful in search results. */
const PRIVATE = ['/api/', '/login', '/signup', '/forgot-password', '/reset-password', '/editor/']

/**
 * Search engines and AI assistants (ChatGPT, Claude, Perplexity, Gemini, Apple) are all welcome on the public pages, so SlidesDone can be found and quoted in answers.
 * Each crawler gets its own group because a named group does not inherit the "*" rules. /_next/static is NOT blocked: Google needs our scripts and styles to render pages.
 * To keep a crawler out later, change its group to `disallow: '/'`.
 */
const AI_CRAWLERS = [
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot', // OpenAI: ChatGPT search, user-requested visits, model training
  'Claude-SearchBot', 'Claude-User', 'ClaudeBot', // Anthropic
  'PerplexityBot', 'Perplexity-User', // Perplexity
  'Google-Extended', 'Applebot-Extended', // Gemini and Apple Intelligence (opt-out switches; Google Search itself is unaffected)
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: PRIVATE },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
