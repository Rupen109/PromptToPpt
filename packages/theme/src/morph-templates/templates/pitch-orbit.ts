import { authored, at, center, rect, W, H } from '../author'
import type { Place } from '../author'

/**
 * Orbit Pitch: an investor deck where one glowing core and its orbits carry the whole story. The core travels (centre, left, right, shrinking to the smallest circle of the market,
 * growing for the ask), the orbit rings re-centre around it, the satellites slide along their rings to new angles, and the glass cards trade places. Market sizing is three nested
 * circles; traction is bars that rise from the bottom as the cards leave. Original choreography for SlidesDone.
 */
const C = { cyan: '#5CE1E6', violet: '#8B5CF6', lime: '#C6F432', ink: '#EEF2FF', mute: '#A3AED0', line: '#8FA0D8' }
const ring = (cx: number, cy: number, r: number): Place => ({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r })
const orbit = (cx: number, cy: number, r: number, deg: number, size: number): Place => ({ x: cx + r * Math.cos((deg * Math.PI) / 180) - size / 2, y: cy + r * Math.sin((deg * Math.PI) / 180) - size / 2, w: size, h: size })
/** the three rings and four satellites of a core at (cx, cy): ring radii, the angle of each satellite (on ring 1, 2, 3, 2), their sizes, and how visible the rings are */
const sys = (cx: number, cy: number, r: [number, number, number], deg: [number, number, number, number], sz: [number, number, number, number] = [120, 96, 140, 84], a: [number, number, number] = [0.4, 0.28, 0.2]) => ({
  ...Object.fromEntries(Object.entries({ r1: a[0], r2: a[1], r3: a[2] }).map(([k, v]) => [k, at(ring(cx, cy, r[Number(k[1]) - 1]!), { a: v })])),
  s1: orbit(cx, cy, r[0], deg[0], sz[0]), s2: orbit(cx, cy, r[1], deg[1], sz[1]), s3: orbit(cx, cy, r[2], deg[2], sz[2]), s4: orbit(cx, cy, r[1], deg[3], sz[3]),
})
/** a glass card: its faint fill and its fine edge */
const glass = (k: 'big' | 'c1' | 'c2' | 'c3', p: Place): Record<string, Place> => ({ [k]: at(p, { a: 0.07 }), [`${k === 'big' ? 'bigE' : 'e' + k[1]}`]: at(p, { a: 0.4 }) })
const HEAD = { brand: rect(80, 52, 400, 30), page: rect(1240, 52, 600, 30) }
const NEBULA = (dx = 0, dy = 0, k = 1) => at(rect(-(k - 1) * 960 + dx, -(k - 1) * 540 + dy, W * k, H * k), {})
const GRAD = { from: '#0A0F24', to: '#1A1146', angle: 160 }

