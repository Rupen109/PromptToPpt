import { authored, at, full, rect } from '../author'
import type { Place } from '../author'

/**
 * Annual Report: a printed annual report that moves. Four tall architectural photographs sit side by side as an accordion: on every scene they trade widths (one opens to about 60% of the set,
 * the others compress to slim strips, or the whole set slides to the other edge), each picture drawn with `cover` so its crop changes with the panel. Giant serif numerals travel and
 * scale between scenes like counters. The same five brass rounded shapes are bars, then one stacked column, then dots on a line. One panel opens to full bleed as the chapter opener
 * and shrinks back. A thin year timeline in the header moves a marker. Original choreography for SlidesDone.
 */
const C = { bg: '#0F2A24', bg2: '#0B211C', ivory: '#F2EDE0', brass: '#C8A45C', sage: '#8FB3A3', mute: '#C9CDBF', deep: '#4F7A6A' }
const PY = 140, PH = 860, GAP = 16

/** the four panels of the accordion: where each stands for the given left edge and widths, and how dark its veil is */
const pan = (x0: number, ws: [number, number, number, number], veil: [number, number, number, number] = [0.3, 0.3, 0.3, 0.3], art: Partial<Record<1 | 2 | 3 | 4, string>> = {}): Record<string, Place> => {
  const out: Record<string, Place> = {}
  let x = x0
  ws.forEach((w, i) => {
    const k = (i + 1) as 1 | 2 | 3 | 4
    out[`p${k}`] = { x, y: PY, w, h: PH, ...(art[k] ? { art: art[k] } : {}) }
    out[`v${k}`] = { x, y: PY, w, h: PH, a: veil[i]! }
    x += w + GAP
  })
  return out
}
/** the header: brand, the page line, and the year timeline whose marker moves with the scene */
const TL = { x: 760, step: 80, y: 84 }
const header = (scene: number, total = 12): Record<string, Place> => {
  const mx = TL.x + (TL.step * 5 * (scene - 1)) / (total - 1)
  return {
    brand: rect(80, 52, 400, 30), page: rect(1240, 52, 600, 30),
    tlTrack: rect(TL.x, TL.y, TL.step * 5, 2, { a: 0.4 }), tlFill: rect(TL.x, TL.y, mx - TL.x + 1, 2), tlDot: rect(mx - 8, TL.y - 7, 16, 16),
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`tk${i + 1}`, rect(TL.x + i * TL.step - 1, TL.y - 9, 2, 10, { a: 0.5 })])),
    ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`ty${i + 1}`, rect(TL.x + i * TL.step - 50, 40, 100, 28)])),
  }
}
const rule = (x: number): Place => rect(x, 136, 80, 4)

/** the five brass shapes as bars on a baseline: centre x, height */
const bar = (cx: number, h: number, w = 130, base = 900): Place => rect(cx - w / 2, base - h, w, h)
const dot = (cx: number, cy: number): Place => rect(cx - 24, cy - 24, 48, 48)
const seg = (y0: number, h: number, fill: string): Place => rect(520, y0 + 6, 240, h - 6, { fill })
/** a thin line between two points */
const link = (a: [number, number], b: [number, number]): Place => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  return rect((a[0] + b[0]) / 2 - len / 2, (a[1] + b[1]) / 2 - 1.5, len, 3, { rot: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI })
}

// s5: growth by region (sample). Four bars at 40 px per percent point.
const REG = [{ cx: 785, g: 8.4 }, { cx: 981, g: 5.1 }, { cx: 1177, g: 12.7 }, { cx: 1373, g: 9.6 }]
const regLabel = (i: number, text: string, extra: Partial<Place> = {}) => ({ ...rect(REG[i]!.cx - 98, 918, 196, 62), text, ...extra })
const regValue = (i: number, text: string) => ({ ...rect(REG[i]!.cx - 98, 900 - REG[i]!.g * 40 - 62, 196, 50), text })
// s6: one stacked column of revenue by segment (sample). Total 600 px, from y 300 to 900.
const STACK = [{ y: 672, h: 228, name: 'Workplace', pct: '38%', fill: C.brass }, { y: 510, h: 162, name: 'Infrastructure', pct: '27%', fill: C.sage }, { y: 384, h: 126, name: 'Advisory', pct: '21%', fill: C.ivory }, { y: 300, h: 84, name: 'Ventures', pct: '14%', fill: C.deep }]
// s7: five years of revenue as dots on a line (sample, billions)
const YEARS = [{ y: '2022', v: 3.5 }, { y: '2023', v: 3.8 }, { y: '2024', v: 4.1 }, { y: '2025', v: 4.4 }, { y: '2026', v: 4.8 }]
const pts: [number, number][] = YEARS.map((d, i) => [200 + i * 300, 840 - ((d.v - 3.5) / 1.3) * 320])

