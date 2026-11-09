import { authored, rect, full, at, W } from '../author'
import type { Place } from '../author'

/**
 * Billboard Campaign: a loud summer-campaign deck built like a street poster. One giant word (Anton, 300-700 px) is the set design: it travels, scales, turns on its side and re-colours from
 * scene to scene while two ticker bands of repeated words slide behind it in opposite directions. Starbursts pop in rotated and swing to new corners, cut-out products (a can, a bottle and
 * a cup, each with a hard offset shadow) bounce between scenes, hard-edged colour blocks slide in from the sides, a sun grows from a point into the next colour (iris), and the same four
 * white cards become persona tiles, product cards, channel cards, timeline phases, budget segments and KPI tiles. Original choreography for SlidesDone.
 */
const C = { y: '#FFD60A', p: '#FF2E93', b: '#2D5BFF', t: '#FF4B2B', k: '#0D0D0D', w: '#FFFFFF', cream: '#FFF1A6' }
const AR = { can: 0.55, can2: 0.55, bottle: 0.42, cup: 0.76 } as const
type Prod = keyof typeof AR

/** a product centred at cx, cy with height h, and its hard offset shadow */
const pr = (id: Prod, cx: number, cy: number, h: number, rot = 0): Record<string, Place> => {
  const w = h * AR[id]
  return { [id]: { x: cx - w / 2, y: cy - h / 2, w, h, rot }, [`sh_${id}`]: { x: cx - w / 2 + Math.round(h * 0.03), y: cy - h / 2 + Math.round(h * 0.04), w, h, rot } }
}
/** a starburst sticker (with its hard shadow and its words) centred at cx, cy */
const stk = (k: 'stA' | 'stB' | 'stC', cx: number, cy: number, d: number, rot: number, text: string, px: number): Record<string, Place> => ({
  [k]: { x: cx - d / 2, y: cy - d / 2, w: d, h: d, rot },
  [`${k}s`]: { x: cx - d / 2 + Math.round(d * 0.05), y: cy - d / 2 + Math.round(d * 0.06), w: d, h: d, rot },
  [`${k}t`]: { x: cx - d * 0.36, y: cy - d * 0.36, w: d * 0.72, h: d * 0.72, rot, text, px },
})
/** the giant campaign word in one of four colours: only that colour shows, the others sit at the same place invisible (so a re-colour is a cross-dissolve) */
const BIG = (c: 'K' | 'P' | 'W' | 'B', p: Place): Record<string, Place> => Object.fromEntries((['K', 'P', 'W', 'B'] as const).map((k) => [`big${k}`, at(p, { a: k === c ? p.a ?? 1 : 0 })]))
/** a card with its hard shadow */
const card = (i: number, x: number, y: number, w: number, h: number, fill = C.w): Record<string, Place> => ({ [`cd${i}`]: { x, y, w, h, fill }, [`sd${i}`]: { x: x + 16, y: y + 20, w, h } })
/** the words of a card: a name or number on top, a line of body below, relative to the card */
const ctext = (i: number, x: number, y: number, w: number, name: string, body: string, o: { npx?: number; nh?: number; ny?: number; by?: number; bh?: number; bpx?: number; pad?: number } = {}): Record<string, Place> => {
  const pad = o.pad ?? 36
  return {
    [`cn${i}`]: { x: x + pad, y: y + (o.ny ?? 30), w: w - pad - 20, h: o.nh ?? 70, text: name, px: o.npx ?? 52 },
    [`cb${i}`]: { x: x + pad, y: y + (o.by ?? 110), w: w - pad - 24, h: o.bh ?? 180, text: body, px: o.bpx ?? 28 },
  }
}
const star = (n = 14, inner = 0.84): number[][] => Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? inner : 1; const a = (Math.PI * i) / n - Math.PI / 2; return [0.5 + 0.5 * r * Math.cos(a), 0.5 + 0.5 * r * Math.sin(a)] })
const HEAD = { brand: rect(80, 44, 500, 30), page: rect(1240, 44, 600, 30) }
/** the two ticker bands at step i (they travel opposite ways), on a given row */
const ticks = (i: number): Record<string, Place> => ({
  band1: rect(0, 900, W, 180), band2: rect(0, 900, W, 180), tk1: rect(-200 * i, 912, 12000, 75, { px: 62 }), tk2: rect(-2200 + 200 * i, 992, 12000, 75, { px: 62 }),
})
/** the cover and the closing: the band splits in two (top and bottom) and the tickers get big */
const ticksBig = (i: number): Record<string, Place> => ({
  band1: rect(0, 92, W, 130), band2: rect(0, 920, W, 160), tk1: rect(-200 * i, 103, 12000, 108, { px: 90 }), tk2: rect(-2200 + 200 * i, 945, 12000, 108, { px: 90 }),
})
const HT = { ht: full({ a: 0.25 }) }
const SUN_FULL = rect(-640, -1060, 3200, 3200)
const rep = (s: string, n: number) => Array(n).fill(s).join('')
const SHADOW = (r: number) => ({ kind: 'shape' as const, radius: r, fill: C.k, park: 'b' as const })
const STAR_POLY = star()

