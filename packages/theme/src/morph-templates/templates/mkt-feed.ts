import { authored, at, rect } from '../author'
import type { Place, SceneDef } from '../author'

/**
 * Social Feed: a social media strategy deck where a PHONE is the stage. A feed of six post cards scrolls up through it one post per scene; the focused post grows out of the phone into
 * the slide (its picture becomes a half-slide hero) while the phone slides to the middle and shrinks. Story rings leave the phone and become the audience row, two phones compare
 * channels, the feed regroups into a content calendar, metric bubbles float up and settle into rounded bars, and in the end the feed folds into one large card with the call to action.
 * Original choreography for SlidesDone.
 */
const C = { violet: '#6C4DFF', coral: '#FF5C7A', ink: '#1B1730', mute: '#5B5675', white: '#FFFFFF', peach: '#FFD9C7', mint: '#CFF5E7', butter: '#FFF1B8', lav: '#E9E4FF', shadow: '#8E7FD8', screen: '#F4F1FF' }
const BC = ['#6C4DFF', '#FF5C7A', '#8FE0C2', '#FFDC5E', '#FFB799', '#6C4DFF'] // bubble fills
const NC = ['#FFFFFF', '#FFFFFF', '#1B1730', '#1B1730', '#1B1730', '#FFFFFF'] // their number colours

// ── the phone: 460 x 920 in its own units, scaled by s ──
interface Ph { x: number; y: number; s: number }
const phone = (k: 'A' | 'B', { x, y, s }: Ph, a = 1): Record<string, Place> => ({
  [`${k}sh`]: { x: x - 2 * s, y: y + 26 * s, w: 464 * s, h: 920 * s, radius: 74 * s, a: 0.3 * a },
  [`${k}bd`]: { x, y, w: 460 * s, h: 920 * s, radius: 70 * s, a },
  [`${k}sc`]: { x: x + 14 * s, y: y + 14 * s, w: 432 * s, h: 892 * s, radius: 58 * s, a },
  [`${k}nt`]: { x: x + 150 * s, y: y + 24 * s, w: 160 * s, h: 28 * s, radius: 14 * s, a },
})
const slot = (p: Ph, k: number): Place => ({ x: p.x + 30 * p.s, y: p.y + (158 + 368 * k) * p.s, w: 400 * p.s, h: 352 * p.s })

// ── a post card, built from shapes: picture, two caption bars, three reaction chips ──
const post = (i: number, b: Place, a = 1, sa = 0.26): Record<string, Place> => {
  const s = b.w / 400, { x, y, w, h } = b
  return {
    [`sh${i}`]: { x: x - 4 * s, y: y + 12 * s, w: w + 8 * s, h: h + 6 * s, radius: 32 * s, a: sa * a },
    [`c${i}`]: { x, y, w, h, radius: 28 * s, a },
    [`p${i}`]: { x: x + 12 * s, y: y + 12 * s, w: w - 24 * s, h: h - 126 * s, radius: 20 * s, a },
    [`la${i}`]: { x: x + 22 * s, y: y + h - 98 * s, w: 236 * s, h: 14 * s, radius: 7 * s, a },
    [`lb${i}`]: { x: x + 22 * s, y: y + h - 74 * s, w: 160 * s, h: 12 * s, radius: 6 * s, a },
    [`ka${i}`]: { x: x + 22 * s, y: y + h - 48 * s, w: 78 * s, h: 34 * s, radius: 17 * s, a },
    [`kd${i}`]: { x: x + 36 * s, y: y + h - 39 * s, w: 16 * s, h: 16 * s, radius: 8 * s, a },
    [`kb${i}`]: { x: x + 108 * s, y: y + h - 48 * s, w: 78 * s, h: 34 * s, radius: 17 * s, a },
    [`kc${i}`]: { x: x + 194 * s, y: y + h - 48 * s, w: 78 * s, h: 34 * s, radius: 17 * s, a },
  }
}
/** the whole column of six posts inside a phone: post `first` is in the top slot, the next one below; every other post waits, unseen, above or below. `own` places posts elsewhere */
const feed = (p: Ph, first: number, own: Record<number, Place | { box: Place; a?: number }> = {}): Record<string, Place> => {
  let out: Record<string, Place> = {}
  for (let i = 1; i <= 6; i++) {
    const o = own[i]
    if (o) { const box = 'box' in o ? o.box : o; out = { ...out, ...post(i, box, 'box' in o ? o.a ?? 1 : 1, 0.26) }; continue }
    const k = i - first
    const vis = k === 0 || k === 1
    out = { ...out, ...post(i, slot(p, k), vis ? 1 : 0, 0.12) }
  }
  return out
}

