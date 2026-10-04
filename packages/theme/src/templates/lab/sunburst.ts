import type { Theme } from '@prompttoppt/validation'
import { A, H, SlideBuilder, W, type LabTemplate } from './dsl'

/** SUNBURST — Marketing & Campaigns. Loud, joyful colour blocking: orange, pink and sun-yellow with circular photo crops and floating 3D props. */
const C = { cream: '#FFF6EC', ink: '#1A1033', mute: '#5B4B73', orange: '#FF5A1F', pink: '#FF2E88', yellow: '#FFD23F', white: '#FFFFFF' }

export const sunburstTheme: Theme = {
  id: 'lab-sunburst', name: 'Sunburst', templateId: 'lab-sunburst', radius: 32,
  colors: { background: C.cream, surface: C.white, textPrimary: C.ink, textSecondary: C.mute, primary: C.orange, secondary: C.yellow, accent: C.pink, onPrimary: C.white },
  fonts: { heading: 'Poppins', body: 'DM Sans' },
  motion: { transition: 'push', entrance: 'pop', stagger: 120, duration: 650 },
}

/** floating confetti dots */
const confetti = (b: SlideBuilder, spots: [number, number, number, string, number][]) => {
  for (const [x, y, d, fill, delay] of spots) b.shape('ellipse', { x, y, w: d, h: d, fill, anim: A('drift', delay, 5200 + delay), decorative: true })
  return b
}

const personas = [
  { x: 140, bg: C.orange, fg: C.white, photo: 's-p1', name: 'Maya, 28', role: 'Ops lead at a growing retailer', stat: '38%', d: 400 },
  { x: 700, bg: C.pink, fg: C.white, photo: 's-p2', name: 'Daniel, 34', role: 'Founder of a 12-person studio', stat: '29%', d: 560 },
  { x: 1260, bg: C.yellow, fg: C.ink, photo: 's-p3', name: 'Jordan, 21', role: 'Student who runs a side shop', stat: '18%', d: 720 },
] as const

const personaCard = (b: SlideBuilder, img: (n: string) => string, c: (typeof personas)[number]) =>
  b
    .shape('rect', { x: c.x + 14, y: 334, w: 520, h: 640, fill: C.ink, radius: 40, anim: A('pop', c.d, 600) })
    .shape('rect', { x: c.x, y: 320, w: 520, h: 640, fill: C.white, radius: 40, stroke: C.ink, strokeWidth: 4, anim: A('pop', c.d, 600) })
    .image({ src: img(c.photo), alt: c.name, x: c.x + 22, y: 342, w: 476, h: 340, radius: 28, anim: A('fade', c.d + 150, 700) })
    .text({ x: c.x + 36, y: 706, w: 450, h: 50, text: c.name, size: 38, color: C.ink, role: 'heading', weight: 800, anim: A('fade-up', c.d + 250, 600) })
    .text({ x: c.x + 36, y: 758, w: 450, h: 70, text: c.role, size: 24, color: C.mute, anim: A('fade-up', c.d + 300, 600) })
    .shape('rect', { x: c.x + 36, y: 850, w: 210, h: 80, fill: c.bg, radius: 20, anim: A('pop', c.d + 400, 600) })
    .text({ x: c.x + 36, y: 850, w: 210, h: 80, text: c.stat, size: 46, color: c.fg, role: 'metric', weight: 900, align: 'center', valign: 'middle', anim: A('count-up', c.d + 450, 1200) })
    .text({ x: c.x + 262, y: 868, w: 230, h: 50, text: 'of our buyers', size: 22, color: C.mute, weight: 500, valign: 'middle', anim: A('fade', c.d + 600, 600) })

/** a labelled horizontal bar whose fill grows in */
const bar = (b: SlideBuilder, y: number, label: string, pct: number, fill: string, delay: number) =>
  b
    .text({ x: 1000, y, w: 500, h: 44, text: label, size: 32, color: C.ink, weight: 700, anim: A('fade', delay, 600) })
    .text({ x: 1580, y, w: 240, h: 44, text: `${pct}%`, size: 34, color: C.ink, role: 'metric', weight: 900, align: 'right', anim: A('count-up', delay + 100, 1200) })
    .shape('rect', { x: 1000, y: y + 56, w: 820, h: 30, fill: C.white, radius: 15, anim: A('fade', delay, 600) })
    .shape('rect', { x: 1000, y: y + 56, w: Math.round((820 * pct) / 50), h: 30, fill, radius: 15, anim: A('slide-left', delay + 150, 900) })

