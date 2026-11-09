import { authored, at, rect, full } from '../author'
import type { ObjDef, Place } from '../author'

/**
 * Dashboard: a calm analytics workspace where a bento grid of widget cards re-flows from scene to scene. On each topic one widget EXPANDS to most of the slide while the other
 * seven compress into a tidy rail (their charts shrink into sparklines); the revenue bars, the user line, the progress ring and the ticket bars are the SAME objects in every
 * scene; the bars later become one stacked bar and then the slices of a donut; the cards become table rows and then alert cards; a pill slides down the sidebar to the active item
 * and the title scales from the cover headline to a page header. Original choreography for SlidesDone.
 */
const C = { canvas: '#F6F8FB', ink: '#0B1B33', mute: '#5B6B84', line: '#E3E8F0', blue: '#2563EB', violet: '#7C3AED', green: '#16A34A', amber: '#F59E0B', red: '#EF4444', amberInk: '#B45309', blueT: '#E8EFFE', greenT: '#E3F5EA', amberT: '#FEF1DA', redT: '#FDE8E8', track: '#E9EEF6', barLight: '#BCD0FA', barLightV: '#D8C8FA', dot: '#C9D3E3' }
type PM = Record<string, Place>
type WK = 'rev' | 'usr' | 'perf' | 'sup' | 'chn' | 'nps' | 'arpa' | 'conv'
const WIDS: WK[] = ['rev', 'usr', 'perf', 'sup', 'chn', 'nps', 'arpa', 'conv']
const CHART = new Set<WK>(['rev', 'usr', 'perf', 'sup'])
const WD: Record<WK, { title: string; value: string; delta: string }> = {
  rev: { title: 'Revenue (MRR)', value: '$1.24M', delta: '+8.2% vs August' },
  usr: { title: 'Active users', value: '58.9K', delta: '+6.5% vs August' },
  perf: { title: 'Uptime', value: '99.97%', delta: '+0.02 pt vs Q2' },
  sup: { title: 'Support tickets', value: '1,284', delta: '-3.1% vs Q2' },
  chn: { title: 'Logo churn', value: '1.9%', delta: '-0.3 pt vs Q2' },
  nps: { title: 'NPS', value: '47', delta: '+2 vs Q2' },
  arpa: { title: 'ARPA', value: '$214', delta: '+$9 vs Q2' },
  conv: { title: 'Trial conversion', value: '4.8%', delta: '+0.4 pt vs Q2' },
}

// ── sample data ──
const MRR = [862, 931, 998, 1052, 1146, 1240]
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
const FC = [1310, 1380, 1460, 1520, 1610, 1700]
const FC_MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']
const WAU = [41.2, 44.0, 45.8, 49.1, 52.6, 55.3, 58.9]
const WAU_M = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
const TICK = [312, 296, 248, 241, 187]
const TICK_N = ['Billing', 'How-to', 'Requests', 'Bugs', 'Access']
const TICK_C = [C.blue, C.violet, C.green, C.amber, C.red]
const TICK_P = ['24%', '23%', '19%', '19%', '15%']
const TABLE: Record<WK, [string, string, string, string, string, string]> = {
  rev: ['Harbor & Pine', 'Enterprise', '$184K', '+12%', 'Healthy', C.green],
  usr: ['Lumen Health', 'Enterprise', '$162K', '+8%', 'Healthy', C.green],
  perf: ['Orbital Freight', 'Business', '$131K', '+3%', 'Healthy', C.green],
  sup: ['Brightwell Energy', 'Enterprise', '$127K', '-4%', 'At risk', C.amberInk],
  chn: ['Kestrel Bank', 'Business', '$98K', '+15%', 'Healthy', C.green],
  nps: ['Mosaic Studio', 'Team', '$64K', '-9%', 'At risk', C.amberInk],
  arpa: ['Tidewater Foods', 'Business', '$57K', '0%', 'Stable', C.blue],
  conv: ['Quill Education', 'Team', '$41K', '-18%', 'Churn risk', C.red],
}
const ALERTS: Partial<Record<WK, [string, string, string, string, string]>> = {
  rev: ['CRITICAL', 'Failed renewals spiked', 'Card declines on annual plans reached 6.1% on Sep 28.', C.red, C.redT],
  usr: ['WARNING', 'Onboarding drop-off', 'Step 3 of setup now loses 31% of new teams, up from 24%.', C.amberInk, C.amberT],
  perf: ['CRITICAL', 'EU search latency', 'The search API p95 hit 412 ms for 40 minutes on Sep 19.', C.red, C.redT],
  sup: ['WARNING', 'Backlog above target', 'Open tickets are at 214 against a target of 150.', C.amberInk, C.amberT],
  chn: ['ON TRACK', 'Churn back under target', 'Logo churn fell to 1.9%, the lowest in six quarters.', C.green, C.greenT],
  nps: ['INFO', 'NPS is steady at 47', 'Enterprise scores 58 and SMB 39: watch that gap.', C.blue, C.blueT],
}

