import { authored, at, rect, W, H } from '../author'
import type { Place } from '../author'

/**
 * Unboxing: a dark, keynote-style hardware launch. ONE product (a pair of fictional wireless headphones) is the hero that rotates, scales and travels: it rises out of the dark, grows past the
 * slide edge for a close-up, pulls back to the centre, slides left while hairline call-out lines draw out of it towards the spec labels (and re-aim at other features as it turns), shrinks into
 * the corner above a six-cell spec grid whose numbers are the very numbers of the call-outs, leaves two ghosted earlier generations behind, lines up with its box contents, and rises once more
 * in the closing scene. A violet halo, two rings and a soft floor glow travel with it. Original choreography for SlidesDone.
 */
const C = { bg: '#07080C', lime: '#C8FF2E', ink: '#F2F6FF', mute: '#98A2B8', line: '#FFFFFF', violet: '#3A3FFF' }
const D = Math.PI / 180

/** the hero's box: centre, size, turn */
const hb = (cx: number, cy: number, s: number, rot = 0, art?: string): Place => ({ x: cx - s / 2, y: cy - s / 2, w: s, h: s, ...(rot ? { rot } : {}), ...(art ? { art } : {}) })
/** a point on the hero, given as a fraction of its box, after it has been turned */
const feat = (b: Place, f: [number, number]): [number, number] => {
  const r = (b.rot ?? 0) * D, dx = (f[0] - 0.5) * b.w, dy = (f[1] - 0.5) * b.h
  return [b.x + b.w / 2 + dx * Math.cos(r) - dy * Math.sin(r), b.y + b.h / 2 + dx * Math.sin(r) + dy * Math.cos(r)]
}
/** a hairline from one point to another (a thin turned rect); with `len` it is only that long and invisible: its start stays where it will grow from */
const line = (p: [number, number], q: [number, number], shown = true): Place => {
  const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), k = shown ? 1 : 6 / L, l = L * k, ang = Math.atan2(dy, dx) / D
  const mx = p[0] + (dx * k) / 2, my = p[1] + (dy * k) / 2
  return { x: mx - l / 2, y: my - 1.5, w: l, h: 3, rot: ang, ...(shown ? {} : { a: 0 }) }
}
const dot = (p: [number, number], d: number, a = 1): Place => ({ x: p[0] - d / 2, y: p[1] - d / 2, w: d, h: d, ...(a < 1 ? { a } : {}) })

/** what travels with the hero: a violet halo, two rings, the soft floor glow, and the dim wash behind it all */
const rig = (cx: number, cy: number, s: number, o: { ring?: number; halo?: number; a?: number } = {}) => {
  const rs = o.ring ?? s, hd = (o.halo ?? 1.6) * s, a = o.a ?? 1
  return {
    halo: at(rect(cx - 1.47 * hd, cy - 0.83 * hd, 2.94 * hd, 1.65 * hd), { a: 0.5 * a }),
    r1: at(rect(cx - 0.56 * rs, cy - 0.58 * rs, 1.12 * rs, 1.12 * rs), { a: 0.55 * a }),
    r2: at(rect(cx - 0.72 * rs, cy - 0.74 * rs, 1.44 * rs, 1.44 * rs), { a: 0.2 * a }),
    floor: at(rect(cx - 1.35 * s, cy + 0.42 * s - 0.11 * s, 2.7 * s, 0.22 * s), { a: 0.8 * a }),
    wash: at(rect(960 + (cx - 960) * 0.35 - 1700, 540 - 960, 3400, 1920), { a: 0.3 }),
  }
}
const HEAD = { brand: rect(80, 44, 300, 34), page: rect(1240, 44, 600, 34), hair: at(rect(80, 98, 1760, 2), { a: 0.2 }) }
const BEAM = (cx: number, a: number) => at(rect(cx - 960, 0, 1920, 1080), { a })