const text = (px: number, o: Record<string, unknown> = {}) => ({ kind: 'text' as const, text: '', px, weight: 700, color: C.k, ...o })
const anton = (px: number, o: Record<string, unknown> = {}) => text(px, { face: 'heading', weight: 400, caps: true, spc: 2, lh: 1.02, ...o })

export const MKT_BILLBOARD = authored(
  {
    id: 'mkt-billboard', category: 'marketing', name: 'Billboard Campaign', tagline: 'One giant word, stickers and products that pop',
    description: 'A loud, light marketing deck built like a street poster: one giant campaign word travels from slide to slide, stickers pop in and swing to new corners, products bounce between scenes with hard shadows, and colour blocks slide in from the sides. Objective, audience, big idea, products, offer, channels, timeline, budget and KPIs, ending on a call to action.',
    audience: 'The Billboard Campaign template suits marketing campaign plans, brand launches, product promotions, agency pitches and creative briefs, social media and advertising plans, media plans and seasonal offers, for teams who want a bold, confident, poster-style presentation.',
    topics: ['marketing campaign', 'campaign plan', 'advertising', 'ad campaign', 'social media campaign', 'brand launch', 'product launch', 'promotion', 'promotional offer', 'media plan', 'creative brief', 'agency pitch', 'summer campaign', 'seasonal campaign', 'brand awareness', 'billboard', 'outdoor advertising', 'influencer marketing', 'go to market', 'consumer brand', 'drinks', 'retail'],
    fonts: { heading: 'Anton', body: 'DM Sans' },
    colors: { background: '#FFD60A', surface: '#FFFFFF', textPrimary: '#0D0D0D', textSecondary: '#3A3A3A', primary: '#FF2E93', secondary: '#2D5BFF', accent: '#FF4B2B', onPrimary: '#0D0D0D' },
    background: '#FFD60A',
  },
  {
    objects: {
      blkL: { kind: 'shape', fill: C.p, park: 'l' }, blkR: { kind: 'shape', fill: C.b, park: 'r' },
      sun: { kind: 'shape', shape: 'ellipse', fill: C.t, park: 't' },
      ht: { kind: 'image', art: 'bill-halftone.webp', alt: 'A white halftone dot pattern', fit: 'cover' },
      band1: { kind: 'shape', fill: C.k, park: 't' }, band2: { kind: 'shape', fill: C.k, park: 'b' },
      tk1: anton(110, { text: rep('SUMMER POP   ', 14), color: C.w, spc: 3 }), tk2: anton(110, { text: rep('FIZZLE SODA   NEW   ICE COLD   ', 6), color: C.y, spc: 3 }),
      bigK: anton(600, { color: C.k, text: 'POP', spc: 4, lh: 1, align: 'ctr', park: 't' }), bigP: anton(600, { color: C.p, text: 'POP', spc: 4, lh: 1, align: 'ctr', park: 't' }),
      bigW: anton(600, { color: C.w, text: 'POP', spc: 4, lh: 1, align: 'ctr', park: 't' }), bigB: anton(600, { color: C.b, text: 'POP', spc: 4, lh: 1, align: 'ctr', park: 't' }),
      ln: { kind: 'shape', radius: 6, fill: C.k, park: 'l' },
      bubs: { ...SHADOW(50), park: 'r' }, bub: { kind: 'shape', radius: 50, fill: C.p, park: 'r' }, bubT: { kind: 'shape', shape: 'triangle', fill: C.p, park: 'r' },
      sd1: SHADOW(56), sd2: SHADOW(56), sd3: SHADOW(56), sd4: SHADOW(56),
      cd1: { kind: 'shape', radius: 56, fill: C.w, park: 'b' }, cd2: { kind: 'shape', radius: 56, fill: C.w, park: 'b' }, cd3: { kind: 'shape', radius: 56, fill: C.w, park: 'b' }, cd4: { kind: 'shape', radius: 56, fill: C.w, park: 'b' },
      dt1: { kind: 'shape', shape: 'ellipse', fill: C.p, stroke: C.k, strokeW: 5, park: 't' }, dt2: { kind: 'shape', shape: 'ellipse', fill: C.t, stroke: C.k, strokeW: 5, park: 't' },
      dt3: { kind: 'shape', shape: 'ellipse', fill: C.b, stroke: C.k, strokeW: 5, park: 't' }, dt4: { kind: 'shape', shape: 'ellipse', fill: C.y, stroke: C.k, strokeW: 5, park: 't' },
      cn1: anton(52, { park: 'b' }), cn2: anton(52, { park: 'b' }), cn3: anton(52, { park: 'b' }), cn4: anton(52, { park: 'b' }),
      cb1: text(28, { weight: 500, lh: 1.4, park: 'b' }), cb2: text(28, { weight: 500, lh: 1.4, park: 'b' }), cb3: text(28, { weight: 500, lh: 1.4, park: 'b' }), cb4: text(28, { weight: 500, lh: 1.4, park: 'b' }),
      sh_can: { ...SHADOW(54), park: 'b' }, sh_can2: { ...SHADOW(54), park: 'b' }, sh_bottle: { ...SHADOW(70), park: 'b' }, sh_cup: { kind: 'shape', fill: C.k, poly: [[0.19, 0.23], [0.81, 0.23], [0.73, 1], [0.27, 1]], park: 'b' },
      can: { kind: 'image', art: 'bill-can.webp', alt: 'A tomato-red aluminium soda can', fit: 'contain', park: 'b' }, can2: { kind: 'image', art: 'bill-can2.webp', alt: 'An electric-blue aluminium soda can', fit: 'contain', park: 'b' },
      bottle: { kind: 'image', art: 'bill-bottle.webp', alt: 'A hot-pink aluminium drinks bottle', fit: 'contain', park: 'b' }, cup: { kind: 'image', art: 'bill-cup.webp', alt: 'An iced drink cup with a blue lid and straw', fit: 'contain', park: 'b' },
      tp1: { kind: 'image', art: 'bill-tape.webp', alt: 'A strip of masking tape', fit: 'contain', park: 't' }, tp2: { kind: 'image', art: 'bill-tape.webp', alt: 'A strip of masking tape', fit: 'contain', park: 't' },
      stAs: { kind: 'shape', poly: STAR_POLY, fill: C.k, park: 'l' }, stA: { kind: 'shape', poly: STAR_POLY, fill: C.p, park: 'l' }, stAt: anton(54, { align: 'ctr', anchor: 'ctr', lh: 1, spc: 1, park: 'l' }),
      stBs: { kind: 'shape', poly: STAR_POLY, fill: C.k, park: 'r' }, stB: { kind: 'shape', poly: STAR_POLY, fill: C.b, park: 'r' }, stBt: anton(54, { color: C.w, align: 'ctr', anchor: 'ctr', lh: 1, spc: 1, park: 'r' }),
      stCs: { kind: 'shape', poly: STAR_POLY, fill: C.k, park: 'r' }, stC: { kind: 'shape', poly: STAR_POLY, fill: C.t, park: 'r' }, stCt: anton(54, { align: 'ctr', anchor: 'ctr', lh: 1, spc: 1, park: 'r' }),
      pl1s: { kind: 'shape', radius: 60, fill: C.k, park: 'b' }, pl1: { kind: 'shape', radius: 60, fill: C.p, park: 'b' }, pl1t: text(28, { weight: 700, caps: true, spc: 3, align: 'ctr', anchor: 'ctr', park: 'b' }),
      brand: text(24, { text: 'FIZZLE SODA', caps: true, spc: 5 }), page: text(24, { text: 'Summer Pop campaign  ·  2027 plan', weight: 500, align: 'r' }),
      kick: text(28, { caps: true, spc: 5 }), kickC: text(28, { caps: true, spc: 5, align: 'ctr' }),
      title: anton(130), wtitle: anton(120, { color: C.w }),
      body: text(34, { weight: 500, lh: 1.4 }), bodyC: text(36, { weight: 500, lh: 1.4, align: 'ctr' }), wbody: text(32, { weight: 500, lh: 1.4, color: C.w }),
      stat: anton(330, { align: 'ctr', lh: 1, spc: 2 }), statLabel: text(32, { weight: 600, lh: 1.35, align: 'ctr' }),
      n1: anton(80, { color: C.b, park: 'l' }), n2: anton(80, { color: C.b, park: 'l' }), n3: anton(80, { color: C.b, park: 'l' }), n4: anton(80, { color: C.b, park: 'l' }), n5: anton(80, { color: C.b, park: 'l' }), n6: anton(80, { color: C.b, park: 'l' }),
      l1: text(44, { park: 'l' }), l2: text(44, { park: 'l' }), l3: text(44, { park: 'l' }), l4: text(44, { park: 'l' }), l5: text(44, { park: 'l' }), l6: text(44, { park: 'l' }),
      wk1: anton(44, { align: 'ctr', park: 't' }), wk2: anton(44, { align: 'ctr', park: 't' }), wk3: anton(44, { align: 'ctr', park: 't' }), wk4: anton(44, { align: 'ctr', park: 't' }),
      bubt: text(46, { align: 'ctr', anchor: 'ctr', lh: 1.25, park: 'r' }),
      contact: text(30, { weight: 600, lh: 1.5, park: 'b' }),
    },
    order: ['blkL', 'blkR', 'sun', 'ht', 'band1', 'band2', 'tk1', 'tk2', 'bigK', 'bigP', 'bigW', 'bigB', 'ln', 'dt1', 'dt2', 'dt3', 'dt4', 'bubs', 'bub', 'bubT',
      'sd1', 'sd2', 'sd3', 'sd4', 'cd1', 'cd2', 'cd3', 'cd4', 'cn1', 'cb1', 'cn2', 'cb2', 'cn3', 'cb3', 'cn4', 'cb4',
      'sh_can', 'sh_can2', 'sh_bottle', 'sh_cup', 'can', 'can2', 'bottle', 'cup', 'tp1', 'tp2',
      'stAs', 'stA', 'stAt', 'stBs', 'stB', 'stBt', 'stCs', 'stC', 'stCt', 'pl1s', 'pl1', 'pl1t',
      'brand', 'page', 'kick', 'kickC', 'title', 'wtitle', 'body', 'bodyC', 'wbody', 'stat', 'statLabel', 'n1', 'l1', 'n2', 'l2', 'n3', 'l3', 'n4', 'l4', 'n5', 'l5', 'n6', 'l6',
      'wk1', 'wk2', 'wk3', 'wk4', 'bubt', 'contact'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening poster: the giant word POP behind a can, a bottle and a cup, with the campaign name and a starburst.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticksBig(0), ...BIG('P', rect(210, 210, 1500, 600, { px: 600 })),
          ...pr('bottle', 650, 790, 500, -10), ...pr('can', 1000, 770, 580, 5), ...pr('cup', 1390, 800, 420, 9),
          ...stk('stA', 1680, 330, 340, 14, 'NEW\nFLAVOUR', 54),
          title: rect(80, 560, 480, 90, { text: 'FIZZLE SODA', px: 72 }), body: rect(80, 660, 440, 100, { text: 'Summer campaign plan, 2027', px: 32 }),
          pl1s: rect(96, 800, 420, 70), pl1: rect(80, 780, 420, 70), pl1t: rect(80, 780, 420, 70, { text: 'JUNE TO AUGUST' }),
        },
      },
      {
        id: 's2', title: 'Contents', purpose: 'A blue block slides in from the right with the title, the six parts of the plan list on the left and the can swings over the block.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(1), blkR: rect(1160, 110, 760, 970, { fill: C.b }), ...BIG('P', rect(1160, 655, 520, 240, { px: 240 })),
          ...pr('can2', 1750, 790, 400, -10), ...stk('stA', 1010, 720, 250, 12, '12\nWEEKS', 50),
          wtitle: rect(1230, 150, 600, 340, { text: 'SIX\nMOVES TO\nSUMMER', px: 108 }), wbody: rect(1230, 510, 560, 100, { text: 'From one big idea to a measurable launch in twelve weeks.' }),
          ...Object.fromEntries(['The objective', 'The audience', 'The big idea', 'Products and offer', 'Channels and timeline', 'Budget and KPIs'].flatMap((t, i) => [
            [`n${i + 1}`, rect(80, 170 + i * 118, 150, 90, { text: `0${i + 1}`, px: 84 })], [`l${i + 1}`, rect(250, 190 + i * 118, 780, 64, { text: t })]])),
        },
      },
      {
        id: 's3', title: 'Objective', purpose: 'A pink block slides in from the left with the target as a giant number, and the word POP sits in white beneath it while the can crosses to the right.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(2), blkL: rect(0, 110, 820, 970, { fill: C.p }), ...BIG('W', rect(40, 560, 740, 340, { px: 340, a: 0.9 })),
          ...pr('can', 1730, 560, 560, 8),
          stat: rect(30, 170, 760, 300, { text: '+25%', px: 270 }), statLabel: rect(110, 490, 600, 100, { text: 'unit sales against last summer (sample goal)' }),
          kick: rect(900, 160, 700, 36, { text: 'THE OBJECTIVE' }), title: rect(900, 210, 700, 250, { text: 'OWN THE\nSUMMER SHELF', px: 100 }),
          body: rect(900, 490, 610, 290, { text: 'Make Fizzle the first can young shoppers reach for. Lift sales by a quarter and take brand awareness from 18% to 30% by the end of August. All targets here are samples.' }),
        },
      },
      {
        id: 's4', title: 'Audience', purpose: 'The pink block leaves; three white tiles and a speech bubble introduce the audience while a small sun glows behind the cup.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(3), sun: rect(1480, 520, 330, 330, { fill: C.t }), ...pr('cup', 1650, 690, 480, -6),
          title: rect(80, 150, 900, 250, { text: "WHO WE'RE\nTALKING TO" }),
          ...card(1, 100, 450, 400, 340), ...card(2, 560, 450, 400, 340, C.p), ...card(3, 1020, 450, 400, 340),
          ...ctext(1, 100, 450, 400, '16-28', 'Students, first jobs and first flats.', { npx: 120, nh: 140, by: 190, bh: 130 }),
          ...ctext(2, 560, 450, 400, '3 IN 4', 'find new drinks on social first (sample).', { npx: 120, nh: 140, by: 190, bh: 130 }),
          ...ctext(3, 1020, 450, 400, '5X', 'a week they grab a cold drink in summer (sample).', { npx: 120, nh: 140, by: 190, bh: 130 }),
          bubs: rect(1056, 170, 770, 220), bub: rect(1040, 150, 770, 220), bubT: rect(1110, 362, 90, 80, { rot: 180 }),
          bubt: rect(1080, 175, 700, 170, { text: 'If it is not in my feed, it is not in my fridge.' }),
        },
      },
      {
        id: 's5', title: 'Big idea', purpose: 'The sun grows from a point behind the cup until it floods the slide pink, and the word POP fills it with a can and a cup on each side.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(4), sun: at(SUN_FULL, { fill: C.p }), ...BIG('K', rect(210, 160, 1500, 600, { px: 600 })),
          ...pr('can2', 230, 520, 520, -14), ...pr('cup', 1710, 560, 440, 10), ...stk('stB', 1500, 250, 300, 12, 'POP THE\nTAB', 52),
          kickC: rect(560, 110, 800, 36, { text: 'THE BIG IDEA' }), bodyC: rect(460, 770, 1000, 110, { text: 'Every can is a tiny celebration: one sound, one moment, one share.' }),
        },
      },
      {
        id: 's6', title: 'Line-up', purpose: 'The sun shrinks to a sticker corner; three white cards rise, each with a product popping out of it and taped on.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(5), sun: rect(1470, 70, 260, 260, { fill: C.t }),
          title: rect(80, 130, 1300, 130, { text: 'MEET THE LINE-UP', px: 110 }),
          ...card(1, 120, 330, 520, 520), ...card(2, 700, 330, 520, 520), ...card(3, 1280, 330, 520, 520),
          ...pr('can', 380, 445, 340, -6), ...pr('bottle', 960, 450, 350, 4), ...pr('cup', 1540, 445, 340, -5),
          tp1: rect(80, 330, 200, 54, { rot: -35 }), tp2: rect(1690, 330, 200, 54, { rot: 32 }),
          ...ctext(1, 120, 330, 520, 'BLOOD ORANGE', 'Bold citrus with a bitter-sweet finish. Zero sugar.', { ny: 335, by: 395, nh: 70 }),
          ...ctext(2, 700, 330, 520, 'PINK GUAVA', 'Juicy guava and a squeeze of lime in a slim bottle.', { ny: 335, by: 395, nh: 70 }),
          ...ctext(3, 1280, 330, 520, 'BLUE COCONUT', 'Iced coconut and blue citrus, served by the cup.', { ny: 335, by: 395, nh: 70 }),
          ...stk('stB', 1720, 215, 260, 10, '3\nFLAVOURS', 34),
        },
      },
      {
        id: 's7', title: 'Offer', purpose: 'A pink sun fills the middle with the launch offer as one huge line, the word POP turns on its side at the left, and a starburst swings in.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(6), sun: rect(540, 20, 1040, 1040, { fill: C.p }), ...BIG('K', rect(-160, 350, 700, 420, { px: 420, rot: -90 })),
          ...pr('can', 1710, 600, 600, 10), ...pr('bottle', 470, 840, 360, -12), ...stk('stC', 1430, 270, 300, 14, 'WEEK\nONE\nONLY', 48),
          kickC: rect(580, 250, 960, 40, { text: 'LAUNCH OFFER  ·  SAMPLE' }), stat: rect(560, 330, 1000, 330, { text: '2 FOR 1', px: 300 }),
          bodyC: rect(680, 700, 760, 110, { text: 'Buy one, get one free on any flavour. First 10,000 codes at checkout.', px: 34 }),
        },
      },
      {
        id: 's8', title: 'Channels', purpose: 'Four cards arrange into a grid on the right with the channels; the word POP drops to the lower left in pink.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(7), ...BIG('P', rect(70, 590, 760, 300, { px: 300 })),
          kick: rect(80, 150, 700, 36, { text: 'CHANNELS' }), title: rect(80, 200, 740, 280, { text: 'WHERE WE\nSHOW UP', px: 130 }),
          body: rect(80, 510, 680, 120, { text: 'Four channels, one idea. Every touchpoint ends with the same tab pop.' }),
          ...card(1, 860, 140, 470, 330, C.p), ...card(2, 1370, 140, 470, 330), ...card(3, 860, 510, 470, 330), ...card(4, 1370, 510, 470, 330, C.t),
          ...ctext(1, 860, 140, 470, 'SHORT VIDEO', 'Three 15-second spots a week on the feeds our crowd scrolls most.'),
          ...ctext(2, 1370, 140, 470, 'BILLBOARDS', 'Bold one-word posters at 40 city sites near campuses and transit.'),
          ...ctext(3, 860, 510, 470, 'CREATORS', 'Twenty creators open a can on camera and pass the tab to a friend.'),
          ...ctext(4, 1370, 510, 470, 'SAMPLING', 'Pop-up fridges at festivals, gyms and beaches, with a code on every can.'),
          tp1: rect(800, 130, 200, 54, { rot: -35 }), tp2: rect(1740, 800, 200, 54, { rot: -35 }),
        },
      },
      {
        id: 's9', title: 'Timeline', purpose: 'A line draws across the slide; four cards drop under it as the phases, with dots on the line and the bottle at the top right.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(8),
          title: rect(80, 130, 1300, 130, { text: '12 WEEKS, FOUR BEATS', px: 110 }), ...pr('bottle', 1730, 215, 270, 10),
          ln: rect(100, 475, 1720, 12),
          ...Object.fromEntries([0, 1, 2, 3].flatMap((i) => {
            const x = 100 + i * 440
            return [[`dt${i + 1}`, rect(x + 172, 453, 56, 56)], [`wk${i + 1}`, rect(x, 385, 400, 56, { text: ['WEEKS 1-3', 'WEEKS 4-6', 'WEEKS 7-10', 'WEEKS 11-12'][i]! })]]
          })),
          ...[0, 1, 2, 3].reduce<Record<string, Place>>((acc, i) => ({ ...acc, ...card(i + 1, 100 + i * 440, 560, 400, 290, [C.w, C.p, C.w, C.t][i]!) }), {}),
          ...ctext(1, 100, 560, 400, 'TEASE', 'Cryptic one-word posters and creator teasers.'), ...ctext(2, 540, 560, 400, 'LAUNCH', 'Billboards go live, the hero film drops, first codes out.'),
          ...ctext(3, 980, 560, 400, 'PEAK', 'Festival fridges, the creator challenge and daily posts.'), ...ctext(4, 1420, 560, 400, 'ECHO', 'Re-share fan videos and reward the best with merch.'),
        },
      },
      {
        id: 's10', title: 'Budget', purpose: 'The four cards slide together into one long bar whose widths are the budget split; the can stands under its end.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(9),
          title: rect(80, 140, 1500, 130, { text: 'WHERE THE MONEY GOES', px: 110 }), ...pr('can2', 1690, 830, 290, -8), ...stk('stA', 1700, 210, 250, 12, 'SAMPLE\nSPLIT', 42),
          ...card(1, 100, 330, 674, 360, C.p), ...card(2, 786, 330, 421, 360, C.t), ...card(3, 1219, 330, 337, 360), ...card(4, 1568, 330, 253, 360, C.cream),
          ...ctext(1, 100, 330, 674, '40%', 'Short video and creators', { npx: 130, nh: 150, by: 200, bh: 130, bpx: 32 }), ...ctext(2, 786, 330, 421, '25%', 'Billboards', { npx: 130, nh: 150, by: 200, bh: 130, bpx: 32 }),
          ...ctext(3, 1219, 330, 337, '20%', 'Sampling and retail', { npx: 130, nh: 150, by: 200, bh: 130, bpx: 32 }), ...ctext(4, 1568, 330, 253, '15%', 'Reserve', { npx: 100, nh: 150, by: 200, bh: 130, bpx: 32, pad: 24 }),
          body: rect(100, 740, 1300, 110, { text: 'A sample split of a $500K budget. Short video and creators lead because that is where our crowd already is.' }),
        },
      },
      {
        id: 's11', title: 'KPIs', purpose: 'A blue stripe sweeps across the slide and the four cards become KPI tiles on it.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticks(10), blkL: rect(0, 300, 1920, 520, { fill: C.b }), ...pr('cup', 1720, 195, 230, -8),
          title: rect(80, 140, 1500, 130, { text: 'WHAT SUCCESS LOOKS LIKE', px: 104 }),
          ...card(1, 100, 350, 400, 420), ...card(2, 540, 350, 400, 420, C.p), ...card(3, 980, 350, 400, 420), ...card(4, 1420, 350, 400, 420, C.t),
          ...ctext(1, 100, 350, 400, '10M', 'people reached across all channels (sample target)', { npx: 130, nh: 150, by: 210, bh: 170 }),
          ...ctext(2, 540, 350, 400, '4.5%', 'average engagement on short video (sample target)', { npx: 130, nh: 150, by: 210, bh: 170 }),
          ...ctext(3, 980, 350, 400, '250K', 'codes redeemed at the till (sample target)', { npx: 130, nh: 150, by: 210, bh: 170 }),
          ...ctext(4, 1420, 350, 400, '3.2X', 'return on every dollar of media (sample target)', { npx: 130, nh: 150, by: 210, bh: 170 }),
          body: rect(100, 835, 1400, 45, { text: 'Sample targets for planning: replace them with your own baselines.', px: 30 }),
        },
      },
      {
        id: 's12', title: 'Next step', purpose: 'The cover returns: the giant word POP again, the products swap places, and a button-like pill asks for the go-ahead.', bg: C.y,
        place: {
          ...HT, ...HEAD, ...ticksBig(11), ...BIG('B', rect(30, 215, 1500, 600, { px: 600 })),
          ...pr('cup', 290, 800, 420, -9), ...pr('can', 640, 770, 580, -4), ...pr('bottle', 1000, 790, 500, 8),
          ...stk('stA', 1700, 310, 320, -12, 'THANK\nYOU', 58),
          kick: rect(1300, 500, 540, 36, { text: 'NEXT STEP' }), body: rect(1300, 550, 540, 170, { text: 'Approve the plan and the budget, lock the media, and Fizzle goes live in June.', px: 32 }),
          contact: rect(1300, 730, 540, 80, { text: 'hello@fizzle.example\n@fizzlesoda' }),
          pl1s: rect(1316, 840, 540, 90), pl1: rect(1300, 820, 540, 90), pl1t: rect(1300, 820, 540, 90, { text: 'APPROVE THE CAMPAIGN' }),
        },
      },
    ],
  },
)
void W
