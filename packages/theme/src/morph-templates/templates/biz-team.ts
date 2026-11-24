import { authored, rect, row, grid, at } from '../author'
import type { Place } from '../author'

/**
 * Team Welcome: a warm onboarding deck. Six coloured avatar circles are the cast: they are the people on the cover, the number badges of the values, the team grid, the stops of a day
 * (a camera pan along a calendar line), the 30-60-90 steps, the nodes of the "who to ask" map and the dots of the benefits. One soft circle zooms through the slide as the
 * background of the mission and the closing. Cards trade places (3, 4, 3, 6). Original choreography for SlidesDone.
 */
const C = { cream: '#FFF9F2', ink: '#2B2118', mute: '#5A4A3B', teal: '#1F6F60', peach: '#FFD9C4', mint: '#CFEAE3', sun: '#FCE3A6', edge: '#F0DFCB', link: '#E9CDB0' }
const AV = ['#E8582A', '#2E8B7A', '#C77D0A', '#D44F6B', '#1F5F6B', '#5E8F4A']

/** a box centred on a point */
const ctr = (cx: number, cy: number, w: number, h = w): Place => ({ x: cx - w / 2, y: cy - h / 2, w, h })
/** avatar number i (1-6): the circle and the text inside it */
const av = (i: number, cx: number, cy: number, d: number, text = '', px = Math.round(d * 0.36)): Record<string, Place> => ({ [`a${i}`]: ctr(cx, cy, d), [`init${i}`]: { ...ctr(cx, cy, d), text, px } })
/** a thin line between two points (a thin rotated rect) */
const link = (x1: number, y1: number, x2: number, y2: number): Place => {
  const len = Math.hypot(x2 - x1, y2 - y1)
  return { x: (x1 + x2) / 2 - len / 2, y: (y1 + y2) / 2 - 3, w: len, h: 6, rot: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI }
}
/** the three soft background circles of a scene */
const deco = (a: [number, number, number], b: [number, number, number], c: [number, number, number], fa = C.peach, fb = C.mint, fc = C.sun): Record<string, Place> => ({
  blobA: { ...rect(a[0], a[1], a[2], a[2]), fill: fa }, blobB: { ...rect(b[0], b[1], b[2], b[2]), fill: fb }, blobC: { ...rect(c[0], c[1], c[2], c[2]), fill: fc },
})
const HEAD = { brand: rect(80, 52, 520, 30), page: rect(1240, 52, 600, 30) }
/** kicker and title of a content scene */
const top = (k: string, title: string, px = 64): Record<string, Place> => ({ k: { ...rect(100, 128, 1100, 32), text: k }, title: { ...rect(100, 176, 1300, 84), text: title, px } })
/** heading and description of item i */
const item = (i: number, x: number, y: number, w: number, h: string, t: string, hh = 50, th = 150, gap = 8): Record<string, Place> => ({ [`h${i}`]: { ...rect(x, y, w, hh), text: h }, [`t${i}`]: { ...rect(x, y + hh + gap, w, th), text: t } })
/** a person's name and role next to or under an avatar */
const person = (i: number, x: number, y: number, w: number, name: string, role: string): Record<string, Place> => ({ [`name${i}`]: { ...rect(x, y, w, 46), text: name }, [`role${i}`]: { ...rect(x, y + 52, w, 84), text: role } })

const FULL = (fill: string) => ({ ...rect(-340, -760, 2600, 2600), fill })
const DESK = { x: 1440, y: 90, w: 400, h: 266 }

// the six stops of a day, spaced 640 px apart; scene 6 shows the first three, scene 7 the camera has moved two stops to the right
const STOPS = [
  { time: '9:00', h: 'Arrive and settle', t: 'Meet your buddy, pick up your laptop and find your desk.' },
  { time: '10:30', h: 'Team stand-up', t: 'Hear what everyone is working on and say hello.' },
  { time: '12:30', h: 'Lunch together', t: 'Join the table in the kitchen, or take a walk outside.' },
  { time: '14:00', h: 'A first small task', t: 'Pair with a teammate on a real, friendly first task.' },
  { time: '16:00', h: 'Learning hour', t: 'Explore the tools, guides and recorded demos at your pace.' },
  { time: '17:30', h: 'Wrap up the day', t: 'Write down three questions for tomorrow and head home.' },
]
const stops = (shift: number): Record<string, Place> => Object.assign({}, ...STOPS.map((s, i) => {
  const cx = 330 + i * 640 - shift
  return { ...av(i + 1, cx, 560, 120, s.time, 32), [`h${i + 1}`]: { ...rect(cx - 280, 665, 560, 50), text: s.h }, [`t${i + 1}`]: { ...rect(cx - 280, 725, 560, 135), text: s.t } }
}))