/** three call-out rows at the right: line from a hero feature to the row, its two dots, label, value and a note */
const ROW_Y = [250, 520, 790]
const callouts = (b: Place, f: [[number, number], [number, number], [number, number]], off: number, rows: [[string, string, string], [string, string, string], [string, string, string]]) => {
  const out: Record<string, Place> = {}
  rows.forEach((r, i) => {
    const y = ROW_Y[i]!, p = feat(b, f[i]!), q: [number, number] = [1196, y + 66]
    const n = i + 1, m = n + off
    out[`c${m}`] = line(p, q)
    out[`d${m}`] = dot(p, 18)
    out[`e${m}`] = dot(q, 12)
    out[`l${n}`] = { ...rect(1230, y, 590, 30), text: r[0] }
    out[`v${n}`] = { ...rect(1230, y + 36, 590, 80), text: r[1], px: 64 }
    out[`t${n}`] = { ...rect(1230, y + 124, 560, 80), text: r[2] }
  })
  return out
}
/** the same call-outs, invisible in place: a rotated line must not change shape between scenes (the Morph would show a stray copy), so each set only fades in and out */
const hidden = (b: Place, f: [[number, number], [number, number], [number, number]], off: number) => {
  const out: Record<string, Place> = {}
  f.forEach((ff, i) => {
    const y = ROW_Y[i]!, p = feat(b, ff), q: [number, number] = [1196, y + 66], n = i + 1 + off
    out[`c${n}`] = at(line(p, q), { a: 0, rot: line(p, q).rot! + 0.05 })
    out[`d${n}`] = dot(p, 18, 0)
    out[`e${n}`] = dot(q, 12, 0)
  })
  return out
}

const BAR_H = [70, 120, 180, 240, 200, 150, 220, 270, 230, 160, 110, 190, 250, 180, 100, 60]
const BAR_X = (i: number) => 151 + i * 104
const bars = (up: boolean) => Object.fromEntries(BAR_H.map((h, i) => [`b${i + 1}`, up ? rect(BAR_X(i), 990 - h, 58, h) : at(rect(BAR_X(i), H + 60, 58, h), { a: 0 })]))

// features on the two pictures (fractions of the box): the "side" picture shows the cup on the right, the "hero" picture shows it on the left
const SIDE = { ring: [0.72, 0.71], hinge: [0.77, 0.52], band: [0.6, 0.1], cush: [0.21, 0.64] } as const
const HERO = { ring: [0.2, 0.66], cush: [0.66, 0.64], hinge: [0.74, 0.37], band: [0.4, 0.07], shell: [0.8, 0.58] } as const
const SIDE_F: [[number, number], [number, number], [number, number]] = [[...SIDE.band], [...SIDE.hinge], [...SIDE.ring]]
const HERO_F: [[number, number], [number, number], [number, number]] = [[...HERO.hinge], [...HERO.shell], [...HERO.cush]]

const A = { hero: 'unbox-hero.webp', side: 'unbox-side.webp', detail: 'unbox-detail.webp' }
const B6 = hb(530, 600, 840, 0, A.side), B7 = hb(540, 610, 800, -10, A.hero)
const B8 = hb(1640, 290, 360, 14, A.hero), B9 = hb(1260, 570, 720, 0, A.hero)

