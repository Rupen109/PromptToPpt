/**
 * Faithful stand-ins for two real documents, generated at test time in Chromium (never committed as binaries):
 *  - makeBookingPdf: "Booking Widget Vacation Flow", 21 A4 pages exported from a document tool (real text, tables, figures, code boxes, vector flow diagrams, footer on every page)
 *  - makeZomatoPdf: a 13-slide deck exported like SlidesDone does (one JPEG per page via jsPDF, no text in the file)
 * Page geometry in CSS px; A4 at 96 dpi is 794 x 1123 px = 595.28 x 841.89 pt (0.75 pt per px).
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------- booking document
const NAVY = '#0b2a3c'
const css = `
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1c2a33; font-size: 11pt; line-height: 1.4 }
.page { position: relative; width: 794px; height: 1123px; page-break-after: always; overflow: hidden; padding: 48px 72px 0 72px }
.page:last-child { page-break-after: auto }
.foot { position: absolute; left: 72px; right: 72px; bottom: 36px; display: flex; justify-content: space-between; font-size: 8.5pt; color: #6b7a85; border-top: 1px solid #c8d1d8; padding-top: 8px }
h1 { font-size: 34pt; color: ${NAVY}; margin: 6px 0 6px; line-height: 1.1 }
.sub { font-size: 15pt; font-weight: bold; color: #6b7a85; margin: 0 0 8px }
.meta { font-size: 9pt; color: #6b7a85; margin: 0 0 24px }
h2 { font-size: 17pt; color: ${NAVY}; margin: 22px 0 8px }
h3 { font-size: 13pt; color: ${NAVY}; margin: 16px 0 6px }
p { margin: 0 0 10px }
ul { margin: 0 0 12px; padding-left: 22px } li { margin-bottom: 6px }
table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 9.5pt }
th { background: ${NAVY}; color: #fff; text-align: left; padding: 6px 8px; border: 1px solid ${NAVY} }
td { padding: 5px 8px; border: 1px solid #c8d1d8; vertical-align: top }
tr:nth-child(odd) td { background: #eef3f7 } tr:nth-child(even) td { background: #fff }
.fig { text-align: center; margin: 10px 0 14px } .fig img { width: 100%; display: block; border: 1px solid #c8d1d8 }
.cap { font-size: 8.5pt; color: #6b7a85; text-align: center; margin-top: 5px }
pre { background: #f3f4f6; border: 1px solid #c8d1d8; border-radius: 4px; padding: 12px; font-family: Courier, "Courier New", monospace; font-size: 8.5pt; line-height: 1.35; margin: 8px 0 14px; white-space: pre-wrap }
.box { border-radius: 14px; padding: 14px 18px; margin: 10px 0; border: 1.5px solid #3b5a6b }
.green { background: #dcefe0 } .pink { background: #f9dcdc } .yellow { background: #fff3bf } .blue { background: #eef3f7 }
svg text { font-family: Arial, Helvetica, sans-serif }
`
const fig = (n, seed, cap, h = 330) => `<div class="fig"><canvas data-seed="${seed}" width="1200" height="700" style="width:100%;height:${h}px;display:none"></canvas><img data-for="${seed}" style="height:${h}px;object-fit:cover"><div class="cap">Figure ${n} - ${cap}</div></div>`
const row = (cells, tag = 'td') => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`
const table = (head, rows) => `<table><thead>${row(head, 'th')}</thead><tbody>${rows.map((r) => row(r)).join('')}</tbody></table>`
const bullets = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
const node = (x, y, w, h, fill, lines) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="#2b3f4c" stroke-width="1.5"/>${lines.map((l, i) => `<text x="${x + w / 2}" y="${y + h / 2 + (i - (lines.length - 1) / 2) * 15 + 4}" font-size="11.5" text-anchor="middle" fill="#1c2a33">${l}</text>`).join('')}`
const arrow = (x1, y1, x2, y2, label) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2b3f4c" stroke-width="1.5"/><polygon points="${x2},${y2} ${x2 - 5},${y2 - 9} ${x2 + 5},${y2 - 9}" fill="#2b3f4c" transform="rotate(0 ${x2} ${y2})"/>${label ? `<text x="${(x1 + x2) / 2 + 8}" y="${(y1 + y2) / 2}" font-size="10" font-style="italic" fill="#5b6a75">${label}</text>` : ''}`
const flow = (fills, labels) => `<svg width="650" height="640" viewBox="0 0 650 640" xmlns="http://www.w3.org/2000/svg">${[0, 1, 2, 3, 4].map((i) => node(190, 10 + i * 125, 270, 70, fills[i % fills.length], labels[i])).join('')}${[0, 1, 2, 3].map((i) => arrow(325, 80 + i * 125, 325, 135 + i * 125, ['yes', 'cached', 'on tab change', 'retry'][i])).join('')}${node(10, 260, 140, 60, fills[1], ['Session', 'storage'])}${node(500, 260, 140, 60, fills[0], ['Package', 'API'])}</svg>`

const LOREM = [
  'The widget loads the package cards for the selected tab and keeps them in session storage so a returning visitor never waits for the network twice.',
  'When the visitor changes the destination, the widget requests the matching packages, replaces the cards and updates the price summary below the filter bar.',
  'Every request carries the tab name, the visitor locale and the currency; the response contains the card titles, the nights, the price and the badge text.',
]
const FOOT = (n) => `<div class="foot"><span>Booking Widget Vacation Flow</span><span>Page ${n}</span></div>`
const pg = (n, body) => `<section class="page">${body}${FOOT(n)}</section>`

export const BOOKING_TRUTH = { pages: 21, footerLeft: 'Booking Widget Vacation Flow', figures: [2, 3, 4, 5, 6, 13, 14, 15, 16, 17], iconPage: 5, fullPageFigurePage: 6 }

export function bookingHtml() {
  const pages = []
  pages.push(pg(1, `<h1>Booking Widget Vacation Flow</h1><p class="sub">Frontend behaviour and data flow</p><p class="meta">Version 1.4 - Updated 12 November 2026 - Owner: Web platform team</p>
<h2>1. Purpose</h2><p>${LOREM[0]} ${LOREM[1]}</p>
<h2>2. Summary</h2>${bullets([
    '<b>Tab content is cached in session storage.</b> All packages of a tab are stored under one key and expire with the session.',
    '<b>The first tab renders from the page payload.</b> Other tabs are requested only when the visitor opens them.',
    'Price badges are computed on the server; the widget only <b>formats</b> them for the locale.',
    '<b>Failed requests retry once.</b> After the second failure a friendly message and a retry button are shown.',
    'Cards are rendered in a fixed grid of <b>three columns</b> on desktop and one column on phones.',
    '<b>Analytics events fire on tab change.</b> They carry the tab name and the number of cards shown.',
    'The widget never blocks the page: it is mounted after the <b>first paint</b> of the host page.',
    '<b>Keyboard users can reach every card.</b> Focus order follows the visual order.'])}
<h2>3. Package Types</h2>${table(['Type', 'Audience', 'Typical length', 'Includes', 'Notes'], [
    ['Vacation', 'Families and couples who book months ahead', '5 to 9 nights', 'Flights, hotel, transfers', 'Most popular type in summer and winter'],
    ['City break', 'Short trips for one or two adults', '2 to 4 nights', 'Hotel and breakfast', 'Flights are booked separately by the visitor'],
    ['Cruise', 'Groups and older travellers', '7 to 14 nights', 'Cabin, meals, entertainment', 'Port taxes are added at checkout'],
    ['Adventure', 'Active travellers in small groups', '6 to 12 nights', 'Guide, lodging, equipment', 'Fitness level is shown on the card'],
    ['Last minute', 'Flexible visitors who can leave within days', '3 to 7 nights', 'Flights and hotel', 'Prices change every hour']])}`))
  pages.push(pg(2, `<h2>4. Detailed Flow</h2><h3>Step 1: The widget mounts on the host page</h3><p>${LOREM[0]}</p><p>${LOREM[2]}</p>${fig(1, 1, 'Landing widget with package cards (Vacation tab)', 420)}<h3>Step 2: The visitor picks a package</h3><p>${LOREM[1]}</p>`))
  pages.push(pg(3, `<h3>Step 3: Filters narrow the list</h3><p>${LOREM[1]}</p>${fig(2, 2, 'Filter bar with destination and month')}${bullets(['<b>Destination</b> is a single choice.', '<b>Month</b> allows several choices.', '<b>Reset</b> clears both and restores the cached cards.'])}${fig(3, 3, 'Empty state after filters', 250)}`))
  pages.push(pg(4, `<h3>Step 4: Card details</h3><p>${LOREM[2]}</p>${fig(4, 4, 'Card with badge and price', 300)}${bullets(['<b>Badge</b> text comes from the API.', '<b>Price</b> is formatted for the locale.', 'The <b>call to action</b> opens the booking page in the same tab.'])}<p>${LOREM[0]}</p>`))
  pages.push(pg(5, `<h3>Step 5: Tab switching <img data-for="9" style="width:14px;height:14px;vertical-align:middle"></h3><p>${LOREM[0]} The small icon next to this heading marks a tab with a promotion.</p>${fig(5, 5, 'Tabs with promotion icon', 300)}${bullets(['<b>Session storage</b> key: <b>bw.tab.vacation</b>', '<b>Expiry</b> with the browser session', 'Cache is <b>bypassed</b> when the locale changes'])}`))
  pages.push(pg(6, `<h3>Step 6: Full widget on mobile</h3><div class="fig" style="margin:6px -72px 0 -72px"><canvas data-seed="6" width="1200" height="1400" style="display:none"></canvas><img data-for="6" style="width:794px;height:930px;border:none"></div><div class="cap">Figure 6 - Mobile layout of the whole widget</div><p style="margin-top:10px">${LOREM[2]}</p>`))
  pages.push(pg(7, `<h2>5. Request Sequence</h2><p>The diagram shows the order of calls between the widget, session storage and the package API.</p>${flow(['#fff3bf', '#eef3f7'], [['Visitor opens', 'a tab'], ['Read session', 'storage key'], ['Cache hit?', 'Return cards'], ['Call package API', 'with tab and locale'], ['Render cards', 'and store result']])}<div class="cap">Figure 7 - Request sequence for one tab</div>`))
  const t3 = (a) => table(['Field', 'Type', 'Description'], a)
  pages.push(pg(8, `<h2>6. Data Contracts</h2><h3>6.1 Request fields</h3>${t3([['tab', 'string', 'Name of the active tab, for example vacation'], ['locale', 'string', 'IETF language tag such as en-GB'], ['currency', 'string', 'ISO 4217 code for the price'], ['limit', 'number', 'Maximum number of cards to return'], ['sort', 'string', 'popular, price or date']])}<h3>6.2 Response fields</h3>${t3([['cards', 'array', 'The package cards, already sorted'], ['total', 'number', 'Number of packages that match the filters'], ['updatedAt', 'string', 'Time the prices were last refreshed']])}`))
  pages.push(pg(9, `<h3>6.3 Example request</h3><pre>POST /api/packages/search\nContent-Type: application/json\n\n{\n  "tab": "vacation",\n  "locale": "en-GB",\n  "currency": "GBP",\n  "limit": 12,\n  "sort": "popular",\n  "filters": { "destination": "Lisbon", "months": [6, 7] }\n}</pre><h3>6.4 Status codes</h3>${table(['Code', 'Meaning', 'Widget behaviour'], [['200', 'Packages found', 'Render the cards'], ['204', 'No match', 'Show the empty state'], ['429', 'Too many requests', 'Wait two seconds and retry once'], ['500', 'Server error', 'Show the retry message']])}`))
  pages.push(pg(10, `<h2>7. Error Handling</h2>${table(['Situation', 'Detection', 'Message shown'], [['Network offline', 'fetch rejects', 'You seem to be offline. Check your connection.'], ['Slow response', 'No answer after 8 seconds', 'This is taking longer than usual.'], ['Bad payload', 'Schema check fails', 'We could not read the packages.'], ['Empty result', 'total equals zero', 'No packages match your search.']])}<p>${LOREM[1]}</p>`))
  pages.push(pg(11, `<h3>7.1 Retry payload</h3><pre>{\n  "event": "retry",\n  "attempt": 2,\n  "tab": "vacation",\n  "reason": "timeout",\n  "waitMs": 2000\n}</pre>${table(['Event', 'When', 'Fields'], [['tab_view', 'A tab becomes visible', 'tab, cards'], ['card_click', 'A card is opened', 'tab, cardId, position'], ['retry', 'A request is retried', 'tab, attempt, reason']])}`))
  pages.push(pg(12, `<h2>8. Rules</h2>${bullets(['<b>Never</b> show a price that was computed in the browser.', 'Keep the <b>cache key</b> stable across releases of the widget.', '<b>Clear</b> the cache when the visitor changes currency.', 'Do not request more than <b>twelve cards</b> per tab.', 'Respect the <b>reduced motion</b> setting for card transitions.', 'Every image needs <b>alternative text</b> from the API.', 'Log errors with the <b>tab name</b> but without personal data.', 'Retry <b>once</b>, never in a loop.', 'Badge colours come from the <b>design tokens</b> only.', 'Test every change on a <b>slow network</b> profile.'])}`))
  pages.push(pg(13, `<h2>9. Screens</h2>${fig(8, 8, 'Package grid, desktop', 250)}<div class="box green"><b>Good practice.</b> Show the skeleton cards while the first request is running so the layout never jumps.</div><div class="box pink"><b>Avoid.</b> Do not replace the cards with a spinner; visitors lose their scroll position.</div>${table(['Breakpoint', 'Columns', 'Card width'], [['Desktop', '3', '320 px'], ['Tablet', '2', '300 px'], ['Phone', '1', 'Full width']])}`))
  pages.push(pg(14, `<h3>9.1 Tablet layout</h3>${fig(9, 10, 'Tablet layout with two columns', 280)}<p>${LOREM[0]}</p><div class="box pink"><b>Warning.</b> The tablet breakpoint was changed in release 1.3; older bookmarks may show three columns.</div>`))
  pages.push(pg(15, `<h3>9.2 Phone layout</h3><p>${LOREM[1]}</p>${fig(10, 11, 'Phone layout with a single column', 300)}${bullets(['Cards stack with a <b>16 px</b> gap.', 'The <b>filter bar</b> becomes a bottom sheet.'])}`))
  pages.push(pg(16, `<h3>9.3 Loading states</h3>${table(['State', 'Visible', 'Duration'], [['Skeleton', 'Grey cards', 'Until first response'], ['Spinner', 'Button only', 'While retrying']])}${fig(11, 12, 'Skeleton cards while loading', 300)}<div class="box green"><b>Tip.</b> Keep the skeleton height equal to the final card height.</div>`))
  pages.push(pg(17, `<h3>9.4 Promotion card</h3>${fig(12, 13, 'Promotion card with ribbon', 320)}<p>${LOREM[2]}</p>${bullets(['The <b>ribbon</b> text is limited to 18 characters.', 'The ribbon is hidden when the <b>promotion</b> has ended.'])}`))
  pages.push(pg(18, `<h2>10. Rollout</h2>${table(['Phase', 'Audience', 'Success measure'], [['Pilot', 'Five percent of visitors', 'Error rate below one percent'], ['Gradual', 'Fifty percent of visitors', 'Conversion not lower than control'], ['Full', 'All visitors', 'No open incidents for a week']])}<p>${LOREM[0]}</p>`))
  pages.push(pg(19, `<h2>11. Failure Flow</h2><p>What happens when the first request fails.</p>${flow(['#dcefe0', '#f9dcdc'], [['Request fails', 'first time'], ['Wait two seconds', 'then retry once'], ['Second failure?', 'Check status'], ['Show message', 'and retry button'], ['Visitor presses', 'retry']])}<div class="cap">Figure 13 - Failure flow</div>`))
  pages.push(pg(20, `<h2>12. Recovery Flow</h2><p>How the widget recovers once the network is back.</p>${flow(['#f9dcdc', '#dcefe0'], [['Online event', 'fires'], ['Cards missing?', 'Check cache'], ['Fetch again', 'current tab'], ['Replace message', 'with the cards'], ['Send analytics', 'recovery event']])}<div class="cap">Figure 14 - Recovery flow</div>`))
  pages.push(pg(21, `<h2>13. Open Questions</h2>${bullets(['Should the cache survive a page reload in a new tab?', 'Which currency should be used for visitors without a locale?', 'Do we show last-minute packages in the first tab?', 'Who owns the badge copy in other languages?', 'How long should promotion ribbons stay visible?', 'Can the retry button be keyboard-activated with Enter and Space?'])}<p>Answers will be added to this document before the pilot starts.</p>`))
  return `<!doctype html><html><head><meta charset="utf-8"><title>Booking Widget Vacation Flow</title><style>${css}</style></head><body>${pages.join('')}</body></html>`
}

/** paint UI-like pictures into the canvases (a header bar, cards, noise) and show them as <img> */
const PAINT = () => {
  document.querySelectorAll('canvas[data-seed]').forEach((c) => {
    const seed = Number(c.dataset.seed), g = c.getContext('2d'), W = c.width, H = c.height
    let s = seed * 9301 + 49297; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    g.fillStyle = `hsl(${seed * 37 % 360} 30% 94%)`; g.fillRect(0, 0, W, H)
    g.fillStyle = '#0b2a3c'; g.fillRect(0, 0, W, 70)
    for (let i = 0; i < 3; i++) for (let j = 0; j < Math.max(1, Math.floor((H - 120) / 330)); j++) {
      const x = 40 + i * 380, y = 110 + j * 330
      g.fillStyle = '#fff'; g.fillRect(x, y, 340, 300)
      for (let k = 0; k < 900; k++) { g.fillStyle = `hsl(${(seed * 40 + k * 3) % 360} 55% ${40 + rnd() * 35}%)`; g.fillRect(x + (k % 30) * 11.3, y + Math.floor(k / 30) * 5.2, 11, 5) }
      g.fillStyle = '#1c2a33'; g.fillRect(x + 14, y + 190, 200, 14); g.fillStyle = '#6b7a85'; g.fillRect(x + 14, y + 220, 280, 10); g.fillStyle = '#e8590c'; g.fillRect(x + 14, y + 250, 110, 30)
    }
    document.querySelectorAll(`img[data-for="${seed}"]`).forEach((im) => { im.src = c.toDataURL('image/png') })
  })
  document.querySelectorAll('img[data-for="9"]').forEach((im) => {
    const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#e8590c'; g.beginPath(); g.arc(24, 24, 22, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(21, 10, 6, 20); g.fillRect(21, 34, 6, 6)
    im.src = c.toDataURL('image/png')
  })
  return Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r }))))
}

