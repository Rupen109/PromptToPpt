import { authored, rect, row, col, at } from '../author'
import type { Place } from '../author'

/**
 * Health & Wellness: a calm, caring deck built on one gentle heartbeat. A pulse line (nine thin segments) crosses the cover, sits quietly beside the titles, and later flattens into the
 * timeline of a daily routine. Three cards are key facts, then body-diagram labels, rows of signs, tall prevention steps and the stops of a day; the strip is a camera pan, and the
 * same cards become progress rows whose bars fill. A mint circle zooms through the slide as the background of "why it matters" and again, in blue, of "when to get help". Two panels
 * (do / do not) trade places to become fact / myth. Original choreography for SlidesDone.
 */
const C = { bg: '#F2FAF6', ink: '#12332A', mute: '#4B6B61', green: '#1F9D74', deep: '#0F6B52', blue: '#3A86FF', coral: '#EE5A70', coralDeep: '#B93049', mint: '#CFEEDD', mint2: '#DCF2E6', sky: '#DCE9FF', sky2: '#E1ECFF', rose: '#FFE1E4', roseP: '#FFE9EB', okP: '#E3F5EC', edge: '#D5EBE0', link: '#BFE3D0' }

const ctr = (cx: number, cy: number, w: number, h = w): Place => ({ x: cx - w / 2, y: cy - h / 2, w, h })
const tx = (x: number, y: number, w: number, h: number, text: string, extra: Partial<Place> = {}): Place => ({ ...rect(x, y, w, h), text, ...extra })
const link = (x1: number, y1: number, x2: number, y2: number, th = 6): Place => {
  const len = Math.hypot(x2 - x1, y2 - y1) + th
  return { x: (x1 + x2) / 2 - len / 2, y: (y1 + y2) / 2 - th / 2, w: len, h: th, rot: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI }
}

// the heartbeat: nine thin segments between ten points; amp 0 lays the same segments flat (the timeline)
const PX = [0, 0.22, 0.31, 0.38, 0.46, 0.54, 0.6, 0.68, 0.84, 1]
const PY = [0, 0, -0.35, 0.45, -1, 0.7, 0, -0.12, 0, 0]
const pulse = (x0: number, x1: number, y: number, amp: number, th = 8): Record<string, Place> => {
  const pts = PX.map((f, i) => [x0 + (x1 - x0) * f, y + amp * PY[i]!] as const)
  return Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`pu${i + 1}`, link(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], th)]))
}
const HEADPULSE = (amp = 36) => pulse(1100, 1500, 215, amp, 7)

const HEAD = { brand: rect(80, 52, 520, 30), page: rect(1240, 52, 600, 30) }
const top = (k: string, title: string, px = 64): Record<string, Place> => ({ k: tx(100, 128, 1000, 32, k), title: tx(100, 176, 1000, 84, title, { px }) })
const blobs = (a: [number, number, number], b: [number, number, number], c: [number, number, number], fill = C.mint): Record<string, Place> => ({
  blob: { ...rect(a[0], a[1], a[2], a[2]), fill }, blobB: rect(b[0], b[1], b[2], b[2]), blobC: rect(c[0], c[1], c[2], c[2]),
})
/** card i as a key-fact card: the disc with its number inside it, then heading and text */
const card = (i: number, c: Place, n: string, h: string, t: string, o: { npx?: number; tpx?: number } = {}): Record<string, Place> => ({
  [`c${i}`]: c, [`d${i}`]: ctr(c.x + 100, c.y + 100, 120), [`n${i}`]: { ...ctr(c.x + 100, c.y + 100, 120), text: n, px: o.npx ?? 52 },
  [`h${i}`]: tx(c.x + 40, c.y + 192, c.w - 80, 50, h), [`t${i}`]: tx(c.x + 40, c.y + 250, c.w - 80, c.h - 270, t, { px: o.tpx ?? 30 }),
})