// ── geometry helpers ──
const polyBand = (a0: number, a1: number, rIn: number, rOut = 0.5): number[][] => {
  const n = Math.max(2, Math.min(30, Math.ceil(Math.abs(a1 - a0) / 5)))
  const pt = (r: number, a: number) => [0.5 + r * Math.cos((a * Math.PI) / 180), 0.5 + r * Math.sin((a * Math.PI) / 180)].map((v) => Math.round(v * 1000) / 1000)
  const out = Array.from({ length: n + 1 }, (_, i) => pt(rOut, a0 + ((a1 - a0) * i) / n))
  const inn = Array.from({ length: n + 1 }, (_, i) => pt(rIn, a1 - ((a1 - a0) * i) / n))
  return [...out, ...inn]
}
const seg = (a: { x: number; y: number }, b: { x: number; y: number }, th: number): Place => {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy)
  return { x: (a.x + b.x) / 2 - len / 2, y: (a.y + b.y) / 2 - th / 2, w: len, h: th, rot: (Math.atan2(dy, dx) * 180) / Math.PI, radius: th / 2 }
}
const dotAt = (p: { x: number; y: number }, d: number): Place => ({ x: p.x - d / 2, y: p.y - d / 2, w: d, h: d, radius: d / 2 })
const tx = (P: PM, id: string, x: number, y: number, w: number, h: number, extra: Partial<Place> = {}) => { P[id] = { x, y, w, h, ...extra } }
const card = (P: PM, w: WK, p: Place, r = 28) => { P['c_' + w] = { ...p, radius: r }; P['s_' + w] = { x: p.x - 8, y: p.y + 2, w: p.w + 16, h: p.h + 20, radius: r + 8, a: 0.06 } }

// ── charts ──
const barFill = (i: number, last: number, light: string, strong: string) => (i === last ? strong : light)
function bars(P: PM, vals: number[], vmax: number, x0: number, base: number, bw: number, gap: number, hmax: number, radius: number, light: string, strong: string) {
  vals.forEach((v, i) => { const h = (v / vmax) * hmax; P['b' + (i + 1)] = { x: x0 + i * (bw + gap), y: base - h, w: bw, h, radius, fill: barFill(i, vals.length - 1, light, strong) } })
}
function ticketBars(P: PM, x0: number, base: number, bw: number, gap: number, hmax: number, radius: number) {
  TICK.forEach((v, i) => { const h = (v / 312) * hmax; P['q' + (i + 1)] = { x: x0 + i * (bw + gap), y: base - h, w: bw, h, radius, fill: TICK_C[i]! } })
}
function userLine(P: PM, x0: number, x1: number, yTop: number, yBot: number, dot: number, th: number): { x: number; y: number }[] {
  const pts = WAU.map((v, i) => ({ x: x0 + ((x1 - x0) * i) / (WAU.length - 1), y: yBot - ((v - 38) / 24) * (yBot - yTop) }))
  pts.forEach((p, i) => { P['u' + (i + 1)] = dotAt(p, dot) })
  pts.slice(1).forEach((p, i) => { P['k' + (i + 1)] = seg(pts[i]!, p, th) })
  return pts
}
function ring(P: PM, cx: number, cy: number, d: number, rot = 0, a = 1) {
  const box = { x: cx - d / 2, y: cy - d / 2, w: d, h: d }
  P['trA'] = { ...box }; P['trB'] = { ...box }; P['pa'] = { ...box, rot, a }
}
const gridLines = (P: PM, base: number) => { for (let i = 0; i < 5; i++) P['g' + (i + 1)] = { x: 362, y: base - i * 100, w: 996, h: 2 } }

// ── widget texts ──
function texts(P: PM, w: WK, o: { t: [number, number, number, number, number?]; v: [number, number, number, number, number]; d?: [number, number, number, number, number] | null }) {
  tx(P, 't_' + w, o.t[0], o.t[1], o.t[2], o.t[3], { px: o.t[4] ?? 24, text: WD[w].title })
  tx(P, 'v_' + w, o.v[0], o.v[1], o.v[2], o.v[3], { px: o.v[4], text: WD[w].value, color: C.ink })
  if (o.d) tx(P, 'd_' + w, o.d[0], o.d[1], o.d[2], o.d[3], { px: o.d[4], text: WD[w].delta, color: C.green })
}

/** a widget at rest in the overview grid (also used, scaled, for the cover) */
function ovInner(P: PM, w: WK, c: Place, k = 1, cover = false) {
  const big = w === 'rev' || w === 'usr', tile = !CHART.has(w)
  const vpx = big ? 72 : 60
  texts(P, w, {
    t: [c.x + (tile ? 28 : 32) * k, c.y + (tile ? 22 : 26) * k, c.w - 56 * k, 32 * k, cover ? 22 : 24],
    v: [c.x + (tile ? 28 : 32) * k, c.y + (tile ? 56 : 62) * k, c.w - 56 * k, (vpx + 14) * k, vpx * k],
    d: cover ? null : [c.x + (tile ? 28 : 32) * k, c.y + (big ? 148 : tile ? 138 : 134) * k, c.w - 56 * k, 32, 24],
  })
  const ox = (n: number) => c.x + n * k, oy = (n: number) => c.y + n * k
  if (w === 'rev') bars(P, MRR, 1240, ox(32), oy(400), 70 * k, 51.2 * k, 150 * k, 16 * k, C.barLight, C.blue)
  if (w === 'usr') userLine(P, ox(60), ox(730), oy(250), oy(380), 16 * k, 5 * k)
  if (w === 'perf') ring(P, c.x + c.w / 2, oy(300), 190 * k)
  if (w === 'sup') ticketBars(P, ox(32), oy(390), 56 * k, 21.5 * k, 150 * k, 14 * k)
}

