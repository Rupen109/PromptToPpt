import { authored, rect, full, at } from '../author'
import type { Place } from '../author'

/**
 * Case Study: one client, one method, one result. A dark editorial deck. One picture travels (cover panel, portrait card, a footer band) and zooms through to fill the slide for the
 * result; one giant number travels from "what it cost" to "what we achieved" and then splits into three results; four connected nodes become the approach, the solution modules, the
 * timeline (a rising staircase) and the lessons (a vertical chain); the before and after pictures slide through each other and swap sides around the client's quote.
 */
const C = { ink: '#F2F4F8', mute: '#9AA6B8', orange: '#FF6B3D', teal: '#4DD4C4', gold: '#FFD166', surface: '#171C24', line: '#2A3340', bg: '#0E1116' }
const HEAD = { brand: rect(80, 48, 520, 30), page: rect(1240, 48, 600, 30) }
/** a thin line between two points (a rotated rect) */
const seg = (ax: number, ay: number, bx: number, by: number, t = 4, extra: Partial<Place> = {}): Place => {
  const len = Math.hypot(bx - ax, by - ay)
  return { x: (ax + bx) / 2 - len / 2, y: (ay + by) / 2 - t / 2, w: len, h: t, rot: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI, ...extra }
}
/** four connected nodes (circles with their numbers) and the three links between them; `pts` are the centres */
const chain = (pts: [number, number][], d: number, px: number, extra: Partial<Place> = {}): Record<string, Place> => {
  const out: Record<string, Place> = {}
  pts.forEach(([cx, cy], i) => {
    const p = { x: cx - d / 2, y: cy - d / 2, w: d, h: d }
    out[`nd${i + 1}`] = at(p, extra)
    out[`n${i + 1}`] = at(p, { px })
    if (i) out[`lk${i}`] = seg(pts[i - 1]![0], pts[i - 1]![1], cx, cy, 4, extra)
  })
  return out
}
const HERO = { cover: 'case-hero.webp', band: 'case-band.webp', col: 'case-column.webp' }