const head = (px: number, extra = {}) => ({ kind: 'text' as const, text: '', px, weight: 800, color: C.ink, face: 'heading' as const, lh: 1.15, ...extra })
const body = (px: number, extra = {}) => ({ kind: 'text' as const, text: '', px, weight: 400, color: C.mute, lh: 1.45, ...extra })

export const BIZ_TEAM = authored(
  {
    id: 'biz-team', category: 'business', fillPictures: ['office', 'desk', 'kitchen'], name: 'Team Welcome', tagline: 'Meet the team, the way we work and your first weeks',
    description: 'A warm, light deck for onboarding and introductions: a welcome, our mission and values, who is who, how we work, a day in the life, your first 30, 60 and 90 days, who to ask, benefits and the workplace, all told by one friendly cast of circles that change role from slide to slide.',
    audience: 'The Team Welcome template suits employee onboarding, new-hire welcomes, team introductions, company culture and values talks, department overviews, internal all-hands and recruiting presentations, and any talk that makes people feel they already know the team.',
    topics: ['team', 'onboarding', 'employee onboarding', 'new hire', 'new hires', 'welcome', 'team introduction', 'company culture', 'culture', 'values', 'mission and values', 'all hands', 'all-hands', 'department overview', 'hr', 'human resources', 'recruiting', 'orientation', 'first week', 'first 90 days', 'team building', 'our team', 'who we are', 'benefits', 'workplace'],
    fonts: { heading: 'Nunito Sans', body: 'Outfit' },
    colors: { background: '#FFF9F2', surface: '#FFFFFF', textPrimary: '#2B2118', textSecondary: '#5A4A3B', primary: '#F26B3A', secondary: '#2E8B7A', accent: '#F5B82E', onPrimary: '#FFFFFF' },
    background: '#FFF9F2',
  },
  {
    objects: {
      blobA: { kind: 'shape', shape: 'ellipse', fill: C.peach },
      blobB: { kind: 'shape', shape: 'ellipse', fill: C.mint },
      blobC: { kind: 'shape', shape: 'ellipse', fill: C.sun },
      line: { kind: 'shape', radius: 3, fill: C.link, park: 'l' },
      l1: { kind: 'shape', radius: 3, fill: C.link }, l2: { kind: 'shape', radius: 3, fill: C.link }, l3: { kind: 'shape', radius: 3, fill: C.link }, l4: { kind: 'shape', radius: 3, fill: C.link },
      c1: { kind: 'shape', radius: 40, fill: '#FFFFFF', stroke: C.edge, strokeW: 2, park: 'b' }, c2: { kind: 'shape', radius: 40, fill: '#FFFFFF', stroke: C.edge, strokeW: 2, park: 'b' },
      c3: { kind: 'shape', radius: 40, fill: '#FFFFFF', stroke: C.edge, strokeW: 2, park: 'b' }, c4: { kind: 'shape', radius: 40, fill: '#FFFFFF', stroke: C.edge, strokeW: 2, park: 'b' },
      c5: { kind: 'shape', radius: 40, fill: '#FFFFFF', stroke: C.edge, strokeW: 2, park: 'b' }, c6: { kind: 'shape', radius: 40, fill: '#FFFFFF', stroke: C.edge, strokeW: 2, park: 'b' },
      hub: { kind: 'shape', shape: 'ellipse', fill: C.teal, park: 'l' },
      a1: { kind: 'shape', shape: 'ellipse', fill: AV[0], park: 'b' }, a2: { kind: 'shape', shape: 'ellipse', fill: AV[1], park: 'b' }, a3: { kind: 'shape', shape: 'ellipse', fill: AV[2], park: 'b' },
      a4: { kind: 'shape', shape: 'ellipse', fill: AV[3], park: 'b' }, a5: { kind: 'shape', shape: 'ellipse', fill: AV[4], park: 'b' }, a6: { kind: 'shape', shape: 'ellipse', fill: AV[5], park: 'b' },
      mug: { kind: 'image', art: 'team-mug.webp', alt: 'A cheerful orange coffee mug with steam', park: 't' },
      plant: { kind: 'image', art: 'team-plant.webp', alt: 'A leafy houseplant in a teal pot', park: 'b' },
      notebook: { kind: 'image', art: 'team-notebook.webp', alt: 'A teal notebook with a yellow pencil', park: 'r' },
      desk: { kind: 'image', art: 'team-desk.webp', alt: 'A tidy welcome desk seen from above', radius: 32 },
      office: { kind: 'image', art: 'team-office.webp', alt: 'A bright open-plan office with plants', radius: 40 },
      kitchen: { kind: 'image', art: 'team-kitchen.webp', alt: 'A cosy shared kitchen with colourful mugs', clip: 'circle' },
      brand: { kind: 'text', text: 'Team Welcome', px: 24, weight: 800, color: C.mute, face: 'heading' },
      page: { kind: 'text', text: 'Welcome pack  ·  2026', px: 24, weight: 500, color: C.mute, align: 'r' },
      k: { kind: 'text', text: '', px: 24, weight: 800, color: C.teal, caps: true, spc: 4, face: 'heading' },
      title: head(64, { lh: 1.05, spc: -1 }),
      body: body(34),
      hubt: { kind: 'text', text: '', px: 64, weight: 800, color: '#FFFFFF', face: 'heading', align: 'ctr', anchor: 'ctr' },
      ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((i) => [
        [`init${i}`, { kind: 'text', text: '', px: 36, weight: 800, color: '#FFFFFF', face: 'heading', align: 'ctr', anchor: 'ctr', park: 'b' }],
        [`h${i}`, head(38, { lh: 1.1, park: 'b' })],
        [`t${i}`, body(30, { park: 'b' })],
        [`name${i}`, head(38, { lh: 1.1, park: 'b' })],
        [`role${i}`, body(30, { lh: 1.4, park: 'b' })],
      ])),
    },
    order: ['blobA', 'blobB', 'blobC', 'line', 'l1', 'l2', 'l3', 'l4', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'hub', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'mug', 'plant', 'notebook', 'desk', 'office', 'kitchen',
      'brand', 'page', 'k', 'title', 'body', 'hubt', 'init1', 'init2', 'init3', 'init4', 'init5', 'init6', 'h1', 't1', 'h2', 't2', 'h3', 't3', 'h4', 't4', 'h5', 't5', 'h6', 't6',
      'name1', 'role1', 'name2', 'role2', 'name3', 'role3', 'name4', 'role4', 'name5', 'role5', 'name6', 'role6'],
    scenes: [
      {
        id: 's1', title: 'Welcome', purpose: 'The opening: a big title on the left, a mug and a plant on a soft circle, and the six team circles in a row.',
        place: {
          ...deco([1000, 140, 840], [-160, 720, 420], [780, 60, 170]), mug: rect(1130, 330, 440, 440), plant: rect(1600, 570, 220, 330), ...HEAD,
          ...Object.assign({}, ...[0, 1, 2, 3, 4, 5].map((i) => av(i + 1, 148 + i * 112, 908, 96, ['SR', 'JL', 'AM', 'TC', 'CB', 'RP'][i], 34))),
          k: { ...rect(100, 220, 760, 32), text: 'Onboarding  ·  Day one' }, title: { ...rect(100, 270, 880, 270), text: 'Welcome to the team', px: 120 },
          body: { ...rect(100, 590, 780, 170), text: 'A friendly guide to who we are, how we work and what your first weeks will look like.', px: 36 },
        },
      },
      {
        id: 's2', title: 'Mission', purpose: 'The cover circle grows through the whole slide and becomes the golden background of the mission.',
        place: {
          ...deco([-340, -760, 2600], [1250, 560, 560], [1640, -150, 360], C.sun, C.mint, C.peach), mug: rect(1330, 610, 340, 340), plant: rect(1700, 560, 190, 285), ...HEAD,
          ...Object.assign({}, ...[0, 1, 2, 3, 4, 5].map((i) => av(i + 1, 148 + i * 112, 908, 96, ['SR', 'JL', 'AM', 'TC', 'CB', 'RP'][i], 34))),
          k: { ...rect(100, 200, 760, 32), text: 'Our mission' }, title: { ...rect(100, 250, 1060, 300), text: 'We help every team do work they are proud of', px: 84 },
          body: { ...rect(100, 540, 1000, 170), text: 'Add your mission in two or three sentences: who you serve, what changes for them, and why that matters to the people in this room.', px: 32 },
        },
      },
      {
        id: 's3', title: 'Values', purpose: 'Three cards slide up; the first three team circles become their number badges.',
        place: {
          ...deco([1500, -250, 650], [-180, 820, 460], [1640, 880, 360]), ...HEAD, ...top('Our values', 'What we value, every day'),
          ...[0, 1, 2].reduce((o, i) => {
            const c = row(3, 100, 390, 546, 470, 41)[i]!
            return { ...o, [`c${i + 1}`]: c, ...av(i + 1, c.x + 100, c.y + 100, 120, String(i + 1), 52),
              ...item(i + 1, c.x + 40, c.y + 192, 466, ['Be curious', 'Own the outcome', 'Be kind, be clear'][i]!, ['Ask why, try small experiments and share what you learn, even when it did not work.', 'Take a task all the way to done, and say early when you need a hand.', 'Give honest feedback with care, and assume good intent from everyone.'][i]!, 50, 190) }
          }, {} as Record<string, Place>),
        },
      },
      {
        id: 's4', title: 'Who is who', purpose: 'The cards drop away and all six circles spread into a grid, each with a name and a role.',
        place: {
          ...deco([1560, -300, 620], [-240, 780, 480], [1500, 900, 300]), ...HEAD, ...top('Who is who  ·  sample names', 'Meet the people around you'),
          ...Object.assign({}, ...[0, 1, 2, 3, 4, 5].map((i) => {
            const x = 100 + (i % 3) * 600, y = 410 + Math.floor(i / 3) * 290
            return { ...av(i + 1, x + 85, y + 85, 170, ['SR', 'JL', 'AM', 'TC', 'CB', 'RP'][i], 60),
              ...person(i + 1, x + 205, y + 22, 315, ['Sam Rivera', 'Jordan Lee', 'Alex Morgan', 'Taylor Chen', 'Casey Brooks', 'Riley Park'][i]!, ['Team lead', 'People partner', 'IT and workplace', 'Onboarding buddy', 'Customer success', 'Operations'][i]!) }
          })),
        },
      },
      {
        id: 's5', title: 'How we work', purpose: 'Four rounded tiles rise in a row, each led by a circle with a letter; a notebook slides in at the corner.',
        place: {
          ...deco([-260, -280, 560], [1560, 820, 520], [880, -200, 300]), ...HEAD, ...top('How we work', 'How we work together'), notebook: rect(1480, 95, 230, 230, { rot: -8 }),
          ...[0, 1, 2, 3].reduce((o, i) => {
            const c = row(4, 100, 380, 400, 520, 40)[i]!
            return { ...o, [`c${i + 1}`]: c, ...av(i + 1, c.x + 90, c.y + 86, 100, ['D', 'W', 'F', 'M'][i]!, 44),
              ...item(i + 1, c.x + 36, c.y + 170, 340, ['Daily stand-up', 'One to ones', 'Friday demo', 'Monthly retro'][i]!, ['Ten minutes at 9:30 to share what is done, what is next and where you need help.', 'A private chat with your manager about goals, feedback and how you are feeling.', 'Show something you made this week, big or small, and celebrate each other.', 'Look back together on what worked, what did not and what we will change.'][i]!, 50, 250) }
          }, {} as Record<string, Place>),
        },
      },
      {
        id: 's6', title: 'A day: morning', purpose: 'Tiles fall away; the circles become stops on a long calendar line that runs past the slide edge.',
        place: {
          ...deco([-300, -300, 600], [1000, 880, 460], [1500, -160, 320]), ...HEAD, ...top('A day in the life  ·  Morning', 'A day in the life'),
          line: rect(-300, 557, 5200, 6), ...stops(0),
        },
      },
      {
        id: 's7', title: 'A day: afternoon', purpose: 'The camera pans two stops along the line: the morning slides out left and the afternoon arrives at centre.',
        place: {
          ...deco([-800, -300, 600], [200, 880, 460], [700, -160, 320]), ...HEAD, ...top('A day in the life  ·  Afternoon', 'A day in the life'),
          line: rect(-300 - 1280, 557, 5200, 6), ...stops(1280),
        },
      },
      {
        id: 's8', title: 'First 30-60-90', purpose: 'The line is gone; three circles become the numbers of three cards that climb like steps, with the desk picture above.',
        place: {
          ...deco([1500, -260, 600], [-200, 840, 460], [880, 980, 260]), ...HEAD, ...top('The first three months', 'Your first 30, 60 and 90 days'), desk: rect(DESK.x, DESK.y, DESK.w, DESK.h),
          ...[0, 1, 2].reduce((o, i) => {
            const c = [rect(100, 500, 546, 440), rect(687, 440, 546, 500), rect(1274, 380, 546, 560)][i]!
            return { ...o, [`c${i + 1}`]: c, ...av(i + 1, c.x + 100, c.y + 96, 120, ['30', '60', '90'][i]!, 52),
              ...item(i + 1, c.x + 40, c.y + 184, 466, ['30 days: Learn', '60 days: Contribute', '90 days: Lead'][i]!, ['Meet the team, learn the tools and finish your onboarding checklist.', 'Own a small project with your buddy and share what you learn.', 'Take on a bigger goal and help the next new hire settle in.'][i]!, 50, 170) }
          }, {} as Record<string, Place>),
        },
      },
      {
        id: 's9', title: 'Who to ask', purpose: 'A teal hub appears on the left; four circles line up as contacts, joined to it by lines.',
        place: {
          ...deco([70, 295, 700], [1500, -200, 520], [1700, 900, 320]), ...HEAD, ...top('Who to ask', 'Who to ask, and for what'),
          hub: ctr(420, 645, 260), hubt: { ...ctr(420, 645, 260), text: 'You' },
          ...[[1000, 420], [1100, 570], [1100, 720], [1000, 870]].reduce((o, [cx, cy], i) => ({
            ...o, [`l${i + 1}`]: link(420, 645, cx!, cy!), ...av(i + 1, cx!, cy!, 120, ['SR', 'JL', 'AM', 'TC'][i], 42),
            ...person(i + 1, cx! + 90, cy! - 50, 620, ['Sam Rivera', 'Jordan Lee', 'Alex Morgan', 'Taylor Chen'][i]!, ['Your manager: goals, feedback and time off', 'People team: contracts, benefits and leave', 'IT help: laptop, accounts and access', 'Your buddy: how things really work here'][i]!),
          }), {} as Record<string, Place>),
        },
      },
      {
        id: 's10', title: 'Benefits', purpose: 'Six tiles fill the slide; the circles shrink into the coloured dots that lead each benefit.',
        place: {
          ...deco([1560, -260, 600], [-220, 840, 480], [820, 980, 260]), ...HEAD, ...top('What we offer', 'What we offer you'),
          ...grid(3, 2, 100, 330, 1720, 610, 30).reduce((o, c, i) => ({
            ...o, [`c${i + 1}`]: c, ...av(i + 1, c.x + 68, c.y + 68, 64, ''),
            [`h${i + 1}`]: { ...rect(c.x + 120, c.y + 42, c.w - 150, 50), text: ['Flexible hours', 'Learning budget', 'Health cover', 'Paid time off', 'Team time', 'Home setup'][i]! },
            [`t${i + 1}`]: { ...rect(c.x + 36, c.y + 122, c.w - 72, 130), text: ['Work when you do your best work, with a few shared core hours.', 'A yearly budget for courses, books and conferences you choose.', 'Medical, dental and mental health support from your first day.', 'Generous leave, plus extra days to rest after big launches.', 'Quarterly offsites, monthly lunches and plenty of friendly games.', 'Equipment and a desk allowance so your workspace feels right.'][i]! },
          }), {} as Record<string, Place>),
        },
      },
      {
        id: 's11', title: 'Workplace', purpose: 'Tiles clear away; a large office picture takes the left, a round kitchen picture the top right and three notes the middle.',
        place: {
          ...deco([1700, 820, 420], [-200, -200, 460], [920, -180, 300]), ...HEAD, ...top('Our workplace', 'Where we work'),
          office: rect(100, 330, 860, 645), kitchen: rect(1580, 100, 240, 240), plant: rect(1650, 700, 170, 255),
          ...item(1, 1020, 380, 560, 'Open and bright', 'Desks by the windows, quiet rooms for focus and a sofa corner for easy chats.', 50, 130),
          ...item(2, 1020, 570, 560, 'A table for everyone', 'The kitchen is where we share lunch, birthdays and the best ideas.', 50, 130),
          ...item(3, 1020, 760, 560, 'Come as you are', 'Work from the office, from home or a mix. Your team will meet you halfway.', 50, 130),
        },
      },
      {
        id: 's12', title: 'Questions', purpose: 'The circle zooms through the slide again as the peach background; the cover returns with contact details.',
        place: {
          ...deco([-340, -760, 2600], [1000, 140, 840], [780, 60, 170], C.peach, C.mint, C.sun), mug: rect(1130, 330, 440, 440), plant: rect(1600, 570, 220, 330), notebook: rect(1080, 790, 170, 170, { rot: 8 }), ...HEAD,
          ...Object.assign({}, ...[0, 1, 2, 3, 4, 5].map((i) => av(i + 1, 148 + i * 112, 908, 96, ['SR', 'JL', 'AM', 'TC', 'CB', 'RP'][i], 34))),
          k: { ...rect(100, 220, 760, 32), text: 'Questions?' }, title: { ...rect(100, 270, 880, 250), text: 'Glad you are here', px: 112 },
          body: { ...rect(100, 590, 800, 170), text: 'welcome@yourcompany.com\nyourcompany.com/people\nAsk us anything, any time.', px: 34 },
        },
      },
    ],
  },
)
void at