const FOCUS = rect(330, 170, 1060, 870)
const RAIL = (f: WK | null, n = 7): Place[] => Array.from({ length: n }, (_, i) => rect(1420, 170 + i * 126, 460, 112))
function railInner(P: PM, w: WK, c: Place) {
  texts(P, w, { t: [c.x + 24, c.y + 12, 270, 30, 22], v: [c.x + 24, c.y + 42, 270, 56, 44], d: [c.x + 262, c.y + 40, 188, 30, 22] })
  const rx = c.x + 300
  if (!CHART.has(w)) return
  P['d_' + w] = { ...P['d_' + w]!, a: 0 }
  if (w === 'rev') bars(P, MRR, 1240, rx, c.y + 90, 14, 10.4, 62, 5, C.barLight, C.blue)
  if (w === 'usr') userLine(P, rx + 8, rx + 128, c.y + 30, c.y + 84, 9, 3)
  if (w === 'perf') ring(P, c.x + 368, c.y + 56, 66, -140, 0.9)
  if (w === 'sup') ticketBars(P, rx, c.y + 90, 20, 9, 62, 5)
}
function railScene(P: PM, f: WK | null, skip: WK[] = []) {
  const others = WIDS.filter((w) => w !== f && !skip.includes(w))
  RAIL(f, others.length).forEach((p, i) => { card(P, others[i]!, p, 22); railInner(P, others[i]!, p) })
}
function focusTexts(P: PM, f: WK, note: string) {
  texts(P, f, { t: [362, 206, 700, 38, 28], v: [362, 246, 540, 150, 132], d: [362, 394, 540, 36, 26] })
  tx(P, 'note', 920, 252, 430, 160, { text: note })
}

// ── chrome: page title, filter chips, sidebar highlight ──
const NAV = ['Overview', 'Revenue', 'Users', 'Performance', 'Support', 'Accounts', 'Alerts', 'Forecast']
function chrome(P: PM, nav: number, title: string, sub: string, chips: [string, string, string], active: number) {
  tx(P, 'ptitle', 330, 46, 900, 66, { text: title, px: 44, color: C.ink })
  tx(P, 'psub', 330, 112, 860, 34, { text: sub, px: 24, color: C.mute })
  let right = 1880
  for (let i = 2; i >= 0; i--) {
    const w = Math.round(chips[i]!.length * 14 + 52)
    right -= w
    const on = i === active
    P['chb' + (i + 1)] = { x: right, y: 52, w, h: 48, radius: 24, fill: on ? C.blueT : '#FFFFFF' }
    P['cht' + (i + 1)] = { x: right, y: 61, w, h: 32, text: chips[i]!, color: on ? C.blue : C.mute }
    right -= 12
  }
  P['sb'] = { x: 40, y: 40, w: 250, h: 1000, radius: 30 }
  P['sbs'] = { x: 32, y: 42, w: 266, h: 1020, radius: 38, a: 0.06 }
  P['mark'] = { x: 68, y: 66, w: 48, h: 48, radius: 14 }
  P['brand'] = { x: 128, y: 70, w: 150, h: 42 }
  if (nav >= 0) P['navhi'] = { x: 58, y: 200 + nav * 68, w: 214, h: 56, radius: 18 }
  NAV.forEach((_, i) => {
    const on = i === nav
    P['nb' + (i + 1)] = { x: 84, y: 200 + i * 68 + 19, w: 18, h: 18, radius: 6, fill: on ? C.blue : C.dot }
    P['nv' + (i + 1)] = { x: 114, y: 200 + i * 68 + 12, w: 172, h: 34, color: on ? C.blue : C.mute }
  })
  P['smp'] = { x: 62, y: 960, w: 206, h: 52, radius: 26 }
  P['smpt'] = { x: 62, y: 970, w: 206, h: 32 }
}

// ── scenes ──
const KC = 0.6
const cvPlace = (p: Place): Place => ({ x: 900 + (p.x - 330) * KC, y: 480 + (p.y - 170) * KC, w: p.w * KC, h: p.h * KC })
const OV: Record<WK, Place> = {
  rev: rect(330, 170, 740, 430), usr: rect(1090, 170, 790, 430), perf: rect(330, 620, 360, 420), sup: rect(710, 620, 430, 420),
  chn: rect(1160, 620, 350, 200), nps: rect(1530, 620, 350, 200), arpa: rect(1160, 840, 350, 200), conv: rect(1530, 840, 350, 200),
}