// ── story rings: gradient ring, white gap, a round picture ──
const ring = (i: number, cx: number, cy: number, d: number, a = 1): Record<string, Place> => ({
  [`rg${i}`]: { x: cx - d / 2, y: cy - d / 2, w: d, h: d, radius: d / 2, a },
  [`rw${i}`]: { x: cx - d * 0.44, y: cy - d * 0.44, w: d * 0.88, h: d * 0.88, radius: d * 0.44, a },
  [`av${i}`]: { x: cx - d * 0.37, y: cy - d * 0.37, w: d * 0.74, h: d * 0.74, radius: d * 0.37, a },
})
const stories = (p: Ph, a = 1): Record<string, Place> => Object.assign({}, ...[1, 2, 3, 4].map((i) => ring(i, p.x + (79 + 100 * (i - 1)) * p.s, p.y + 106 * p.s, 76 * p.s, a)))

// ── bubbles (circles that later become bars) and the number and label that sit in them ──
const bub = (i: number, cx: number, cy: number, d: number, extra: Partial<Place> = {}): Record<string, Place> => ({
  [`b${i}`]: { x: cx - d / 2, y: cy - d / 2, w: d, h: d, radius: d / 2, fill: BC[i - 1]!, ...extra },
  [`n${i}`]: { x: cx - d / 2, y: cy - d / 2, w: d, h: d, text: '', color: NC[i - 1]!, ...(extra.a !== undefined ? { a: extra.a } : {}) },
})
const num = (i: number, cx: number, cy: number, d: number, text: string, px: number): Place => ({ x: cx - d / 2, y: cy - px * 0.95, w: d, h: px * 1.2, text, px, color: NC[i - 1]! })
const lab = (i: number, cx: number, cy: number, d: number, text: string, px: number, color = NC[i - 1]!): Place => ({ x: cx - d / 2, y: cy + px * 0.35, w: d, h: 32, text, color })
/** a list row: a numbered bubble, a heading and a line under it */
const rowAt = (i: number, x: number, y: number, d: number, textX: number, textW: number, head: string, desc: string, descH: number, headPx = 36): Record<string, Place> => ({
  ...bub(i, x + d / 2, y + d / 2, d),
  [`n${i}`]: { x, y, w: d, h: d, text: String(i), px: d > 70 ? 38 : 34, color: NC[i - 1]! },
  [`rh${i}`]: { x: textX, y: y + 2, w: textW, h: headPx * 1.3, text: head, px: headPx },
  [`rd${i}`]: { x: textX, y: y + 2 + headPx * 1.3 + 4, w: textW, h: descH, text: desc },
})
const blobs = (b1: [number, number, number, string, number], b2: [number, number, number, string, number], b3: [number, number, number, string, number]): Record<string, Place> =>
  Object.fromEntries([b1, b2, b3].map(([cx, cy, d, fill, a], k) => [`bl${k + 1}`, { x: cx - d / 2, y: cy - d / 2, w: d, h: d, radius: d / 2, fill, a }]))

const PICS = ['feed-coffee', 'feed-smoothie', 'feed-sneaker', 'feed-desk', 'feed-plant', 'feed-tote']
const ALTS = ['A latte, a notebook and dried flowers on peach linen', 'A pink smoothie with berries on a yellow table', 'A pastel mint and lilac sneaker on a peach backdrop', 'A bright desk with tulips, a laptop and a mug', 'A green plant on a sunlit windowsill', 'A cotton tote bag on a park bench']
const AVS = ['feed-shades', 'feed-phone', 'feed-tote', 'feed-coffee']
const AVALT = ['Rose sunglasses on a pastel backdrop', 'A hand holding a phone with a blank screen', 'A cotton tote bag on a bench', 'A latte and a notebook']

const postObjects = () => {
  const o: Record<string, any> = {}
  const order: string[] = []
  for (let i = 1; i <= 6; i++) {
    Object.assign(o, {
      [`sh${i}`]: { kind: 'shape', radius: 32, fill: C.shadow }, [`c${i}`]: { kind: 'shape', radius: 28, fill: C.white },
      [`p${i}`]: { kind: 'image', art: `${PICS[i - 1]}.webp`, alt: ALTS[i - 1], fit: 'cover', radius: 20 },
      [`la${i}`]: { kind: 'shape', radius: 7, fill: '#CBC1F0' }, [`lb${i}`]: { kind: 'shape', radius: 6, fill: '#D2C9F3' },
      [`ka${i}`]: { kind: 'shape', radius: 17, fill: '#FFE0E6' }, [`kd${i}`]: { kind: 'shape', radius: 8, fill: C.coral },
      [`kb${i}`]: { kind: 'shape', radius: 17, fill: '#E4DDFF' }, [`kc${i}`]: { kind: 'shape', radius: 17, fill: '#D3F6EA' },
    })
    order.push(`sh${i}`, `c${i}`, `p${i}`, `la${i}`, `lb${i}`, `ka${i}`, `kd${i}`, `kb${i}`, `kc${i}`)
  }
  return { o, order }
}
const PO = postObjects()

