import { WEB, expect, suite } from '../lib.mjs'

/**
 * Search and answer engines (SEO / AEO), judged on the HTML a crawler gets without running JavaScript, for EVERY page in the sitemap:
 * its own share card (Open Graph + Twitter title, address and picture; lib/seo.ts withShare), a whole title that is not shared with another page, valid structured data,
 * the free tools as free web apps with steps (toolGraph), only real dates in the sitemap, robots.txt naming the AI crawlers, and llms.txt listing every free tool. No AI is used.
 */
export default async function () {
  const s = suite('102-seo')
  const get = async (path) => { const r = await fetch(`${WEB}${path}`); return { status: r.status, text: await r.text() } }
  const ld = (h) => [...h.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).flatMap((j) => (Array.isArray(j) ? j : j['@graph'] ?? [j]))
  const sitemap = await get('/sitemap.xml')
  const paths = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)

  await s.check(`every page in the sitemap (${paths.length}) has its own share card, a whole title of its own and valid structured data`, null, async () => {
    const titles = new Map(), problems = []
    for (const p of paths) {
      const { status, text: h } = await get(p)
      const og = (k) => (h.match(new RegExp(`<meta property="og:${k}" content="([^"]*)"`)) ?? [])[1] ?? ''
      const title = (h.match(/<title>([^<]*)/) ?? [])[1] ?? ''
      const why = []
      if (status !== 200) why.push(`status ${status}`)
      if (!og('title') || (p !== '/' && og('title') === 'SlidesDone — AI Presentation Maker')) why.push('the home page\'s share title')
      if (p !== '/' && !og('url').endsWith(p)) why.push(`og:url ${og('url')}`)
      if (!og('image')) why.push('no share picture')
      if (!/<meta name="twitter:card"/.test(h)) why.push('no twitter card')
      if (/…/.test(title)) why.push(`title cut off: ${title}`)
      if (titles.has(title)) why.push(`same title as ${titles.get(title)}`)
      titles.set(title, p)
      try { ld(h) } catch { why.push('structured data does not parse') }
      if (why.length) problems.push(`${p}: ${why.join(', ')}`)
    }
    expect(problems.length === 0, problems.slice(0, 8).join(' | '))
  })

  await s.check('a free tool is a free web app with its steps, breadcrumbs and questions; the tools page lists every tool', null, async () => {
    const types = ld((await get('/free-tools/pdf-to-ppt')).text).map((x) => x['@type'])
    expect(['WebApplication', 'HowTo', 'BreadcrumbList', 'FAQPage'].every((t) => types.includes(t)), `types: ${types}`)
    const app = ld((await get('/free-tools/pdf-to-ppt')).text).find((x) => x['@type'] === 'WebApplication')
    expect(app.isAccessibleForFree === true && app.offers?.price === '0', `offer: ${JSON.stringify(app.offers)}`)
    const list = ld((await get('/free-tools')).text).find((x) => x['@type'] === 'CollectionPage')
    const tools = paths.filter((p) => p.startsWith('/free-tools/'))
    const listed = list.mainEntity.itemListElement.map((i) => new URL(i.url).pathname)
    expect(tools.every((t) => listed.includes(t)), `not listed: ${tools.filter((t) => !listed.includes(t))}`)
  })

  await s.check('a template page shows its slides as text and is a presentation document in its data', null, async () => {
    const tpl = paths.find((p) => p.startsWith('/templates/'))
    const { text: h } = await get(tpl)
    const doc = ld(h).find((x) => x['@type'] === 'PresentationDigitalDocument')
    expect(!!doc && doc.hasPart.length === doc.numberOfPages && doc.numberOfPages > 3, `document: ${JSON.stringify(doc)?.slice(0, 200)}`)
    expect(/What is inside the/.test(h) && doc.hasPart.every((x) => h.includes(x.name.replace(/&/g, '&amp;')) || h.includes(x.name)), 'the slide list is not on the page')
  })

  await s.check('the sitemap gives only real dates (never "now" for every page), robots.txt names the AI crawlers, llms.txt lists every free tool', null, async () => {
    const dates = [...sitemap.text.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1])
    // real dates come from git (apps/web/scripts/gen-page-dates.mjs): valid, never in the future, and not one shared "now" stamped on every page
    const t = dates.map((d) => Date.parse(d))
    expect(t.every((x) => Number.isFinite(x) && x <= Date.now() + 60000), `a sitemap date is invalid or in the future: ${dates.find((d, i) => !(t[i] <= Date.now() + 60000))}`)
    expect(new Set(dates).size > 1 || dates.length < 2, `every page carries the same date (${dates[0]}): that is a build stamp, not when the pages changed`)
    const robots = (await get('/robots.txt')).text
    // only the real site (https://slidesdone.app) is open to crawlers; a local or test build keeps every crawler out (apps/web lib/env.ts IS_PUBLIC_SITE)
    if (WEB.startsWith('https://slidesdone.app')) {
      for (const bot of ['OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) expect(robots.includes(bot), `robots.txt does not name ${bot}`)
      expect(/Sitemap: https:\/\/slidesdone\.app\/sitemap\.xml/.test(robots), 'robots.txt has no sitemap line')
    } else expect(/Disallow: \/\s*$/m.test(robots), 'a non-public build must keep crawlers out')
    const llms = (await get('/llms.txt')).text
    const missing = paths.filter((p) => p.startsWith('/free-tools/') && !llms.includes(p))
    expect(missing.length === 0, `llms.txt misses: ${missing}`)
  })

  return s.done()
}