function cover(kicker: string, title: string, sub: string, art: Place, artName: 'stack' | 'cube'): PM {
  const P: PM = {}
  P['mesh'] = full()
  for (const w of WIDS) { const c = cvPlace(OV[w]); card(P, w, c, 18); ovInner(P, w, c, KC, true) }
  P[artName] = art
  tx(P, 'kick', 110, 270, 800, 36, { text: kicker })
  tx(P, 'ptitle', 110, 330, 820, 260, { text: title, px: artName === 'stack' ? 112 : 96, color: C.ink })
  tx(P, 'psub', 110, artName === 'stack' ? 640 : 590, 760, 170, { text: sub, px: 34, color: C.mute })
  return P
}

const s1 = () => cover('QUARTERLY BUSINESS REVIEW', 'Q3 business\nreview', 'Revenue, users, performance and support for the quarter, on one calm dashboard. Sample data.', rect(1340, 24, 500, 500, { rot: 8 }), 'stack')

const s2 = () => {
  const P: PM = {}
  chrome(P, 0, 'Overview', 'Sample data · the quarter at a glance', ['Q3 2026', 'All regions', 'All plans'], 0)
  for (const w of WIDS) { card(P, w, OV[w]); ovInner(P, w, OV[w]) }
  return P
}

function focusBase(f: WK, nav: number, title: string, sub: string, chips: [string, string, string], act: number, note: string): PM {
  const P: PM = {}
  chrome(P, nav, title, sub, chips, act)
  card(P, f, FOCUS)
  railScene(P, f)
  focusTexts(P, f, note)
  return P
}

const s3 = () => {
  const P = focusBase('rev', 1, 'Revenue', 'Sample data · monthly recurring revenue, $K', ['Last 6 months', 'USD', 'All plans'], 0, 'MRR rose 44% from April, led by Pro-plan upgrades. September added $94K, the best month this year.')
  gridLines(P, 940)
  bars(P, MRR, 1240, 362, 940, 112, 64.8, 400, 22, C.barLight, C.blue)
  MRR.forEach((v, i) => {
    const b = P['b' + (i + 1)]!
    tx(P, 'bl' + (i + 1), b.x - 14, b.y - 36, b.w + 28, 30, { text: v.toLocaleString('en-US') })
    tx(P, 'ax' + (i + 1), b.x - 14, 954, b.w + 28, 30, { text: MONTHS[i]! })
  })
  return P
}

const s4 = () => {
  const P = focusBase('usr', 2, 'Users', 'Sample data · weekly active users, thousands', ['Last 7 months', 'Weekly actives', 'All plans'], 1, 'Weekly actives reached 58.9K, up 43% since March. Growth is steady, with no single spike behind it.')
  gridLines(P, 940)
  const pts = userLine(P, 430, 1290, 560, 900, 26, 7)
  pts.forEach((p, i) => {
    tx(P, 'bl' + (i + 1), p.x - 45, p.y - 54, 90, 30, { text: WAU[i]!.toFixed(1) })
    tx(P, 'ax' + (i + 1), p.x - 45, 954, 90, 30, { text: WAU_M[i]! })
  })
  return P
}

const PERF_ROWS: [string, string, number, string][] = [['API uptime · 30% of error budget used', '99.97%', 0.3, C.green], ['p95 latency · 74% of budget used', '184 ms', 0.74, C.amber], ['Error rate · 16% of budget used', '0.08%', 0.16, C.green]]
const s5 = () => {
  const P = focusBase('perf', 3, 'Performance', 'Sample data · production, last 30 days', ['Last 30 days', 'All regions', 'Production'], 2, 'Uptime beat the 99.9% target. EU search latency is the one budget now close to its limit.')
  ring(P, 590, 720, 380)
  tx(P, 'rc', 490, 650, 200, 120, { text: '92', px: 110 })
  tx(P, 'rcap', 480, 770, 220, 32, { text: 'score' })
  PERF_ROWS.forEach(([label, val, f, col], i) => {
    const y = 520 + i * 140
    tx(P, 'pl' + (i + 1), 860, y, 490, 32, { text: label })
    tx(P, 'pv' + (i + 1), 860, y + 34, 300, 56, { text: val })
    P['pt' + (i + 1)] = { x: 860, y: y + 100, w: 490, h: 12, radius: 6 }
    P['pf' + (i + 1)] = { x: 860, y: y + 100, w: 490 * f, h: 12, radius: 6, fill: col }
  })
  return P
}

const s6 = () => {
  const P = focusBase('sup', 4, 'Support', 'Sample data · tickets by topic, Q3', ['Q3 2026', 'All queues', 'All channels'], 1, 'Tickets are flat while users grew 43%. Billing and how-to questions are almost half of volume.')
  gridLines(P, 940)
  ticketBars(P, 396, 940, 150, 61.5, 400, 24)
  TICK.forEach((v, i) => {
    const b = P['q' + (i + 1)]!
    tx(P, 'bl' + (i + 1), b.x - 14, b.y - 36, b.w + 28, 30, { text: String(v) })
    tx(P, 'ax' + (i + 1), b.x - 14, 954, b.w + 28, 30, { text: TICK_N[i]! })
  })
  return P
}