export const PITCH_ORBIT = authored(
  {
    id: 'pitch-orbit', category: 'pitch', name: 'Orbit Pitch', tagline: 'Every idea in motion around one core',
    description: 'An investor deck where one glowing core and its orbits carry the whole story: problem, solution, market, product, traction, pricing, team, roadmap and ask, each flowing into the next as the orbits turn.',
    audience: 'The Orbit Pitch template suits startup and investor pitches, fundraising and seed decks, product and platform stories, accelerator demo days and any talk where one idea sits at the centre of everything else.',
    topics: ['pitch', 'pitch deck', 'investor', 'investors', 'startup', 'fundraising', 'seed', 'venture', 'founder', 'demo day', 'platform', 'saas', 'technology', 'business model'],
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
    colors: { background: '#0A0F24', surface: '#161C3A', textPrimary: '#EEF2FF', textSecondary: '#A3AED0', primary: '#5CE1E6', secondary: '#8B5CF6', accent: '#C6F432', onPrimary: '#0A0F24' },
    background: '#0A0F24',
  },
  {
    objects: {
      glow: { kind: 'image', art: 'orbit-nebula.webp', alt: 'A soft blue and violet nebula' },
      m1: { kind: 'shape', shape: 'ellipse', gradient: { from: '#5CE1E6', to: '#8B5CF6', angle: 135 }, park: 'b' },
      m2: { kind: 'shape', shape: 'ellipse', gradient: { from: '#5CE1E6', to: '#8B5CF6', angle: 135 }, park: 'b' },
      m3: { kind: 'shape', shape: 'ellipse', gradient: { from: '#C6F432', to: '#5CE1E6', angle: 135 }, park: 'b' },
      r3: { kind: 'shape', shape: 'ellipse', stroke: C.line, strokeW: 2 }, r2: { kind: 'shape', shape: 'ellipse', stroke: C.line, strokeW: 2 }, r1: { kind: 'shape', shape: 'ellipse', stroke: C.line, strokeW: 2 },
      big: { kind: 'shape', radius: 44, fill: '#FFFFFF', park: 't' }, bigE: { kind: 'shape', radius: 44, stroke: '#FFFFFF', strokeW: 2, park: 't' },
      c1: { kind: 'shape', radius: 36, fill: '#FFFFFF', park: 'b' }, e1: { kind: 'shape', radius: 36, stroke: '#FFFFFF', strokeW: 2, park: 'b' },
      c2: { kind: 'shape', radius: 36, fill: '#FFFFFF', park: 'b' }, e2: { kind: 'shape', radius: 36, stroke: '#FFFFFF', strokeW: 2, park: 'b' },
      c3: { kind: 'shape', radius: 36, fill: '#FFFFFF', park: 'b' }, e3: { kind: 'shape', radius: 36, stroke: '#FFFFFF', strokeW: 2, park: 'b' },
      line: { kind: 'shape', radius: 3, fill: '#8FA0D8', park: 'l' },
      b1: { kind: 'shape', radius: 30, gradient: { from: '#5CE1E6', to: '#8B5CF6', angle: 180 }, park: 'b' }, b2: { kind: 'shape', radius: 30, gradient: { from: '#5CE1E6', to: '#8B5CF6', angle: 180 }, park: 'b' },
      b3: { kind: 'shape', radius: 30, gradient: { from: '#5CE1E6', to: '#8B5CF6', angle: 180 }, park: 'b' }, b4: { kind: 'shape', radius: 30, gradient: { from: '#C6F432', to: '#5CE1E6', angle: 180 }, park: 'b' },
      core: { kind: 'image', art: 'orbit-core.webp', alt: 'A glowing iridescent glass sphere' },
      s1: { kind: 'image', art: 'orbit-cyan.webp', alt: 'A cyan glass orb', park: 'r' }, s2: { kind: 'image', art: 'orbit-violet.webp', alt: 'A violet glass orb', park: 'l' },
      s3: { kind: 'image', art: 'orbit-lime.webp', alt: 'A lime glass orb', park: 'r' }, s4: { kind: 'image', art: 'orbit-pink.webp', alt: 'A pink glass orb', park: 'l' },
      brand: { kind: 'text', text: 'ORBIT', px: 22, weight: 700, color: C.ink, caps: true, spc: 6 },
      page: { kind: 'text', text: 'Seed deck  ·  2026', px: 22, weight: 500, color: C.mute, align: 'r' },
      kc: { kind: 'text', text: '', px: 26, weight: 600, color: C.lime, caps: true, spc: 6, align: 'ctr' },
      k: { kind: 'text', text: '', px: 24, weight: 600, color: C.lime, caps: true, spc: 5 },
      titleC: { kind: 'text', text: '', px: 64, weight: 700, color: C.ink, face: 'heading', lh: 1.05, spc: -1.5, align: 'ctr' },
      title: { kind: 'text', text: '', px: 72, weight: 700, color: C.ink, face: 'heading', lh: 1.05, spc: -1.5 },
      bodyC: { kind: 'text', text: '', px: 34, weight: 400, color: C.mute, lh: 1.45, align: 'ctr' },
      body: { kind: 'text', text: '', px: 32, weight: 400, color: C.mute, lh: 1.45 },
      statC: { kind: 'text', text: '', px: 200, weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -6, align: 'ctr' },
      stat: { kind: 'text', text: '', px: 120, weight: 700, color: C.ink, face: 'heading', lh: 1, spc: -3 },
      statLabel: { kind: 'text', text: '', px: 28, weight: 500, color: C.mute, lh: 1.35 },
      h1: { kind: 'text', text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 }, t1: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.45 },
      h2: { kind: 'text', text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 }, t2: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.45 },
      h3: { kind: 'text', text: '', px: 40, weight: 700, color: C.ink, face: 'heading', lh: 1.1 }, t3: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.45 },
      tag1: { kind: 'text', text: '', px: 24, weight: 700, color: C.cyan, caps: true, spc: 4, align: 'ctr' }, tag2: { kind: 'text', text: '', px: 24, weight: 700, color: C.cyan, caps: true, spc: 4, align: 'ctr' }, tag3: { kind: 'text', text: '', px: 24, weight: 700, color: C.cyan, caps: true, spc: 4, align: 'ctr' },
      in1: { kind: 'text', text: '', px: 64, weight: 700, color: '#0A0F24', face: 'heading', align: 'ctr' }, in2: { kind: 'text', text: '', px: 64, weight: 700, color: '#0A0F24', face: 'heading', align: 'ctr' },
      in3: { kind: 'text', text: '', px: 64, weight: 700, color: '#0A0F24', face: 'heading', align: 'ctr' }, in4: { kind: 'text', text: '', px: 64, weight: 700, color: '#0A0F24', face: 'heading', align: 'ctr' },
      nm1: { kind: 'text', text: '', px: 36, weight: 700, color: C.ink, face: 'heading', align: 'ctr' }, nm2: { kind: 'text', text: '', px: 36, weight: 700, color: C.ink, face: 'heading', align: 'ctr' },
      nm3: { kind: 'text', text: '', px: 36, weight: 700, color: C.ink, face: 'heading', align: 'ctr' }, nm4: { kind: 'text', text: '', px: 36, weight: 700, color: C.ink, face: 'heading', align: 'ctr' },
      rl1: { kind: 'text', text: '', px: 26, weight: 400, color: C.mute, align: 'ctr', lh: 1.35 }, rl2: { kind: 'text', text: '', px: 26, weight: 400, color: C.mute, align: 'ctr', lh: 1.35 },
      rl3: { kind: 'text', text: '', px: 26, weight: 400, color: C.mute, align: 'ctr', lh: 1.35 }, rl4: { kind: 'text', text: '', px: 26, weight: 400, color: C.mute, align: 'ctr', lh: 1.35 },
    },
    order: ['glow', 'm1', 'm2', 'm3', 'r3', 'r2', 'r1', 'big', 'bigE', 'c1', 'e1', 'c2', 'e2', 'c3', 'e3', 'line', 'b1', 'b2', 'b3', 'b4', 'core', 's1', 's2', 's3', 's4',
      'brand', 'page', 'kc', 'k', 'titleC', 'title', 'bodyC', 'body', 'statC', 'stat', 'statLabel', 'h1', 't1', 'h2', 't2', 'h3', 't3', 'tag1', 'tag2', 'tag3', 'in1', 'in2', 'in3', 'in4', 'nm1', 'nm2', 'nm3', 'nm4', 'rl1', 'rl2', 'rl3', 'rl4'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening: the glowing core in the middle with three orbits around it, the name over it.', grad: GRAD,
        place: {
          glow: NEBULA(), core: center(500, 500, 0, -90), ...sys(960, 540, [360, 560, 780], [205, -35, 35, 125]), ...HEAD,
          kc: { ...rect(510, 118, 900, 40), text: 'SEED ROUND  ·  2026' }, titleC: { ...rect(260, 340, 1400, 230), text: 'Orbit', px: 200 }, bodyC: { ...rect(560, 770, 800, 60), text: 'The operating system for small teams.', px: 40 },
        },
      },
      {
        id: 's2', title: 'Problem', purpose: 'The core moves left and shrinks; a glass card on the right states the problem.', grad: GRAD,
        place: {
          glow: NEBULA(-60, 0, 1.12), core: rect(220, 320, 440, 440), ...sys(440, 540, [260, 420, 580], [300, 35, 215, 150], [110, 90, 130, 80]), ...glass('big', rect(930, 150, 860, 780)), ...HEAD,
          k: rect(1000, 230, 700, 36), title: { ...rect(1000, 285, 720, 270), text: 'Small teams drown in tools' }, body: { ...rect(1000, 600, 710, 240), text: 'Add the problem in two or three sentences: who feels it, how often, and what it costs them today.' },
        },
      },
      {
        id: 's3', title: 'Solution', purpose: 'The core crosses to the right; the card moves to the left with the solution.', grad: GRAD,
        place: {
          glow: NEBULA(60, 0, 1.12), core: rect(1260, 320, 440, 440), ...sys(1480, 540, [260, 420, 580], [250, 335, 40, 150], [110, 90, 130, 80]), ...glass('big', rect(130, 150, 860, 780)), ...HEAD,
          k: { ...rect(200, 230, 700, 36), text: 'THE SOLUTION' }, title: { ...rect(200, 285, 720, 270), text: 'One home for every project' }, body: { ...rect(200, 600, 710, 240), text: 'Describe your product in one clear sentence. Then show the three things it does better than anything your customers use today.' },
        },
      },
      {
        id: 's4', title: 'Market', purpose: 'The core shrinks to the smallest of three nested circles: total, serviceable and obtainable market.', grad: GRAD,
        place: {
          glow: NEBULA(0, 0, 1.2), m1: at(ring(620, 540, 420), { a: 0.16 }), m2: at(ring(620, 540, 290), { a: 0.26 }), m3: at(ring(620, 540, 160), { a: 0.5 }),
          ...sys(620, 540, [160, 290, 420], [-60, 25, 150, 215], [66, 62, 80, 56], [0.6, 0.45, 0.35]), core: center(130, 130, -340, 0), ...HEAD,
          tag1: { ...rect(520, 138, 200, 32), text: 'TAM' }, tag2: { ...rect(520, 276, 200, 32), text: 'SAM' }, tag3: { ...rect(520, 404, 200, 32), text: 'SOM' },
          k: { ...rect(1180, 140, 640, 36), text: 'MARKET  ·  SAMPLE FIGURES' },
          stat: { ...rect(1180, 190, 640, 130), text: '$24B' }, statLabel: { ...rect(1180, 330, 600, 80), text: 'Total market: everything small teams spend on work tools each year' },
          h1: { ...rect(1180, 470, 640, 100), text: '$6B', px: 88 }, t1: { ...rect(1180, 580, 600, 80), text: 'Serviceable: the teams we can reach today' },
          h2: { ...rect(1180, 730, 640, 100), text: '$900M', px: 88 }, t2: { ...rect(1180, 840, 600, 80), text: 'Obtainable: the share we can win in three years' },
        },
      },
      {
        id: 's5', title: 'Product', purpose: 'The core rises to the top; three glass cards slide up, each with an orb for an icon.', grad: GRAD,
        place: {
          glow: NEBULA(0, -40, 1.1), core: center(230, 230, 0, -420), ...sys(960, 160, [190, 320, 460], [200, 330, 20, 150], [100, 80, 110, 70], [0.35, 0.25, 0.15]),
          ...glass('c1', rect(140, 480, 520, 450)), ...glass('c2', rect(700, 480, 520, 450)), ...glass('c3', rect(1260, 480, 520, 450)), ...HEAD,
          s1: rect(185, 520, 110, 110), s2: rect(745, 520, 110, 110), s3: rect(1305, 520, 110, 110),
          kc: { ...rect(710, 292, 500, 36), text: 'THE PRODUCT' }, titleC: { ...rect(360, 332, 1200, 100), text: 'Three things, done well', px: 64 },
          h1: { ...rect(185, 660, 440, 56), text: 'Plan' }, t1: { ...rect(185, 730, 440, 170), text: 'Boards, timelines and docs in a single shared view.' },
          h2: { ...rect(745, 660, 440, 56), text: 'Build' }, t2: { ...rect(745, 730, 440, 170), text: 'Turn every decision into a task with an owner and a date.' },
          h3: { ...rect(1305, 660, 440, 56), text: 'Ship' }, t3: { ...rect(1305, 730, 440, 170), text: 'See what is blocked, what is next and what just went out.' },
        },
      },
      {
        id: 's6', title: 'Traction', purpose: 'The cards drop away and four bars rise from the bottom while the core moves to the corner.', grad: GRAD,
        place: {
          glow: NEBULA(40, 0, 1.1), core: rect(1130, 90, 230, 230), b1: rect(1000, 680, 150, 220), b2: rect(1200, 560, 150, 340), b3: rect(1400, 420, 150, 480), b4: rect(1600, 260, 150, 640), ...HEAD,
          k: { ...rect(120, 300, 700, 36), text: 'TRACTION  ·  SAMPLE FIGURES' }, title: { ...rect(120, 355, 780, 250), text: 'Growing every month' },
          stat: { ...rect(120, 640, 700, 130), text: '4.2×' }, statLabel: { ...rect(120, 780, 700, 90), text: 'Revenue growth over the last twelve months' },
        },
      },
      {
        id: 's7', title: 'Business model', purpose: 'Three glass cards of rising height become pricing tiers, with the core small in the corner.', grad: GRAD,
        place: {
          glow: NEBULA(0, 20, 1.1), core: rect(120, 120, 150, 150), ...glass('c1', rect(230, 480, 460, 460)), ...glass('c2', rect(730, 380, 460, 560)), ...glass('c3', rect(1230, 280, 460, 660)), ...HEAD,
          kc: { ...rect(560, 120, 800, 36), text: 'BUSINESS MODEL' }, titleC: { ...rect(360, 165, 1200, 100), text: 'Pricing that grows with you', px: 64 },
          tag1: { ...rect(230, 520, 460, 32), text: 'START' }, tag2: { ...rect(730, 420, 460, 32), text: 'TEAM' }, tag3: { ...rect(1230, 320, 460, 32), text: 'SCALE' },
          h1: { ...rect(280, 590, 360, 90), text: '$9', px: 80 }, t1: { ...rect(280, 700, 360, 200), text: 'per person each month, for small teams just getting going.' },
          h2: { ...rect(780, 490, 360, 90), text: '$19', px: 80 }, t2: { ...rect(780, 600, 360, 280), text: 'per person each month, with reporting, roles and integrations.' },
          h3: { ...rect(1280, 390, 360, 90), text: 'Custom', px: 80 }, t3: { ...rect(1280, 500, 360, 380), text: 'for companies that need security reviews, support and a dedicated plan.' },
        },
      },
      {
        id: 's8', title: 'Team', purpose: 'Four orbs line up as the team, each with initials, a name and a role.', grad: GRAD,
        place: {
          glow: NEBULA(0, 0, 1.0), core: center(190, 190, 0, -400), ...sys(960, 150, [200, 330, 470], [190, 340, 25, 160], [70, 60, 80, 56], [0.3, 0.2, 0.12]), ...HEAD,
          s1: rect(260, 480, 200, 200), s2: rect(660, 480, 200, 200), s3: rect(1060, 480, 200, 200), s4: rect(1460, 480, 200, 200),
          in1: { ...rect(260, 530, 200, 100), text: 'AK' }, in2: { ...rect(660, 530, 200, 100), text: 'MR' }, in3: { ...rect(1060, 530, 200, 100), text: 'JS' }, in4: { ...rect(1460, 530, 200, 100), text: 'LT' },
          nm1: { ...rect(210, 710, 300, 50), text: 'Alex Kim' }, nm2: { ...rect(610, 710, 300, 50), text: 'Maya Rao' }, nm3: { ...rect(1010, 710, 300, 50), text: 'Jon Silva' }, nm4: { ...rect(1410, 710, 300, 50), text: 'Lena Tran' },
          rl1: { ...rect(210, 770, 300, 80), text: 'CEO, product' }, rl2: { ...rect(610, 770, 300, 80), text: 'CTO, engineering' }, rl3: { ...rect(1010, 770, 300, 80), text: 'Growth' }, rl4: { ...rect(1410, 770, 300, 80), text: 'Design' },
          kc: { ...rect(710, 280, 500, 36), text: 'THE TEAM' }, titleC: { ...rect(260, 320, 1400, 100), text: 'Built by people who have done this before', px: 56 },
        },
      },
      {
        id: 's9', title: 'Roadmap', purpose: 'A line draws across the slide; three cards below it are the next milestones, orbs sit on the line.', grad: GRAD,
        place: {
          glow: NEBULA(-30, 0, 1.1), core: rect(1520, 100, 240, 240), line: rect(200, 520, 1520, 6), ...HEAD,
          ...glass('c1', rect(160, 640, 520, 300)), ...glass('c2', rect(700, 640, 520, 300)), ...glass('c3', rect(1240, 640, 520, 300)),
          s1: rect(390, 490, 70, 70), s2: rect(930, 490, 70, 70), s3: rect(1470, 490, 70, 70),
          k: { ...rect(120, 140, 700, 36), text: 'ROADMAP' }, title: { ...rect(120, 190, 1200, 120), text: 'The next twelve months', px: 76 },
          tag1: { ...rect(335, 430, 180, 32), text: 'Q1' }, tag2: { ...rect(875, 430, 180, 32), text: 'Q2' }, tag3: { ...rect(1415, 430, 180, 32), text: 'Q3' },
          h1: { ...rect(205, 675, 440, 56), text: 'Launch' }, t1: { ...rect(205, 745, 440, 170), text: 'Open the product to the first hundred teams.' },
          h2: { ...rect(745, 675, 440, 56), text: 'Integrate' }, t2: { ...rect(745, 745, 440, 170), text: 'Connect the tools our customers already use.' },
          h3: { ...rect(1285, 675, 440, 56), text: 'Scale' }, t3: { ...rect(1285, 745, 440, 170), text: 'Add a second market and a sales team.' },
        },
      },
      {
        id: 's10', title: 'The ask', purpose: 'The core grows to fill the middle; orbits widen around it; one large number says what is being raised.', grad: GRAD,
        place: {
          glow: NEBULA(0, 0, 1.25), core: center(620, 620, 0, -20), ...sys(960, 540, [470, 650, 840], [215, -20, 40, 130], [130, 100, 150, 90], [0.45, 0.32, 0.22]), ...HEAD,
          kc: { ...rect(510, 215, 900, 40), text: 'THE ASK' }, statC: { ...rect(260, 320, 1400, 240), text: '$2.5M' }, bodyC: { ...rect(520, 870, 880, 120), text: 'Add what the round buys: the team, the product and your first thousand customers.', px: 34 },
        },
      },
      {
        id: 's11', title: 'Contact', purpose: 'The core settles to the left; a glass card on the right holds the contact details.', grad: GRAD,
        place: {
          glow: NEBULA(-60, 0, 1.12), core: rect(240, 260, 560, 560), ...sys(520, 540, [360, 540, 740], [200, -40, 160, 40], [120, 96, 130, 84]), ...glass('big', rect(1040, 170, 760, 740)), ...HEAD,
          k: { ...rect(1110, 250, 620, 36), text: "LET'S TALK" }, title: { ...rect(1110, 305, 620, 130), text: 'Thank you', px: 96 },
          body: { ...rect(1110, 480, 620, 360), text: 'hello@yourcompany.com\n+00 000 000 0000\nyourcompany.com\n@yourcompany', px: 36 },
        },
      },
    ],
  },
)
void H
