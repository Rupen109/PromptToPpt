import { authored, at, full, rect } from '../author'
import type { Place } from '../author'

/**
 * Sales Proposal: a client proposal that walks a buyer from their problem to a decision. Three white cards are the same objects all the way through: stat rows (the situation), need
 * columns, step columns, quote and result tiles, deliverable rows, three price tiers, timeline phases, a bento and the next steps. A skyline tile zooms through to fill the slide and
 * comes back as a small backdrop, one glossy hero object travels to a new place on every slide, the title scales between sizes and a rail turns from a connector into a timeline.
 * Original choreography for SlidesDone.
 */
const C = { ink: '#0F1B3D', mute: '#4A5878', blue: '#2F5BFF', teal: '#0FB5A6', orange: '#FF8A3D', bg: '#F6F8FC', line: '#E1E8F5' }
const HEAD = { brand: rect(80, 48, 520, 30), page: rect(1240, 48, 600, 30) }

type Kind = 'row' | 'col' | 'tier' | 'tile'
interface Words { n: string; h: string; t: string }
interface Look { fill?: string; nPx?: number; hPx?: number; tPx?: number; n?: string; h?: string; t?: string }

/** one white card with its three texts: number, heading and body, laid out as a row, a column or a price tier */
const card = (i: number, p: Place, kind: Kind, w: Words, o: Look = {}): Record<string, Place> => {
  const n = kind === 'row' ? rect(p.x + 36, p.y + p.h / 2 - 44, 190, 88) : kind === 'col' ? rect(p.x + 44, p.y + 36, p.w - 88, 80) : kind === 'tile' ? rect(p.x + 44, p.y + 20, p.w - 88, 104) : rect(p.x + 44, p.y + 96, p.w - 88, 96)
  const h = kind === 'row' ? rect(p.x + 250, p.y + 34, p.w - 290, 48) : kind === 'col' ? rect(p.x + 44, p.y + 130, p.w - 88, 48) : kind === 'tile' ? rect(p.x + 44, p.y + 134, p.w - 88, 44) : rect(p.x + 44, p.y + 36, p.w - 88, 48)
  const t = kind === 'row' ? rect(p.x + 250, p.y + 90, p.w - 290, p.h - 110) : kind === 'col' ? rect(p.x + 44, p.y + 192, p.w - 88, p.h - 220) : kind === 'tile' ? rect(p.x + 44, p.y + 184, p.w - 88, p.h - 200) : rect(p.x + 44, p.y + 222, p.w - 88, p.h - 250)
  return {
    [`c${i}`]: o.fill ? at(p, { fill: o.fill }) : p,
    [`n${i}`]: { ...n, text: w.n, ...(o.nPx ? { px: o.nPx } : {}), ...(o.n ? { color: o.n } : {}) },
    [`h${i}`]: { ...h, text: w.h, ...(o.hPx ? { px: o.hPx } : {}), ...(o.h ? { color: o.h } : {}) },
    [`t${i}`]: { ...t, text: w.t, ...(o.tPx ? { px: o.tPx } : {}), ...(o.t ? { color: o.t } : {}) },
  }
}
const cols3 = (y: number, h: number, w = 540, gap = 30): Place[] => [0, 1, 2].map((i) => rect(100 + i * (w + gap), y, w, h))
/** the soft colour fields behind the content: they drift a little on every slide */
const orbs = (a: [number, number, number], b: [number, number, number]) => ({ orbA: rect(a[0], a[1], a[2], a[2]), orbB: rect(b[0], b[1], b[2], b[2]) })