const s7 = () => {
  const P = focusBase('sup', 4, 'Support mix', 'Sample data · share of Q3 tickets by topic', ['Q3 2026', 'By topic', 'All channels'], 1, 'Billing and how-to make up 47% of tickets. Better help articles could remove the largest slice.')
  // the five bars lie down into one stacked bar
  let x = 362
  TICK.forEach((v, i) => {
    const w = (v / 1284) * (996 - 4 * 6)
    P['q' + (i + 1)] = { x, y: 462, w, h: 84, radius: 16, fill: TICK_C[i]! }
    tx(P, 'bl' + (i + 1), x, 488, w, 32, { text: TICK_P[i]!, color: '#FFFFFF', px: 26 })
    x += w + 6
  })
  // ...and the donut turns in underneath
  const D = 360, cx = 560, cy = 790
  let a = -90
  TICK.forEach((v, i) => {
    const sw = (v / 1284) * 360
    P['wd' + (i + 1)] = { x: cx - D / 2, y: cy - D / 2, w: D, h: D }
    a += sw
    const lx = 880, ly = 610 + i * 72
    P['ld' + (i + 1)] = { x: lx, y: ly + 6, w: 24, h: 24, radius: 12 }
    tx(P, 'lg' + (i + 1), lx + 44, ly, 240, 36, { text: TICK_N[i]! })
    tx(P, 'lv' + (i + 1), lx + 280, ly, 190, 36, { text: `${v}  ·  ${TICK_P[i]}` })
  })
  tx(P, 'dc', 460, 740, 200, 80, { text: '4.6', px: 64 })
  tx(P, 'dcap', 440, 818, 240, 32, { text: 'CSAT, sample' })
  return P
}

const s8 = () => {
  const P: PM = {}
  chrome(P, 5, 'Accounts', 'Sample data · top eight accounts by ARR', ['Top 8 by ARR', 'All plans', 'All regions'], 0)
  const cols: [number, string][] = [[372, 'ACCOUNT'], [800, 'PLAN'], [1010, 'ARR'], [1230, 'CHANGE'], [1640, 'HEALTH']]
  cols.forEach(([x, t], i) => tx(P, 'hc' + (i + 1), x, 178, 220, 30, { text: t }))
  WIDS.forEach((w, i) => {
    const y = 226 + i * 100, r = TABLE[w]
    card(P, w, rect(330, y, 1550, 88), 22)
    tx(P, 't_' + w, 372, y + 24, 400, 40, { text: r[0], px: 28, color: C.ink })
    tx(P, 'ab_' + w, 800, y + 24, 200, 40, { text: r[1], px: 26 })
    tx(P, 'v_' + w, 1010, y + 22, 200, 46, { text: r[2], px: 32 })
    tx(P, 'd_' + w, 1230, y + 24, 200, 40, { text: r[3], px: 26, color: r[3].startsWith('-') ? C.red : r[3] === '0%' ? C.mute : C.green })
    const pw = Math.round(r[4].length * 13.5 + 44)
    P['pl_' + w] = { x: 1640, y: y + 22, w: pw, h: 44, radius: 22, fill: r[5] === C.green ? C.greenT : r[5] === C.red ? C.redT : r[5] === C.blue ? C.blueT : C.amberT }
    tx(P, 'h_' + w, 1662, y + 27, pw - 30, 34, { text: r[4], px: 24, color: r[5] })
  })
  return P
}

const s9 = () => {
  const P: PM = {}
  chrome(P, 6, 'Alerts', 'Sample data · what needs attention this week', ['Open', 'Last 30 days', 'All severities'], 0)
  const six: WK[] = ['rev', 'usr', 'perf', 'sup', 'chn', 'nps']
  six.forEach((w, i) => {
    const x = 330 + (i % 2) * 624, y = 170 + Math.floor(i / 2) * 296, a = ALERTS[w]!
    card(P, w, rect(x, y, 606, 278))
    const pw = Math.round(a[0].length * 15 + 40)
    P['pl_' + w] = { x: x + 32, y: y + 28, w: pw, h: 40, radius: 20, fill: a[4] }
    tx(P, 'd_' + w, x + 52, y + 33, pw - 24, 32, { text: a[0], px: 22, color: a[3] })
    tx(P, 't_' + w, x + 32, y + 88, 542, 42, { text: a[1], px: 32, color: C.ink })
    tx(P, 'ab_' + w, x + 32, y + 140, 542, 110, { text: a[2], px: 26 })
  })
  const big: [WK, string, string, string, string][] = [['arpa', 'Critical', '2', 'open right now', C.red], ['conv', 'Warnings', '2', 'to review this week', C.amberInk]]
  big.forEach(([w, t, v, b, col], i) => {
    const y = 170 + i * 444, x = 1590
    card(P, w, rect(x, y, 290, 426))
    tx(P, 't_' + w, x + 28, y + 40, 234, 36, { text: t, px: 28, color: C.ink })
    tx(P, 'v_' + w, x + 28, y + 120, 234, 190, { text: v, px: 170, color: col })
    tx(P, 'ab_' + w, x + 28, y + 330, 234, 70, { text: b, px: 26 })
  })
  return P
}

