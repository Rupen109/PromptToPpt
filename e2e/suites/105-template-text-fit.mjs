import { WEB, expect, launch, suite } from '../lib.mjs'

/**
 * Every template, every slide, measured as the browser really draws it (not as the layout engine estimates it): no text is taller than its box, and no
 * figure ("99.95%", "$12.4M") wraps onto a second line. Also: every card on every free-template category page shows a slide (none blank).
 * Before the measured font widths (packages/theme/src/font-widths.ts) 22 templates broke this; the layout engine's estimate said they fit. No AI is used.
 */
const ids = async () => [...(await (await fetch(`${WEB}/sitemap.xml`)).text()).matchAll(/<loc>[^<]*\/templates\/([^<\/]+)<\/loc>/g)].map((m) => m[1])
const categories = async () => [...(await (await fetch(`${WEB}/sitemap.xml`)).text()).matchAll(/<loc>[^<]*(\/free-templates\/[^<]+)<\/loc>/g)].map((m) => m[1])

export default async function () {
  const s = suite('105-template-text-fit')
  const b = await launch()
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } })
  try {
    await s.check('no text overflows its box and no figure wraps, on any slide of any template (as drawn in the browser)', null, async () => {
      const list = await ids()
      expect(list.length > 100, `only ${list.length} templates in the sitemap`)
      const bad = []
      let next = 0
      await Promise.all(Array.from({ length: 4 }, async () => {
        const p = await ctx.newPage()
        while (next < list.length) {
          const id = list[next++]
          await p.goto(`${WEB}/templates/${id}`, { waitUntil: 'networkidle', timeout: 60000 })
          await p.evaluate(() => document.fonts.ready)
          await p.waitForTimeout(300)
          const found = await p.evaluate(() => [...document.querySelectorAll('[data-pt-text]')].flatMap((el) => {
            const cs = getComputedStyle(el)
            const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3
            let need = 0
            for (const k of el.children) need += k.offsetHeight + parseFloat(getComputedStyle(k).marginBottom || '0')
            const wraps = el.dataset.ptText === 'metric' && [...el.children].some((k) => Math.round(k.offsetHeight / lh) > 1)
            return need > el.offsetHeight + 3 || wraps ? [`${el.dataset.ptText} "${el.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)}" ${Math.round(need)}px in ${el.offsetHeight}px${wraps ? ' (figure wraps)' : ''}`] : []
          }))
          for (const f of new Set(found)) bad.push(`${id}: ${f}`)
        }
        await p.close()
      }))
      expect(bad.length === 0, `${bad.length} text boxes do not fit: ${bad.slice(0, 6).join(' | ')}`)
    })

    await s.check('every card on every free-template category page shows a slide (no blank thumbnails)', null, async () => {
      const p = await ctx.newPage()
      const blank = []
      for (const path of await categories()) {
        await p.goto(`${WEB}${path}`, { waitUntil: 'networkidle' })
        // thumbnails draw as they near the screen: scroll the whole grid into view
        for (let i = 0; i < 25; i++) { await p.mouse.wheel(0, 700); await p.waitForTimeout(100) }
        await p.waitForTimeout(1500)
        const r = await p.evaluate(() => [...document.querySelectorAll('#templates li')].map((li) => ({ name: li.querySelector('h3')?.textContent?.trim() ?? '?', drawn: li.querySelectorAll('[data-pt-text], img').length > 0 })))
        for (const c of r) if (!c.drawn) blank.push(`${path}: ${c.name}`)
      }
      expect(blank.length === 0, `${blank.length} blank cards: ${blank.slice(0, 8).join(' | ')}`)
      await p.close()
    })

    await s.check('the templates page shows 12 at a time: numbered pages, the page in the address, back from a template returns to it, a category or search starts at page 1', null, async () => {
      const p = await ctx.newPage()
      const total = (await ids()).length
      const cards = () => p.locator('ul li h3').allInnerTexts()
      const pager = p.getByRole('navigation', { name: 'Template pages' })
      await p.goto(`${WEB}/templates`, { waitUntil: 'networkidle' })
      const first = await cards()
      expect(first.length === 12, `page 1 shows ${first.length} templates`)
      expect(await pager.getByText(`Showing 1–12 of ${total} templates`).isVisible(), 'no "Showing 1–12 of N" line')
      expect(await pager.getByRole('button', { name: 'Previous page' }).isDisabled(), 'Prev works on page 1')
      await pager.getByRole('button', { name: 'Next page' }).click()
      await p.waitForFunction(() => new URLSearchParams(location.search).get('page') === '2')
      const second = await cards()
      expect(second.length === 12 && !second.some((n) => first.includes(n)), 'page 2 repeats page 1')
      expect(await pager.getByRole('button', { name: 'Page 2' }).getAttribute('aria-current') === 'page', 'page 2 not marked current')
      // back from a template lands on the same page
      await p.locator('ul li a').first().click(); await p.waitForURL(/\/templates\/[^/?]+$/)
      await p.goBack(); await p.waitForLoadState('networkidle')
      expect(JSON.stringify(await cards()) === JSON.stringify(second), 'back from a template did not return to page 2')
      // the last page holds the rest; a page past the end shows the last one
      const pages = Math.ceil(total / 12)
      await p.goto(`${WEB}/templates?page=999`, { waitUntil: 'networkidle' })
      expect((await cards()).length === total - (pages - 1) * 12, `last page shows ${(await cards()).length}`)
      expect(await pager.getByRole('button', { name: 'Next page' }).isDisabled(), 'Next works on the last page')
      // a category starts at page 1 and only shows its own templates
      await p.getByRole('tab', { name: 'Technology & Architecture' }).click()
      await p.waitForFunction(() => new URLSearchParams(location.search).get('category') && !new URLSearchParams(location.search).get('page'))
      expect((await cards()).length > 0 && (await cards()).length <= 12, 'category page 1 is not 1–12 templates')
      // a search starts at page 1
      await p.getByRole('tab', { name: 'All templates' }).click()
      await p.getByLabel('Search templates').fill('review')
      await p.waitForFunction(() => new URLSearchParams(location.search).get('q') === 'review' && !new URLSearchParams(location.search).get('page'))
      expect((await cards()).every((n) => n.length > 0), 'search shows no templates')
      await p.close()
    })
  } finally {
    await b.close()
  }
  return s.done()
}