export const BIZ_SALES = authored(
  {
    id: 'biz-sales', category: 'business', fillPictures: ['tile'], name: 'Sales Proposal', tagline: 'A client proposal that walks from their need to the next step',
    description: "A light, confident sales proposal in twelve scenes: the client's situation, what we heard, our solution, how it works, proof, deliverables, three price options, the timeline, why us and one clear next step. The same cards turn into every layout.",
    audience: 'The Sales Proposal template suits client proposals, sales presentations, solution pitches, quotes and statements of work, partnership offers, RFP responses and customer meetings, and any talk that moves a buyer from their problem to a decision.',
    topics: ['sales', 'sales proposal', 'proposal', 'client proposal', 'sales presentation', 'sales pitch', 'solution pitch', 'quote', 'pricing', 'pricing options', 'statement of work', 'sow', 'rfp response', 'partnership proposal', 'customer meeting', 'account plan', 'b2b sales', 'offer', 'service offering', 'consulting proposal', 'agency proposal'],
    fonts: { heading: 'Work Sans', body: 'Inter' },
    colors: { background: '#F6F8FC', surface: '#FFFFFF', textPrimary: '#0F1B3D', textSecondary: '#4A5878', primary: '#2F5BFF', secondary: '#0FB5A6', accent: '#FF8A3D', onPrimary: '#FFFFFF' },
    background: '#F6F8FC',
  },
  {
    objects: {
      orbA: { kind: 'shape', shape: 'ellipse', gradient: { from: '#D9E4FF', to: '#F6F8FC', angle: 135 } },
      orbB: { kind: 'shape', shape: 'ellipse', gradient: { from: '#D3F1ED', to: '#F6F8FC', angle: 135 } },
      tile: { kind: 'image', art: 'sales-skyline.webp', alt: 'Glass office towers against a pale blue sky', fit: 'cover', radius: 48, park: 'r' },
      veil: { kind: 'shape', fill: C.bg },
      target: { kind: 'image', art: 'sales-target.webp', alt: 'A bullseye target with an orange dart' },
      box: { kind: 'image', art: 'sales-box.webp', alt: 'A white parcel with a blue ribbon' },
      pen: { kind: 'image', art: 'sales-pen.webp', alt: 'A navy fountain pen on a stack of contract pages' },
      rail: { kind: 'shape', radius: 3, fill: '#C9D4EC', park: 'l' },
      lg1: { kind: 'shape', radius: 22, fill: '#BFCAE2', park: 'b' }, lg2: { kind: 'shape', shape: 'ellipse', fill: '#BFCAE2', park: 'b' }, lg3: { kind: 'shape', shape: 'triangle', fill: '#BFCAE2', park: 'b' },
      lg4: { kind: 'shape', shape: 'ring', fill: '#BFCAE2', stroke: '#BFCAE2', strokeW: 14, park: 'b' }, lg5: { kind: 'shape', radius: 14, fill: '#BFCAE2', park: 'b' },
      c1: { kind: 'shape', radius: 36, fill: '#FFFFFF', stroke: C.line, strokeW: 2, park: 'b' }, c2: { kind: 'shape', radius: 36, fill: '#FFFFFF', stroke: C.line, strokeW: 2, park: 'b' }, c3: { kind: 'shape', radius: 36, fill: '#FFFFFF', stroke: C.line, strokeW: 2, park: 'b' },
      d1: { kind: 'shape', shape: 'ellipse', fill: C.blue }, d2: { kind: 'shape', shape: 'ellipse', fill: C.teal }, d3: { kind: 'shape', shape: 'ellipse', fill: C.orange },
      pill: { kind: 'shape', radius: 22, fill: C.orange, park: 't' },
      hero: { kind: 'image', art: 'sales-hero.webp', alt: 'Three glossy interlocked rings in blue, white and orange' },
      brand: { kind: 'text', text: 'Harbor & Co.', px: 24, weight: 700, color: C.ink },
      page: { kind: 'text', text: 'Prepared for Northwind Logistics', px: 24, weight: 500, color: C.mute, align: 'r' },
      k: { kind: 'text', text: '', px: 24, weight: 700, color: C.blue, caps: true, spc: 4 },
      title: { kind: 'text', text: '', px: 72, weight: 800, color: C.ink, face: 'heading', lh: 1.06, spc: -1.5 },
      body: { kind: 'text', text: '', px: 30, weight: 400, color: C.mute, lh: 1.45 },
      cap: { kind: 'text', text: '', px: 22, weight: 700, color: C.mute, caps: true, spc: 3, park: 'b' },
      pillT: { kind: 'text', text: '', px: 22, weight: 700, color: '#FFFFFF', caps: true, spc: 3, align: 'ctr', park: 't' },
      ...Object.fromEntries([1, 2, 3].flatMap((i) => [
        [`n${i}`, { kind: 'text', text: '', px: 64, weight: 800, color: C.blue, face: 'heading', lh: 1, spc: -1, park: 'b' }],
        [`h${i}`, { kind: 'text', text: '', px: 34, weight: 700, color: C.ink, face: 'heading', lh: 1.15, park: 'b' }],
        [`t${i}`, { kind: 'text', text: '', px: 27, weight: 400, color: C.mute, lh: 1.4, park: 'b' }],
      ])),
    },
    order: ['orbA', 'orbB', 'tile', 'veil', 'target', 'box', 'pen', 'rail', 'lg1', 'lg2', 'lg3', 'lg4', 'lg5', 'c1', 'c2', 'c3', 'd1', 'd2', 'd3', 'pill', 'hero',
      'brand', 'page', 'k', 'title', 'body', 'cap', 'pillT', 'n1', 'h1', 't1', 'n2', 'h2', 't2', 'n3', 'h3', 't3'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The opening: the proposal title on the left, a skyline tile on the right and the hero object overlapping it.', bg: C.bg,
        place: {
          ...orbs([-260, -300, 1100], [1250, 560, 760]), ...HEAD, tile: rect(1010, 130, 780, 830), veil: full({ a: 0 }),
          k: { ...rect(100, 250, 880, 34), text: 'SALES PROPOSAL FOR NORTHWIND LOGISTICS' },
          title: { ...rect(100, 310, 900, 310), px: 92, text: 'A faster way to\nship, built for\nNorthwind' },
          body: { ...rect(100, 660, 760, 110), text: 'Prepared for Dana Whitfield, COO,\nby Harbor & Co.  ·  18 Nov 2026' },
          hero: rect(840, 640, 390, 390, { rot: -8 }),
        },
      },
      {
        id: 's2', title: 'The situation', purpose: 'The skyline tile grows until it fills the slide, washed out behind three stat cards that slide up on the right.', bg: C.bg,
        place: {
          ...orbs([1000, -300, 1100], [-200, 600, 700]), ...HEAD, tile: full({ radius: 0 }), veil: full({ a: 0.88 }),
          k: { ...rect(100, 150, 860, 34), text: 'THE SITUATION  ·  SAMPLE FIGURES' },
          title: { ...rect(100, 200, 860, 160), px: 64, text: 'Northwind has outgrown\nits warehouse tools' },
          body: { ...rect(100, 400, 800, 200), text: 'Your network doubled in two years, but orders, carriers and depots still live in separate spreadsheets and inboxes.' },
          hero: rect(120, 650, 330, 330, { rot: 10 }),
          ...card(1, rect(1000, 190, 820, 200), 'row', { n: '38%', h: 'Late peak orders', t: 'Share of December orders that missed their date (sample).' }),
          ...card(2, rect(1000, 420, 820, 200), 'row', { n: '6', h: 'Separate systems', t: 'Screens opened to track a single order (sample).' }),
          ...card(3, rect(1000, 650, 820, 200), 'row', { n: '3 hrs', h: 'Daily reporting', t: 'Spent each morning compiling status reports (sample).' }),
        },
      },
      {
        id: 's3', title: 'What we heard', purpose: 'The tile shrinks into a backdrop for a target; the stat rows turn into three need columns.', bg: C.bg,
        place: {
          ...orbs([-300, 500, 1000], [1300, -200, 700]), ...HEAD, tile: rect(1230, 100, 560, 460), target: rect(1285, 120, 450, 430),
          k: { ...rect(100, 110, 800, 34), text: 'WHAT WE HEARD' },
          title: { ...rect(100, 160, 900, 150), px: 64, text: 'What we heard from\nyour team' },
          body: { ...rect(100, 340, 900, 120), text: 'In interviews with operations, finance and customer care, three needs came up every time.' },
          hero: rect(1010, 390, 190, 190, { rot: 20 }),
          ...card(1, cols3(610, 360)[0]!, 'col', { n: '01', h: 'See every order', t: 'One live view from depot to doorstep, without calling anyone.' }),
          ...card(2, cols3(610, 360)[1]!, 'col', { n: '02', h: 'Plan peaks early', t: 'Forecast December volumes in October, not in the middle of the rush.' }),
          ...card(3, cols3(610, 360)[2]!, 'col', { n: '03', h: 'Stop the chasing', t: 'Customers get automatic updates instead of calling customer care.' }),
        },
      },
      {
        id: 's4', title: 'Our solution', purpose: 'The cards drop away and the hero object grows to carry one idea: a single control tower.', bg: C.bg,
        place: {
          ...orbs([500, 100, 1000], [-300, 600, 700]), ...HEAD,
          k: { ...rect(100, 230, 820, 34), text: 'OUR SOLUTION' },
          title: { ...rect(100, 285, 880, 200), px: 84, text: 'One control tower\nfor every order' },
          body: { ...rect(100, 520, 800, 170), text: 'Harbor Control connects your orders, carriers and depots in one live view, so the whole team works from the same facts.' },
          hero: rect(980, 150, 780, 780, { rot: -6 }),
        },
      },
      {
        id: 's5', title: 'How it works', purpose: 'The cards rise back as three steps joined by a rail; the hero object moves to the corner.', bg: C.bg,
        place: {
          ...orbs([1100, -300, 900], [-200, 500, 800]), ...HEAD, rail: rect(100, 520, 1680, 6),
          k: { ...rect(100, 110, 800, 34), text: 'HOW IT WORKS' },
          title: { ...rect(100, 160, 1100, 140), px: 64, text: 'Three steps from kick-off\nto your first live depot' },
          hero: rect(1500, 110, 290, 290, { rot: 15 }),
          ...card(1, cols3(480, 400)[0]!, 'col', { n: '01', h: 'Connect', t: 'We link your order, carrier and warehouse systems, with no downtime.' }),
          ...card(2, cols3(480, 400)[1]!, 'col', { n: '02', h: 'Pilot', t: 'One depot goes live first, so your team tests the real thing.' }),
          ...card(3, cols3(480, 400)[2]!, 'col', { n: '03', h: 'Roll out', t: 'The remaining depots follow in waves, each with training included.' }),
        },
      },
      {
        id: 's6', title: 'Proof', purpose: 'The cards re-flow into a quote and two result tiles, with a wall of client logos made of shapes below.', bg: C.bg,
        place: {
          ...orbs([-200, -200, 900], [1200, 500, 800]), ...HEAD,
          k: { ...rect(100, 96, 900, 34), text: 'PROOF  ·  SAMPLE QUOTE AND FIGURES' },
          title: { ...rect(100, 138, 1000, 70), px: 52, text: 'Results our clients see' },
          hero: rect(1500, 790, 260, 260, { rot: -12 }),
          c1: rect(100, 240, 1040, 510), n1: { ...rect(150, 250, 200, 170), text: '“', px: 180 },
          t1: { ...rect(150, 420, 940, 190), text: 'Late deliveries halved in our first quarter, and for the first time the whole team trusts the numbers.', px: 40, color: C.ink },
          h1: { ...rect(150, 650, 940, 48), text: 'Priya Nair, COO, Fieldstone Freight', px: 30 },
          ...card(2, rect(1180, 240, 640, 245), 'tile', { n: '-47%', h: 'Fewer late deliveries', t: 'In the first quarter (sample).' }, { nPx: 96, hPx: 32, tPx: 26 }),
          ...card(3, rect(1180, 505, 640, 245), 'tile', { n: '9 days', h: 'Faster depot onboarding', t: 'Down from 21 days (sample).' }, { nPx: 96, hPx: 32, tPx: 26 }),
          cap: { ...rect(100, 800, 700, 30), text: 'SAMPLE CLIENT LOGOS' }, lg1: rect(100, 850, 110, 80), lg2: rect(260, 850, 80, 80), lg3: rect(390, 850, 90, 80), lg4: rect(530, 850, 80, 80), lg5: rect(670, 855, 70, 70, { rot: 45 }),
        },
      },
      {
        id: 's7', title: 'What you get', purpose: 'Three deliverable rows on the left, a parcel picture on the right.', bg: C.bg,
        place: {
          ...orbs([900, 300, 1000], [-300, -200, 700]), ...HEAD,
          k: { ...rect(100, 110, 800, 34), text: 'WHAT YOU GET' },
          title: { ...rect(100, 160, 940, 140), px: 64, text: 'Everything you need\nto go live' },
          box: rect(1130, 200, 690, 690, { rot: 4 }), hero: rect(1070, 770, 230, 230, { rot: -15 }),
          ...card(1, rect(100, 340, 940, 200), 'row', { n: '01', h: 'Live tracking platform', t: 'Orders, carriers and depots in one dashboard, set up for your network.' }),
          ...card(2, rect(100, 560, 940, 200), 'row', { n: '02', h: 'Integrations and data', t: 'Connections to your ERP, carriers and warehouse systems, tested end to end.' }),
          ...card(3, rect(100, 780, 940, 200), 'row', { n: '03', h: 'Training and support', t: 'Role-based training for every depot plus a named support lead for 12 months.' }),
        },
      },
      {
        id: 's8', title: 'Options and pricing', purpose: 'The same cards become three price tiers; the middle one rises and turns blue.', bg: C.bg,
        place: {
          ...orbs([300, -400, 1300], [1300, 600, 700]), ...HEAD,
          k: { ...rect(100, 110, 900, 34), text: 'OPTIONS AND PRICING  ·  SAMPLE PRICES' },
          title: { ...rect(100, 160, 1300, 80), px: 64, text: 'Three ways to start' },
          hero: rect(1580, 110, 210, 210, { rot: 12 }),
          ...card(1, rect(100, 380, 520, 500), 'tier', { n: '$4,900', h: 'Pilot', t: 'One depot\nLive tracking dashboard\nStandard reports\nEmail support' }, { nPx: 72, tPx: 30 }),
          ...card(2, rect(700, 330, 520, 550), 'tier', { n: '$18,500', h: 'Growth', t: 'Up to 5 depots\nCarrier integrations\nRole dashboards\nPriority support' }, { fill: C.blue, nPx: 72, tPx: 30, n: '#FFFFFF', h: '#FFFFFF', t: '#DCE6FF' }),
          ...card(3, rect(1300, 380, 520, 500), 'tier', { n: '$42,000', h: 'Network', t: 'Unlimited depots\nCustom integrations\nDedicated success lead\nQuarterly reviews' }, { nPx: 72, tPx: 30 }),
          pill: rect(830, 308, 260, 44), pillT: { ...rect(830, 314, 260, 32), text: 'Recommended' },
        },
      },
      {
        id: 's9', title: 'Timeline', purpose: 'The price tiers settle into three phases hanging from a rail with a dot for each.', bg: C.bg,
        place: {
          ...orbs([-300, 400, 1000], [1200, -300, 800]), ...HEAD, rail: rect(100, 470, 1680, 6),
          k: { ...rect(100, 110, 800, 34), text: 'TIMELINE' },
          title: { ...rect(100, 160, 1200, 80), px: 64, text: 'Ten weeks to go live' },
          hero: rect(1580, 110, 210, 210, { rot: -10 }),
          d1: rect(144, 453, 40, 40), d2: rect(714, 453, 40, 40), d3: rect(1284, 453, 40, 40),
          ...card(1, cols3(560, 330)[0]!, 'col', { n: 'Weeks 1-2', h: 'Connect and plan', t: 'Systems linked, data migrated and the pilot depot chosen.' }, { nPx: 48 }),
          ...card(2, cols3(560, 330)[1]!, 'col', { n: 'Weeks 3-6', h: 'Pilot and train', t: 'First depot live, team trained and results reviewed with you.' }, { nPx: 48 }),
          ...card(3, cols3(560, 330)[2]!, 'col', { n: 'Weeks 7-10', h: 'Roll out', t: 'Remaining depots go live in waves, then a final handover review.' }, { nPx: 48 }),
        },
      },
      {
        id: 's10', title: 'Why us', purpose: 'The cards re-flow into a bento: one large dark panel and two light ones.', bg: C.bg,
        place: {
          ...orbs([1200, -300, 900], [-300, 600, 700]), ...HEAD,
          k: { ...rect(100, 96, 900, 34), text: 'WHY HARBOR & CO.' },
          title: { ...rect(100, 138, 1300, 80), px: 56, text: 'Why Northwind can count on us' },
          hero: rect(1650, 100, 150, 150, { rot: 8 }),
          c1: at(rect(100, 260, 920, 690), { fill: C.ink }), h1: { ...rect(144, 304, 832, 50), text: 'Proven in freight', px: 40, color: '#FFFFFF' },
          n1: { ...rect(144, 370, 832, 170), text: '120+', px: 150, color: '#5EE0D2' },
          t1: { ...rect(144, 570, 832, 330), text: 'depots already run on Harbor Control (sample figure). Your rollout follows the same tested playbook: plan, pilot, scale.', px: 32, color: '#C5D0EA' },
          ...card(2, rect(1060, 260, 760, 330), 'col', { n: '24/7', h: 'A dedicated team', t: 'A named success lead and an engineer who knows your network.' }, { nPx: 56, hPx: 34, tPx: 27 }),
          ...card(3, rect(1060, 620, 760, 330), 'col', { n: 'Fixed', h: 'Clear scope, fixed price', t: 'What is quoted is what you pay, with no change fees inside the agreed scope.' }, { nPx: 56, hPx: 34, tPx: 27 }),
        },
      },
      {
        id: 's11', title: 'Next steps', purpose: 'The deliverable rows return on the right with the pen on the left: three steps to a decision.', bg: C.bg,
        place: {
          ...orbs([-200, 300, 1100], [1300, -200, 700]), ...HEAD,
          k: { ...rect(800, 110, 900, 34), text: 'NEXT STEPS' },
          title: { ...rect(800, 160, 1020, 80), px: 64, text: 'Three steps to a decision' },
          pen: rect(90, 230, 640, 640, { rot: -6 }), hero: rect(540, 780, 250, 250, { rot: 8 }),
          ...card(1, rect(800, 340, 1020, 200), 'row', { n: '01', h: 'Review this proposal', t: 'Share it with your team and send us your questions by Friday 27 November.' }),
          ...card(2, rect(800, 560, 1020, 200), 'row', { n: '02', h: 'Confirm scope and price', t: 'One 45-minute call to confirm the plan and choose the option that fits.' }),
          ...card(3, rect(800, 780, 1020, 200), 'row', { n: '03', h: 'Sign and kick off', t: 'Sign the statement of work and we start your first depot in January.' }),
        },
      },
      {
        id: 's12', title: 'Contact', purpose: 'The tile glides back in from the right with a desk photo; the hero returns to where it started and the cards leave.', bg: C.bg,
        place: {
          ...orbs([400, -300, 1000], [1250, 560, 760]), ...HEAD, tile: { ...rect(1010, 130, 780, 830), art: 'sales-desk.webp' },
          k: { ...rect(100, 260, 820, 34), text: "LET'S GET STARTED" },
          title: { ...rect(100, 320, 880, 220), px: 92, text: 'Thank you,\nDana' },
          body: { ...rect(100, 590, 800, 200), text: 'Sam Rivera, Account Director\nsam@harborandco.example\n+00 000 000 0000\nharborandco.example' },
          hero: rect(840, 700, 320, 320, { rot: 10 }),
        },
      },
    ],
  },
)