const SCEN: [WK, string, string, string][] = [['usr', 'Base case', '$1.70M', 'MRR in March at 6% monthly growth.'], ['perf', 'Upside', '$1.86M', 'Adds the EU launch and two enterprise wins.'], ['sup', 'Downside', '$1.52M', 'Churn returns to 2.6% and growth slows to 3%.']]
const s10 = () => {
  const P: PM = {}
  chrome(P, 7, 'Forecast', 'Sample data · projected MRR, next six months', ['Next 6 months', 'Base case', 'USD'], 1)
  card(P, 'rev', FOCUS)
  texts(P, 'rev', { t: [362, 206, 700, 38, 28], v: [362, 246, 540, 150, 132], d: [362, 394, 540, 36, 26] })
  P['t_rev'] = { ...P['t_rev']!, text: 'Projected MRR, March' }
  P['v_rev'] = { ...P['v_rev']!, text: '$1.70M', color: C.violet }
  P['d_rev'] = { ...P['d_rev']!, text: '+37% vs September', color: C.violet }
  tx(P, 'note', 920, 252, 430, 160, { text: 'Base case reaches $1.70M a month by March, short of the $1.9M target. See the scenarios on the right.' })
  gridLines(P, 940)
  bars(P, FC, 1700, 362, 940, 112, 64.8, 400, 22, C.barLightV, C.violet)
  FC.forEach((v, i) => {
    const b = P['b' + (i + 1)]!
    tx(P, 'bl' + (i + 1), b.x - 14, b.y - 36, b.w + 28, 30, { text: (v / 1000).toFixed(2) })
    tx(P, 'ax' + (i + 1), b.x - 14, 954, b.w + 28, 30, { text: FC_MONTHS[i]! })
  })
  P['tgt'] = { x: 362, y: 940 - (1900 / 1700) * 400, w: 996, h: 4, radius: 2 }
  tx(P, 'tgtl', 1058, 940 - (1900 / 1700) * 400 - 38, 300, 30, { text: 'Target $1.9M' })
  SCEN.forEach(([w, t, v, b], i) => {
    const x = 1420, y = 170 + i * 295
    card(P, w, rect(x, y, 460, 280))
    tx(P, 't_' + w, x + 28, y + 24, 400, 32, { text: t, px: 26, color: C.mute })
    tx(P, 'v_' + w, x + 28, y + 60, 404, 84, { text: v, px: 72, color: i === 0 ? C.ink : i === 1 ? C.green : C.red })
    tx(P, 'ab_' + w, x + 28, y + 158, 404, 100, { text: b, px: 26 })
  })
  return P
}

const s11 = () => {
  const P: PM = {}
  chrome(P, 0, 'Takeaways', 'Sample data · four things to remember from Q3', ['Q3 2026', 'All regions', 'All plans'], 0)
  const four: [WK, string][] = [
    ['rev', 'MRR grew 8.2% in September and 44% since April. Pro-plan upgrades did most of the work.'],
    ['usr', 'Weekly actives are up 43% since March, but only 69% of new teams finish setup.'],
    ['perf', 'Uptime beat the 99.9% target. EU search latency is the one budget at risk.'],
    ['sup', 'Volume is flat while users grew, so help content works. Billing is the top topic.'],
  ]
  four.forEach(([w, b], i) => {
    const x = 330 + (i % 2) * 490, y = 170 + Math.floor(i / 2) * 440
    card(P, w, rect(x, y, 470, 420))
    tx(P, 't_' + w, x + 32, y + 30, 406, 34, { text: WD[w].title, px: 26, color: C.mute })
    tx(P, 'v_' + w, x + 32, y + 76, 406, 100, { text: WD[w].value, px: 84, color: C.ink })
    tx(P, 'ab_' + w, x + 32, y + 206, 406, 190, { text: b, px: 28 })
  })
  const small: WK[] = ['chn', 'nps', 'arpa', 'conv']
  small.forEach((w, i) => {
    const x = 1340 + (i % 2) * 285, y = 600 + Math.floor(i / 2) * 210
    card(P, w, rect(x, y, 265, 190), 22)
    tx(P, 't_' + w, x + 22, y + 18, 225, 30, { text: WD[w].title, px: 22 })
    tx(P, 'v_' + w, x + 22, y + 54, 225, 66, { text: WD[w].value, px: 52, color: C.ink })
    tx(P, 'd_' + w, x + 22, y + 134, 225, 30, { text: WD[w].delta, px: 22, color: C.green })
  })
  P['stack'] = rect(1380, 70, 460, 460, { rot: -6 })
  return P
}

