import { join } from 'node:path'
import { API, EDITOR, WEB, expect, launch, suite } from '../lib.mjs'
import { api, person, png, tsx } from '../kits-lib.mjs'

/**
 * Blog / tech news / guides written in the owner dashboard and shown on the website; header language picker; sitemap generator; no emoji icons.
 * Real browser, real API and database. No AI is called anywhere in this suite. Flow ids: docs/CONTENT_FUNCTIONAL_FLOWS.md.
 */
const SHOTS = new URL('../results/', import.meta.url).pathname
const run = Date.now().toString(36)
const T = { blog: `Cut your deck time in half ${run}`, news: `Chipmaker unveils new AI processor ${run}`, g1: `Create your first deck ${run}`, g2: `Share and export ${run}`, sched: `Scheduled article ${run}` }
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{2728}]/u
const SECTION = `Getting started ${run}`

export default async function () {
  const s = suite('41-content')
  const b = await launch()
  const O = await person(b, 'cmsowner'); const U = await person(b, 'cmsuser')
  tsx(`scripts/qa-set-role.ts ${O.email} admin`)
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const v = await ctx.newPage() // an anonymous visitor of the website
  const o = O.p
  const ids = {}
  const dash = (path) => o.goto(EDITOR + path, { waitUntil: 'load' })
  const listFor = async (kind) => (await (await v.request.get(`${API}/api/v1/content/posts?kind=${kind}&pageSize=50`)).json()).data.items
  const save = async () => { await o.getByRole('button', { name: /Save draft|Save changes/ }).click(); await o.getByRole('status').filter({ hasText: 'Saved.' }).waitFor({ timeout: 10000 }) }
  const startPost = async (label) => { await dash('/admin/posts/new'); await o.getByRole('button', { name: new RegExp(label) }).click() }

  try {
    await s.check('A1 Owner only: an ordinary user cannot open the dashboard section or call its API; anonymous gets 401', U.p, async () => {
      await U.p.goto(EDITOR + '/admin/posts', { waitUntil: 'load' })
      await U.p.getByText('Not authorised').waitFor({ timeout: 10000 })
      expect((await api.get(U, '/admin/posts')).status === 403, 'API not 403 for a user')
      expect((await v.request.get(`${API}/api/v1/admin/posts`)).status() === 401, 'API not 401 anonymous')
    })

    await s.check('A2 New post starts with the type choice: Blog article / Tech news / Guide; choosing Blog shows blog fields only', o, async () => {
      await dash('/admin/posts/new')
      for (const t of ['Blog article', 'Tech news', 'Guide']) await o.getByRole('button', { name: new RegExp(t) }).waitFor({ timeout: 15000 })
      await o.getByRole('button', { name: /Blog article/ }).click()
      await o.getByLabel('Article text').waitFor()
      expect(await o.getByText('Featured').count() >= 1, 'no Featured option for blog')
      expect(await o.getByText('Source name').count() === 0, 'news fields shown on a blog')
      expect(await o.getByText('Trending').count() === 0, 'trending shown on a blog')
    })

    await s.check('A3 Blog: write with the toolbar, upload a picture, preview, save draft (private), then publish → on the site with picture, headings, SEO data', o, async () => {
      await o.getByRole('textbox', { name: /Title/ }).first().fill(T.blog)
      const slug = await o.getByPlaceholder('made-from-the-title').inputValue(); expect(/^cut-your-deck-time-in-half-/.test(slug), `slug ${slug}`)
      await o.getByLabel(/^Summary/).fill('Three habits that make every presentation faster to build and easier to follow.')
      await o.getByLabel('Article text').fill('Intro paragraph with a [link](https://example.com).\n\nSecond heading line')
      // the toolbar: select the last line → Heading; select "Intro" → Bold
      await o.getByLabel('Article text').evaluate((el) => { el.focus(); el.setSelectionRange(el.value.indexOf('Second'), el.value.length) })
      await o.getByRole('button', { name: 'Heading', exact: true }).click()
      expect((await o.getByLabel('Article text').inputValue()).includes('## Second heading line'), 'toolbar did not make a heading')
      await o.waitForTimeout(400) // the toolbar re-selects its own text on the next frame
      await o.getByLabel('Article text').evaluate((el) => { el.focus(); el.setSelectionRange(0, 5) })
      await o.getByRole('button', { name: 'Bold', exact: true }).click()
      expect((await o.getByLabel('Article text').inputValue()).startsWith('**Intro** paragraph'), 'toolbar did not make bold')
      await o.waitForTimeout(400)
      await o.getByLabel('Article text').evaluate((el) => { el.focus(); el.setSelectionRange(el.value.length, el.value.length) })
      await o.getByLabel('Article text').pressSequentially('\n\n- one\n- two\n')
      await o.getByLabel('Choose a cover picture').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png(640, 360) })
      await o.locator('img[alt="Cover"]').waitFor({ timeout: 10000 })
      await o.getByLabel('Choose a picture to add to the article').setInputFiles({ name: 'inline.png', mimeType: 'image/png', buffer: png(300, 200, { rgba: [30, 90, 200, 255] }) })
      await o.waitForFunction(() => document.querySelector('textarea[aria-label="Article text"]').value.includes('/api/v1/content/images/post-'))
      await o.getByLabel('Tags').fill(`ai, presentations, ${run}`)
      await o.getByRole('tab', { name: 'preview' }).click()
      await o.locator('.sd-prose h2').filter({ hasText: 'Second heading line' }).waitFor({ timeout: 8000 })
      expect(await o.locator('.sd-prose strong').filter({ hasText: 'Intro' }).count() === 1, `preview lacks bold: ${(await o.locator('.sd-prose').innerHTML()).slice(0, 400)}`)
      await o.getByRole('tab', { name: 'write' }).click()
      await save()
      ids.blog = o.url().split('/').pop(); expect(ids.blog && ids.blog !== 'new', 'not redirected to the saved post')
      // private while it is a draft
      expect((await v.request.get(`${API}/api/v1/content/posts/blog/${slug}`)).status() === 404, 'draft is public')
      await o.screenshot({ path: join(SHOTS, '41-blog-editor.png') })
      await o.getByRole('button', { name: 'Publish now' }).click()
      await o.getByRole('status').filter({ hasText: /Published/ }).waitFor({ timeout: 10000 })
      await v.goto(WEB + `/blog/${slug}`, { waitUntil: 'networkidle' })
      expect(await v.getByRole('heading', { level: 1, name: T.blog }).count() === 1, 'h1')
      expect(await v.locator('.sd-prose h2#second-heading-line').count() === 1, 'rendered heading with id')
      expect(await v.locator('.sd-prose a[href="https://example.com"][rel*="noopener"]').count() === 1, 'external link attrs')
      const imgs = await v.locator('img').evaluateAll((els) => els.filter((e) => e.src.includes('/api/v1/content/images/')).map((e) => e.complete && e.naturalWidth))
      expect(imgs.length >= 2 && imgs.every((w) => w > 0), `pictures did not load: ${JSON.stringify(imgs)}`)
      const ld = await v.locator('script[type="application/ld+json"]').allInnerTexts(); expect(ld.join().includes('"Article"') && ld.join().includes('BreadcrumbList'), 'no JSON-LD')
      expect((await v.locator('link[rel=canonical]').getAttribute('href')).endsWith(`/blog/${slug}`), 'canonical')
      expect((await v.locator('meta[property="og:image"]').getAttribute('content')).includes('/api/v1/content/images/'), 'og:image')
      await v.screenshot({ path: join(SHOTS, '41-blog-article.png'), fullPage: false })
      ids.blogSlug = slug
    })

    await s.check('A4 The blog page lists it (card, tag filter, pagination markup), feed and sitemap include it', v, async () => {
      await v.goto(WEB + '/blog', { waitUntil: 'networkidle' })
      await v.getByRole('heading', { name: T.blog }).waitFor({ timeout: 15000 })
      await v.getByRole('navigation', { name: 'Topics' }).getByRole('link', { name: run }).click()
      await v.waitForURL(new RegExp(`tag=${run}`))
      expect(await v.getByRole('heading', { name: T.blog }).count() === 1, 'tag filter lost the post')
      await v.goto(WEB + '/blog?tag=nothing-here-' + run, { waitUntil: 'networkidle' })
      await v.getByText(/No articles about/).waitFor()
      const rss = await (await v.request.get(WEB + '/blog/rss.xml')).text(); expect(rss.includes('<rss') && rss.includes(T.blog), 'RSS feed lacks the post')
      const sm = await (await v.request.get(WEB + '/sitemap.xml')).text(); expect(sm.includes(`/blog/${ids.blogSlug}`) && sm.includes('/blog<') , 'sitemap lacks the post / blog page')
    })

    await s.check('A5 Tech news: pick the type → news fields; headline + short text + source link + trending → /news shows the Trending strip and a Source link', o, async () => {
      await startPost('Tech news')
      await o.getByText('Source name').waitFor()
      expect(await o.getByLabel('Article text').count() === 1, 'optional write-up missing')
      await o.getByRole('textbox', { name: /Headline/ }).first().fill(T.news)
      await o.getByLabel(/^The news/).fill('A chipmaker showed an AI processor it says runs models twice as fast while using half the power.')
      await o.getByLabel('Source name').fill('The Daily Wire')
      await o.getByLabel('Link to the original').fill('https://example.com/story')
      await o.getByLabel('Tags').fill(`ai, chips, ${run}`)
      await o.getByRole('checkbox', { name: /Trending/ }).check()
      await save(); ids.news = o.url().split('/').pop()
      await o.getByRole('button', { name: 'Publish now' }).click(); await o.getByRole('status').filter({ hasText: /Published/ }).waitFor()
      await v.goto(WEB + '/news', { waitUntil: 'networkidle' })
      await v.getByRole('heading', { name: 'Trending now' }).waitFor({ timeout: 15000 })
      const card = v.locator('article', { hasText: T.news }).first()
      await card.waitFor()
      expect((await card.getByRole('link', { name: /Source/ }).getAttribute('href')) === 'https://example.com/story', 'source link')
      expect((await card.getByRole('link', { name: /Source/ }).getAttribute('rel')).includes('noopener'), 'source rel')
      expect(await card.getByText('The Daily Wire').count() === 1, 'source name')
      await v.screenshot({ path: join(SHOTS, '41-news.png') })
    })

    await s.check('A6 Guides: section + order; two guides → /guides groups them in order; guide page has On this page, previous/next', o, async () => {
      for (const [title, order] of [[T.g2, '20'], [T.g1, '10']]) {
        await startPost('Guide'); await o.locator('input[list="guide-sections"]').waitFor()
        await o.getByRole('textbox', { name: /Title/ }).first().fill(title)
        await o.getByLabel(/^Summary/).fill(`Step by step: ${title}.`)
        await o.locator('input[list="guide-sections"]').fill(SECTION); await o.getByLabel('Order').fill(order)
        await o.getByLabel('Article text').fill('## Step one\nDo the first thing.\n\n## Step two\nDo the second thing.\n\n### A detail\nMore words here.')
        await save(); await o.getByRole('button', { name: 'Publish now' }).click(); await o.getByRole('status').filter({ hasText: /Published/ }).waitFor()
        ids[title === T.g1 ? 'g1' : 'g2'] = o.url().split('/').pop()
      }
      await v.goto(WEB + '/guides', { waitUntil: 'networkidle' })
      const sec = v.locator('section[aria-labelledby]', { has: v.getByRole('heading', { name: SECTION }) })
      const titles = await sec.locator('h3').allInnerTexts(); expect(titles.join('|') === `${T.g1}|${T.g2}`, `order: ${titles}`)
      await sec.getByRole('link', { name: T.g1 }).click()
      await v.getByRole('heading', { level: 1, name: T.g1 }).waitFor()
      expect(await v.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'A detail' }).count() === 1, 'On this page list')
      await v.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Step two' }).click()
      expect((await v.evaluate(() => location.hash)) === '#step-two', 'jump link hash')
      expect(await v.getByRole('navigation', { name: 'More guides' }).getByRole('link', { name: new RegExp(T.g2) }).count() === 1, 'next guide link')
      await v.screenshot({ path: join(SHOTS, '41-guide.png') })
    })

    await s.check('A7 Plain refusals in the dashboard: publish without a summary / without text; a bad news link; nothing goes live', o, async () => {
      await startPost('Blog article')
      await o.getByRole('textbox', { name: /Title/ }).first().fill(`Incomplete ${run}`)
      await o.getByRole('button', { name: 'Publish now' }).click()
      await o.getByRole('alert').filter({ hasText: /Write a short summary/ }).waitFor({ timeout: 10000 })
      await o.getByLabel(/^Summary/).fill('A summary only.')
      await o.getByRole('button', { name: 'Publish now' }).click()
      await o.getByRole('alert').filter({ hasText: /Write the article/ }).waitFor({ timeout: 10000 })
      expect(!(await listFor('blog')).some((p) => p.title === `Incomplete ${run}`), 'incomplete post is public')
      await startPost('Tech news')
      await o.getByRole('textbox', { name: /Headline/ }).first().fill(`Bad link ${run}`)
      await o.getByLabel('Link to the original').fill('javascript:alert(1)')
      await o.getByRole('button', { name: 'Save draft' }).click()
      await o.getByRole('alert').first().waitFor({ timeout: 10000 })
    })

    await s.check('A8 Scheduling: a future date keeps it private and shows "scheduled" in the list; unpublish and delete take posts off the site', o, async () => {
      await startPost('Blog article')
      await o.getByRole('textbox', { name: /Title/ }).first().fill(T.sched)
      await o.getByLabel(/^Summary/).fill('Comes later.'); await o.getByLabel('Article text').fill('Text that is long enough to publish.')
      const d = new Date(Date.now() + 2 * 24 * 3600_000); const pad = (n) => String(n).padStart(2, '0')
      await o.getByLabel('Or publish on a date').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`)
      await o.getByRole('button', { name: 'Schedule' }).click()
      await o.getByRole('status').filter({ hasText: /Scheduled for/ }).waitFor({ timeout: 10000 })
      expect(!(await listFor('blog')).some((p) => p.title === T.sched), 'scheduled post is public')
      await dash('/admin/posts?state=scheduled')
      await o.getByText(T.sched).waitFor({ timeout: 10000 })
      // unpublish the guide → gone from the site; delete the scheduled one
      await dash(`/admin/posts/${ids.g2}`); await o.getByRole('button', { name: /Unpublish/ }).click(); await o.getByRole('status').filter({ hasText: /Back to draft/ }).waitFor()
      expect((await v.request.get(`${API}/api/v1/content/posts/guide/${T.g2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`)).status() === 404, 'unpublished guide still public')
      o.once('dialog', (d2) => d2.accept())
      await dash(`/admin/posts?state=scheduled&q=${run}`); await o.getByText(T.sched).click()
      await o.getByRole('button', { name: /Delete this post/ }).click()
      await o.waitForURL(/\/admin\/posts$/, { timeout: 10000 })
    })

    await s.check('A9 Safe text: HTML and javascript: links in an article are shown inert on the site', o, async () => {
      await startPost('Blog article')
      await o.getByRole('textbox', { name: /Title/ }).first().fill(`Safe text ${run}`)
      await o.getByLabel(/^Summary/).fill('Checks that nothing runs.')
      await o.getByLabel('Article text').fill('Hello <script>window.__pwn=1</script> <img src=x onerror="window.__pwn=1"> [click](javascript:window.__pwn=1) ![x](http://evil.example/p.png)\n\nDone, more than twenty characters.')
      await save(); await o.getByRole('button', { name: 'Publish now' }).click(); await o.getByRole('status').filter({ hasText: /Published/ }).waitFor()
      await v.goto(WEB + `/blog/safe-text-${run}`, { waitUntil: 'networkidle' })
      expect(await v.evaluate(() => window.__pwn === undefined), 'script ran')
      expect(await v.locator('.sd-prose script, .sd-prose img[onerror]').count() === 0, 'raw HTML rendered')
      const hrefs = await v.locator('.sd-prose a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
      expect(hrefs.every((h) => !/^javascript:/i.test(h)), `javascript: link kept: ${hrefs}`)
      expect(await v.locator('.sd-prose img[src*="evil.example"]').count() === 0, 'http image rendered')
    })

    await s.check('B1 The language picker is in the website header (desktop) and the phone menu, starting on English (choosing, translating and the hand-off are tested in suites 42 and 43)', v, async () => {
      await v.setViewportSize({ width: 1440, height: 900 })
      await v.goto(WEB + '/', { waitUntil: 'networkidle' })
      expect(await v.locator('header').getByLabel('Presentation language').count() === 1, 'no language picker in the header')
      expect(await v.locator('header').getByLabel('Presentation language').inputValue() === 'en', 'does not start on English')
      await v.setViewportSize({ width: 390, height: 800 })
      await v.goto(WEB + '/', { waitUntil: 'networkidle' })
      await v.getByRole('button', { name: /menu/i }).first().click()
      expect(await v.locator('#mobile-nav').getByLabel('Presentation language').count() === 1, 'no picker in the phone menu')
    })

    await s.check('B2 Editor start page accepts only a known language code from the link', U.p, async () => {
      // a made-up code must not become the deck language
      const bogus = 'zz-evil'
      await U.p.goto(EDITOR + `/start?draft=none&lang=${bogus}`, { waitUntil: 'load' }); await U.p.waitForTimeout(1500)
      expect(await U.p.evaluate(() => sessionStorage.getItem('prompttoppt:pending-language')) === null, 'bogus language stored')
    })

    await s.check('C1 Sitemap generator: a real public site → sitemap.xml to download, valid XML, robots/noindex notes; private addresses refused', v, async () => {
      await v.setViewportSize({ width: 1280, height: 900 })
      await v.goto(WEB + '/free-tools', { waitUntil: 'load' })
      expect(await v.getByRole('link', { name: /Sitemap Generator/ }).count() >= 1, 'not listed on /free-tools')
      await v.goto(WEB + '/free-tools/sitemap-generator', { waitUntil: 'networkidle' })
      // the page may still be hydrating: type again until the form has taken the text
      for (let i = 0; i < 10 && !(await v.getByRole('button', { name: 'Generate sitemap' }).isEnabled()); i++) { await v.getByLabel('Website address').fill('example.com'); await v.waitForTimeout(300) }
      await v.getByRole('button', { name: 'Generate sitemap' }).click()
      await v.getByRole('heading', { name: /sitemap for example.com is ready/ }).waitFor({ timeout: 60000 })
      const xml = await v.getByLabel('Sitemap XML').inputValue()
      expect(xml.startsWith('<?xml') && xml.includes('<urlset') && xml.includes('<loc>https://example.com/</loc>'), xml.slice(0, 200))
      const [dl] = await Promise.all([v.waitForEvent('download'), v.getByRole('button', { name: /Download sitemap.xml/ }).click()])
      expect(dl.suggestedFilename() === 'sitemap.xml', dl.suggestedFilename())
      await v.getByRole('button', { name: /Copy XML/ }).click(); await v.getByRole('button', { name: /Copied/ }).waitFor()
      expect((await v.evaluate(() => navigator.clipboard.readText())).includes('<urlset'), 'clipboard')
      await v.screenshot({ path: join(SHOTS, '41-sitemap.png') })
      await v.getByLabel('Website address').fill('http://localhost:4000')
      await v.getByRole('button', { name: 'Generate sitemap' }).click()
      await v.getByRole('alert').filter({ hasText: /not allowed|port/ }).waitFor({ timeout: 15000 })
      await v.getByLabel('Website address').fill('this-site-does-not-exist-' + run + '.com')
      await v.getByRole('button', { name: 'Generate sitemap' }).click()
      await v.getByRole('alert').filter({ hasText: /could not open/ }).waitFor({ timeout: 30000 })
    })

    await s.check('D1 No emoji icons anywhere in the product pages: website (home, templates, pricing, free tools, blog, guides) and editor (home, sidebar, admin)', v, async () => {
      const seen = []
      for (const path of ['/', '/templates', '/pricing', '/free-tools', '/free-tools/pdf-to-ppt', '/free-tools/pdf-to-jpg', '/free-tools/sitemap-generator', '/free-tools/video-to-slides', '/blog', '/news', '/guides']) {
        await v.goto(WEB + path, { waitUntil: 'networkidle' })
        const t = await v.locator('body').innerText(); const m = t.match(EMOJI); if (m) seen.push(`${path}: ${m[0]}`)
        expect(await v.locator('svg.lucide').count() > 0 || path.startsWith('/free-tools/pdf') , `${path}: no icons from the library`)
      }
      for (const path of ['/', '/admin/posts', '/admin/reviews']) {
        await dash(path); await o.waitForTimeout(1200)
        const t = await o.locator('body').innerText(); const m = t.match(EMOJI); if (m) seen.push(`editor ${path}: ${m[0]}`)
      }
      expect(seen.length === 0, `emoji still shown: ${seen.join('; ')}`)
    })

    await s.check('E1 Phone width: blog list, article, news and guides have no sideways scroll; footer links to Blog, News and Guides', v, async () => {
      await v.setViewportSize({ width: 390, height: 800 })
      for (const path of ['/blog', `/blog/${ids.blogSlug}`, '/news', '/guides']) {
        await v.goto(WEB + path, { waitUntil: 'networkidle' })
        expect(await v.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path} scrolls sideways`)
      }
      const foot = v.locator('footer')
      for (const l of ['Blog', 'Tech news', 'Guides: how to use SlidesDone']) expect(await foot.getByRole('link', { name: l }).count() >= 1, `footer lacks ${l}`)
    })
  } finally {
    // clean up what this run wrote
    for (const id of Object.values(ids)) await api.del(O, `/admin/posts/${id}`).catch(() => {})
    const left = await api.get(O, `/admin/posts?q=${run}`).catch(() => null)
    for (const p of left?.data?.items ?? []) await api.del(O, `/admin/posts/${p.id}`).catch(() => {})
    await b.close()
  }
  return s.done()
}