const FACTS = [
  ['Move a little', 'Regular movement supports the heart, mood and sleep. Short walks count.'],
  ['Eat well', 'A mix of vegetables, fruit, whole grains and water keeps energy steady.'],
  ['Rest and recover', 'Good sleep and quiet breaks help the body repair and the mind settle.'],
] as const
const STEPS = [
  ['Build the habit', 'Pick one small action and tie it to something you already do each day.'],
  ['Check in early', 'Book the regular check-ups and screenings that suit your age.'],
  ['Ask for support', 'Talk with a health professional or someone you trust before worries grow.'],
] as const
const DAY = [
  ['07:00', 'Wake and stretch', 'Open the curtains, drink a glass of water and move gently for five minutes.'],
  ['12:30', 'A real lunch break', 'Step away from the screen, eat slowly and take a short walk outside.'],
  ['16:00', 'Move and breathe', 'Take a brisk walk or spend a few minutes on slow, steady breathing.'],
  ['18:30', 'Cook and share', 'Add vegetables to the plate and eat together whenever you can.'],
  ['21:00', 'Wind down', 'Dim the lights, put screens away and do something quiet.'],
  ['22:30', 'Sleep', 'Aim for a regular bedtime so your body learns its own rhythm.'],
] as const
/** the six stops of a day, 620 px apart; the camera has moved `shift` px to the right */
const strip = (shift: number): Record<string, Place> => Object.assign({}, ...DAY.map(([time, h, t], i) => card(i + 1, rect(90 + 620 * i - shift, 430, 540, 470), time, h, t, { npx: 30 })))

const head = (px: number, extra = {}) => ({ kind: 'text' as const, text: '', px, weight: 800, color: C.ink, face: 'heading' as const, lh: 1.15, ...extra })
const body = (px: number, extra = {}) => ({ kind: 'text' as const, text: '', px, weight: 400, color: C.mute, lh: 1.45, ...extra })
const card0 = { kind: 'shape' as const, radius: 40, fill: '#FFFFFF', stroke: C.edge, strokeW: 2 }
const disc = (fill: string) => ({ kind: 'shape' as const, shape: 'ellipse' as const, fill, park: 'b' as const })
const DISC = [C.green, C.blue, C.coral, C.green, C.blue, C.coral]
const goals = [['Sleep', '7 of 8 h', 0.875], ['Water', '5 of 8 cups', 0.625], ['Movement', '24 of 30 min', 0.8]] as const