const s12 = () => cover('DISCUSSION', 'Questions and\nnext steps', 'Three decisions for today: fix EU search latency, ship the new setup flow and fund the billing-retry work. Sample data.', rect(1330, 14, 520, 520, { rot: -8 }), 'cube')

const SCENES: [string, string, string, () => PM][] = [
  ['Cover', 'The dashboard assembles as eight widget tiles settle into a grid beside the headline.', 's1', s1],
  ['Overview', 'The tiles open into the full bento grid, the sidebar slides in and the headline shrinks into a page title.', 's2', s2],
  ['Revenue', 'The revenue widget expands to most of the slide while the other seven compress into a rail and its bars grow tall.', 's3', s3],
  ['Users', 'The user widget takes over, the bars shrink into a sparkline and the weekly-active line draws itself.', 's4', s4],
  ['Performance', 'The performance widget expands and a progress ring sweeps round next to three budget meters.', 's5', s5],
  ['Support', 'The support widget expands and five coloured bars rise for the ticket topics.', 's6', s6],
  ['Support mix', 'The five bars lie down into one stacked bar and a donut turns in with the same five colours.', 's7', s7],
  ['Accounts', 'The eight widget cards become the rows of an account table.', 's8', s8],
  ['Alerts', 'The rows regroup into six alert cards with coloured severity chips and two count cards.', 's9', s9],
  ['Forecast', 'The revenue card returns with the bars turned violet as a six-month projection, beside three scenario cards.', 's10', s10],
  ['Takeaways', 'The cards settle into four takeaway cards and four small tiles, with the layered chart object floating in.', 's11', s11],
  ['Next steps', 'The grid re-forms into the cover arrangement, with the data cube in place of the layered chart.', 's12', s12],
]

// ── objects ──
const T = (px: number, weight: number, color: string, o: Record<string, unknown> = {}): ObjDef => ({ kind: 'text', text: '', px, weight, color, ...o }) as ObjDef
const CAP = { caps: true, spc: 3, align: 'l' }
const objects: Record<string, ObjDef> = {}
const order: string[] = []
const add = (id: string, d: ObjDef) => { objects[id] = d; order.push(id) }

add('mesh', { kind: 'image', art: 'dash-mesh.webp', alt: 'A soft blue and violet mesh gradient' })
WIDS.forEach((w) => add('s_' + w, { kind: 'shape', radius: 36, fill: C.ink }))
add('sbs', { kind: 'shape', radius: 38, fill: C.ink, park: 'l' })
add('sb', { kind: 'shape', radius: 30, fill: '#FFFFFF', stroke: C.line, strokeW: 2, park: 'l' })
WIDS.forEach((w) => add('c_' + w, { kind: 'shape', radius: 28, fill: '#FFFFFF', stroke: C.line, strokeW: 2 }))
add('mark', { kind: 'shape', radius: 14, gradient: { from: C.blue, to: C.violet, angle: 135 }, park: 'l' })
add('navhi', { kind: 'shape', radius: 18, fill: C.blueT, park: 'l' })
NAV.forEach((_, i) => add('nb' + (i + 1), { kind: 'shape', radius: 6, fill: C.dot, park: 'l' }))
add('smp', { kind: 'shape', radius: 26, fill: C.amberT, park: 'l' })
for (let i = 1; i <= 3; i++) add('chb' + i, { kind: 'shape', radius: 24, fill: '#FFFFFF', stroke: C.line, strokeW: 2, park: 't' })
WIDS.forEach((w) => add('pl_' + w, { kind: 'shape', radius: 20, fill: C.greenT }))
for (let i = 1; i <= 5; i++) add('g' + i, { kind: 'shape', radius: 1, fill: '#E8EDF4' })
add('tgt', { kind: 'shape', radius: 2, fill: C.amber })
add('trA', { kind: 'shape', fill: C.track, poly: polyBand(-90, 90.5, 0.38) })
add('trB', { kind: 'shape', fill: C.track, poly: polyBand(90, 270.5, 0.38) })
add('pa', { kind: 'shape', fill: C.blue, poly: polyBand(-90, -90 + 331, 0.38) })
for (let i = 1; i <= 3; i++) { add('pt' + i, { kind: 'shape', radius: 6, fill: C.track }); add('pf' + i, { kind: 'shape', radius: 6, fill: C.green }) }
for (let i = 1; i <= 6; i++) add('b' + i, { kind: 'shape', radius: 16, fill: C.barLight })
for (let i = 1; i <= 5; i++) add('q' + i, { kind: 'shape', radius: 14, fill: C.blue })
{
  let a = -90
  TICK.forEach((v, i) => { const sw = (v / 1284) * 360; add('wd' + (i + 1), { kind: 'shape', fill: TICK_C[i]!, poly: polyBand(a + 0.9, a + sw - 0.9, 0.3) }); a += sw })
}
for (let i = 1; i <= 5; i++) add('ld' + i, { kind: 'shape', radius: 12, fill: TICK_C[i - 1]! })
for (let i = 1; i <= 6; i++) add('k' + i, { kind: 'shape', radius: 3, fill: C.blue })
for (let i = 1; i <= 7; i++) add('u' + i, { kind: 'shape', shape: 'ellipse', fill: C.blue })
add('stack', { kind: 'image', art: 'dash-stack.webp', alt: 'A floating stack of four glass chart cards' })
add('cube', { kind: 'image', art: 'dash-cube.webp', alt: 'An isometric data cube of glass blocks' })
// text
add('brand', T(32, 800, C.ink, { face: 'heading', park: 'l' }))
NAV.forEach((n, i) => add('nv' + (i + 1), T(23, 600, C.mute, { text: n, park: 'l' })))
add('smpt', T(22, 700, C.amberInk, { text: 'Sample data', align: 'ctr', park: 'l' }))
for (let i = 1; i <= 3; i++) add('cht' + i, T(24, 600, C.mute, { align: 'ctr', park: 't' }))
add('kick', T(24, 700, C.blue, { caps: true, spc: 6 }))
add('ptitle', T(44, 800, C.ink, { face: 'heading', lh: 1.05, spc: -1 }))
add('psub', T(24, 400, C.mute, { lh: 1.45 }))
WIDS.forEach((w) => {
  add('t_' + w, T(24, 600, C.mute))
  add('v_' + w, T(60, 800, C.ink, { face: 'heading', lh: 1, spc: -1.5 }))
  add('d_' + w, T(24, 600, C.green))
  add('ab_' + w, T(26, 400, C.mute, { lh: 1.4 }))
  add('h_' + w, T(24, 700, C.green))
})
add('note', T(26, 400, C.mute, { lh: 1.45 }))
for (let i = 1; i <= 5; i++) add('hc' + i, T(22, 700, C.mute, CAP))
for (let i = 1; i <= 7; i++) add('bl' + i, T(22, 700, C.ink, { align: 'ctr' }))
for (let i = 1; i <= 7; i++) add('ax' + i, T(22, 500, C.mute, { align: 'ctr' }))
add('tgtl', T(24, 700, C.amberInk, { align: 'r' }))
add('rc', T(110, 800, C.ink, { face: 'heading', align: 'ctr', lh: 1, spc: -3 }))
add('rcap', T(24, 500, C.mute, { align: 'ctr' }))
for (let i = 1; i <= 3; i++) { add('pl' + i, T(24, 500, C.mute)); add('pv' + i, T(48, 800, C.ink, { face: 'heading', lh: 1, spc: -1 })) }
for (let i = 1; i <= 5; i++) { add('lg' + i, T(28, 600, C.ink)); add('lv' + i, T(28, 500, C.mute, { align: 'r' })) }
add('dc', T(64, 800, C.ink, { face: 'heading', align: 'ctr', lh: 1 }))
add('dcap', T(22, 500, C.mute, { align: 'ctr' }))
// the brand text is the same on every scene it is on
const BRAND_TEXT = 'Pulse'