const SHAPE = { kind: 'shape', radius: 24, fill: C.brass, park: 'b' } as const
const STAT = { kind: 'text', text: '', px: 72, weight: 700, color: C.ivory, face: 'heading', lh: 1, spc: -1 } as const
const STAT_LABEL = { kind: 'text', text: '', px: 26, weight: 500, color: C.sage, lh: 1.35 } as const
const PTS = { kind: 'text', text: '', px: 38, weight: 700, color: C.ivory, face: 'heading', lh: 1, align: 'ctr' } as const
const PTL = { kind: 'text', text: '', px: 24, weight: 500, color: C.sage, lh: 1.2, align: 'ctr' } as const

export const BIZ_ANNUAL = authored(
  {
    id: 'biz-annual', category: 'business', name: 'Annual Report', tagline: 'A printed annual report that moves',
    description: 'A quietly luxurious annual report in deep forest green and brass: tall architectural photographs trade widths like an accordion, giant serif numerals count from one chapter to the next, and the same brass shapes become bars, a stacked column and a line of dots for the financial results.',
    audience: 'The Annual Report template suits annual and integrated reports, investor updates, board and shareholder presentations, quarterly and half-year reviews, financial results, corporate overviews, ESG and sustainability reports and any institutional story that needs to feel established and trustworthy.',
    topics: ['annual report', 'financial results', 'investor update', 'investor relations', 'corporate', 'quarterly review', 'board report', 'board meeting', 'shareholders', 'shareholder letter', 'esg', 'sustainability report', 'company overview', 'financial highlights', 'earnings', 'fiscal year', 'year in review', 'ceo letter', 'revenue', 'governance', 'corporate responsibility', 'business review', 'outlook'],
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    colors: { background: C.bg, surface: '#17382F', textPrimary: C.ivory, textSecondary: C.mute, primary: C.brass, secondary: C.sage, accent: C.brass, onPrimary: C.bg },
    background: C.bg,
  },
  {
    objects: {
      // the accordion: four tall photographs; each scene gives them new widths, so each crop changes
      p1: { kind: 'image', art: 'annual-glass.webp', alt: 'Looking up the glass and concrete facade of an office tower', fit: 'cover' },
      v1: { kind: 'shape', fill: C.bg },
      p2: { kind: 'image', art: 'annual-atrium.webp', alt: 'A tall atrium with white balconies, trees and a skylight', fit: 'cover' },
      v2: { kind: 'shape', fill: C.bg },
      p3: { kind: 'image', art: 'annual-tower.webp', alt: 'A green-roofed office tower at golden hour', fit: 'cover' },
      v3: { kind: 'shape', fill: C.bg },
      p4: { kind: 'image', art: 'annual-canopy.webp', alt: 'Looking up into a misty forest canopy', fit: 'cover' },
      v4: { kind: 'shape', fill: C.bg },
      // the brass shapes: bars, then one stacked column, then dots
      base: { kind: 'shape', fill: C.ivory, park: 'l' },
      ls1: { kind: 'shape', fill: C.brass }, ls2: { kind: 'shape', fill: C.brass }, ls3: { kind: 'shape', fill: C.brass }, ls4: { kind: 'shape', fill: C.brass },
      b1: SHAPE, b2: SHAPE, b3: SHAPE, b4: SHAPE, b5: SHAPE,
      // header chrome
      tlTrack: { kind: 'shape', fill: C.sage }, tlFill: { kind: 'shape', fill: C.brass }, tlDot: { kind: 'shape', shape: 'ellipse', fill: C.brass },
      ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`tk${i + 1}`, { kind: 'shape', fill: C.sage }])),
      rule: { kind: 'shape', fill: C.brass },
      brand: { kind: 'text', text: 'NORTHFIELD', px: 22, weight: 700, color: C.ivory, caps: true, spc: 6 },
      page: { kind: 'text', text: 'Annual Report  ·  Fiscal 2026', px: 22, weight: 500, color: C.sage, align: 'r' },
      ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`ty${i + 1}`, { kind: 'text', text: String(2021 + i), px: 22, weight: 500, color: C.sage, align: 'ctr' }])),
      // story
      kick: { kind: 'text', text: '', px: 24, weight: 600, color: C.brass, caps: true, spc: 5 },
      title: { kind: 'text', text: '', px: 72, weight: 700, color: C.ivory, face: 'heading', lh: 1.05, spc: -0.5 },
      body: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.45 },
      num: { kind: 'text', text: '', px: 300, weight: 700, color: C.ivory, face: 'heading', lh: 0.9, spc: -6 },
      numLabel: { kind: 'text', text: '', px: 30, weight: 500, color: C.mute, lh: 1.35 },
      listNo: { kind: 'text', text: '', px: 30, weight: 600, color: C.brass, lh: 2.2, spc: 2 },
      list: { kind: 'text', text: '', px: 42, weight: 700, color: C.ivory, face: 'heading', lh: 1.57 },
      quote: { kind: 'text', text: '', px: 46, weight: 400, color: C.ivory, face: 'heading', italic: true, lh: 1.25 },
      sign: { kind: 'text', text: '', px: 28, weight: 600, color: C.brass, lh: 1.35 },
      st1: STAT, st2: STAT, st3: STAT, sl1: STAT_LABEL, sl2: STAT_LABEL, sl3: STAT_LABEL,
      v1t: PTS, v2t: PTS, v3t: PTS, v4t: PTS, v5t: PTS, l1: PTL, l2: PTL, l3: PTL, l4: PTL, l5: PTL,
      g1: { kind: 'text', text: '', px: 30, weight: 500, color: C.ivory, lh: 1.2 }, g2: { kind: 'text', text: '', px: 30, weight: 500, color: C.ivory, lh: 1.2 },
      g3: { kind: 'text', text: '', px: 30, weight: 500, color: C.ivory, lh: 1.2 }, g4: { kind: 'text', text: '', px: 30, weight: 500, color: C.ivory, lh: 1.2 },
    },
    order: ['base', 'ls1', 'ls2', 'ls3', 'ls4', 'b1', 'b2', 'b3', 'b4', 'b5', 'p1', 'v1', 'p2', 'v2', 'p3', 'v3', 'p4', 'v4',
      'tlTrack', 'tlFill', 'tk1', 'tk2', 'tk3', 'tk4', 'tk5', 'tk6', 'tlDot', 'rule',
      'brand', 'page', 'ty1', 'ty2', 'ty3', 'ty4', 'ty5', 'ty6',
      'kick', 'title', 'body', 'num', 'numLabel', 'listNo', 'list', 'quote', 'sign', 'st1', 'sl1', 'st2', 'sl2', 'st3', 'sl3',
      'v1t', 'v2t', 'v3t', 'v4t', 'v5t', 'l1', 'l2', 'l3', 'l4', 'l5', 'g1', 'g2', 'g3', 'g4'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening: four slim photographs stand side by side on the right, the year as a giant numeral on the left.', bg: C.bg,
        place: {
          ...pan(960, [208, 208, 208, 208], [0.12, 0.12, 0.12, 0.12]), ...header(1), rule: rule(80),
          kick: { ...rect(80, 160, 780, 36), text: 'Fiscal year report' }, title: { ...rect(80, 225, 820, 270), text: 'Annual\nReport', px: 128 },
          num: { ...rect(70, 590, 800, 280), text: '2026' }, numLabel: { ...rect(80, 890, 780, 40), text: 'Northfield Group  ·  sample company, sample figures', px: 28 },
        },
      },
      {
        id: 's2', title: 'Contents', purpose: 'The first photograph opens wide; the numeral drops to the bottom right and the six chapters are listed.', bg: C.bg,
        place: {
          ...pan(80, [520, 120, 120, 120], [0.05, 0.4, 0.4, 0.4]), ...header(2), rule: rule(1100),
          kick: { ...rect(1100, 160, 700, 36), text: 'Contents' }, title: { ...rect(1100, 205, 740, 80), text: 'Inside this report', px: 64 },
          listNo: { ...rect(1100, 330, 80, 400), text: '01\n02\n03\n04\n05\n06' }, list: { ...rect(1190, 330, 650, 400), text: 'Letter from the CEO\nThe year in numbers\nGrowth by region\nFinancial highlights\nSustainability\nPeople and outlook' },
          num: { ...rect(1090, 760, 340, 260), text: '06', px: 240 }, numLabel: { ...rect(1440, 890, 400, 40), text: 'chapters to read', px: 30 },
        },
      },
      {
        id: 's3', title: 'Letter from the CEO', purpose: 'The first photograph swaps to hands on a blueprint and opens wider; the CEO letter sits beside it.', bg: C.bg,
        place: {
          ...pan(80, [700, 110, 110, 110], [0.05, 0.4, 0.4, 0.4], { 1: 'annual-blueprint.webp' }), ...header(3), rule: rule(1260),
          kick: { ...rect(1260, 160, 580, 36), text: 'Letter from the CEO' }, num: { ...rect(1250, 200, 590, 220), text: '01', px: 240 },
          quote: { ...rect(1260, 445, 580, 215), text: 'Discipline, patience and trust carried us through a year of change.' },
          body: { ...rect(1260, 690, 580, 170), text: 'Our teams delivered record results while investing in the people, buildings and landscapes we will rely on for the next decade.', px: 28 },
          sign: { ...rect(1260, 880, 580, 80), text: 'Eleanor Whitfield\nChief Executive Officer' },
        },
      },
      {
        id: 's4', title: 'The year in numbers', purpose: 'The photographs compress to slim strips on the right; one giant figure and three supporting numbers take the space.', bg: C.bg,
        place: {
          ...pan(1392, [100, 100, 100, 100], [0.2, 0.2, 0.2, 0.2]), ...header(4), rule: rule(80),
          kick: { ...rect(80, 160, 900, 36), text: 'The year in numbers  ·  sample figures' }, num: { ...rect(70, 205, 1250, 290), text: '$4.8B', px: 320 },
          numLabel: { ...rect(80, 548, 1100, 100), text: 'Revenue for the year, up 9% on the year before', px: 36 },
          st1: { ...rect(80, 690, 380, 90), text: '12.4%' }, sl1: { ...rect(80, 790, 360, 70), text: 'Operating margin, up from 11.6%' },
          st2: { ...rect(500, 690, 380, 90), text: '38,200' }, sl2: { ...rect(500, 790, 360, 70), text: 'Colleagues around the world' },
          st3: { ...rect(920, 690, 380, 90), text: '46' }, sl3: { ...rect(920, 790, 360, 70), text: 'Countries where we serve clients' },
        },
      },
      {
        id: 's5', title: 'Growth by region', purpose: 'The numbers fall away and four brass bars rise from a baseline, one for each region.', bg: C.bg,
        place: {
          ...pan(1536, [64, 64, 64, 64], [0.3, 0.3, 0.3, 0.3]), ...header(5), rule: rule(80),
          kick: { ...rect(80, 160, 600, 36), text: 'Growth by region' }, title: { ...rect(80, 215, 620, 210), text: 'Every region\ngrew, led by\nAsia-Pacific', px: 60 },
          body: { ...rect(80, 470, 580, 160), text: 'Revenue growth by region, year on year, in percent. Sample figures for illustration only.', px: 28 },
          num: { ...rect(70, 660, 620, 150), text: '12.7%', px: 150 }, numLabel: { ...rect(80, 832, 580, 80), text: 'Asia-Pacific, the fastest growing region', px: 30 },
          base: rect(700, 900, 760, 2, { a: 0.4 }),
          b1: bar(REG[0]!.cx, REG[0]!.g * 40), b2: bar(REG[1]!.cx, REG[1]!.g * 40), b3: bar(REG[2]!.cx, REG[2]!.g * 40), b4: bar(REG[3]!.cx, REG[3]!.g * 40),
          v1t: regValue(0, '+8.4%'), v2t: regValue(1, '+5.1%'), v3t: regValue(2, '+12.7%'), v4t: regValue(3, '+9.6%'),
          l1: regLabel(0, 'Americas'), l2: regLabel(1, 'Europe'), l3: regLabel(2, 'Asia-Pacific'), l4: regLabel(3, 'Middle East\n& Africa'),
        },
      },
      {
        id: 's6', title: 'Financial highlights', purpose: 'The photographs slide to the left edge; the four bars merge into one stacked column showing revenue by segment.', bg: C.bg,
        place: {
          ...pan(80, [64, 64, 64, 64], [0.3, 0.3, 0.3, 0.3]), ...header(6), rule: rule(520),
          kick: { ...rect(520, 160, 800, 36), text: 'Financial highlights  ·  sample figures' }, title: { ...rect(520, 212, 800, 70), text: 'Where revenue comes from', px: 52 },
          base: rect(500, 904, 800, 2, { a: 0.4 }),
          b1: seg(STACK[0]!.y, STACK[0]!.h, STACK[0]!.fill), b2: seg(STACK[1]!.y, STACK[1]!.h, STACK[1]!.fill), b3: seg(STACK[2]!.y, STACK[2]!.h, STACK[2]!.fill), b4: seg(STACK[3]!.y, STACK[3]!.h, STACK[3]!.fill),
          ...Object.fromEntries(STACK.flatMap((s, i) => [[`v${i + 1}t`, { ...rect(780, s.y + s.h / 2 - 25, 140, 50), text: s.pct }], [`g${i + 1}`, { ...rect(950, s.y + s.h / 2 - 18, 380, 40), text: s.name }]])),
          num: { ...rect(1370, 165, 470, 230), text: '9%', px: 240 }, numLabel: { ...rect(1380, 432, 460, 90), text: 'Revenue growth across all four segments', px: 28 },
          st1: { ...rect(1380, 560, 460, 90), text: '$612M', px: 72 }, sl1: { ...rect(1380, 652, 460, 40), text: 'Operating profit' },
          st2: { ...rect(1380, 750, 460, 90), text: '$1.9B', px: 72 }, sl2: { ...rect(1380, 842, 460, 40), text: 'Cash generated' },
        },
      },
      {
        id: 's7', title: 'Five-year trend', purpose: 'The stacked column breaks into five brass dots on a line: five years of revenue.', bg: C.bg,
        place: {
          ...pan(1536, [64, 64, 64, 64], [0.3, 0.3, 0.3, 0.3]), ...header(7), rule: rule(80),
          kick: { ...rect(80, 160, 800, 36), text: 'Revenue, billions  ·  sample figures' }, title: { ...rect(80, 205, 760, 130), text: 'Five years of\nsteady growth', px: 56 },
          num: { ...rect(870, 150, 620, 220), text: '+37%', px: 240 }, numLabel: { ...rect(880, 425, 600, 40), text: 'revenue growth since 2022', px: 28 },
          base: rect(120, 900, 1360, 2, { a: 0.4 }),
          b1: dot(...pts[0]!), b2: dot(...pts[1]!), b3: dot(...pts[2]!), b4: dot(...pts[3]!), b5: dot(...pts[4]!),
          ls1: link(pts[0]!, pts[1]!), ls2: link(pts[1]!, pts[2]!), ls3: link(pts[2]!, pts[3]!), ls4: link(pts[3]!, pts[4]!),
          ...Object.fromEntries(YEARS.flatMap((d, i) => [[`v${i + 1}t`, { ...rect(pts[i]![0] - 90, pts[i]![1] - 24 - 66, 180, 50), text: `$${d.v.toFixed(1)}B` }], [`l${i + 1}`, { ...rect(pts[i]![0] - 90, 920, 180, 36), text: d.y, px: 28 }]])),
        },
      },
      {
        id: 's8', title: 'Chapter: Sustainability', purpose: 'The last photograph opens from its strip to the full slide and becomes the chapter opener.', bg: C.bg,
        place: {
          ...pan(1536, [64, 64, 64, 64], [0.3, 0.3, 0.3, 0.3], { 4: 'annual-forest.webp' }), p4: { ...full(), art: 'annual-forest.webp' }, v4: full({ a: 0.55 }), ...header(8), rule: rule(80),
          kick: { ...rect(80, 160, 700, 36), text: 'Chapter five' }, num: { ...rect(70, 195, 800, 400), text: '05', px: 420 },
          title: { ...rect(80, 635, 1200, 240), text: 'Growing\nresponsibly', px: 112 }, numLabel: { ...rect(80, 895, 1000, 50), text: 'Sustainability and the environment', px: 34 },
        },
      },
      {
        id: 's9', title: 'Sustainability', purpose: 'The forest shrinks back to a tall panel on the right; emissions fall as one giant figure with three supporting results.', bg: C.bg,
        place: {
          ...pan(944, [96, 96, 96, 560], [0.4, 0.4, 0.4, 0.05]), ...header(9), rule: rule(80),
          kick: { ...rect(80, 160, 700, 36), text: 'Sustainability' }, title: { ...rect(80, 205, 780, 160), text: 'Growing\nresponsibly', px: 72 },
          num: { ...rect(70, 395, 800, 280), text: '46%', px: 300 }, numLabel: { ...rect(80, 715, 780, 90), text: 'less carbon than in 2019, ahead of plan', px: 30 },
          st1: { ...rect(80, 810, 250, 70), text: '100%', px: 60 }, sl1: { ...rect(80, 885, 240, 70), text: 'renewable electricity' },
          st2: { ...rect(350, 810, 250, 70), text: '62%', px: 60 }, sl2: { ...rect(350, 885, 240, 70), text: 'of waste recycled' },
          st3: { ...rect(620, 810, 250, 70), text: '3.1M', px: 60 }, sl3: { ...rect(620, 885, 240, 70), text: 'trees planted' },
        },
      },
      {
        id: 's10', title: 'People', purpose: 'The set slides to the left and the second photograph opens, swapped to a calm workspace; the headcount becomes the giant numeral.', bg: C.bg,
        place: {
          ...pan(80, [96, 560, 96, 96], [0.4, 0.05, 0.4, 0.4], { 2: 'annual-workspace.webp' }), ...header(10), rule: rule(1060),
          kick: { ...rect(1060, 160, 700, 36), text: 'People' }, title: { ...rect(1060, 205, 780, 160), text: 'The people behind\nthe results', px: 68 },
          num: { ...rect(1050, 405, 790, 210), text: '38,200', px: 230 }, numLabel: { ...rect(1060, 668, 780, 50), text: 'colleagues in 46 countries', px: 30 },
          st1: { ...rect(1060, 760, 240, 70), text: '94%', px: 60 }, sl1: { ...rect(1060, 835, 230, 100), text: 'would recommend us as a place to work' },
          st2: { ...rect(1330, 760, 240, 70), text: '41%', px: 60 }, sl2: { ...rect(1330, 835, 230, 100), text: 'women in senior leadership' },
          st3: { ...rect(1600, 760, 240, 70), text: '62 hrs', px: 60 }, sl3: { ...rect(1600, 835, 230, 100), text: 'of learning per person' },
        },
      },
      {
        id: 's11', title: 'Outlook', purpose: 'The set slides back to the right; the third photograph opens to the skyline and the numeral turns to the next year.', bg: C.bg,
        place: {
          ...pan(944, [96, 96, 560, 96], [0.4, 0.4, 0.05, 0.4], { 3: 'annual-skyline.webp' }), ...header(11), rule: rule(80),
          kick: { ...rect(80, 160, 700, 36), text: 'Outlook' }, title: { ...rect(80, 205, 780, 160), text: 'Building on\nstrong ground', px: 72 },
          num: { ...rect(70, 395, 800, 280), text: '2027', px: 300 }, numLabel: { ...rect(80, 715, 780, 50), text: 'priorities for the year ahead (sample targets)', px: 28 },
          st1: { ...rect(80, 790, 250, 70), text: '+8%', px: 60 }, sl1: { ...rect(80, 865, 240, 100), text: 'revenue growth target' },
          st2: { ...rect(350, 790, 250, 70), text: '14%', px: 60 }, sl2: { ...rect(350, 865, 240, 100), text: 'operating margin ambition' },
          st3: { ...rect(620, 790, 250, 70), text: '-20%', px: 60 }, sl3: { ...rect(620, 865, 240, 100), text: 'further cut in emissions' },
        },
      },
      {
        id: 's12', title: 'Thank you', purpose: 'The four slim photographs return to the right, as on the cover, with a thank-you and contact details.', bg: C.bg,
        place: {
          ...pan(960, [208, 208, 208, 208], [0.12, 0.12, 0.12, 0.12]), ...header(12), rule: rule(80),
          kick: { ...rect(80, 160, 780, 36), text: 'Thank you' }, title: { ...rect(80, 225, 820, 270), text: 'Thank\nyou', px: 128 },
          body: { ...rect(80, 540, 800, 100), text: 'Our next report publishes in March.\ninvestors@northfield.example', px: 30 },
          num: { ...rect(70, 665, 800, 280), text: '2027', px: 300 },
        },
      },
    ],
  },
)
void at
