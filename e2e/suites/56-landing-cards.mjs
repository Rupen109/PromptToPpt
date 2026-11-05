import { WEB, expect, launch, suite } from '../lib.mjs'

/**
 * Landing page cards: no label pills above the section headings, card groups are swipeable carousels on phones and tablets (buttons, dots,
 * keyboard, swipe) and plain grids with equal-height cards on desktop, and the page never scrolls sideways. No AI is called.
 */
const CAROUSELS = ['What SlidesDone can read', 'How SlidesDone works, in three steps', 'Template designs', 'Pricing plans']
const GONE = ['Multi-modal ingestion matrix', 'Instant velocity', 'Uncompromised granular control', 'Pre-engineered blueprints', 'Honest SaaS pricing', 'Clear answers', 'Live ingestion simulator', 'Agency-grade', 'Modality 01', 'Input stage', 'Agent synthesis']

export default async function () {
  const s = suite('56-landing-cards')
  const b = await launch()
  const open = async (width) => {
    const ctx = await b.newContext({ viewport: { width, height: 900 } })
    const p = await ctx.newPage()
    await p.goto(WEB + '/', { waitUntil: 'networkidle' })
    await p.addStyleTag({ content: '[data-reveal]{opacity:1!important;transform:none!important;transition:none!important}' }) // scroll-reveal is not under test
    return { ctx, p }
  }
  const state = (p, label) => p.evaluate((label) => {
    const r = [...document.querySelectorAll('[role=region][aria-roledescription=carousel]')].find((x) => x.getAttribute('aria-label') === label)
    if (!r) return null
    const t = r.firstElementChild, prev = r.querySelector('button[aria-label="Previous card"]'), next = r.querySelector('button[aria-label="Next card"]')
    const dots = [...r.querySelectorAll('button[aria-label^="Show card"]')]
    return { left: Math.round(t.scrollLeft), max: t.scrollWidth - t.clientWidth, slides: t.children.length, focusable: t.tabIndex === 0, display: getComputedStyle(t).display,
      controls: !!prev && getComputedStyle(prev.parentElement).display !== 'none', prevOff: prev?.disabled, nextOff: next?.disabled, dot: dots.findIndex((d) => d.getAttribute('aria-current') === 'true') }
  }, label)
  const settle = (p) => p.waitForTimeout(900) // smooth scrolling

  try {
    await s.check('A1 No label pills above the section headings, hero or simulator; the useful labels stay (Most popular, N slides)', null, async () => {
      const { ctx, p } = await open(1440)
      const html = (await p.content()).toLowerCase()
      const left = GONE.filter((t) => html.includes(t.toLowerCase()))
      expect(left.length === 0, `still on the page: ${left.join(', ')}`)
      expect((await p.getByText('Most popular').count()) === 1, 'the Most popular label on the Pro plan is gone')
      expect((await p.getByText(/^\d+ slides$/i).count()) >= 3, 'the slide counts on the template cards are gone')
      await ctx.close()
    })

    await s.check('A2 Phone: every card group is a carousel; Next, Previous, the dots and the keyboard move one card and the buttons follow', null, async () => {
      const { ctx, p } = await open(390)
      const names = await p.evaluate(() => [...document.querySelectorAll('[role=region][aria-roledescription=carousel]')].map((r) => r.getAttribute('aria-label')))
      for (const n of CAROUSELS) expect(names.includes(n), `no carousel named "${n}"`)
      const label = 'What SlidesDone can read'
      const region = p.locator(`[role=region][aria-label="${label}"]`)
      await region.scrollIntoViewIfNeeded()
      let st = await state(p, label)
      expect(st.slides === 4 && st.max > 100 && st.prevOff && !st.nextOff && st.dot === 0 && st.focusable, `start: ${JSON.stringify(st)}`)
      await region.getByRole('button', { name: 'Next card' }).click(); await settle(p)
      st = await state(p, label); expect(st.dot === 1 && st.left > 100 && !st.prevOff, `after Next: ${JSON.stringify(st)}`)
      await region.getByRole('button', { name: 'Show card 4 of 4' }).click(); await settle(p)
      st = await state(p, label); expect(st.dot === 3 && st.nextOff && st.left >= st.max - 3, `after dot 4: ${JSON.stringify(st)}`)
      await region.getByRole('button', { name: 'Previous card' }).click(); await settle(p)
      st = await state(p, label); expect(st.dot === 2, `after Previous: ${JSON.stringify(st)}`)
      await region.locator('> div').first().focus(); await p.keyboard.press('Home'); await settle(p)
      st = await state(p, label); expect(st.dot === 0 && st.left <= 3, `after Home: ${JSON.stringify(st)}`)
      await p.keyboard.press('ArrowRight'); await settle(p)
      st = await state(p, label); expect(st.dot === 1, `after ArrowRight: ${JSON.stringify(st)}`)
      await p.evaluate((l) => { const t = [...document.querySelectorAll('[role=region]')].find((x) => x.getAttribute('aria-label') === l).firstElementChild; t.scrollTo({ left: t.scrollWidth, behavior: 'instant' }) }, label); await p.waitForTimeout(500)
      st = await state(p, label); expect(st.dot === 3 && st.nextOff, `after a swipe to the end: ${JSON.stringify(st)}`)
      const slide = await region.locator('> div > div').nth(1).getAttribute('aria-label'); expect(slide === '2 of 4', `slide label "${slide}"`)
      await ctx.close()
    })

    await s.check('A3 Phone: the Most popular label is not clipped, and choosing another template filter starts the carousel again at its first card', null, async () => {
      const { ctx, p } = await open(390)
      const box = await p.getByText('Most popular').boundingBox(); expect(box && box.width > 40 && box.height > 15, 'the Most popular label is clipped')
      await p.locator('#templates').scrollIntoViewIfNeeded()
      await p.locator('#templates').getByRole('button', { name: 'Next card' }).click(); await settle(p)
      await p.locator('#templates button[aria-pressed]').nth(1).click(); await p.waitForTimeout(400)
      const st = await state(p, 'Template designs'); expect(st.dot === 0 && st.left <= 3, `after the filter: ${JSON.stringify(st)}`)
      await ctx.close()
    })

    await s.check('A4 Tablet: about two cards in view with the next one peeking', null, async () => {
      const { ctx, p } = await open(768)
      const w = await p.evaluate(() => { const t = [...document.querySelectorAll('[role=region]')].find((x) => x.getAttribute('aria-label') === 'What SlidesDone can read').firstElementChild; return { view: t.clientWidth, card: t.children[0].getBoundingClientRect().width } })
      expect(w.card * 2 < w.view && w.card * 3 > w.view, `card ${Math.round(w.card)}px in a ${w.view}px track`)
      await ctx.close()
    })

    await s.check('A5 Desktop: card groups are plain grids (no buttons, no extra tab stop) and the cards in a row are equally tall; the raised Pro plan is the only exception', null, async () => {
      for (const width of [1440, 1024]) {
        const { ctx, p } = await open(width)
        const groups = width === 1440 ? CAROUSELS : ['How SlidesDone works, in three steps', 'Pricing plans']
        for (const label of groups) {
          const st = await state(p, label)
          expect(st && st.display === 'grid' && !st.controls && !st.focusable && st.max <= 1, `${width}px ${label}: ${JSON.stringify(st)}`)
          const heights = await p.evaluate((l) => { const r = [...document.querySelectorAll('[role=region]')].find((x) => x.getAttribute('aria-label') === l); return [...r.firstElementChild.querySelectorAll('[role=group]')].map((g) => Math.round(g.firstElementChild.firstElementChild?.getBoundingClientRect().height ?? g.getBoundingClientRect().height)) }, label)
          const [min, max] = [Math.min(...heights), Math.max(...heights)]
          expect(max - min <= (label === 'Pricing plans' ? 18 : 1), `${width}px ${label}: card heights ${heights.join(', ')}`)
        }
        await ctx.close()
      }
    })

    await s.check('A7 The example under "From a Dense Document to One Clear Slide": before and after are labelled, no time is promised, and every number on the slide is on the document it came from', null, async () => {
      const { ctx, p } = await open(1440)
      const fig = p.locator('figure[aria-label^="Example"]'); expect((await fig.count()) === 1, 'the example is missing')
      const text = await fig.innerText()
      for (const t of ['Before · your document', 'After · your slide', 'AI builds the slide']) expect(text.toLowerCase().includes(t.toLowerCase()), `missing "${t}"`)
      expect(!/\b\d+\s?(s|sec|secs|seconds|min|minutes)\b/i.test(text), `a duration is promised: ${text.match(/\b\d+\s?(s|sec|secs|seconds|min|minutes)\b/i)?.[0]}`)
      const source = await fig.locator('> div > div').first().innerText(), slide = await fig.locator('> div > div').last().innerText()
      const figures = slide.match(/\$?\d[\d.]*[%M]/g) ?? []
      expect(figures.length >= 6, `the slide shows only ${figures.length} figures`)
      const missing = [...new Set(figures)].filter((f) => !source.includes(f)); expect(missing.length === 0, `on the slide but not in the document: ${missing.join(', ')}`)
      await ctx.close()
    })

    await s.check('A8 The Most popular label is steady (a pulsing one fades below WCAG contrast); the Q2 bar of the example chart is drawn', null, async () => {
      const { ctx, p } = await open(1440)
      const anim = await p.getByText('Most popular').evaluate((e) => getComputedStyle(e).animationName); expect(anim === 'none', `the label animates (${anim})`)
      const bar = await p.locator('figure[aria-label^="Example"] [role=img]').locator('div.rounded-t-md').first().evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, h: e.getBoundingClientRect().height }))
      expect(bar.h > 40 && bar.bg !== 'rgba(0, 0, 0, 0)', `the Q2 bar is not drawn (${JSON.stringify(bar)})`)
      await ctx.close()
    })

    await s.check('A6 The page never scrolls sideways (360, 390, 768, 1024, 1440, 1920 px)', null, async () => {
      for (const width of [360, 390, 768, 1024, 1440, 1920]) {
        const { ctx, p } = await open(width)
        const w = await p.evaluate(() => ({ page: document.documentElement.scrollWidth, view: window.innerWidth }))
        expect(w.page <= w.view, `${width}px: page is ${w.page}px wide`)
        await ctx.close()
      }
    })
  } finally { await b.close() }
  return s.done()
}
