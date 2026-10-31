# SEO and AEO (answer engines): what is in place and how to keep it right

Last reviewed 2026-10-31. SEO = being found in search results. AEO = being quoted by answer engines (ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews).

## What the site does
| Area | State |
|---|---|
| Titles, descriptions | one per page, titles <= 60 chars incl. " | SlidesDone", descriptions <= 160. Generated pages (137 template pages, 8 template collections) cut at a word with `fit()` in `lib/seo.ts`. |
| Canonical | every public page has its own canonical URL |
| Social previews | `og:title/description/image` (1200x630 PNG, 240 KB), Twitter card, icons, manifest |
| robots.txt | `app/robots.ts`: everyone allowed on public pages; private pages (`/api/`, login, signup, password reset, `/editor/`) blocked; `/_next/` is NOT blocked (Google needs scripts and styles); named groups for the AI crawlers (OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended). To keep one out: `disallow: '/'` in its group. |
| sitemap.xml | `app/sitemap.ts`: static pages, 137 templates, 8 template collections, tools, blog, news, guides (published posts only) |
| llms.txt | `app/llms.txt/route.ts`: plain-text guide for AI assistants (product summary, key pages, FAQ, latest guides and posts). Cheap and harmless, but NOT a proven ranking signal: Google says it needs no special AI files. |
| Structured data | root layout: Organization + WebSite + SoftwareApplication (one graph). Pricing: priced offers generated from the live plan data. FAQPage on home, pricing, `/ai-ppt-maker` and every free tool. BreadcrumbList on pricing, `/ai-ppt-maker`, templates, articles. Article/NewsArticle on posts. |
| Answer-first content | `lib/faq.ts` holds the questions people ask (what is it, how to make a deck with AI, is it free, which files, editable in PowerPoint, build without AI, templates, privacy). One list feeds the visible FAQ, the FAQPage markup and llms.txt, so they cannot disagree. Answers start with the direct answer and state only what the product does today. |
| `/ai-ppt-maker` | was an empty placeholder in the sitemap (thin content). Now a real page: answer first, 3 steps, features, FAQ, links. |

## Checking it (re-runnable)
- Crawl every sitemap URL for title, description, canonical, one H1, noindex, og:image, structured data: the audit script used on 2026-10-31 is `e2e/seo-audit.py` (`python3 e2e/seo-audit.py https://slidesdone.app`); result after the fixes: 163 of 164 clean, the last one fixed afterwards.
- Real browser: `e2e/suites/01-public.mjs` (pages, titles, no overflow) and `09-a11y-cross.mjs` (accessibility).

## WhatsApp / Slack / LinkedIn link previews
The tags and the image are correct (checked with the WhatsApp user agent). WhatsApp showed only the bare domain because it **cached the page from before the site was live** (a parking page) and keeps previews for days. To refresh: share the link with a changed address (`https://slidesdone.app/?v=2`), or open https://developers.facebook.com/tools/debug/ , paste the address and press "Scrape Again" (WhatsApp uses Meta's crawler). New links not seen before will preview correctly.

## Owner tasks (cannot be done from code)
1. **Google Search Console**: add `slidesdone.app` as a Domain property (verify with the DNS TXT record: send it to the developer to add in Route 53), submit `https://slidesdone.app/sitemap.xml`, request indexing of the home page.
2. **Bing Webmaster Tools**: import from Search Console. Bing feeds ChatGPT search and other assistants, so this matters for AEO.
3. **Measure AEO**: monthly, ask ChatGPT, Perplexity, Gemini and Claude the questions in `lib/faq.ts` ("best AI PPT maker", "how to turn a PDF into a presentation") and note whether SlidesDone is cited; watch referrals from chatgpt.com, perplexity.ai and gemini.google.com in analytics.
4. **Sameness across the web**: use the same name, one-line description and logo on LinkedIn, X, YouTube, Product Hunt and directories. When social profiles exist, add them as `sameAs` in `lib/seo.ts`.
5. **Original content**: AEO rewards pages that answer one question directly with facts nobody else has (benchmarks, how-tos, comparisons). Publish guides through the dashboard; each gets Article and breadcrumb markup automatically.

## Known gaps
- The pricing text on `planHighlights()` says "Write decks in 100+ languages" while the language picker offers 43; decide the true number and fix one of them.
- `/privacy` and `/terms` pages do not exist yet (needed for trust, Google sign-in verification and Razorpay); they are on the launch checklist.
- No country-specific pages or hreflang (the site is English).

## Sources used (vendor blogs, so treated with caution)
Crawler access, answer-first writing and FAQ markup were the points all sources agreed on; llms.txt and schema impact were disputed, so they are cheap extras, not the plan.
- https://www.stackmatix.com/blog/aeo-optimization-checklist
- https://theaeoreport.com/answer-engine-optimization-checklist/
- https://www.trevorlasn.com/blog/aeo-geo-vs-seo-google-ai-optimization
- https://pixis.ai/blog/robots-txt-for-ai-crawlers-gptbot-perplexitybot-geo-audit/