/** the PDF and where every figure really is (page numbers from 1, boxes in points from the top-left of the page) */
export async function makeBooking(browser) {
  const c = await browser.newContext({ viewport: { width: 794, height: 1123 } })
  const page = await c.newPage()
  await page.setContent(bookingHtml())
  await page.evaluate(PAINT)
  await page.waitForTimeout(300)
  const figures = await page.evaluate(() => [...document.querySelectorAll('img[data-for]')].map((im) => {
    const r = im.getBoundingClientRect(), top = r.top + window.scrollY, n = Math.floor((top + 1) / 1123)
    return { page: n + 1, icon: im.dataset.for === '9', x: r.left * 0.75, y: (top - n * 1123) * 0.75, w: r.width * 0.75, h: r.height * 0.75 }
  }))
  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  await c.close()
  return { pdf: Buffer.from(pdf), figures }
}
export const makeBookingPdf = async (browser) => (await makeBooking(browser)).pdf

// ---------------------------------------------------------------- Zomato-style deck exported by SlidesDone
const SW = 1456, SH = 819
const SALMON = '#eb5f6a', PINK = '#f0a8ae'
const photo = (seed, x, y, w, h, r = 28, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${r}px;overflow:hidden;${extra}"><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><filter id="n${seed}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="4" seed="${seed}"/><feColorMatrix type="matrix" values="2.4 0 0 0 -0.35  0 1.9 0 0 -0.1  0 0 1.7 0 0.05  0 0 0 0 1"/></filter><rect width="${w}" height="${h}" filter="url(#n${seed})"/><ellipse cx="${w * 0.4}" cy="${h * 0.75}" rx="${w * 0.2}" ry="${h * 0.4}" fill="#10151c"/><circle cx="${w * 0.4}" cy="${h * 0.35}" r="${h * 0.12}" fill="#c9a07a"/></svg></div>`
const T = (t, x, y, w, size = 50, extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font:800 ${size}px/1.15 'Plus Jakarta Sans',Helvetica,Arial,sans-serif;color:#fff;${extra}">${t}</div>`
const B = (t, x, y, w, size = 24, color = '#d9c9cc', extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;font:400 ${size}px/1.4 Inter,Helvetica,Arial,sans-serif;color:${color};${extra}">${t}</div>`
const bl = (items, x, y, w) => items.map((t, i) => `<div style="position:absolute;left:${x}px;top:${y + i * 120}px;width:${w}px;font:400 25px/1.4 Inter,Helvetica,Arial,sans-serif;color:#e8dadd"><span style="position:absolute;left:-30px;top:10px;width:10px;height:10px;border-radius:5px;background:${SALMON}"></span>${t}</div>`).join('')
const card = (x, y, w, h, fill, inner = '', extra = '') => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:22px;background:${fill};${extra}">${inner}</div>`
const BULLETS3 = ['Hyperlocal targeting reaches customers by neighbourhood with offers that match local taste.', 'Regional language campaigns lift engagement in smaller cities well beyond metro averages.', 'Real time promotions react to weather, festivals and match days within minutes.']
export const ZOMATO_SLIDES = [
  { n: 1, kind: 'cover', texts: ['Hyperlocal Market Penetration', "Zomato's Digital Marketing Strategy"] },
  { n: 2, kind: 'bullets', texts: ['Why Hyperlocal Wins', ...BULLETS3], photo: [830, 150, 520, 520] },
  { n: 3, kind: 'agenda', texts: ['Agenda', 'Market context', 'Customer segments', 'Channel mix', 'Campaign results', 'Next steps'] },
  { n: 4, kind: 'bullets', texts: ['Local Customer Insight', ...BULLETS3], photo: [960, 120, 380, 580] },
  { n: 5, kind: 'rows', texts: ['Campaign Layers'] },
  { n: 6, kind: 'radial', texts: ['The Growth Loop'] },
  { n: 7, kind: 'cols', texts: ['Four Channel Pillars'] },
  { n: 8, kind: 'cards2', texts: ['Strengths and Risks'] },
  { n: 9, kind: 'bullets', texts: ['Delivery Partner Network', ...BULLETS3], photo: [830, 150, 520, 520] },
  { n: 10, kind: 'panel', texts: ['Roadmap'] },
  { n: 11, kind: 'phases', texts: ['Three Phases'] },
  { n: 12, kind: 'bullets', texts: ['Brand Voice at Scale', ...BULLETS3], photo: [830, 150, 520, 520] },
  { n: 13, kind: 'closing', texts: ['Thank You', 'Questions and Discussion'] },
]
/** a closing slide whose title sits right under the photo (the real SlidesDone cover does) */
export const ZOMATO_TIGHT = [{ n: 1, kind: 'tight', texts: ['Defining the Future of Delivery', 'Marketing'] }]
export function zomatoSlideHtml(s) {
  const bg = `linear-gradient(135deg,#1f0e11 0%,#2a0f14 100%)`
  let inner = ''
  switch (s.kind) {
    case 'cover': inner = photo(3, 60, 50, 1336, 400, 36) + T(s.texts[0] + '<br>' + s.texts[1], 80, 500, 1300, 56) + B('Digital strategy review - 2026', 80, 680, 900, 26, '#9a8a8d'); break
    case 'bullets': inner = T(s.texts[0], 80, 70, 700, 54) + bl(s.texts.slice(1), 110, 230, 640) + photo(s.n + 10, ...s.photo, 30); break
    case 'agenda': inner = T(s.texts[0], 80, 50, 600, 52) + s.texts.slice(1).map((t, i) => `<div style="position:absolute;left:80px;top:${170 + i * 118}px;width:1296px;height:2px;background:#4a2b30"></div>` + T('0' + (i + 1), 80, 190 + i * 118, 160, 64, `color:${SALMON}`) + T(t, 280, 190 + i * 118, 900, 34) + B('Short supporting line that explains this agenda item', 280, 235 + i * 118, 900, 21, '#9a8a8d')).join(''); break
    case 'rows': inner = T(s.texts[0], 80, 40, 900, 50) + [[SALMON, 'Awareness'], [PINK, 'Consideration'], ['#ffffff', 'Conversion']].map(([f, l], i) => card(80, 150 + i * 215, 1296, 190, f, `<div style="position:absolute;left:30px;top:70px;font:800 34px 'Plus Jakarta Sans',Helvetica,sans-serif;color:#2a0f14">${l}</div>` + [0, 1].map((k) => `<div style="position:absolute;left:${520 + k * 400}px;top:30px;width:370px;height:130px;border-radius:16px;background:#2a0f14;color:#f1e5e7;font:400 22px/1.35 Inter,Helvetica,sans-serif;padding:22px">Tile text about ${l.toLowerCase()} tactic ${k + 1} in local markets</div>`).join(''))).join(''); break
    case 'radial': inner = T(s.texts[0], 80, 40, 900, 50) + [[300, 300], [1156, 300], [300, 620], [1156, 620]].map(([x, y], i) => `<div style="position:absolute;left:${x - 110}px;top:${y - 110}px;width:220px;height:220px;border-radius:110px;border:3px solid ${PINK};color:#fff;font:700 26px/1.2 Inter,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px">Local driver ${i + 1}</div>`).join('') + `<div style="position:absolute;left:578px;top:330px;width:300px;height:300px;border-radius:150px;background:${SALMON};color:#2a0f14;font:800 34px/1.2 'Plus Jakarta Sans',Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center">Hyperlocal growth</div>`; break
    case 'cols': inner = T(s.texts[0], 80, 40, 900, 50) + ['Reach', 'Engage', 'Convert', 'Retain'].map((w, i) => `<div style="position:absolute;left:${80 + i * 330}px;top:200px;width:300px"><div style="width:70px;height:70px;border-radius:35px;background:${SALMON};color:#2a0f14;font:800 40px/70px sans-serif;text-align:center">&#8250;</div><div style="margin-top:28px;font:800 36px 'Plus Jakarta Sans',Helvetica,sans-serif;color:#fff">${w}</div><div style="margin-top:14px;font:400 22px/1.45 Inter,Helvetica,sans-serif;color:#9a8a8d">Grey description over three lines about how this pillar works in practice for local teams.</div></div>`).join(''); break
    case 'cards2': inner = T(s.texts[0], 80, 40, 900, 50) + [[SALMON, 'Strengths'], [PINK, 'Risks']].map(([f, l], i) => card(80 + i * 660, 160, 620, 600, '#2e1519', `<div style="height:16px;background:${f};border-radius:22px 22px 0 0"></div><div style="padding:30px 36px;font:800 34px 'Plus Jakarta Sans',Helvetica,sans-serif;color:#fff">${l}</div>` + [1, 2, 3].map((k) => `<div style="margin:0 36px 24px;font:400 24px/1.4 Inter,Helvetica,sans-serif;color:#d9c9cc">- ${l} point ${k} explained in one line</div>`).join(''))).join(''); break
    case 'panel': inner = T(s.texts[0], 80, 300, 500, 60) + card(660, 70, 720, 680, SALMON, [1, 2, 3, 4].map((k) => `<div style="position:absolute;left:40px;top:${40 + (k - 1) * 155}px;width:640px"><span style="font:800 48px 'Plus Jakarta Sans',Helvetica,sans-serif;color:#2a0f14">${k}</span><span style="margin-left:24px;font:700 26px 'Plus Jakarta Sans',Helvetica,sans-serif;color:#2a0f14">Milestone ${k} for the year</span></div>`).join('')); break
    case 'phases': inner = T(s.texts[0], 80, 40, 900, 50) + [[SALMON, 'Launch'], [PINK, 'Scale'], ['#ffffff', 'Sustain']].map(([f, l], i) => `<div style="position:absolute;left:${80 + i * 440}px;top:160px;width:420px;height:80px;background:${f};clip-path:polygon(0 0,92% 0,100% 50%,92% 100%,0 100%,8% 50%);font:800 30px/80px 'Plus Jakarta Sans',Helvetica,sans-serif;color:#2a0f14;text-align:center">${l}</div>` + card(80 + i * 440, 280, 400, 460, '#2e1519', `<div style="padding:30px;font:800 30px 'Plus Jakarta Sans',Helvetica,sans-serif;color:#fff">${l} phase</div><div style="padding:0 30px;font:400 22px/1.5 Inter,Helvetica,sans-serif;color:#9a8a8d">- First grey bullet<br>- Second grey bullet<br>- Third grey bullet</div>`)).join(''); break
    case 'tight': inner = photo(5, 60, 50, 1336, 360, 36) + T(s.texts[0] + '<br>' + s.texts[1], 80, 414, 1300, 56) + B('hello@example.com', 80, 640, 900, 26, '#9a8a8d'); break
    case 'closing': inner = photo(5, 60, 50, 1336, 420, 36) + T(s.texts[0] + '<br>' + s.texts[1], 80, 520, 1300, 56) + B('hello@example.com', 80, 700, 900, 26, '#9a8a8d'); break
  }
  return `<!doctype html><html><body style="margin:0;width:${SW}px;height:${SH}px;overflow:hidden;position:relative;background:${bg}">${inner}</body></html>`
}

export async function makeZomatoPdf(browser, { slides = ZOMATO_SLIDES } = {}) {
  const { jsPDF } = createRequire(join(here, '../../apps/editor/package.json'))('jspdf')
  const c = await browser.newContext({ viewport: { width: SW, height: SH } })
  const pg = await c.newPage()
  const jpgs = []
  for (const s of slides) { await pg.setContent(zomatoSlideHtml(s)); jpgs.push(await pg.screenshot({ type: 'jpeg', quality: 92 })) }
  await c.close()
  const doc = new jsPDF({ unit: 'px', format: [SW, SH], orientation: 'landscape', hotfixes: ['px_scaling'], compress: true })
  jpgs.forEach((j, i) => { if (i > 0) doc.addPage([SW, SH], 'landscape'); doc.addImage(`data:image/jpeg;base64,${j.toString('base64')}`, 'JPEG', 0, 0, SW, SH) })
  return Buffer.from(doc.output('arraybuffer'))
}

// ---------------------------------------------------------------- list markers (ReportLab / Word style)
/** one page with two kinds of bullet lists: the marker as its own text item (A) and the marker inside the first item of the line (B); wrapped lines hang under the words */
export async function makeBulletPdf() {
  const { PDFDocument, StandardFonts } = createRequire(join(here, '../../apps/web/package.json'))('pdf-lib')
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica)
  const pg = doc.addPage([595, 842])
  const A = [['Alpha beta gamma delta epsilon zeta eta theta iota kappa', 'lambda mu nu xi omicron pi rho sigma tau'], ['Upsilon phi chi psi omega alpha beta gamma delta epsilon', 'zeta eta theta iota kappa lambda mu']]
  A.forEach((lines, i) => { const y = 740 - i * 44; pg.drawText('•', { x: 60, y, size: 11, font }); lines.forEach((l, k) => pg.drawText(l, { x: 72, y: y - k * 14, size: 10, font })) })
  const B = [['• Gamma bullet with the marker inside the same text item as', 'the words, wrapped under the words'], ['• Delta bullet with the marker inside the same text item as', 'the words, wrapped under the words too']]
  B.forEach((lines, i) => { const y = 600 - i * 44; pg.drawText(lines[0], { x: 60, y, size: 10, font }); pg.drawText(lines[1], { x: 60 + font.widthOfTextAtSize('• ', 10), y: y - 14, size: 10, font }) })
  return Buffer.from(await doc.save())
}

// ---------------------------------------------------------------- dark photo on a dark slide, chevrons right under it (the owner's slide 12)
/**
 * One slide like the owner's slide 12: maroon gradient ground, bullets on the left, a DARK photo (dark teal, near-black in places, a bright phone screen
 * as its only bright part) on the right with rounded corners, and a row of chevrons only 8 px below the photo. Returns the deck with the photo AND the same
 * slide without it (ground truth for the cover that is left behind), and where the photo is (points of the 1092 x 614.25 pt page).
 */
export const DARK_PHOTO_BOX = { x: 830 * 0.75, y: 150 * 0.75, w: 520 * 0.75, h: 470 * 0.75 }
export const DARK_CHEVRONS = { x: 1090 * 0.75, y: 624 * 0.75, w: 260 * 0.75, h: 40 * 0.75 }
function darkSlideHtml(withPhoto) {
  const photo = `<div style="position:absolute;left:830px;top:150px;width:520px;height:470px;border-radius:24px;overflow:hidden"><svg xmlns="http://www.w3.org/2000/svg" width="520" height="470"><defs><radialGradient id="g" cx="50%" cy="60%" r="75%"><stop offset="0" stop-color="#101b20"/><stop offset="1" stop-color="#04070a"/></radialGradient><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="3" seed="4"/><feColorMatrix type="matrix" values="0.22 0 0 0 0  0 0.3 0 0 0.02  0 0 0.34 0 0.03  0 0 0 0 1"/></filter></defs><rect width="520" height="470" fill="url(#g)"/><rect width="520" height="470" filter="url(#n)" opacity="0.8"/><ellipse cx="120" cy="420" rx="110" ry="80" fill="#0a1014"/><ellipse cx="400" cy="440" rx="120" ry="70" fill="#0c1318"/><rect x="170" y="70" width="180" height="330" rx="22" fill="#0b0e11" stroke="#1d2a30" stroke-width="3"/><rect x="184" y="90" width="152" height="290" rx="8" fill="#17202a"/>${Array.from({ length: 20 }, (_, i) => `<rect x="${194 + (i % 4) * 36}" y="${106 + Math.floor(i / 4) * 52}" width="26" height="26" rx="7" fill="hsl(${i * 47 % 360} 60% ${42 + (i * 7) % 20}%)"/>`).join('')}</svg></div>`
  const chev = [SALMON, '#8a8083', '#c9505a', '#cdbfc2', SALMON].map((f, i) => `<div style="position:absolute;left:${1090 + i * 52}px;top:624px;width:46px;height:40px;background:${f};clip-path:polygon(0 0,60% 0,100% 50%,60% 100%,0 100%,40% 50%)"></div>`).join('')
  return `<!doctype html><html><body style="margin:0;width:${SW}px;height:${SH}px;overflow:hidden;position:relative;background:linear-gradient(135deg,#1f0e11 0%,#2a0f14 100%)">${T('Key Takeaways for Business Strategists', 80, 70, 700, 54)}${bl(BULLETS3, 110, 280, 640)}${withPhoto ? photo : ''}${chev}</body></html>`
}
export async function makeDarkPhotoDeck(browser) {
  const { jsPDF } = createRequire(join(here, '../../apps/editor/package.json'))('jspdf')
  const c = await browser.newContext({ viewport: { width: SW, height: SH } })
  const pg = await c.newPage()
  const out = {}
  for (const withPhoto of [true, false]) {
    await pg.setContent(darkSlideHtml(withPhoto))
    const jpg = await pg.screenshot({ type: 'jpeg', quality: 92 })
    const doc = new jsPDF({ unit: 'px', format: [SW, SH], orientation: 'landscape', hotfixes: ['px_scaling'], compress: true })
    doc.addImage(`data:image/jpeg;base64,${jpg.toString('base64')}`, 'JPEG', 0, 0, SW, SH)
    out[withPhoto ? 'pdf' : 'bare'] = Buffer.from(doc.output('arraybuffer'))
  }
  await c.close()
  return out
}

// ---------------------------------------------------------------- labels in shapes, big numbers, small grey lines, white cards on a dark slide
/** what the label slide says (the text finder is scored against this) */
export const LABEL_TEXT = ['Growth Loop Overview', '1', '2', '3', '4', 'Hyperlocal growth', 'Phase 1', 'Phase 2', 'Phase 3', 'Merchant Network', '01', '02', '03', 'Short grey line under the first number', 'Another small supporting line here', 'Third small supporting line of text']
export async function makeLabelsPdf(browser) {
  const { jsPDF } = createRequire(join(here, '../../apps/editor/package.json'))('jspdf')
  const c = await browser.newContext({ viewport: { width: SW, height: SH } })
  const pg = await c.newPage()
  const circle = (x, y, d, fill, color, txt, size = 44) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${d}px;height:${d}px;border-radius:50%;background:${fill};color:${color};font:800 ${size}px/${d}px 'Plus Jakarta Sans',Helvetica,Arial,sans-serif;text-align:center">${txt}</div>`
  const chev = (x, f, txt) => `<div style="position:absolute;left:${x}px;top:520px;width:380px;height:78px;background:${f};clip-path:polygon(0 0,92% 0,100% 50%,92% 100%,0 100%,8% 50%);font:800 28px/78px 'Plus Jakarta Sans',Helvetica,Arial,sans-serif;color:#2a0f14;text-align:center">${txt}</div>`
  const html = `<!doctype html><html><body style="margin:0;width:${SW}px;height:${SH}px;overflow:hidden;position:relative;background:linear-gradient(135deg,#1f0e11 0%,#2a0f14 100%)">
${T('Growth Loop Overview', 80, 50, 900, 52)}
<div style="position:absolute;left:300px;top:300px;width:300px;height:3px;background:#6b4a50"></div>
${circle(120, 190, 100, '#f6f6f6', '#10151c', '1')}${circle(400, 190, 100, SALMON, '#ffffff', '2')}${circle(120, 330, 100, '#f6f6f6', '#10151c', '3')}${circle(400, 330, 100, SALMON, '#ffffff', '4')}
${circle(760, 170, 300, SALMON, '#2a0f14', 'Hyperlocal growth', 30)}
${chev(80, SALMON, 'Phase 1')}${chev(470, PINK, 'Phase 2')}${chev(860, '#ffffff', 'Phase 3')}
<div style="position:absolute;left:80px;top:650px;width:300px;height:110px;border-radius:14px;background:#f4f4f4;color:#1c1417;font:700 30px/110px 'Plus Jakarta Sans',Helvetica,Arial,sans-serif;text-align:center">Merchant Network</div>
${['01', '02', '03'].map((n, i) => T(n, 480 + i * 330, 640, 200, 64, `color:${SALMON}`) + B(['Short grey line under the first number', 'Another small supporting line here', 'Third small supporting line of text'][i], 480 + i * 330, 722, 300, 19, '#9a8a8d')).join('')}
</body></html>`
  await pg.setContent(html)
  const jpg = await pg.screenshot({ type: 'jpeg', quality: 92 })
  await c.close()
  const doc = new jsPDF({ unit: 'px', format: [SW, SH], orientation: 'landscape', hotfixes: ['px_scaling'], compress: true })
  doc.addImage(`data:image/jpeg;base64,${jpg.toString('base64')}`, 'JPEG', 0, 0, SW, SH)
  return Buffer.from(doc.output('arraybuffer'))
}

// ---------------------------------------------------------------- slides in other languages
/** text of the language slides: title, two bullets (what the finder must read) */
export const LANG_SLIDES = {
  spa: { title: 'Estrategia de Marketing Digital', bullets: ['Llegamos a los clientes por barrio con ofertas locales', 'Campañas en idiomas regionales aumentan la participación'], dir: 'ltr' },
  fra: { title: 'Stratégie de Marketing Numérique', bullets: ['Nous touchons les clients quartier par quartier avec des offres locales', 'Les campagnes en langues régionales augmentent la participation'], dir: 'ltr' },
  deu: { title: 'Strategie für digitales Marketing', bullets: ['Wir erreichen Kunden Viertel für Viertel mit lokalen Angeboten', 'Regionale Sprachkampagnen steigern die Beteiligung deutlich'], dir: 'ltr' },
  por: { title: 'Estratégia de Marketing Digital', bullets: ['Chegamos aos clientes bairro por bairro com ofertas locais', 'Campanhas em idiomas regionais aumentam o envolvimento'], dir: 'ltr' },
  ita: { title: 'Strategia di Marketing Digitale', bullets: ['Raggiungiamo i clienti quartiere per quartiere con offerte locali', 'Le campagne nelle lingue regionali aumentano il coinvolgimento'], dir: 'ltr' },
  hin: { title: 'डिजिटल मार्केटिंग रणनीति', bullets: ['हम स्थानीय प्रस्तावों के साथ मोहल्ले के ग्राहकों तक पहुँचते हैं', 'क्षेत्रीय भाषा अभियान जुड़ाव को बढ़ाते हैं'], dir: 'ltr' },
  ara: { title: 'استراتيجية التسويق الرقمي', bullets: ['نصل إلى العملاء في كل حي بعروض محلية مناسبة', 'الحملات باللغات الإقليمية تزيد من التفاعل'], dir: 'rtl' },
}
export async function makeLanguagePdf(browser, code) {
  const { jsPDF } = createRequire(join(here, '../../apps/editor/package.json'))('jspdf')
  const s = LANG_SLIDES[code]
  const c = await browser.newContext({ viewport: { width: SW, height: SH } })
  const pg = await c.newPage()
  const rtl = s.dir === 'rtl'
  await pg.setContent(`<!doctype html><html><body dir="${s.dir}" style="margin:0;width:${SW}px;height:${SH}px;overflow:hidden;position:relative;background:linear-gradient(135deg,#1f0e11 0%,#2a0f14 100%);font-family:Helvetica,Arial,'Geeza Pro','Kohinoor Devanagari',sans-serif;color:#fff">
<div style="position:absolute;${rtl ? 'right' : 'left'}:90px;top:90px;width:1100px;font-size:62px;font-weight:800;line-height:1.2;text-align:${rtl ? 'right' : 'left'}">${s.title}</div>
${s.bullets.map((b, i) => `<div style="position:absolute;${rtl ? 'right' : 'left'}:120px;top:${300 + i * 140}px;width:1100px;font-size:38px;line-height:1.4;color:#e8dadd;text-align:${rtl ? 'right' : 'left'}">${b}</div>`).join('')}
</body></html>`)
  const jpg = await pg.screenshot({ type: 'jpeg', quality: 92 })
  await c.close()
  const doc = new jsPDF({ unit: 'px', format: [SW, SH], orientation: 'landscape', hotfixes: ['px_scaling'], compress: true })
  doc.addImage(`data:image/jpeg;base64,${jpg.toString('base64')}`, 'JPEG', 0, 0, SW, SH)
  return Buffer.from(doc.output('arraybuffer'))
}