const HEAD = { brand: rect(80, 44, 400, 34), page: rect(1160, 48, 680, 30) }
const CAL = { x0: 90, pitch: 353, w: 329, h: 320, y1: 310, y2: 654 }
const cellBox = (col: number, row: number): Place => rect(CAL.x0 + col * CAL.pitch, row ? CAL.y2 : CAL.y1, CAL.w, CAL.h)
const corner = (col: number, row: number): [number, number] => [CAL.x0 + col * CAL.pitch + CAL.w - 6, (row ? CAL.y2 : CAL.y1) + 8]

// ── the phones of each scene ──
const P_COVER: Ph = { x: 1290, y: 121, s: 0.95 }
const P_MID: Ph = { x: 741, y: 121, s: 0.95 }
const P_SIDE: Ph = { x: 790, y: 200, s: 0.74 }
const P_AUD: Ph = { x: 1560, y: 300, s: 0.6 }
const P_A: Ph = { x: 562, y: 272, s: 0.8 }
const P_B: Ph = { x: 990, y: 272, s: 0.8 }
const P_LEFT: Ph = { x: 100, y: 190, s: 0.78 }
const P_FOLD: Ph = { x: 937, y: 517, s: 0.05 }

/** the soft shadows take a tint that suits the colour of the scene */
const tint = (pl: Record<string, Place>, col: string): Record<string, Place> => Object.fromEntries(Object.entries(pl).map(([k, v]) => [k, /^(sh\d|Ash|Bsh)/.test(k) && v && !v.fill ? { ...v, fill: col } : v]))
const WARM = '#B58AD0', COOL = '#7F8FD8'
const ghost = (pl: Record<string, Place>): Record<string, Place> => Object.fromEntries(Object.entries(pl).map(([k, v]) => [k, { ...v, a: 0 }]))
const SEG: Record<string, Place> = {
  pc1: { ...rect(80, 640, 330, 70), text: '34%' }, sg1: { ...rect(80, 722, 330, 38), text: 'Home refreshers' }, sd1: { ...rect(80, 762, 330, 38), text: '25 to 34' },
  pc2: { ...rect(420, 640, 330, 70), text: '27%' }, sg2: { ...rect(420, 722, 330, 38), text: 'Young professionals' }, sd2: { ...rect(420, 762, 330, 38), text: '22 to 30' },
  pc3: { ...rect(760, 640, 330, 70), text: '21%' }, sg3: { ...rect(760, 722, 330, 38), text: 'Gift buyers' }, sd3: { ...rect(760, 762, 330, 38), text: '30 to 44' },
  pc4: { ...rect(1100, 640, 330, 70), text: '18%' }, sg4: { ...rect(1100, 722, 330, 38), text: 'First renters' }, sd4: { ...rect(1100, 762, 330, 38), text: '18 to 24' },
}
const CALSET: Record<string, Place> = {
  cal1: cellBox(1, 0), cal2: cellBox(4, 0), cal3: cellBox(0, 1), cal4: cellBox(3, 1),
  ct1: { ...cellBox(1, 0), text: 'Poll in stories' }, ct2: { ...cellBox(4, 0), text: 'Customer story' }, ct3: { ...cellBox(0, 1), text: 'Behind the scenes' }, ct4: { ...cellBox(3, 1), text: 'Live Q and A' },
  wd1: { ...rect(CAL.x0, 266, CAL.w, 30), text: 'Mon' }, wd2: { ...rect(CAL.x0 + CAL.pitch, 266, CAL.w, 30), text: 'Tue' }, wd3: { ...rect(CAL.x0 + 2 * CAL.pitch, 266, CAL.w, 30), text: 'Wed' },
  wd4: { ...rect(CAL.x0 + 3 * CAL.pitch, 266, CAL.w, 30), text: 'Thu' }, wd5: { ...rect(CAL.x0 + 4 * CAL.pitch, 266, CAL.w, 30), text: 'Fri' },
}
const TGT: Record<string, Place> = { tgl: rect(640, 539, 1120, 3, { a: 0.55 }), tgt: { ...rect(470, 515, 160, 28), text: '100% target' } }
const BIG_L = rect(80, 120, 640, 840)
const BIG_R = rect(1200, 120, 640, 840)

