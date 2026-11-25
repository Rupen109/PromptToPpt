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
  } finally {
    await b.close()
  }
  return s.done()
}