// ── scene assembly: anything not placed in a scene waits (invisible) where it was last seen, so it fades in and out in place ──
const raw = SCENES.map(([, , , f]) => f())
raw.forEach((P, i) => { if (i > 0 && i < raw.length - 1) P['brand'] = { x: 128, y: 70, w: 150, h: 42, text: BRAND_TEXT } })
const stay = (id: string) => objects[id]!.park !== undefined
const scenes = raw.map((P, i) => {
  const place: Record<string, Place> = { ...P }
  for (const id of order) {
    if (place[id] || stay(id)) continue
    let src: Place | undefined
    for (let j = i - 1; j >= 0 && !src; j--) src = raw[j]![id]
    for (let j = i + 1; j < raw.length && !src; j++) src = raw[j]![id]
    if (src) place[id] = at(src, { a: 0 })
  }
  const [title, purpose, id] = SCENES[i]!
  return { id, title, purpose, bg: C.canvas, place }
})

export const TECH_DASHBOARD = authored(
  {
    id: 'tech-dashboard', category: 'technology', name: 'Dashboard', tagline: 'A bento dashboard that re-flows with every topic',
    description: 'A calm analytics workspace where a grid of widget cards rearranges itself: one widget expands to tell each story while the others fold into a rail, bars become a stacked bar and then a donut, cards become table rows and alert cards, and a sidebar highlight follows the topic.',
    audience: 'The Dashboard template suits quarterly business reviews, KPI and metrics reports, product analytics and SaaS performance updates, BI and reporting walkthroughs, data presentations and any talk where numbers need to be explained one widget at a time.',
    topics: ['dashboard', 'analytics', 'analytics report', 'kpi', 'kpi review', 'business review', 'quarterly business review', 'qbr', 'data presentation', 'saas metrics', 'product analytics', 'bi', 'business intelligence', 'reporting', 'metrics', 'performance report', 'technology', 'data'],
    fonts: { heading: 'Manrope', body: 'Inter' },
    colors: { background: C.canvas, surface: '#FFFFFF', textPrimary: C.ink, textSecondary: C.mute, primary: C.blue, secondary: C.violet, accent: C.amber, onPrimary: '#FFFFFF' },
    background: C.canvas,
  },
  { objects, order, scenes },
)