export const LAUNCH_UNBOX = authored(
  {
    id: 'launch-unbox', category: 'launch', name: 'Unboxing', tagline: 'One product, rotating through the whole launch',
    description: 'A dark, keynote-style hardware launch where a single hero product rises out of the black, grows past the edge for a close-up, pulls back and turns while hairline call-outs draw out of it to the specs, then lines up with its box contents, its price and its date.',
    audience: 'The Unboxing template suits product launches and reveals, hardware and consumer-electronics keynotes, new-product announcements, spec and feature walkthroughs, unboxing and what-is-in-the-box stories, and pre-order or availability decks.',
    topics: ['product launch', 'product reveal', 'unboxing', 'keynote', 'new product', 'hardware launch', 'consumer electronics', 'product announcement', 'specs', 'specifications', 'headphones', 'gadget', 'device', 'tech launch', 'pre-order', 'wearable', 'camera', 'smart ring'],
    fonts: { heading: 'Sora', body: 'Inter' },
    colors: { background: '#07080C', surface: '#12141C', textPrimary: '#F2F6FF', textSecondary: '#98A2B8', primary: '#C8FF2E', secondary: '#3A3FFF', accent: '#C8FF2E', onPrimary: '#07080C' },
    background: '#07080C',
  },
  {
    objects: {
      wash: { kind: 'image', art: 'unbox-glow.webp', alt: 'A faint violet-blue glow' },
      beam: { kind: 'image', art: 'unbox-beam.webp', alt: 'A soft shaft of light from above' },
      halo: { kind: 'image', art: 'unbox-glow.webp', alt: 'A violet halo behind the product' },
      floor: { kind: 'image', art: 'unbox-glow.webp', alt: 'A soft glow on the floor under the product' },
      r2: { kind: 'shape', shape: 'ellipse', stroke: C.line, strokeW: 2 }, r1: { kind: 'shape', shape: 'ellipse', stroke: C.lime, strokeW: 2 },
      ...Object.fromEntries(BAR_H.map((_, i) => [`b${i + 1}`, { kind: 'shape', radius: 12, gradient: { from: C.lime, to: C.violet, angle: 180 }, park: 'b' } as const])),
      cf1: { kind: 'shape', radius: 26, stroke: C.line, strokeW: 2 }, cf2: { kind: 'shape', radius: 26, stroke: C.line, strokeW: 2 }, cf3: { kind: 'shape', radius: 26, stroke: C.line, strokeW: 2 },
      cf4: { kind: 'shape', radius: 26, stroke: C.line, strokeW: 2 }, cf5: { kind: 'shape', radius: 26, stroke: C.line, strokeW: 2 }, cf6: { kind: 'shape', radius: 26, stroke: C.line, strokeW: 2 },
      hl1: { kind: 'shape', fill: C.line, park: 'l' }, hl2: { kind: 'shape', fill: C.line, park: 'l' }, hl3: { kind: 'shape', fill: C.line, park: 'l' }, hl4: { kind: 'shape', fill: C.line, park: 'l' },
      g1: { kind: 'image', art: A.side, alt: 'An earlier generation of the headphones, ghosted' }, g2: { kind: 'image', art: A.hero, alt: 'An earlier generation of the headphones, ghosted' },
      case: { kind: 'image', art: 'unbox-case.webp', alt: 'A slim graphite hard travel case with a lime zip pull' },
      puck: { kind: 'image', art: 'unbox-puck.webp', alt: 'A round graphite wireless charging dock with a lime light ring' },
      hero: { kind: 'image', art: A.hero, alt: 'Over-ear wireless headphones in graphite with a lime ring light' },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => [[`c${n}`, { kind: 'shape', fill: C.lime, radius: 2 }], [`e${n}`, { kind: 'shape', shape: 'ellipse', fill: C.ink }], [`d${n}`, { kind: 'shape', shape: 'ellipse', fill: C.lime }]])),
      hair: { kind: 'shape', fill: C.line },
      brand: { kind: 'text', text: 'ZENO', px: 24, weight: 700, color: C.ink, caps: true, spc: 8, face: 'heading' },
      page: { kind: 'text', text: 'ONE  ·  SAMPLE LAUNCH DECK', px: 22, weight: 500, color: C.mute, align: 'r', caps: true, spc: 4 },
      name: { kind: 'text', text: 'ZENO ONE', px: 300, weight: 800, color: C.ink, face: 'heading', lh: 1, spc: -8, align: 'ctr', anchor: 'ctr', park: 't' },
      k: { kind: 'text', text: '', px: 24, weight: 600, color: C.lime, caps: true, spc: 6 },
      kc: { kind: 'text', text: '', px: 24, weight: 600, color: C.lime, caps: true, spc: 6, align: 'ctr' },
      title: { kind: 'text', text: '', px: 80, weight: 700, color: C.ink, face: 'heading', lh: 1.05, spc: -2 },
      titleC: { kind: 'text', text: '', px: 64, weight: 700, color: C.ink, face: 'heading', lh: 1.05, spc: -1.5, align: 'ctr' },
      body: { kind: 'text', text: '', px: 30, weight: 400, color: C.mute, lh: 1.45 },
      bodyC: { kind: 'text', text: '', px: 32, weight: 400, color: C.mute, lh: 1.45, align: 'ctr' },
      stat: { kind: 'text', text: '', px: 200, weight: 800, color: C.ink, face: 'heading', lh: 1, spc: -6 },
      ag1: { kind: 'text', text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 }, ag2: { kind: 'text', text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 },
      ag3: { kind: 'text', text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 }, ag4: { kind: 'text', text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => [
        [`l${n}`, { kind: 'text', text: '', px: 22, weight: 600, color: C.mute, caps: true, spc: 4 }],
        [`v${n}`, { kind: 'text', text: '', px: 64, weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -2, ...(n > 3 ? { park: 'b' } : {}) }],
      ])),
      ...Object.fromEntries([1, 2, 3].flatMap((n) => [
        [`t${n}`, { kind: 'text', text: '', px: 26, weight: 400, color: C.mute, lh: 1.4 }],
        [`p${n}`, { kind: 'text', text: '', px: 28, weight: 500, color: C.mute }],
        [`nm${n}`, { kind: 'text', text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 }],
      ])),
      gl: { kind: 'text', text: '', px: 22, weight: 600, color: C.mute, caps: true, spc: 4, align: 'r' },
    },
    order: ['wash', 'beam', 'halo', 'floor', 'r2', 'r1', 'name', 'cf1', 'cf2', 'cf3', 'cf4', 'cf5', 'cf6', 'hl1', 'hl2', 'hl3', 'hl4', 'g1', 'g2', 'case', 'puck', 'hero',
      ...BAR_H.map((_, i) => `b${i + 1}`), 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6',
      'brand', 'page', 'hair', 'k', 'kc', 'title', 'titleC', 'body', 'bodyC', 'stat', 'ag1', 'ag2', 'ag3', 'ag4',
      'l1', 'v1', 't1', 'p1', 'nm1', 'l2', 'v2', 't2', 'p2', 'nm2', 'l3', 'v3', 't3', 'p3', 'nm3', 'l4', 'v4', 'l5', 'v5', 'l6', 'v6', 'gl'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The teaser: only the top of the headphones rises into the beam of light under the name, in the dark.', bg: C.bg,
        place: {
          hero: hb(960, 1030, 780, 0, A.hero), ...rig(960, 1030, 780), beam: BEAM(960, 0.55), ...HEAD,
          kc: { ...rect(560, 290, 800, 32), text: 'INTRODUCING' }, name: at(rect(80, 335, 1760, 130), { px: 150 }), bodyC: { ...rect(460, 510, 1000, 50), text: 'Wireless over-ear headphones  ·  Sample launch deck', px: 30 },
        },
      },
      {
        id: 's2', title: 'Reveal', purpose: 'The headphones rise to the centre and the model name grows behind them to its full size.', bg: C.bg,
        place: {
          hero: hb(960, 510, 720, 0, A.hero), ...rig(960, 510, 720), beam: BEAM(960, 0.5), ...HEAD, name: rect(80, 125, 1760, 330),
          kc: { ...rect(560, 858, 800, 32), text: 'THE REVEAL' }, bodyC: { ...rect(460, 900, 1000, 100), text: 'Adaptive noise cancelling and a battery that lasts all week, in a pair of headphones you forget you are wearing.' },
        },
      },
      {
        id: 's3', title: 'Design', purpose: 'A dramatic close-up: one ear cup grows past the slide edge so the lime ring of light fills the right half.', bg: C.bg,
        place: {
          hero: hb(1500, 600, 2000, 14, A.detail), ...rig(1500, 600, 1500, { ring: 900, halo: 0.8, a: 0.9 }), beam: BEAM(1500, 0), ...HEAD,
          k: { ...rect(100, 300, 700, 30), text: 'DESIGN' }, title: { ...rect(100, 350, 880, 200), text: 'A ring of light,\nnot a logo.', px: 84 },
          body: { ...rect(100, 600, 720, 220), text: 'A thin light guide around each cup shows battery, pairing and noise mode, then goes dark when you stop looking at it.' },
        },
      },
      {
        id: 's4', title: 'Contents', purpose: 'The headphones pull back to the centre; four numbered chapters line up on hairlines either side.', bg: C.bg,
        place: {
          hero: hb(960, 635, 720, 0, A.hero), ...rig(960, 635, 720), beam: BEAM(960, 0), ...HEAD,
          kc: { ...rect(560, 116, 800, 30), text: 'CONTENTS' }, titleC: { ...rect(260, 165, 1400, 90), text: 'What you will see today' },
          ag1: { ...rect(100, 440, 440, 56), text: '01   Design' }, hl1: rect(100, 516, 440, 2, { a: 0.2 }), ag2: { ...rect(100, 590, 440, 56), text: '02   Sound' }, hl2: rect(100, 666, 440, 2, { a: 0.2 }),
          ag3: { ...rect(1380, 440, 440, 56), text: '03   Specs' }, hl3: rect(1380, 516, 440, 2, { a: 0.2 }), ag4: { ...rect(1380, 590, 440, 56), text: '04   In the box' }, hl4: rect(1380, 666, 440, 2, { a: 0.2 }),
        },
      },
      {
        id: 's5', title: 'Sound', purpose: 'The headphones turn to the side and shrink above a row of rising bars, a frequency curve.', bg: C.bg,
        place: {
          hero: hb(960, 400, 560, 0, A.side), ...rig(960, 400, 560), ...HEAD, ...bars(true),
          k: { ...rect(100, 200, 520, 30), text: 'SOUND' }, title: { ...rect(100, 245, 560, 200), text: 'Tuned by ear,\nproven in a lab.', px: 52 },
          l1: { ...rect(1280, 215, 540, 30), text: 'FREQUENCY RESPONSE' }, v1: { ...rect(1280, 255, 540, 70), text: '20 Hz–40 kHz', px: 52 }, t1: { ...rect(1280, 335, 520, 80), text: 'Hi-res audio over Bluetooth, with no cable needed.' },
          hl1: rect(1280, 195, 540, 2, { a: 0.2 }), ...hidden(B6, SIDE_F, 0),
        },
      },
      {
        id: 's6', title: 'Call-outs A', purpose: 'The headphones slide left and three lines draw out of them to the weight, connection and noise-cancelling labels.', bg: C.bg,
        place: {
          hero: B6, ...rig(530, 600, 840), ...HEAD, ...bars(false),
          k: { ...rect(1230, 160, 590, 30), text: 'KEY SPECS  ·  SAMPLE' }, hl1: rect(1230, 205, 590, 2, { a: 0.2 }),
          ...hidden(B7, HERO_F, 3), ...callouts(B6, SIDE_F, 0, [['WEIGHT', '248 g', 'Lighter than most phones, with a headband that spreads the load.'], ['CONNECTION', 'BT 6.0', 'Pairs with two devices at once and switches in a tap.'], ['NOISE CANCELLING', '−45 dB', 'Adaptive: it re-tunes to your ears every few seconds.']]),
        },
      },
      {
        id: 's7', title: 'Call-outs B', purpose: 'The headphones turn the other way and the same lines re-aim at the microphones, battery and cushions.', bg: C.bg,
        place: {
          hero: B7, ...rig(540, 610, 800), ...HEAD,
          k: { ...rect(1230, 160, 590, 30), text: 'KEY SPECS  ·  SAMPLE' }, hl1: rect(1230, 205, 590, 2, { a: 0.2 }),
          ...hidden(B6, SIDE_F, 0), ...callouts(B7, HERO_F, 3, [['MICROPHONES', '6-mic', 'A beamforming array keeps calls clear in wind.'], ['BATTERY', '60 h', 'With noise cancelling off; 40 hours with it on.'], ['CUSHIONS', 'Memory foam', 'Swappable, held on by a magnetic seat.']]),
        },
      },
      {
        id: 's8', title: 'Spec grid', purpose: 'The headphones shrink into the corner and the three numbers become giant, joined by three more in a six-cell grid.', bg: C.bg,
        place: {
          hero: B8, ...rig(1640, 290, 360, { a: 0.8 }), ...HEAD, ...hidden(B7, HERO_F, 3),
          k: { ...rect(100, 150, 800, 30), text: 'SPECS  ·  SAMPLE FIGURES' }, title: { ...rect(100, 195, 1200, 170), text: 'Six numbers\nthat matter.', px: 72 },
          ...Object.fromEntries([
            ['248', 'GRAMS  ·  WEIGHT'], ['6.0', 'BLUETOOTH  ·  TWO DEVICES'], ['45', 'DB  ·  NOISE CANCELLING'], ['60', 'HOURS  ·  BATTERY'], ['40', 'MM  ·  DRIVERS'], ['6', 'MICROPHONES'],
          ].flatMap(([num, cap], i) => {
            const cw = (1720 - 48) / 3, ch = 253, x = 100 + (i % 3) * (cw + 24), y = 460 + Math.floor(i / 3) * (ch + 24), n = i + 1
            return [[`cf${n}`, at(rect(x, y, cw, ch), { a: 0.22 })], [`v${n}`, { ...rect(x + 36, y + 26, cw - 72, 130), text: num!, px: 120 }], [`l${n}`, { ...rect(x + 36, y + 180, cw - 72, 30), text: cap! }]]
          })),
        },
      },
      {
        id: 's9', title: 'Compare', purpose: 'The headphones slide right in front of two ghosted earlier generations while three rows show what improved.', bg: C.bg,
        place: {
          hero: B9, ...rig(1260, 570, 720), ...HEAD,
          g2: at(hb(1500, 540, 640, 6, A.hero), { a: 0.3 }), g1: at(hb(1700, 510, 560, 12, A.side), { a: 0.18 }),
          gl: { ...rect(1220, 960, 600, 30), text: 'PREVIOUS GENERATIONS' },
          k: { ...rect(100, 150, 800, 30), text: 'COMPARED' }, title: { ...rect(100, 195, 1100, 80), text: 'Better where it matters.', px: 56 },
          ...Object.fromEntries([['BATTERY', '60 h', 'Previous: 40 h'], ['NOISE CANCELLING', '−45 dB', 'Previous: −32 dB'], ['WEIGHT', '248 g', 'Previous: 290 g']].flatMap(([cap, num, was], i) => {
            const y = 320 + i * 220, n = i + 1
            return [[`hl${n}`, rect(100, y, 800, 2, { a: 0.2 })], [`l${n}`, { ...rect(100, y + 26, 500, 30), text: cap! }], [`v${n}`, { ...rect(100, y + 70, 460, 100), text: num!, px: 88 }], [`p${n}`, { ...rect(560, y + 112, 340, 40), text: was! }]]
          })),
          cf1: at(rect(100, 460, 557, 253), { a: 0 }), cf2: at(rect(100, 460, 557, 253), { a: 0 }), cf3: at(rect(100, 460, 557, 253), { a: 0 }),
        },
      },
      {
        id: 's10', title: 'In the box', purpose: 'The headphones shrink into the first of three framed cells while a travel case and a wireless dock fly in beside them.', bg: C.bg,
        place: {
          hero: hb(370, 510, 440, 0, A.hero), ...rig(370, 510, 440, { a: 0.6, ring: 380 }), ...HEAD,
          g2: at(hb(370, 510, 440, 0, A.hero), { a: 0 }), g1: at(hb(370, 510, 440, 0, A.side), { a: 0 }),
          k: { ...rect(100, 125, 800, 30), text: 'IN THE BOX' }, title: { ...rect(100, 178, 1500, 80), text: 'Everything you need. No cables.', px: 56 },
          cf1: at(rect(100, 280, 540, 580), { a: 0.22 }), cf2: at(rect(690, 280, 540, 580), { a: 0.22 }), cf3: at(rect(1280, 280, 540, 580), { a: 0.22 }),
          case: rect(740, 350, 440, 330), puck: rect(1340, 330, 400, 400),
          nm1: { ...rect(140, 735, 460, 50), text: 'Headphones' }, t1: { ...rect(140, 790, 460, 40), text: 'ZENO ONE, graphite' },
          nm2: { ...rect(730, 735, 460, 50), text: 'Travel case' }, t2: { ...rect(730, 790, 460, 40), text: 'Hard shell, zip closure' },
          nm3: { ...rect(1320, 735, 460, 50), text: 'Wireless dock' }, t3: { ...rect(1320, 790, 460, 40), text: 'Charges without a cable' },
        },
      },
      {
        id: 's11', title: 'Price', purpose: 'The headphones take the right side again, turned slightly; the price is the biggest thing on the left, with dates below.', bg: C.bg,
        place: {
          hero: hb(1380, 560, 820, 6, A.side), ...rig(1380, 560, 820), ...HEAD,
          k: { ...rect(100, 160, 800, 30), text: 'PRICE AND AVAILABILITY' }, stat: { ...rect(100, 205, 800, 210), text: '$349' }, body: { ...rect(100, 430, 760, 80), text: 'Sample launch price. Add your own price, currency and any early-bird offer.' },
          hl1: rect(100, 580, 780, 2, { a: 0.2 }), hl2: rect(100, 690, 780, 2, { a: 0.2 }), hl3: rect(100, 800, 780, 2, { a: 0.2 }),
          l1: { ...rect(100, 622, 260, 30), text: 'PRE-ORDER' }, v1: { ...rect(380, 606, 500, 60), text: '12 March', px: 44 },
          l2: { ...rect(100, 732, 260, 30), text: 'SHIPPING' }, v2: { ...rect(380, 716, 500, 60), text: '26 March', px: 44 },
          l3: { ...rect(100, 842, 260, 30), text: 'WARRANTY' }, v3: { ...rect(380, 826, 500, 60), text: '2 years', px: 44 },
          cf1: at(rect(100, 460, 557, 253), { a: 0 }),
        },
      },
      {
        id: 's12', title: 'Closing', purpose: 'The headphones rise to the centre under the giant name once more, with the call to action and contact line.', bg: C.bg,
        place: {
          hero: hb(960, 510, 720, 0, A.hero), ...rig(960, 510, 720), beam: BEAM(960, 0.5), ...HEAD, name: rect(80, 125, 1760, 330),
          titleC: { ...rect(360, 850, 1200, 80), text: 'Hear it for yourself.', px: 64 }, bodyC: { ...rect(460, 950, 1000, 44), text: 'hello@zeno.example   ·   zeno.example/one', px: 30 },
        },
      },
    ],
  },
)
void W