export const BIZ_CASESTUDY = authored(
  {
    id: 'biz-casestudy', category: 'business', fillPictures: ['hero', 'imgA', 'imgB'], name: 'Case Study', tagline: "From the client's challenge to the result, with the numbers that prove it",
    description: "A dark, editorial case study: the client at a glance, the challenge and what it cost, the approach as four connected steps, the solution, the timeline, one giant result that splits into three, before and after, the client's own words and the lessons learned.",
    audience: "The Case Study template suits customer success stories, client case studies, project retrospectives, consulting engagement summaries, before-and-after results and lessons-learned reviews, for any talk that proves a method by showing what it did for one client.",
    topics: ["case study", "case studies", "customer story", "success story", "client story", "customer success", "project retrospective", "lessons learned", "before and after", "results", "engagement", "consulting engagement", "implementation", "testimonial", "portfolio project", "project review", "post mortem", "client results", "roi", "outcomes"],
    fonts: { heading: 'Source Serif 4', body: 'Inter' },
    colors: { background: '#0E1116', surface: '#171C24', textPrimary: '#F2F4F8', textSecondary: '#9AA6B8', primary: '#FF6B3D', secondary: '#4DD4C4', accent: '#FFD166', onPrimary: '#0E1116' },
    background: '#0E1116',
  },
  {
    objects: {
      hero: { kind: 'image', art: HERO.cover, alt: 'A folded sheet of burnt-orange paper lit from the side on a dark surface', fit: 'cover' },
      veil: { kind: 'shape', fill: C.bg },
      c1: { kind: 'shape', radius: 28, fill: C.surface, park: 'b' }, c2: { kind: 'shape', radius: 28, fill: C.surface, park: 'r' }, c3: { kind: 'shape', radius: 28, fill: C.surface, park: 'r' },
      lk1: { kind: 'shape', radius: 2, fill: '#3A4655' }, lk2: { kind: 'shape', radius: 2, fill: '#3A4655' }, lk3: { kind: 'shape', radius: 2, fill: '#3A4655' },
      nd1: { kind: 'shape', shape: 'ellipse', fill: C.orange }, nd2: { kind: 'shape', shape: 'ellipse', fill: C.orange }, nd3: { kind: 'shape', shape: 'ellipse', fill: C.orange }, nd4: { kind: 'shape', shape: 'ellipse', fill: C.orange },
      imgA: { kind: 'image', art: 'case-before.webp', alt: 'A tangle of copper wires on a dark surface', fit: 'cover', radius: 28 },
      imgB: { kind: 'image', art: 'case-after.webp', alt: 'Brass and teal rods laid in neat parallel rows', fit: 'cover', radius: 28 },
      pillA: { kind: 'shape', radius: 22, fill: C.bg }, pillB: { kind: 'shape', radius: 22, fill: C.bg },
      ln1: { kind: 'shape', fill: C.line }, ln2: { kind: 'shape', fill: C.line },
      rule: { kind: 'shape', radius: 2, fill: C.orange },
      brand: { kind: 'text', text: 'CASE STUDY', px: 22, weight: 700, color: C.ink, caps: true, spc: 5 },
      page: { kind: 'text', text: 'Northwind Logistics  ·  Sample story', px: 22, weight: 500, color: C.mute, align: 'r' },
      k: { kind: 'text', text: '', px: 24, weight: 700, color: C.orange, caps: true, spc: 5 },
      title: { kind: 'text', text: '', px: 72, weight: 600, color: C.ink, face: 'heading', lh: 1.05, spc: -1 },
      body: { kind: 'text', text: '', px: 30, weight: 400, color: C.mute, lh: 1.45 },
      stat: { kind: 'text', text: '', px: 200, weight: 600, color: C.orange, face: 'heading', lh: 1, spc: -4, park: 'b' },
      stat2: { kind: 'text', text: '', px: 200, weight: 600, color: C.teal, face: 'heading', lh: 1, spc: -4 },
      stat3: { kind: 'text', text: '', px: 200, weight: 600, color: C.gold, face: 'heading', lh: 1, spc: -4 },
      statLabel: { kind: 'text', text: '', px: 32, weight: 400, color: C.mute, lh: 1.4 },
      lead: { kind: 'text', text: '', px: 36, weight: 400, color: C.ink, lh: 1.4 },
      sl1: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 }, sl2: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 }, sl3: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      h1: { kind: 'text', text: '', px: 40, weight: 600, color: C.ink, face: 'heading', lh: 1.1 }, t1: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      h2: { kind: 'text', text: '', px: 40, weight: 600, color: C.ink, face: 'heading', lh: 1.1 }, t2: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      h3: { kind: 'text', text: '', px: 40, weight: 600, color: C.ink, face: 'heading', lh: 1.1 }, t3: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      h4: { kind: 'text', text: '', px: 40, weight: 600, color: C.ink, face: 'heading', lh: 1.1 }, t4: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      n1: { kind: 'text', text: '', px: 32, weight: 700, color: C.bg, face: 'heading', align: 'ctr', anchor: 'ctr' }, n2: { kind: 'text', text: '', px: 32, weight: 700, color: C.bg, face: 'heading', align: 'ctr', anchor: 'ctr' },
      n3: { kind: 'text', text: '', px: 32, weight: 700, color: C.bg, face: 'heading', align: 'ctr', anchor: 'ctr' }, n4: { kind: 'text', text: '', px: 32, weight: 700, color: C.bg, face: 'heading', align: 'ctr', anchor: 'ctr' },
      ct1: { kind: 'text', text: '', px: 36, weight: 600, color: C.ink, face: 'heading', lh: 1.1 }, ct2: { kind: 'text', text: '', px: 36, weight: 600, color: C.ink, face: 'heading', lh: 1.1 }, ct3: { kind: 'text', text: '', px: 36, weight: 600, color: C.ink, face: 'heading', lh: 1.1 },
      tx2: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 }, tx3: { kind: 'text', text: '', px: 28, weight: 400, color: C.mute, lh: 1.4 },
      tagA: { kind: 'text', text: 'BEFORE', px: 22, weight: 700, color: C.orange, caps: true, spc: 3, align: 'ctr', anchor: 'ctr' }, tagB: { kind: 'text', text: 'AFTER', px: 22, weight: 700, color: C.teal, caps: true, spc: 3, align: 'ctr', anchor: 'ctr' },
      quote: { kind: 'text', text: '', px: 52, weight: 500, color: C.ink, face: 'heading', italic: true, lh: 1.2 },
      qname: { kind: 'text', text: '', px: 30, weight: 600, color: C.ink }, qrole: { kind: 'text', text: '', px: 24, weight: 400, color: C.mute },
      contact: { kind: 'text', text: '', px: 32, weight: 500, color: C.ink, lh: 1.4 },
    },
    order: ['hero', 'veil', 'c1', 'c2', 'c3', 'lk1', 'lk2', 'lk3', 'quote', 'qname', 'qrole', 'imgA', 'imgB', 'ln1', 'ln2', 'rule', 'nd1', 'nd2', 'nd3', 'nd4', 'pillA', 'pillB',
      'brand', 'page', 'k', 'title', 'body', 'stat', 'stat2', 'stat3', 'statLabel', 'lead', 'sl1', 'sl2', 'sl3', 'h1', 't1', 'h2', 't2', 'h3', 't3', 'h4', 't4', 'n1', 'n2', 'n3', 'n4',
      'ct1', 'ct2', 'ct3', 'tx2', 'tx3', 'tagA', 'tagB', 'contact'],
    scenes: [
      {
        id: 's1', title: 'Cover', purpose: 'The cover: the story headline on the left, the hero picture as a full-height panel on the right.',
        place: {
          hero: rect(1080, 0, 840, 1080), ...HEAD,
          k: { ...rect(80, 250, 900, 32), text: 'CASE STUDY  ·  SAMPLE CLIENT STORY' }, rule: rect(80, 300, 72, 5),
          title: { ...rect(80, 340, 940, 330), text: 'Onboarding in six days, not three weeks', px: 96 },
          body: { ...rect(80, 710, 820, 140), text: 'How a regional freight company cut customer onboarding time by 71% with one connected workflow. All figures are sample figures.' },
        },
      },
      {
        id: 's2', title: 'The client at a glance', purpose: 'The picture becomes a portrait card on the left; four facts about the client sit on a grid on the right.',
        place: {
          hero: at(rect(80, 150, 480, 830), { radius: 28 }), ...HEAD,
          k: { ...rect(660, 150, 900, 32), text: 'THE CLIENT AT A GLANCE' }, title: { ...rect(660, 200, 1180, 90), text: 'Northwind Logistics', px: 64 },
          body: { ...rect(660, 310, 1100, 100), text: 'A regional freight company moving about 40,000 parcels a day across three countries (sample client).' },
          ln1: rect(660, 460, 1180, 2), ln2: rect(660, 740, 1180, 2),
          h1: { ...rect(660, 500, 540, 60), text: 'Regional freight', px: 44 }, t1: { ...rect(660, 568, 540, 40), text: 'Sector' },
          h2: { ...rect(1260, 500, 540, 60), text: '620 people', px: 44 }, t2: { ...rect(1260, 568, 540, 40), text: 'Team size (sample)' },
          h3: { ...rect(660, 780, 540, 60), text: 'Three countries', px: 44 }, t3: { ...rect(660, 848, 540, 40), text: 'Markets served' },
          h4: { ...rect(1260, 780, 540, 60), text: 'Since 2009', px: 44 }, t4: { ...rect(1260, 848, 540, 40), text: 'Founded' },
        },
      },
      {
        id: 's3', title: 'The challenge', purpose: 'The card crosses to the right; three problems hang on a vertical chain of numbered nodes.',
        place: {
          hero: at(rect(1360, 150, 480, 830), { radius: 28 }), ...HEAD,
          k: { ...rect(80, 130, 900, 32), text: 'THE CHALLENGE' }, title: { ...rect(80, 180, 1180, 170), text: 'Every new customer waited three weeks to go live' },
          ...chain([[118, 484], [118, 654], [118, 824]], 76, 30),
          n1: { ...rect(80, 446, 76, 76), text: '01', px: 30 }, n2: { ...rect(80, 616, 76, 76), text: '02', px: 30 }, n3: { ...rect(80, 786, 76, 76), text: '03', px: 30 },
          h1: { ...rect(190, 440, 1100, 52), text: 'Nine hand-offs between teams' }, t1: { ...rect(190, 498, 1100, 40), text: 'Sales, ops, finance and support each re-typed the same data.' },
          h2: { ...rect(190, 610, 1100, 52), text: 'Three systems that never agreed' }, t2: { ...rect(190, 668, 1100, 40), text: 'Contracts, routes and billing lived in separate tools.' },
          h3: { ...rect(190, 780, 1100, 52), text: 'No view of where a customer stood' }, t3: { ...rect(190, 838, 1100, 40), text: 'Account managers answered status questions by email.' },
        },
      },
      {
        id: 's4', title: 'Why it mattered', purpose: 'A giant number (the cost of a late start) on the left; the picture becomes a wide band along the bottom.',
        place: {
          hero: at(rect(0, 800, 1920, 280), { art: HERO.band, radius: 0 }), ...HEAD,
          k: { ...rect(80, 150, 900, 32), text: 'WHY IT MATTERED  ·  SAMPLE FIGURES' }, stat: { ...rect(80, 200, 1000, 300), text: '$1,800', px: 260 },
          statLabel: { ...rect(80, 530, 960, 100), text: 'of first revenue was lost, on average, each time a customer went live late.' },
          title: { ...rect(1140, 200, 700, 200), text: 'Delay was not an inconvenience, it was a cost', px: 52 },
          body: { ...rect(1140, 430, 700, 230), text: 'Customers who waited more than two weeks were twice as likely to leave in their first year. Every extra day of setup pushed first revenue back by a day.', px: 28 },
        },
      },
      {
        id: 's5', title: 'The approach', purpose: 'The number leaves; four nodes appear on a line, one step each, and the picture thins to a footer band.',
        place: {
          hero: at(rect(0, 990, 1920, 90), { art: HERO.band, radius: 0 }), ...HEAD,
          k: { ...rect(80, 110, 900, 32), text: 'THE APPROACH' }, title: { ...rect(80, 150, 1700, 90), text: 'Four steps from signed contract to first delivery', px: 64 },
          ...chain([[124, 400], [574, 400], [1024, 400], [1474, 400]], 88, 32),
          n1: { ...rect(80, 356, 88, 88), text: '01', px: 32 }, n2: { ...rect(530, 356, 88, 88), text: '02', px: 32 }, n3: { ...rect(980, 356, 88, 88), text: '03', px: 32 }, n4: { ...rect(1430, 356, 88, 88), text: '04', px: 32 },
          h1: { ...rect(80, 500, 400, 56), text: 'Map the journey', px: 38 }, t1: { ...rect(80, 568, 380, 170), text: 'Follow ten real customers from signed contract to first delivery.' },
          h2: { ...rect(530, 500, 400, 56), text: 'Unify the data', px: 38 }, t2: { ...rect(530, 568, 380, 170), text: 'Merge three systems into one shared customer record.' },
          h3: { ...rect(980, 500, 400, 56), text: 'Automate hand-offs', px: 38 }, t3: { ...rect(980, 568, 380, 170), text: 'Replace email chains with triggers and clear owners.' },
          h4: { ...rect(1430, 500, 400, 56), text: 'Measure weekly', px: 38 }, t4: { ...rect(1430, 568, 380, 170), text: 'Track days to go live on a dashboard everyone sees.' },
          body: { ...rect(80, 830, 1500, 100), text: 'Every step ended with one visible deliverable the client could check.' },
        },
      },
      {
        id: 's6', title: 'The solution', purpose: 'The chain turns vertical inside a large card (the modules); two smaller cards slide in beside it.',
        place: {
          hero: at(rect(0, 990, 1920, 90), { art: HERO.band, radius: 0 }), ...HEAD,
          k: { ...rect(80, 110, 900, 32), text: 'THE SOLUTION' }, title: { ...rect(80, 150, 1700, 90), text: 'One connected workflow', px: 64 },
          c1: rect(80, 280, 780, 660), c2: rect(900, 280, 940, 310), c3: rect(900, 630, 940, 310),
          ct1: { ...rect(130, 320, 700, 50), text: 'Four connected modules' },
          ...chain([[158, 440], [158, 550], [158, 660], [158, 770]], 56, 24),
          h1: { ...rect(215, 420, 600, 44), text: 'Intake form', px: 34 }, h2: { ...rect(215, 530, 600, 44), text: 'Shared customer record', px: 34 },
          h3: { ...rect(215, 640, 600, 44), text: 'Automated contracts', px: 34 }, h4: { ...rect(215, 750, 600, 44), text: 'Live status page', px: 34 },
          ct2: { ...rect(950, 316, 820, 50), text: 'Built on what the client already owned' }, tx2: { ...rect(950, 384, 830, 180), text: 'The hub sits on top of the ERP and billing tools Northwind already used, so no system was replaced and no data was migrated.' },
          ct3: { ...rect(950, 666, 820, 50), text: 'Live in a day, not a quarter' }, tx3: { ...rect(950, 734, 830, 180), text: 'Each module went live on its own in the first month, so teams adopted one habit at a time.' },
        },
      },
      {
        id: 's7', title: 'Implementation timeline', purpose: 'The cards drop away and the four nodes re-flow into a rising staircase: one milestone every few weeks.',
        place: {
          hero: at(rect(0, 990, 1920, 90), { art: HERO.band, radius: 0 }), ...HEAD,
          k: { ...rect(80, 110, 900, 32), text: 'IMPLEMENTATION' }, title: { ...rect(80, 150, 1500, 90), text: 'Live in eleven weeks, one step at a time', px: 64 },
          ...chain([[124, 644], [574, 544], [1024, 444], [1474, 344]], 88, 32, { fill: C.teal }),
          n1: { ...rect(80, 600, 88, 88), text: '01', px: 32 }, n2: { ...rect(530, 500, 88, 88), text: '02', px: 32 }, n3: { ...rect(980, 400, 88, 88), text: '03', px: 32 }, n4: { ...rect(1430, 300, 88, 88), text: '04', px: 32 },
          h1: { ...rect(80, 708, 400, 56), text: 'Weeks 1-2', px: 38 }, t1: { ...rect(80, 772, 380, 160), text: 'Discovery: hand-off map and data audit.' },
          h2: { ...rect(530, 608, 400, 56), text: 'Weeks 3-5', px: 38 }, t2: { ...rect(530, 672, 380, 160), text: 'Build: the shared customer record and intake form.' },
          h3: { ...rect(980, 508, 400, 56), text: 'Weeks 6-8', px: 38 }, t3: { ...rect(980, 572, 380, 160), text: 'Pilot: two regions run live, with weekly reviews.' },
          h4: { ...rect(1430, 408, 400, 56), text: 'Weeks 9-11', px: 38 }, t4: { ...rect(1430, 472, 380, 160), text: 'Roll-out: every region live, old forms retired.' },
        },
      },
      {
        id: 's8', title: 'The result', purpose: 'Zoom-through: the picture grows to fill the slide and one giant number states the headline result.',
        place: {
          hero: at(full(), { art: HERO.cover, radius: 0 }), veil: full({ a: 0.62 }), ...HEAD,
          k: { ...rect(80, 170, 900, 32), text: 'THE RESULT  ·  SAMPLE FIGURES' },
          stat: { ...rect(80, 230, 1500, 460), text: '71%', px: 440 }, stat2: { ...rect(80, 230, 1500, 460), text: '3.4×', px: 440, a: 0 }, stat3: { ...rect(80, 230, 1500, 460), text: '+27', px: 440, a: 0 },
          lead: { ...rect(80, 730, 900, 110), text: 'less time to go live: from 21 days down to 6 for every new customer.' },
        },
      },
      {
        id: 's9', title: 'Three results', purpose: 'The giant number shrinks and splits into three results, each a column; the picture drops back to a footer band.',
        place: {
          hero: at(rect(0, 990, 1920, 90), { art: HERO.band, radius: 0 }), ...HEAD,
          k: { ...rect(80, 110, 900, 32), text: 'THE RESULTS  ·  SAMPLE FIGURES' }, title: { ...rect(80, 150, 1700, 90), text: 'Three results, still holding two quarters later', px: 64 },
          stat: { ...rect(80, 340, 520, 220), text: '71%', px: 190 }, stat2: { ...rect(700, 340, 520, 220), text: '3.4×', px: 190 }, stat3: { ...rect(1320, 340, 520, 220), text: '+27', px: 190 },
          sl1: { ...rect(80, 590, 500, 170), text: 'Faster onboarding: from 21 days to 6.' }, sl2: { ...rect(700, 590, 500, 170), text: 'More customers onboarded each month by the same team.' }, sl3: { ...rect(1320, 590, 500, 170), text: 'Points of customer satisfaction gained in the first year.' },
        },
      },
      {
        id: 's10', title: 'Before and after', purpose: 'Two pictures, before on the left and after on the right, show the same process side by side.',
        place: {
          hero: at(rect(0, 990, 1920, 90), { art: HERO.band, radius: 0 }), ...HEAD,
          k: { ...rect(80, 110, 900, 32), text: 'BEFORE AND AFTER' }, title: { ...rect(80, 150, 1700, 80), text: 'The same process, rebuilt', px: 56 },
          imgA: rect(80, 260, 840, 520), imgB: rect(1000, 260, 840, 520),
          pillA: at(rect(112, 292, 160, 44), { a: 0.85 }), tagA: rect(112, 292, 160, 44), pillB: at(rect(1032, 292, 160, 44), { a: 0.85 }), tagB: rect(1032, 292, 160, 44),
          t1: { ...rect(80, 810, 840, 90), text: '21 days to go live, nine hand-offs, three separate systems (sample figures).' }, t2: { ...rect(1000, 810, 840, 90), text: '6 days to go live, two hand-offs, one shared record (sample figures).' },
        },
      },
      {
        id: 's11', title: 'In their words', purpose: 'The two pictures slide through each other and swap sides; the client quote takes the middle.',
        place: {
          hero: at(rect(0, 990, 1920, 90), { art: HERO.band, radius: 0 }), ...HEAD,
          imgB: rect(80, 150, 440, 760), imgA: rect(1400, 150, 440, 760),
          pillB: at(rect(112, 182, 160, 44), { a: 0.85 }), tagB: rect(112, 182, 160, 44), pillA: at(rect(1432, 182, 160, 44), { a: 0.85 }), tagA: rect(1432, 182, 160, 44),
          k: { ...rect(580, 230, 760, 32), text: 'IN THEIR WORDS' }, rule: rect(580, 280, 72, 5),
          quote: { ...rect(580, 320, 780, 330), text: 'Our customers now ship their first load in under a week. We stopped apologising for onboarding.' },
          qname: { ...rect(580, 700, 780, 40), text: 'Dana Okafor' }, qrole: { ...rect(580, 748, 780, 34), text: 'VP Operations, Northwind Logistics (sample quote)' },
        },
      },
      {
        id: 's12', title: 'Lessons learned', purpose: 'The picture becomes a tall column on the left; the four nodes line up as a vertical chain of lessons.',
        place: {
          hero: at(rect(0, 0, 560, 1080), { art: HERO.col, radius: 0 }), ...HEAD,
          k: { ...rect(660, 130, 900, 32), text: 'LESSONS LEARNED' }, title: { ...rect(660, 180, 1180, 90), text: 'Four things we would do again', px: 60 },
          ...chain([[692, 380], [692, 530], [692, 680], [692, 830]], 64, 26),
          h1: { ...rect(760, 350, 1060, 52), text: "Start with the customer's data", px: 36 }, t1: { ...rect(760, 408, 1060, 40), text: 'Mapping the real hand-offs first saved weeks of rework.' },
          h2: { ...rect(760, 500, 1060, 52), text: 'Ship one step at a time', px: 36 }, t2: { ...rect(760, 558, 1060, 40), text: 'Each step went live on its own, so risk stayed small.' },
          h3: { ...rect(760, 650, 1060, 52), text: 'Give every step an owner', px: 36 }, t3: { ...rect(760, 708, 1060, 40), text: 'A named owner for each hand-off ended the email chasing.' },
          h4: { ...rect(760, 800, 1060, 52), text: 'Measure from week one', px: 36 }, t4: { ...rect(760, 858, 1060, 40), text: 'A simple dashboard made the gains visible to everyone.' },
        },
      },
      {
        id: 's13', title: 'What is next and contact', purpose: 'The picture returns to the cover panel on the right; what comes next and the contact details close the deck.',
        place: {
          hero: at(rect(1080, 0, 840, 1080), { art: HERO.cover, radius: 0 }), ...HEAD,
          k: { ...rect(80, 220, 900, 32), text: 'WHAT IS NEXT' }, rule: rect(80, 270, 72, 5),
          title: { ...rect(80, 310, 940, 210), text: "Let's write your story next", px: 84 },
          body: { ...rect(80, 560, 860, 130), text: 'Next up: the same workflow in two more regions in 2027. We would be glad to do the same for your team.' },
          contact: { ...rect(80, 740, 860, 150), text: 'hello@yourcompany.com\nyourcompany.com/stories\n+00 000 000 0000' },
        },
      },
    ],
  },
)
