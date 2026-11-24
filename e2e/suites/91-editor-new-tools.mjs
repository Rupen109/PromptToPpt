import { API, EDITOR, PASSWORD, WEB, expect, launch, suite } from '../lib.mjs'
import { tsx } from '../kits-lib.mjs'

/**
 * The newest editor tools, in a real browser, each judged on the SAVED deck: a chart's colours, legend and trend line (chart dialog), a picture's light and shadow (Picture panel), a free crop (crop dialog:
 * the frame takes the cut-out's shape), and grouping (select two objects, Group, the group moves as one, Ungroup). No AI is used.
 * Needs a verified account: E2E_EMAIL=… E2E_PASSWORD=…
 */
export default async function () {
  const s = suite('91-editor-new-tools')
  const email = process.env['E2E_EMAIL']
  if (!email) { console.log('  (skipped: set E2E_EMAIL / E2E_PASSWORD, a verified account)'); return s.done() }
  const b = await launch()
  try {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
    const r = await ctx.request.post(API + '/api/auth/sign-in/email', { headers: { origin: WEB }, data: { email, password: process.env['E2E_PASSWORD'] ?? PASSWORD } })
    expect(r.ok(), `sign-in ${r.status()}`)
    const H = { origin: EDITOR }
    const madeRes = await ctx.request.post(`${API}/api/v1/presentations`, { headers: H, data: { title: 'New tools check' } })
    const made = await madeRes.json()
    expect(!!made?.data?.id, `could not create the deck: ${madeRes.status()}`)
    const deckId = made.data.id
    const get = async () => (await (await ctx.request.get(`${API}/api/v1/presentations/${deckId}`, { headers: H })).json()).data
    const balance = async () => (await (await ctx.request.get(`${API}/api/v1/me/entitlements`, { headers: H })).json()).data.credits.balance
    const doc0 = (await get()).document
    const base = (id, x, y, w, h, z) => ({ id, x, y, width: w, height: h, rotation: 0, locked: false, zIndex: z, opacity: 1 })
    const elements = [
      { type: 'chart', ...base('chart1', 100, 80, 900, 420, 1), chartType: 'bar', labels: ['A', 'B', 'C'], series: [{ name: 'Sales', values: [10, 20, 30] }] },
      { type: 'image', ...base('pic1', 1100, 80, 640, 320, 2), src: `${WEB}/logo-lockup.png`, alt: 'logo', fit: 'cover', clip: 'none' },
      { type: 'shape', ...base('boxA', 200, 640, 300, 200, 3), shape: 'rect', fill: '#2563EB' },
      { type: 'chart', ...base('chart2', 1100, 560, 760, 440, 5), chartType: 'bar', labels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'North', values: [10, 20, 30] }, { name: 'South', values: [30, 20, 10] }], trendline: true },
      { type: 'shape', ...base('boxB', 800, 640, 300, 200, 4), shape: 'rect', fill: '#DC2626' },
    ]
    const slide = { ...structuredClone(doc0.slides[0]), id: 'tools1', manual: true, locked: false, elements, effects: [] }
    const cur = await get()
    const doc = structuredClone(cur.document); doc.slides = [slide]
    const put = await ctx.request.put(`${API}/api/v1/presentations/${deckId}`, { headers: H, data: { baseRevision: cur.revision, document: doc, snapshot: false } })
    expect(put.ok(), `seed save ${put.status()}: ${(await put.text()).slice(0, 200)}`)
    const p = await ctx.newPage()
    await p.goto(`${EDITOR}/edit/${deckId}`, { waitUntil: 'networkidle' })
    const stage = p.locator('[data-testid="stage"]')
    await stage.waitFor({ timeout: 30000 })
    const savedEl = async (id) => (await get()).document.slides[0].elements.find((e) => e.id === id)
    const waitSaved = async (id, test) => { for (let i = 0; i < 30; i++) { const e = await savedEl(id); if (e && test(e)) return e; await new Promise((r) => setTimeout(r, 500)) } return savedEl(id) }
    const at = async (id) => { const e = await savedEl(id); const bb = await stage.boundingBox(); const sc = Number(await stage.getAttribute('data-scale')); return { x: bb.x + (e.x + e.width / 2) * sc, y: bb.y + (e.y + e.height / 2) * sc, sc, e } }
    const click = async (id, opts = {}) => { const c = await at(id); await p.mouse.click(c.x, c.y, opts) }

    await s.check('chart style: colour, legend and trend line chosen in the chart dialog are saved on the chart', p, async () => {
      await click('chart1')
      await p.locator('[data-testid="chart-edit"]').click()
      await p.locator('[data-testid="chart-style"]').waitFor({ timeout: 10000 })
      await p.getByLabel('Colour of Sales').fill('#ff0000')
      await p.getByLabel('Legend', { exact: true }).selectOption('right')
      await p.getByLabel('Trend line').check()
      await p.getByLabel('Show figures').uncheck()
      await p.locator('[data-testid="chart-dialog-done"]').click()
      const c = await waitSaved('chart1', (e) => e.legend === 'right' && e.trendline === true && e.dataLabels === true && e.colors?.[0] === '#ff0000')
      expect(c.legend === 'right' && c.trendline === true && c.dataLabels === false, `saved chart: ${JSON.stringify({ legend: c.legend, trendline: c.trendline, dataLabels: c.dataLabels, colors: c.colors })}`)
      expect(JSON.stringify(c.colors) === JSON.stringify(['#ff0000']), `colours: ${JSON.stringify(c.colors)}`)
      expect(JSON.stringify(c.series) === JSON.stringify([{ name: 'Sales', values: [10, 20, 30] }]), 'the figures changed')
      await p.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] polyline[data-trend]').length > 0, null, { timeout: 8000 }).catch(() => { throw new Error('the trend line is not drawn on the slide') })
    })
    await s.check('stacked bars: chosen in the chart dialog, saved, the trend line taken off; 100% stacked draws a 0-100% axis on the slide', p, async () => {
      await click('chart2')
      await p.locator('[data-testid="chart-edit"]').click()
      await p.locator('[data-testid="chart-style"]').waitFor({ timeout: 10000 })
      await p.getByLabel('Bars', { exact: true }).selectOption('stacked')
      expect(await p.getByLabel('Trend line').count() === 0, 'the trend line control still shows on stacked bars')
      const st = await waitSaved('chart2', (e) => e.stack === 'stacked')
      expect(st.stack === 'stacked' && !st.trendline, `saved: ${JSON.stringify({ stack: st.stack, trendline: st.trendline })}`)
      await p.getByLabel('Bars', { exact: true }).selectOption('percent')
      await p.locator('[data-testid="chart-dialog-done"]').click()
      const pc = await waitSaved('chart2', (e) => e.stack === 'percent')
      expect(pc.stack === 'percent', `saved stack: ${pc.stack}`)
      expect(JSON.stringify(pc.series) === JSON.stringify([{ name: 'North', values: [10, 20, 30] }, { name: 'South', values: [30, 20, 10] }]), 'the figures changed')
      await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="stage"] svg text')].some((t) => t.textContent === '100%'), null, { timeout: 8000 }).catch(() => { throw new Error('no 0-100% axis drawn on the slide') })
      if (process.env['E2E_SHOT']) await p.screenshot({ path: process.env['E2E_SHOT'] }) // (optional: a picture of the slide for a human look)
    })
    await s.check('charts read on their slide: no bar is drawn in the slide\'s own colour, the chart\'s words read on it', p, async () => {
      const sl = (await get()).document.slides[0]
      const bg = (sl.background?.type === 'color' ? sl.background.value : (await get()).document.theme.colors.background).toLowerCase()
      const hex = (c) => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(c); return m ? '#' + m.slice(1).map((v) => (+v).toString(16).padStart(2, '0')).join('') : c.toLowerCase() }
      const fills = await p.$$eval('[data-testid="stage"] svg rect', (rs) => rs.map((r) => getComputedStyle(r).fill))
      expect(!fills.map(hex).includes(bg), `a bar has the slide colour ${bg}: ${[...new Set(fills.map(hex))].join(', ')}`)
      const words = await p.$$eval('[data-testid="stage"] svg text', (ts) => ts.map((t) => getComputedStyle(t).fill))
      expect(!words.map(hex).includes(bg), 'chart words in the slide colour')
    })
    await s.check('picture panel: brightness and shadow chosen on the picture are saved on it', p, async () => {
      await click('pic1')
      await p.locator('[data-testid="picture-look"]').click()
      await p.getByLabel('Brightness', { exact: true }).fill('1.4')
      await p.getByRole('button', { name: 'soft', exact: true }).click()
      const e = await waitSaved('pic1', (x) => x.shadow === 'soft' && x.filter?.brightness === 1.4)
      expect(e.shadow === 'soft' && Math.abs((e.filter?.brightness ?? 0) - 1.4) < 0.001, `saved picture: ${JSON.stringify({ shadow: e.shadow, filter: e.filter })}`)
    })
    await s.check('free crop: a locked 1:1 crop is saved and the frame becomes a square (nothing stretched)', p, async () => {
      await click('pic1')
      await p.locator('[data-testid="crop-picture"]').click()
      await p.locator('[data-testid="crop-box"]').waitFor({ timeout: 15000 })
      await p.getByRole('button', { name: '1:1', exact: true }).click()
      await p.locator('[data-testid="crop-apply"]').click()
      const e = await waitSaved('pic1', (x) => !!x.crop)
      expect(!!e.crop, 'no crop saved')
      expect(Math.abs(e.width - e.height) <= 2, `frame ${e.width} x ${e.height} is not square`)
      expect(e.crop.w < 1 && e.crop.h <= 1 && e.crop.x >= 0 && e.crop.x + e.crop.w <= 1.0001, `crop ${JSON.stringify(e.crop)}`)
      const img = p.locator('[data-testid="stage"] img[src*="logo-lockup"]').first()
      expect(await img.count() > 0, 'the cropped picture is not drawn')
      await click('pic1'); await p.locator('[data-testid="crop-picture"]').click()
      await p.locator('[data-testid="crop-box"]').waitFor({ timeout: 15000 })
      await p.getByRole('button', { name: 'Remove crop' }).click()
      const back = await waitSaved('pic1', (x) => !x.crop)
      expect(!back.crop, 'the crop was not removed')
    })
    await s.check('group: two objects are grouped, move as one, and are freed again', p, async () => {
      await p.keyboard.press('Escape'); await p.keyboard.press('Escape') // (nothing selected first: the last check's open Picture panel covers the lower half of the slide)
      await click('boxA'); await p.keyboard.down('Shift'); await click('boxB'); await p.keyboard.up('Shift')
      const tb = await p.locator('[role="toolbar"][aria-label="Element tools"]').innerText().catch((e) => `no toolbar: ${e.message.slice(0, 80)}`)
      if (!(await p.locator('[data-testid="group"]').count())) throw new Error(`no Group button; toolbar: ${tb.replace(/\n/g, ' | ')}`)
      await p.locator('[data-testid="group"]').click()
      const a = await waitSaved('boxA', (x) => !!x.groupId)
      const b = await savedEl('boxB')
      expect(a.groupId && a.groupId === b.groupId, `group ids: ${a.groupId} / ${b.groupId}`)
      // a click on ONE member selects the whole group: the Ungroup button is there; dragging one moves both by the same amount
      await p.mouse.click(10, 10); await click('boxA')
      await p.locator('[data-testid="ungroup"]').waitFor({ timeout: 5000 })
      const c = await at('boxA')
      await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 60, c.y + 30, { steps: 6 }); await p.mouse.up()
      const a2 = await waitSaved('boxA', (x) => x.x !== 200)
      const b2 = await waitSaved('boxB', (x) => x.x !== 800)
      expect(a2.x - 200 === b2.x - 800 && a2.y - 640 === b2.y - 640 && a2.x !== 200, `the group did not move as one: A ${a2.x - 200},${a2.y - 640} B ${b2.x - 800},${b2.y - 640}`)
      await p.locator('[data-testid="ungroup"]').click()
      const free = await waitSaved('boxA', (x) => !x.groupId)
      expect(!free.groupId && !(await savedEl('boxB')).groupId, 'the objects are still grouped')
    })
    await s.check('a group is resized as one: both members scale by the same factor and keep their places inside it', p, async () => {
      await p.mouse.click(10, 10)
      await click('boxA'); await p.keyboard.down('Shift'); await click('boxB'); await p.keyboard.up('Shift')
      await p.locator('[data-testid="group"]').click()
      await waitSaved('boxA', (x) => !!x.groupId)
      await p.mouse.click(10, 10); await click('boxA')
      const handle = p.locator('[data-group-handle="se"]')
      await handle.waitFor({ timeout: 5000 })
      const a0 = await savedEl('boxA'), b0 = await savedEl('boxB')
      const hb = await handle.boundingBox()
      await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down(); await p.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2 + 40, { steps: 6 }); await p.mouse.up()
      const a1 = await waitSaved('boxA', (x) => x.width !== a0.width)
      const b1 = await savedEl('boxB')
      const fa = a1.width / a0.width, fb = b1.width / b0.width
      expect(fa > 1.05 && Math.abs(fa - fb) < 0.02, `scale A ${fa.toFixed(3)} B ${fb.toFixed(3)}`)
      // the gap between the two stayed in proportion: B's left edge moved with the same factor from A's left edge
      expect(Math.abs((b1.x - a1.x) / (b0.x - a0.x) - fa) < 0.02, 'the objects did not keep their places inside the group')
    })
    await s.check('no errors in the page', p, async () => { /* page errors fail the check through suite() */ })
  } finally { await b.close() }
  return s.done()
}