export const MKT_FEED = authored(
  {
    id: 'mkt-feed', category: 'marketing', name: 'Social Feed', tagline: 'A phone, a feed and a plan that moves',
    description: 'A social media strategy told on a phone: the feed scrolls from post to post while each one grows into a slide, story rings become the audience, two phones compare channels, the feed regroups into a content calendar, metric bubbles settle into bars and everything folds into one call to action.',
    audience: 'The Social Feed template suits social media strategies and plans, content calendars, brand awareness and community campaigns, Instagram and TikTok proposals, influencer and creator briefs, marketing reviews and agency pitches for lifestyle brands.',
    topics: ['social media', 'social media strategy', 'social media plan', 'social media marketing', 'content calendar', 'content strategy', 'content marketing', 'instagram', 'tiktok', 'facebook', 'linkedin', 'brand awareness', 'influencer', 'influencer marketing', 'community', 'community management', 'engagement', 'followers', 'audience', 'campaign', 'lifestyle brand', 'marketing plan', 'digital marketing', 'creator', 'reels', 'stories'],
    fonts: { heading: 'Poppins', body: 'Inter' },
    colors: { background: '#E9E4FF', surface: '#FFFFFF', textPrimary: '#1B1730', textSecondary: '#5B5675', primary: '#6C4DFF', secondary: '#FF5C7A', accent: '#FFDC5E', onPrimary: '#FFFFFF' },
    background: '#E9E4FF',
  },
  {
    objects: {
      bl1: { kind: 'shape', radius: 400, fill: '#FFFFFF' }, bl2: { kind: 'shape', radius: 400, fill: C.peach }, bl3: { kind: 'shape', radius: 400, fill: C.mint },
      Ash: { kind: 'shape', radius: 74, fill: C.shadow }, Abd: { kind: 'shape', radius: 70, fill: C.ink }, Asc: { kind: 'shape', radius: 58, fill: C.screen },
      Bsh: { kind: 'shape', radius: 74, fill: C.shadow }, Bbd: { kind: 'shape', radius: 70, fill: C.ink }, Bsc: { kind: 'shape', radius: 58, fill: C.screen },
      ...Object.fromEntries(Array.from({ length: 4 }, (_, k) => k + 1).flatMap((i) => [
        [`rg${i}`, { kind: 'shape', radius: 100, gradient: { from: C.coral, to: C.violet, angle: 135 } }], [`rw${i}`, { kind: 'shape', radius: 100, fill: C.white }],
        [`av${i}`, { kind: 'image', art: `${AVS[i - 1]}.webp`, alt: AVALT[i - 1], fit: 'cover', radius: 100 }],
      ])),
      ...PO.o,
      Ant: { kind: 'shape', radius: 14, fill: C.ink }, Bnt: { kind: 'shape', radius: 14, fill: C.ink },
      ...Object.fromEntries(Array.from({ length: 4 }, (_, k) => k + 1).map((i) => [`cal${i}`, { kind: 'shape', radius: 26, fill: [C.mint, C.butter, C.peach, '#DDD5FF'][i - 1] }])),
      ...Object.fromEntries(Array.from({ length: 4 }, (_, k) => k + 1).map((i) => [`ct${i}`, { kind: 'text', text: '', px: 28, weight: 700, color: C.ink, face: 'heading', align: 'ctr', anchor: 'ctr', lh: 1.15 }])),
      tgl: { kind: 'shape', radius: 2, fill: C.violet, park: 'l' },
      ...Object.fromEntries(Array.from({ length: 6 }, (_, k) => k + 1).flatMap((i) => [
        [`b${i}`, { kind: 'shape', radius: 40, fill: BC[i - 1] }],
        [`n${i}`, { kind: 'text', text: '', px: 36, weight: 700, color: NC[i - 1], face: 'heading', align: 'ctr', anchor: 'ctr', lh: 1 }],
        [`ml${i}`, { kind: 'text', text: '', px: 24, weight: 600, color: NC[i - 1], align: 'ctr', lh: 1.2 }],
        [`rh${i}`, { kind: 'text', text: '', px: 36, weight: 700, color: C.ink, face: 'heading', lh: 1.15 }],
        [`rd${i}`, { kind: 'text', text: '', px: 26, weight: 400, color: C.mute, lh: 1.4 }],
      ])),
      ...Object.fromEntries(Array.from({ length: 5 }, (_, k) => k + 1).map((i) => [`wd${i}`, { kind: 'text', text: '', px: 24, weight: 600, color: C.mute, caps: true, spc: 3, align: 'ctr' }])),
      ...Object.fromEntries(Array.from({ length: 4 }, (_, k) => k + 1).flatMap((i) => [
        [`pc${i}`, { kind: 'text', text: '', px: 60, weight: 700, color: C.violet, face: 'heading', align: 'ctr', lh: 1 }],
        [`sg${i}`, { kind: 'text', text: '', px: 28, weight: 600, color: C.ink, align: 'ctr', lh: 1.2 }],
        [`sd${i}`, { kind: 'text', text: '', px: 26, weight: 400, color: C.mute, align: 'ctr', lh: 1.2 }],
      ])),
      tgt: { kind: 'text', text: '', px: 22, weight: 600, color: C.violet, align: 'r', park: 'l' },
      brand: { kind: 'text', text: 'Sunday Co.', px: 26, weight: 700, color: C.ink, face: 'heading' },
      page: { kind: 'text', text: 'Social media strategy  ·  sample deck', px: 22, weight: 500, color: C.mute, align: 'r' },
      kA: { kind: 'text', text: '', px: 24, weight: 700, color: C.violet, caps: true, spc: 4 },
      tA: { kind: 'text', text: '', px: 64, weight: 700, color: C.ink, face: 'heading', lh: 1.05, spc: -1 },
      bA: { kind: 'text', text: '', px: 30, weight: 400, color: C.mute, lh: 1.45 },
      kB: { kind: 'text', text: '', px: 24, weight: 700, color: C.violet, caps: true, spc: 4 },
      tB: { kind: 'text', text: '', px: 64, weight: 700, color: C.ink, face: 'heading', lh: 1.05, spc: -1 },
      bB: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.45 },
    },
    order: ['bl1', 'bl2', 'bl3', 'Ash', 'Abd', 'Asc', 'Bsh', 'Bbd', 'Bsc', 'cal1', 'cal2', 'cal3', 'cal4', 'tgl', ...PO.order, 'rg1', 'rw1', 'av1', 'rg2', 'rw2', 'av2', 'rg3', 'rw3', 'av3', 'rg4', 'rw4', 'av4', 'Ant', 'Bnt',
      'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'ml1', 'ml2', 'ml3', 'ml4', 'ml5', 'ml6', 'ct1', 'ct2', 'ct3', 'ct4', 'wd1', 'wd2', 'wd3', 'wd4', 'wd5', 'tgt',
      'brand', 'page', 'kA', 'tA', 'bA', 'kB', 'tB', 'bB', 'rh1', 'rd1', 'rh2', 'rd2', 'rh3', 'rd3', 'rh4', 'rd4', 'rh5', 'rd5', 'rh6', 'rd6', 'pc1', 'sg1', 'sd1', 'pc2', 'sg2', 'sd2', 'pc3', 'sg3', 'sd3', 'pc4', 'sg4', 'sd4'] as string[],
    scenes: ([
      {
        id: 's1', title: 'Cover', purpose: 'The opening: a phone on the right with the first two posts of the feed, the strategy title on the left and reaction bubbles floating around it.', bg: '#E9E4FF',
        place: {
          ...blobs([1500, 540, 900, '#FFFFFF', 0.55], [300, 960, 560, C.peach, 0.6], [1000, 80, 420, C.mint, 0.6]),
          ...phone('A', P_COVER), ...phone('B', P_COVER, 0), ...stories(P_COVER), ...feed(P_COVER, 1), ...HEAD,
          ...bub(1, 1262, 360, 120), ...bub(2, 1740, 250, 90), ...bub(3, 1745, 800, 130), ...bub(4, 1255, 790, 80), ...bub(5, 1010, 900, 100), ...bub(6, 1110, 190, 60),
          kA: { ...rect(120, 300, 900, 36), text: 'SOCIAL MEDIA STRATEGY  ·  2027' }, tA: { ...rect(120, 350, 1040, 240), text: 'A feed people\nlove to follow', px: 108 },
          bA: { ...rect(120, 640, 820, 140), text: 'The social media plan for Sunday Co.: goals, audience, content, channels and a calendar in one scroll.', px: 32 },
        },
      },
      {
        id: 's2', title: 'Agenda', purpose: 'The phone moves to the middle; the bubbles become six numbered stops on either side of it.', bg: '#F0EBFF',
        place: {
          ...blobs([960, 540, 1000, '#FFFFFF', 0.6], [180, 120, 520, C.peach, 0.6], [1780, 960, 560, C.mint, 0.6]),
          ...phone('A', P_MID), ...phone('B', P_MID, 0), ...stories(P_MID), ...feed(P_MID, 1), ...HEAD,
          kA: { ...rect(90, 150, 600, 36), text: 'AGENDA' }, tA: { ...rect(90, 195, 620, 160), text: 'What is\non the feed', px: 72 },
          bB: { ...rect(1240, 175, 590, 100), text: 'Six short stops, about ten minutes. Every number in this deck is a sample.' },
          ...rowAt(1, 90, 430, 80, 200, 500, 'Goals', 'What the feed must achieve', 40), ...rowAt(2, 90, 610, 80, 200, 500, 'Audience', 'Who we are talking to', 40), ...rowAt(3, 90, 790, 80, 200, 500, 'Content pillars', 'What we post, and why', 40),
          ...rowAt(4, 1240, 430, 80, 1350, 480, 'Channels', 'Where we show up', 40), ...rowAt(5, 1240, 610, 80, 1350, 480, 'Calendar', 'Two sample weeks', 40), ...rowAt(6, 1240, 790, 80, 1350, 480, 'Results, next steps', 'Sample numbers and a plan', 40),
        },
      },
      {
        id: 's3', title: 'Objectives', purpose: 'The first post grows out of the phone into a hero card on the right while the phone shrinks to the middle; three goals list on the left.', bg: '#FFE8DC',
        place: {
          ...blobs([1520, 560, 900, '#FFFFFF', 0.55], [200, 980, 520, '#FFF1B8', 0.7], [900, 60, 460, '#E9E4FF', 0.8]),
          ...phone('A', P_SIDE), ...phone('B', P_SIDE, 0), ...stories(P_SIDE), ...feed(P_SIDE, 2, { 1: BIG_R }), ...HEAD, ...ghost(SEG),
          kA: { ...rect(90, 130, 620, 36), text: 'OBJECTIVES  ·  SAMPLE TARGETS' }, tA: { ...rect(90, 178, 620, 150), text: 'Three goals\nfor this year' },
          ...rowAt(1, 90, 430, 72, 190, 510, 'Reach', 'Grow followers from 18k to 40k.', 80), ...rowAt(2, 90, 620, 72, 190, 510, 'Engage', 'Lift the engagement rate on every post to 6 percent.', 80), ...rowAt(3, 90, 810, 72, 190, 510, 'Convert', 'Send 5,000 visits a month to the online shop.', 80),
          ...bub(4, 1192, 160, 76), ...bub(5, 1830, 210, 44), ...bub(6, 1190, 930, 56),
        },
      },
      {
        id: 's4', title: 'Audience', purpose: 'The story rings leave the phone and spread across the slide as four audience segments with a share each; the hero card folds back into the phone.', bg: '#D9F5EA',
        place: {
          ...blobs([700, 520, 1000, '#FFFFFF', 0.5], [1700, 150, 520, '#E9E4FF', 0.8], [150, 960, 520, '#FFF1B8', 0.7]),
          ...phone('A', P_AUD), ...phone('B', P_AUD, 0), ...feed(P_AUD, 2), ...HEAD,
          ...ring(1, 245, 510, 200), ...ring(2, 585, 510, 200), ...ring(3, 925, 510, 200), ...ring(4, 1265, 510, 200),
          kA: { ...rect(90, 130, 900, 36), text: 'AUDIENCE  ·  SAMPLE SEGMENTS' }, tA: { ...rect(90, 178, 1250, 90), text: 'Who we are talking to' },
          ...SEG,
          bA: { ...rect(90, 890, 1330, 80), text: 'A sample split of our current followers. We write for the first two groups first.' },
          ...bub(1, 332, 432, 52), ...bub(2, 672, 432, 52), ...bub(3, 1012, 432, 52), ...bub(4, 1352, 432, 52), ...bub(5, 1480, 180, 40), ...bub(6, 1500, 960, 44),
        },
      },
      {
        id: 's5', title: 'Content pillars', purpose: 'The next post grows out of the phone into a hero card on the left; four content pillars list on the right.', bg: '#EEE9FF',
        place: {
          ...blobs([480, 540, 920, '#FFFFFF', 0.6], [1800, 80, 520, C.peach, 0.6], [1500, 1000, 600, C.mint, 0.6]),
          ...phone('A', P_SIDE), ...phone('B', P_SIDE, 0), ...stories(P_SIDE), ...feed(P_SIDE, 3, { 2: BIG_L }), ...HEAD, ...ghost(SEG),
          kB: { ...rect(1200, 130, 630, 36), text: 'CONTENT PILLARS' }, tB: { ...rect(1200, 178, 630, 150), text: 'Four pillars,\none voice' },
          ...rowAt(1, 1200, 400, 64, 1290, 540, 'Everyday rituals', 'Slow mornings, tea and tidy shelves.', 40, 34), ...rowAt(2, 1200, 550, 64, 1290, 540, 'Behind the scenes', 'How each product is made.', 40, 34),
          ...rowAt(3, 1200, 700, 64, 1290, 540, 'Community', 'Customer photos and warm replies.', 40, 34), ...rowAt(4, 1200, 850, 64, 1290, 540, 'Drops and offers', 'New products and seasonal sales.', 40, 34),
          ...bub(5, 730, 160, 60), ...bub(6, 740, 940, 80),
        },
      },
      {
        id: 's6', title: 'Channels', purpose: 'A second phone slides in so two phones stand side by side, comparing Instagram and TikTok with a posting rhythm each.', bg: '#FFF3C9',
        place: {
          ...blobs([960, 600, 1100, '#FFFFFF', 0.55], [140, 120, 500, C.peach, 0.6], [1800, 980, 520, '#E9E4FF', 0.9]),
          ...phone('A', P_A), ...phone('B', P_B), ...stories(P_A), ...feed(P_A, 3, { 5: slot(P_B, 0), 6: slot(P_B, 1) }), ...HEAD, ...ghost(CALSET),
          kA: { ...rect(90, 104, 700, 36), text: 'CHANNELS  ·  SAMPLE MIX' }, tA: { ...rect(90, 142, 900, 80), text: 'Where we show up' },
          rh5: { ...rect(90, 330, 430, 56), text: 'Instagram', px: 44 }, rd5: { ...rect(90, 400, 430, 190), text: 'Reels, carousels and stories, four times a week. The job: reach and saves.', px: 30 },
          rh6: { ...rect(1400, 330, 430, 56), text: 'TikTok', px: 44 }, rd6: { ...rect(1400, 400, 430, 190), text: 'Short, relaxed videos, three times a week. The job: discovery and new followers.', px: 30 },
          ...bub(5, 155, 720, 130), n5: num(5, 155, 720, 130, '4/wk', 36), ...bub(6, 1465, 720, 130), n6: num(6, 1465, 720, 130, '3/wk', 36), ...bub(3, 960, 640, 76), n3: num(3, 960, 640, 76, 'vs', 28),
          ...bub(1, 1790, 160, 56), ...bub(2, 1640, 190, 36), ...bub(4, 300, 960, 48),
        },
      },
      {
        id: 's7', title: 'Content calendar', purpose: 'The feed regroups into a calendar: six posts and four plain cards form two sample weeks of five days.', bg: '#EEE9FF',
        place: {
          ...blobs([1000, 620, 1300, '#FFFFFF', 0.5], [100, 100, 440, C.peach, 0.6], [1850, 160, 440, C.mint, 0.6]),
          ...phone('A', P_A, 0), ...phone('B', P_B, 0), ...stories(P_A, 0),
          ...post(1, cellBox(0, 0)), ...post(2, cellBox(2, 0)), ...post(3, cellBox(3, 0)), ...post(4, cellBox(1, 1)), ...post(5, cellBox(2, 1)), ...post(6, cellBox(4, 1)),
          ...CALSET,
          ...HEAD, kA: { ...rect(90, 98, 700, 36), text: 'CONTENT CALENDAR  ·  SAMPLE' }, tA: { ...rect(90, 138, 1000, 80), text: 'Two weeks at a glance' },
          bB: { ...rect(1130, 112, 700, 90), text: 'A sample plan: a steady mix of photos, polls, stories and live moments.' },
          ...bub(1, ...corner(0, 0), 44), ...bub(2, ...corner(2, 0), 44), ...bub(3, ...corner(3, 0), 44), ...bub(4, ...corner(1, 1), 44), ...bub(5, ...corner(2, 1), 44), ...bub(6, ...corner(4, 1), 44),
        },
      },
      {
        id: 's8', title: 'Metrics', purpose: 'The phone returns small on the left and six bubbles float up on the right, sized by how much each sample metric matters.', bg: '#FFE8DC',
        place: {
          ...blobs([1250, 640, 1100, '#FFFFFF', 0.5], [200, 980, 520, '#FFF1B8', 0.7], [1800, 90, 440, '#E9E4FF', 0.8]),
          ...phone('A', P_LEFT), ...phone('B', P_LEFT, 0), ...stories(P_LEFT), ...feed(P_LEFT, 3), ...HEAD, ...ghost(CALSET), ...ghost(TGT),
          kB: { ...rect(560, 130, 800, 36), text: 'SAMPLE METRICS' }, tB: { ...rect(560, 176, 1270, 80), text: 'Six numbers that matter' }, bB: { ...rect(560, 256, 1200, 50), text: 'Bubble size shows importance. All figures are samples.' },
          ...bub(1, 760, 610, 280), n1: num(1, 760, 610, 280, '120k', 68), ml1: lab(1, 760, 610, 280, 'Reach', 68),
          ...bub(2, 1090, 540, 240), n2: num(2, 1090, 540, 240, '4.8%', 60), ml2: lab(2, 1090, 540, 240, 'Engagement', 60),
          ...bub(3, 1370, 640, 200), n3: num(3, 1370, 640, 200, '3.2k', 52), ml3: lab(3, 1370, 640, 200, 'Saves', 52),
          ...bub(4, 1650, 540, 170), n4: num(4, 1650, 540, 170, '1.9k', 46), ml4: lab(4, 1650, 540, 170, 'Shares', 46),
          ...bub(5, 940, 880, 180), n5: num(5, 940, 880, 180, '6.4k', 48), ml5: lab(5, 940, 880, 180, 'Clicks', 48),
          ...bub(6, 1250, 900, 160), n6: num(6, 1250, 900, 160, '+5%', 44), ml6: lab(6, 1250, 900, 160, 'Growth', 44),
        },
      },
      {
        id: 's9', title: 'Results', purpose: 'The bubbles settle into six rounded bars against a 100 percent target line, and the feed scrolls on by one post.', bg: '#D9F5EA',
        place: {
          ...blobs([1250, 600, 1100, '#FFFFFF', 0.5], [150, 120, 480, '#E9E4FF', 0.8], [1850, 1000, 520, '#FFF1B8', 0.7]),
          ...phone('A', P_LEFT), ...phone('B', P_LEFT, 0), ...stories(P_LEFT), ...feed(P_LEFT, 4), ...HEAD,
          kB: { ...rect(560, 130, 900, 36), text: 'SAMPLE RESULTS  ·  AFTER 90 DAYS' }, tB: { ...rect(560, 176, 1270, 80), text: 'Ahead on four of six' }, bB: { ...rect(560, 256, 1200, 50), text: 'Each bar is a share of its target. Saves lead; shares need work.' },
          ...TGT,
          ...Object.assign({}, ...[[1, 112, 'Reach'], [2, 96, 'Engagement'], [3, 134, 'Saves'], [4, 88, 'Shares'], [5, 121, 'Clicks'], [6, 105, 'Growth']].map(([i, v, name]) => {
            const x = 640 + 195 * ((i as number) - 1), h = (v as number) * 3.4, top = 880 - h
            return {
              [`b${i}`]: { x, y: top, w: 130, h, radius: 40, fill: BC[(i as number) - 1] },
              [`n${i}`]: { x, y: top + 16, w: 130, h: 44, text: `${v}%`, px: 34, color: NC[(i as number) - 1] },
              [`ml${i}`]: { x: x - 30, y: 896, w: 190, h: 32, text: name as string, color: C.ink },
            }
          })),
        },
      },
      {
        id: 's10', title: 'Next steps', purpose: 'The next post grows into a hero card on the left while the phone moves back to the middle; three steps for the first month list on the right.', bg: '#FFF3C9',
        place: {
          ...blobs([480, 540, 920, '#FFFFFF', 0.6], [1800, 100, 520, C.peach, 0.6], [1500, 1010, 600, '#E9E4FF', 0.9]),
          ...phone('A', P_SIDE), ...phone('B', P_SIDE, 0), ...stories(P_SIDE), ...feed(P_SIDE, 5, { 4: BIG_L }), ...HEAD, ...ghost(TGT),
          kB: { ...rect(1200, 130, 630, 36), text: 'NEXT STEPS  ·  FIRST 30 DAYS' }, tB: { ...rect(1200, 178, 630, 150), text: 'A calm and\nsteady first month' },
          ...rowAt(1, 1200, 430, 72, 1300, 530, 'Week 1: set up', 'Lock the look, the handles and the rota.', 80), ...rowAt(2, 1200, 620, 72, 1300, 530, 'Week 2: launch', 'Publish ten posts and reply within a day.', 80), ...rowAt(3, 1200, 810, 72, 1300, 530, 'Week 4: review', 'Read the numbers, keep what works, refresh the calendar.', 80),
          ...bub(4, 730, 160, 60), ...bub(5, 745, 940, 76), ...bub(6, 1840, 960, 48),
        },
      },
      {
        id: 's11', title: 'Call to action', purpose: 'The phone and the feed fold away and the last post becomes one large violet card carrying the call to action.', bg: '#E9E4FF',
        place: {
          ...blobs([960, 540, 1200, '#FFFFFF', 0.55], [100, 1000, 480, C.peach, 0.6], [1850, 90, 440, C.mint, 0.6]),
          ...phone('A', P_FOLD, 0), ...phone('B', P_FOLD, 0), ...stories(P_FOLD, 0),
          ...feed(P_FOLD, 1, { 1: { box: rect(940, 520, 40, 40), a: 0 }, 2: { box: rect(940, 520, 40, 40), a: 0 }, 3: { box: rect(940, 520, 40, 40), a: 0 }, 5: { box: rect(940, 520, 40, 40), a: 0 }, 6: { box: rect(940, 520, 40, 40), a: 0 } }),
          ...post(4, rect(90, 120, 1740, 840)),
          sh4: { x: 80, y: 140, w: 1760, h: 850, radius: 68, a: 0.3 }, c4: { ...rect(90, 120, 1740, 840), radius: 64, fill: C.violet },
          p4: { ...rect(1110, 170, 670, 740), radius: 44 },
          la4: { ...rect(170, 860, 236, 14), a: 0 }, lb4: { ...rect(170, 880, 160, 12), a: 0 },
          ka4: rect(170, 846, 133, 58, { radius: 29 }), kd4: rect(194, 861, 27, 27, { radius: 14 }), kb4: rect(316, 846, 133, 58, { radius: 29 }), kc4: rect(462, 846, 133, 58, { radius: 29 }),
          ...HEAD,
          kA: { ...rect(170, 170, 880, 36), text: 'READY WHEN YOU ARE', color: C.peach }, tA: { ...rect(170, 220, 900, 230), text: "Let's make it\na habit", px: 92, color: C.white },
          bA: { ...rect(170, 480, 860, 140), text: 'Approve the plan, choose the first ten photos and we start posting on Monday.', px: 32, color: C.lav },
          rd1: { ...rect(170, 680, 860, 100), text: 'hello@sundayco.example\n@sundayco on every channel', px: 30, color: C.white },
          ...bub(1, 90, 170, 110, { fill: C.coral }), ...bub(2, 1830, 130, 76, { fill: '#FFDC5E' }), ...bub(3, 1838, 900, 120, { fill: '#8FE0C2' }), ...bub(4, 100, 930, 70, { fill: '#FFB799' }), ...bub(5, 1100, 150, 44, { fill: C.coral }), ...bub(6, 1110, 960, 56, { fill: '#FFDC5E' }),
        },
      },
    ] as SceneDef[]).map((sc) => ({ ...sc, place: tint(sc.place as Record<string, Place>, sc.bg === '#FFE8DC' || sc.bg === '#FFF3C9' ? WARM : sc.bg === '#D9F5EA' ? COOL : C.shadow) })),
  },
)