export const sunburst: LabTemplate = {
  id: 'lab-sunburst', name: 'Sunburst', category: 'Marketing & Campaigns', tagline: 'Loud, joyful colour blocks with circular photo crops and 3D props.', theme: sunburstTheme,
  slides: (img) => [
    // 1 ─ TITLE
    confetti(
      new SlideBuilder('su1', { type: 'color', value: C.orange })
        .shape('ellipse', { x: 960, y: 70, w: 880, h: 880, fill: C.yellow, anim: A('zoom', 100, 900) })
        .shape('ellipse', { x: 1420, y: 620, w: 420, h: 420, fill: C.pink, anim: A('zoom', 300, 900) })
        .image({ src: img('s-group'), alt: 'Friends laughing together on a sunny rooftop', x: 1010, y: 120, w: 780, h: 780, clip: 'circle', anim: A('zoom', 250, 900) })
        .image({ src: img('s-mega'), alt: 'Orange 3D megaphone with confetti', x: 880, y: 640, w: 360, h: 360, clip: 'circle', anim: A('float', 700, 4800) })
        .pill({ x: 110, y: 150, w: 360, h: 56, text: 'Marketing team', fill: C.ink, color: C.yellow, size: 22, anim: A('pop', 100, 600) })
        .text({ x: 110, y: 270, w: 900, h: 520, text: ['SPRING', 'LAUNCH', 'CAMPAIGN'], size: 128, color: C.white, role: 'title', weight: 900, lh: 0.95, ls: -3, anim: A('fade-up', 250, 700, { byParagraph: true, stagger: 140 }) })
        .text({ x: 110, y: 820, w: 760, h: 60, text: 'Plan & results · Q2 review', size: 38, color: C.white, weight: 500, anim: A('fade', 900, 600) }),
      [[860, 140, 56, C.yellow, 0], [1830, 80, 40, C.pink, 300], [800, 560, 28, C.ink, 600], [1750, 960, 64, C.yellow, 200]],
    ).build({ transition: 'push' }),

    // 2 ─ AUDIENCE: persona cards with hard ink shadows
    personas
      .reduce(
        (b, c) => personaCard(b, img, c),
        new SlideBuilder('su2', { type: 'color', value: C.cream })
          .shape('ellipse', { x: -180, y: -200, w: 560, h: 560, fill: C.yellow, op: 0.6, decorative: true, anim: A('float', 0, 8000) })
          .shape('ellipse', { x: 1620, y: 780, w: 480, h: 480, fill: C.pink, op: 0.25, decorative: true, anim: A('float', 0, 9000) })
          .pill({ x: 140, y: 100, w: 300, h: 52, text: 'The audience', fill: C.pink, color: C.white, size: 20, anim: A('pop', 100, 600) })
          .text({ x: 140, y: 170, w: 1500, h: 110, text: 'Who we’re talking to', size: 84, color: C.ink, role: 'title', weight: 900, ls: -2, anim: A('fade-up', 200, 700) }),
      )
      .build({ transition: 'push' }),

    // 3 ─ RESULTS: huge number, floating 3D megaphone, animated channel bars
    bar(bar(bar(
      new SlideBuilder('su3', { type: 'color', value: C.yellow })
        .shape('ellipse', { x: -200, y: 520, w: 760, h: 760, fill: C.orange, decorative: true, anim: A('zoom', 0, 900) })
        .image({ src: img('s-mega'), alt: 'Orange 3D megaphone with confetti', x: 90, y: 560, w: 480, h: 480, clip: 'circle', anim: A('float', 400, 5200) })
        .pill({ x: 140, y: 110, w: 290, h: 52, text: 'The results', fill: C.ink, color: C.yellow, size: 20, anim: A('pop', 100, 600) })
        .text({ x: 140, y: 180, w: 1000, h: 330, text: '10.4K', size: 300, color: C.pink, role: 'metric', weight: 900, ls: -4, lh: 1, anim: A('count-up', 300, 1600) })
        .text({ x: 150, y: 480, w: 800, h: 110, text: 'qualified sign-ups in eight weeks', size: 44, color: C.ink, weight: 700, anim: A('fade-up', 900, 700) })
        .text({ x: 1000, y: 170, w: 820, h: 60, text: 'Sign-ups by channel', size: 38, color: C.ink, role: 'heading', weight: 800, anim: A('fade', 500, 600) })
        .shape('rect', { x: 1000, y: 236, w: 100, h: 8, fill: C.pink, radius: 4, anim: A('wipe', 600, 600) }),
      330, 'Search', 42, C.orange, 700), 500, 'Social', 29, C.pink, 900), 670, 'Email', 18, C.ink, 1100)
      .text({ x: 1000, y: 870, w: 820, h: 70, text: 'Search and social delivered 70% of sign-ups at the lowest cost per sign-up. Sample figures.', size: 26, color: C.ink, weight: 500, anim: A('fade', 1500, 600) })
      .build({ transition: 'zoom' }),

    // 4 ─ CREATIVE IDEA: full-bleed flat-lay, big white card, rotated sticker
    new SlideBuilder('su4', { type: 'color', value: C.orange })
      .image({ src: img('s-flat'), alt: 'Colourful flat lay of a creative marketing desk', x: 0, y: 0, w: W, h: H, anim: A('kenburns', 0, 20000), overlay: { from: '#FF5A1F', to: '#FF2E88', angle: 135, opacity: 0.26 } })
      .shape('rect', { x: 146, y: 586, w: 980, h: 360, fill: C.ink, radius: 48, anim: A('pop', 400, 700) })
      .shape('rect', { x: 120, y: 560, w: 980, h: 360, fill: C.white, radius: 48, stroke: C.ink, strokeWidth: 5, anim: A('pop', 400, 700) })
      .pill({ x: 170, y: 596, w: 280, h: 48, text: 'The big idea', fill: C.pink, color: C.white, size: 18, anim: A('pop', 700, 600) })
      .text({ x: 170, y: 664, w: 880, h: 130, text: 'Stock, sorted.', size: 104, color: C.ink, role: 'title', weight: 900, ls: -3, anim: A('fade-up', 800, 700) })
      .text({ x: 170, y: 796, w: 880, h: 100, text: 'One message across short films, ads, email and the site — each aimed at a different pain point.', size: 30, color: C.mute, anim: A('fade-up', 1000, 700) })
      .shape('ellipse', { x: 1400, y: 140, w: 320, h: 320, fill: C.yellow, stroke: C.ink, strokeWidth: 6, rot: 12, anim: A('pop', 1100, 700) })
      .text({ x: 1400, y: 140, w: 320, h: 320, text: ['NEW', 'THIS', 'SPRING'], size: 50, color: C.ink, role: 'title', weight: 900, align: 'center', valign: 'middle', rot: 12, lh: 1, anim: A('pop', 1100, 700) })
      .build({ transition: 'wipe' }),

    // 5 ─ NEXT STEPS
    confetti(
      new SlideBuilder('su5', { type: 'color', value: C.pink })
        .shape('ellipse', { x: 1260, y: -140, w: 760, h: 760, fill: C.yellow, anim: A('zoom', 100, 900) })
        .image({ src: img('s-p1'), alt: 'Smiling portrait of Maya', x: 1360, y: 40, w: 560, h: 560, clip: 'circle', anim: A('zoom', 300, 900) })
        .text({ x: 110, y: 90, w: 1100, h: 470, text: ['LET’S', 'GO!'], size: 236, color: C.white, role: 'title', weight: 900, lh: 0.92, ls: -4, anim: A('fade-up', 200, 700, { byParagraph: true, stagger: 160 }) })
        .text({ x: 110, y: 590, w: 1100, h: 70, text: 'Next quarter at a glance', size: 44, color: C.white, weight: 700, anim: A('fade', 800, 600) })
        .pill({ x: 110, y: 710, w: 460, h: 130, text: 'July · Double down', fill: C.white, color: C.ink, size: 28, anim: A('pop', 900, 600) })
        .pill({ x: 610, y: 710, w: 460, h: 130, text: 'August · Fix what dragged', fill: C.yellow, color: C.ink, size: 28, anim: A('pop', 1050, 600) })
        .pill({ x: 1110, y: 710, w: 460, h: 130, text: 'September · Expand', fill: C.ink, color: C.white, size: 28, anim: A('pop', 1200, 600) })
        .text({ x: 110, y: 930, w: 900, h: 50, text: 'Questions and ideas welcome — marketing@example.com', size: 28, color: C.white, weight: 600, anim: A('fade', 1500, 600) }),
      [[1100, 640, 50, C.yellow, 0], [1650, 760, 70, C.orange, 400], [60, 900, 44, C.ink, 200], [1000, 60, 36, C.white, 600]],
    ).build({ transition: 'zoom' }),
  ],
}