export const EDU_HEALTH = authored(
  {
    id: 'edu-health', category: 'education', name: 'Health & Wellness', tagline: 'Calm, clear health talks with a gentle pulse',
    description: 'A light, calm deck for health and wellbeing: a heartbeat line that crosses the cover and becomes the timeline of a daily routine, key facts that turn into steps, a body diagram, signs to notice, progress bars that fill, do and do-not panels that trade places as myths and facts, and a calm call-out for when to get help.',
    audience: 'The Health & Wellness template suits health education, patient information and safety training, hospital and clinic talks, nutrition and fitness, mental health and mindfulness, yoga and wellness retreats, public-health campaigns and any talk that should feel calm, caring and trustworthy.',
    topics: ['health', 'healthcare', 'wellness', 'medical', 'medicine', 'patient', 'patient safety', 'patient information', 'hospital', 'clinic', 'nurse', 'doctor', 'nutrition', 'diet', 'fitness', 'exercise', 'mental health', 'mindfulness', 'yoga', 'wellbeing', 'public health', 'health campaign', 'first aid', 'hygiene', 'sleep', 'stress', 'preventive care', 'safety training', 'healthy habits', 'wellness retreat'],
    fonts: { heading: 'Outfit', body: 'Nunito Sans' },
    colors: { background: '#F2FAF6', surface: '#FFFFFF', textPrimary: '#12332A', textSecondary: '#4B6B61', primary: '#1F9D74', secondary: '#3A86FF', accent: '#FF7A8A', onPrimary: '#FFFFFF' },
    background: '#F2FAF6',
  },
  {
    objects: {
      blob: { kind: 'shape', shape: 'ellipse', fill: C.mint },
      blobB: { kind: 'shape', shape: 'ellipse', fill: C.sky },
      blobC: { kind: 'shape', shape: 'ellipse', fill: C.rose },
      rg1: { kind: 'shape', shape: 'ellipse', stroke: C.coral, strokeW: 3, park: 'b' }, rg2: { kind: 'shape', shape: 'ellipse', stroke: C.coral, strokeW: 3, park: 'b' },
      ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`pu${i + 1}`, { kind: 'shape', radius: 4, fill: C.green }])),
      l1: { kind: 'shape', radius: 3, fill: C.link }, l2: { kind: 'shape', radius: 3, fill: C.link }, l3: { kind: 'shape', radius: 3, fill: C.link },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`c${i}`, { ...card0, park: 'b' }])),
      tr1: { kind: 'shape', radius: 14, fill: C.mint }, tr2: { kind: 'shape', radius: 14, fill: C.mint }, tr3: { kind: 'shape', radius: 14, fill: C.mint },
      f1: { kind: 'shape', radius: 14, fill: C.green }, f2: { kind: 'shape', radius: 14, fill: C.blue }, f3: { kind: 'shape', radius: 14, fill: C.coral },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`d${i}`, disc(DISC[i - 1]!)])),
      garden: { kind: 'image', art: 'health-garden.webp', alt: 'A serene wellness room with a round window onto a garden', radius: 40, park: 'r' },
      leaf: { kind: 'image', art: 'health-leaf.webp', alt: 'A sprig of a leafy green plant', park: 'r' },
      glass: { kind: 'image', art: 'health-glass.webp', alt: 'A glass of water with a lemon slice and mint', park: 'b' },
      stetho: { kind: 'image', art: 'health-stetho.webp', alt: 'A stethoscope with soft blue tubing', park: 'r' },
      heart: { kind: 'image', art: 'health-heart.webp', alt: 'A soft coral heart with a heartbeat line', park: 'b' },
      fruit: { kind: 'image', art: 'health-fruit.webp', alt: 'A wooden bowl of fresh fruit', park: 'b' },
      mat: { kind: 'image', art: 'health-mat.webp', alt: 'A rolled yoga mat with a cushion and a water bottle', park: 'r' },
      brand: { kind: 'text', text: 'Health & Wellness', px: 24, weight: 800, color: C.mute, face: 'heading' },
      page: { kind: 'text', text: 'Sample talk  ·  2026', px: 24, weight: 500, color: C.mute, align: 'r' },
      k: { kind: 'text', text: '', px: 24, weight: 800, color: C.deep, caps: true, spc: 4, face: 'heading' },
      title: head(64, { lh: 1.05, spc: -1 }),
      body: body(34),
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((i) => [
        [`n${i}`, { kind: 'text', text: '', px: 52, weight: 800, color: '#FFFFFF', face: 'heading', align: 'ctr', anchor: 'ctr', park: 'b' }],
        [`h${i}`, head(38, { lh: 1.1, park: 'b' })],
        [`t${i}`, body(30, { park: 'b' })],
      ])),
      v1: head(40, { align: 'r', anchor: 'ctr', color: C.deep }), v2: head(40, { align: 'r', anchor: 'ctr', color: C.deep }), v3: head(40, { align: 'r', anchor: 'ctr', color: C.deep }),
    },
    order: ['blob', 'blobB', 'blobC', 'rg1', 'rg2', 'pu1', 'pu2', 'pu3', 'pu4', 'pu5', 'pu6', 'pu7', 'pu8', 'pu9', 'l1', 'l2', 'l3', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'tr1', 'tr2', 'tr3', 'f1', 'f2', 'f3',
      'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'garden', 'leaf', 'glass', 'stetho', 'heart', 'fruit', 'mat', 'brand', 'page', 'k', 'title', 'body',
      'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'h1', 't1', 'h2', 't2', 'h3', 't3', 'h4', 't4', 'h5', 't5', 'h6', 't6', 'v1', 'v2', 'v3'],
    scenes: [
      {
        id: 's1', title: 'Welcome', purpose: 'The opening: a big title on the left, a leaf and a glass of water on a mint circle, and the heartbeat line under the words.',
        place: {
          ...blobs([1000, 140, 840], [780, 60, 150], [-110, 800, 280]), ...pulse(100, 1000, 880, 90, 8), leaf: rect(1190, 245, 460, 690), glass: rect(1560, 700, 300, 300), ...HEAD,
          k: tx(100, 200, 900, 32, 'Health education  ·  Community talk'), title: tx(100, 255, 880, 290, 'Feel well,\nstay well', { px: 128 }),
          body: tx(100, 580, 780, 130, 'A calm guide to the habits, signs and support that keep us well.', { px: 36 }),
        },
      },
      {
        id: 's2', title: 'Why it matters', purpose: 'The mint circle grows through the whole slide and becomes the background of the first message; the leaf steps aside and a stethoscope slides in.',
        place: {
          ...blobs([-340, -760, 2600], [1130, 60, 130], [-110, 860, 250], C.mint2), ...pulse(100, 1000, 960, 40, 8), leaf: rect(1620, 520, 260, 390), stetho: rect(1130, 330, 520, 520), ...HEAD,
          k: tx(100, 200, 900, 32, 'Why it matters'), title: tx(100, 250, 1000, 200, 'Small habits protect\nbig things', { px: 84 }),
          body: tx(100, 500, 960, 150, 'Most long-term health problems can be prevented or delayed by sleep, movement, food and early check-ups. Add one local fact here, with its source.', { px: 32 }),
        },
      },
      {
        id: 's3', title: 'Key facts', purpose: 'The circle shrinks to a corner; three cards rise, each led by a numbered disc, and the heartbeat sits beside the title.',
        place: {
          ...blobs([1560, -250, 650], [-100, 880, 240], [1790, 880, 250]), ...HEADPULSE(), ...HEAD, ...top('Key facts', 'Three things to know'),
          ...row(3, 100, 400, 546, 440, 41).reduce((o, c, i) => ({ ...o, ...card(i + 1, c, String(i + 1), FACTS[i]![0], FACTS[i]![1]) }), {} as Record<string, Place>),
        },
      },
      {
        id: 's4', title: 'In the body', purpose: 'The cards stack into labels on the right; a heart arrives with ripples, joined to the three discs by lines.',
        place: {
          ...blobs([1560, -300, 600], [-100, 900, 220], [1800, 700, 220]), ...HEADPULSE(20), ...HEAD, ...top('In the body', 'How a habit helps the heart'),
          rg1: ctr(400, 650, 540), rg2: ctr(400, 650, 660, 660), heart: rect(180, 430, 440, 440),
          l1: link(400, 650, 1090, 430), l2: link(400, 650, 1090, 655), l3: link(400, 650, 1090, 880),
          ...col(3, 1000, 330, 820, 200, 25).reduce((o, c, i) => ({
            ...o, [`c${i + 1}`]: c, [`d${i + 1}`]: ctr(c.x + 90, c.y + 100, 120), [`n${i + 1}`]: { ...ctr(c.x + 90, c.y + 100, 120), text: String(i + 1), px: 52 },
            [`h${i + 1}`]: tx(c.x + 180, c.y + 34, 610, 48, ['Movement', 'Circulation', 'Recovery'][i]!, { px: 38 }),
            [`t${i + 1}`]: tx(c.x + 180, c.y + 88, 610, 100, ['Muscles ask for more oxygen and the heart beats a little faster.', 'Blood carries oxygen and nutrients to every part of the body.', 'Rest lets the heart settle and the body repair itself.'][i]!, { px: 28 }),
          }), {} as Record<string, Place>),
        },
      },
      {
        id: 's5', title: 'Signs to notice', purpose: 'The cards flatten into five rounded rows, the discs shrink into markers, and a glass of water arrives on the left.',
        place: {
          ...blobs([1560, -260, 620], [-100, 860, 260], [1780, 900, 230]), ...HEADPULSE(), ...HEAD, ...top('Signs to notice', 'Signs worth noticing'),
          glass: rect(150, 610, 380, 380), body: tx(100, 330, 520, 170, 'Many conditions give early signals. Learning the common ones helps us act sooner.', { px: 32 }),
          ...col(5, 680, 330, 1140, 112, 18).reduce((o, c, i) => ({
            ...o, [`c${i + 1}`]: c, [`d${i + 1}`]: ctr(c.x + 56, c.y + 56, 64), [`n${i + 1}`]: { ...ctr(c.x + 56, c.y + 56, 64), text: '', px: 28 },
            [`h${i + 1}`]: tx(c.x + 116, c.y + 14, 990, 44, ['Constant tiredness', 'Changes in mood', 'Aches that linger', 'Sleep trouble', 'Changes in appetite'][i]!, { px: 34 }),
            [`t${i + 1}`]: tx(c.x + 116, c.y + 60, 990, 40, ['Feeling worn out even after a full night of sleep.', 'Feeling low, anxious or irritable for days in a row.', 'Pain or stiffness that does not ease with rest.', 'Finding it hard to fall asleep, or waking again and again.', 'Eating much more or much less than is usual for you.'][i]!, { px: 28 }),
          }), {} as Record<string, Place>),
        },
      },
      {
        id: 's6', title: 'Prevention', purpose: 'The rows grow back into three tall cards that climb like steps, the discs are numbered again, and a bowl of fruit slides in.',
        place: {
          ...blobs([-240, 760, 520], [1000, 960, 160], [1790, 900, 230]), ...HEADPULSE(48), ...HEAD, ...top('Prevention', 'Three steps to prevention'), fruit: rect(1560, 80, 300, 300),
          ...[rect(100, 540, 546, 420), rect(687, 470, 546, 490), rect(1274, 400, 546, 560)].reduce((o, c, i) => ({ ...o, ...card(i + 1, c, String(i + 1), STEPS[i]![0], STEPS[i]![1]) }), {} as Record<string, Place>),
        },
      },
      {
        id: 's7', title: 'Routine: daytime', purpose: 'The heartbeat flattens into a timeline across the slide; the steps become the first three stops of a day, with more waiting off to the right.',
        place: {
          ...blobs([1500, -300, 600], [-100, 900, 240], [1800, 960, 200]), ...pulse(-60, 1980, 530, 0, 8), ...HEAD, ...top('Daily routine  ·  Daytime', 'A calm day, hour by hour'), ...strip(0),
        },
      },
      {
        id: 's8', title: 'Routine: evening', purpose: 'The camera pans three stops along the line: the day slides out to the left and the evening arrives; a yoga mat slides in.',
        place: {
          ...blobs([800, -320, 600], [-700, 900, 240], [1100, 960, 200]), ...pulse(-60, 1980, 530, 0, 8), ...HEAD, ...top('Daily routine  ·  Evening', 'A calm day, hour by hour'), ...strip(1860), mat: rect(1560, 80, 300, 300),
          ...Object.assign({}, ...goals.map(([, , p], i) => { const r = rect(100, 350 + i * 210, 1720, 190); return { [`tr${i + 1}`]: at(rect(r.x + 640, r.y + 81, 720, 28), { a: 0 }), [`f${i + 1}`]: at(rect(r.x + 640, r.y + 81, 6, 28), { a: 0 }) } })),
        },
      },
      {
        id: 's9', title: 'Numbers that matter', purpose: 'The last three stops collapse into three wide rows; each has a track whose coloured bar grows to its value (sample figures).',
        place: {
          ...blobs([-220, 800, 520], [1700, 60, 140], [1800, 960, 200]), ...HEADPULSE(30), ...HEAD, ...top('Daily goals  ·  Sample figures', 'Numbers that matter'),
          ...Object.assign({}, ...goals.map(([label, val, p], i) => {
            const c = rect(100, 350 + i * 210, 1720, 190)
            return {
              [`c${i + 4}`]: c, [`d${i + 4}`]: ctr(c.x + 90, c.y + 95, 120), [`n${i + 4}`]: { ...ctr(c.x + 90, c.y + 95, 120), text: String(i + 1), px: 52 },
              [`h${i + 4}`]: tx(c.x + 190, c.y + 68, 420, 52, label, { px: 40 }),
              [`tr${i + 1}`]: rect(c.x + 640, c.y + 81, 720, 28), [`f${i + 1}`]: rect(c.x + 640, c.y + 81, 720 * p, 28), [`v${i + 1}`]: tx(c.x + 1380, c.y + 63, 300, 64, val),
            }
          })),
        },
      },
      {
        id: 's10', title: 'Do and do not', purpose: 'Rows two and one open up into two big panels side by side: a green one for what to do and a coral one for what to avoid.',
        place: {
          ...blobs([1560, -280, 600], [-100, 900, 240], [1800, 960, 200]), ...HEADPULSE(), ...HEAD, ...top('Everyday guide', 'Do and do not'),
          c1: { ...rect(100, 340, 850, 420), fill: C.okP }, c2: { ...rect(970, 340, 850, 420), fill: C.roseP },
          d1: ctr(100 + 80, 340 + 80, 72), n1: { ...ctr(180, 420, 72), text: '+', px: 40 }, d2: { ...ctr(970 + 80, 420, 72), fill: C.coral }, n2: { ...ctr(1050, 420, 72), text: '–', px: 40 },
          h1: tx(236, 376, 600, 60, 'Do', { px: 48, color: C.deep }), h2: tx(1106, 376, 600, 60, 'Do not', { px: 48, color: C.coralDeep }),
          t1: tx(150, 490, 750, 380, 'Drink water through the day\nMove a little every day\nSleep at regular times\nTalk to someone you trust', { px: 38 }),
          t2: tx(1020, 490, 750, 380, 'Skip meals to save time\nSit for hours without a break\nIgnore pain that keeps returning\nCompare yourself with others', { px: 38 }),
        },
      },
      {
        id: 's11', title: 'Myths and facts', purpose: 'The two panels trade places: the green one slides right and becomes the facts, the coral one slides left and becomes the myths.',
        place: {
          ...blobs([-240, -280, 560], [1700, 900, 160], [-100, 960, 200]), ...HEADPULSE(), ...HEAD, ...top('Myth or fact?', 'Myths and facts'),
          c1: { ...rect(970, 340, 850, 420), fill: C.okP }, c2: { ...rect(100, 340, 850, 420), fill: C.roseP },
          d1: ctr(1050, 420, 72), n1: { ...ctr(1050, 420, 72), text: 'F', px: 40 }, d2: { ...ctr(180, 420, 72), fill: C.coral }, n2: { ...ctr(180, 420, 72), text: 'M', px: 40 },
          h1: tx(1106, 376, 600, 60, 'Fact', { px: 48, color: C.deep }), h2: tx(236, 376, 600, 60, 'Myth', { px: 48, color: C.coralDeep }),
          t1: tx(1020, 490, 750, 400, 'Short, regular movement helps too. Choose something you enjoy.\n\nStress is common and human. Talking early makes it easier to manage.', { px: 36 }),
          t2: tx(150, 490, 750, 400, 'You must train hard for it to count.\n\nFeeling stressed means you are weak.', { px: 36 }),
        },
      },
      {
        id: 's12', title: 'When to get help', purpose: 'A circle grows from a point through the whole slide and becomes a soft blue; the panels shrink into two calm call-out cards, and the heart returns with its ripples.',
        place: {
          ...blobs([-340, -760, 2600], [1700, 960, 160], [1860, 400, 150], C.sky2), ...pulse(1000, 1820, 975, 40, 8), ...HEAD,
          k: tx(100, 140, 900, 32, 'When to get help'), title: tx(100, 195, 860, 200, 'Reach out\nearly', { px: 84 }),
          body: tx(100, 420, 820, 150, 'Contact a health professional if a symptom is new, severe or does not improve, or if you feel unsafe or overwhelmed.', { px: 32 }),
          rg1: ctr(300, 830, 360), rg2: ctr(300, 830, 440), heart: rect(160, 690, 280, 280),
          c1: { ...rect(1000, 310, 820, 260), fill: '#FFFFFF' }, c2: { ...rect(1000, 610, 820, 260), fill: C.roseP },
          d1: { ...ctr(1100, 440, 120), fill: C.coral }, n1: { ...ctr(1100, 440, 120), text: '!', px: 56 }, d2: { ...ctr(1100, 740, 120), fill: C.green }, n2: { ...ctr(1100, 740, 120), text: '+', px: 56 },
          h1: tx(1200, 360, 580, 50, 'Urgent help', { color: C.ink, px: 38 }), t1: tx(1200, 418, 580, 120, 'In an emergency, call your local emergency number straight away.', { px: 30 }),
          h2: tx(1200, 660, 580, 50, 'Talk to someone', { color: C.ink, px: 38 }), t2: tx(1200, 718, 580, 120, 'Speak with a doctor, nurse or pharmacist when a worry does not ease.', { px: 30 }),
        },
      },
      {
        id: 's13', title: 'Resources', purpose: 'The cover returns: the blue circle settles back into the mint circle, the leaf stands on it with a picture of a calm garden room, and contact details sit under the heartbeat.',
        place: {
          ...blobs([1000, 140, 840], [780, 60, 150], [-110, 800, 280]), ...pulse(100, 1000, 900, 60, 8), garden: rect(1000, 150, 820, 615), leaf: rect(1590, 560, 300, 450), ...HEAD,
          k: tx(100, 200, 900, 32, 'Resources and contacts'), title: tx(100, 255, 880, 150, 'Thank you', { px: 112 }),
          body: tx(100, 450, 820, 320, 'Your local clinic or health service\nyourclinic.example/wellbeing\nhello@yourclinic.example\nHealth line: 000 000 000 (sample)', { px: 34 }),
        },
      },
    ],
  },
)
