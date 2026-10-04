import type { Theme } from '@prompttoppt/validation'
import { A, H, SlideBuilder, W, type LabTemplate } from './dsl'

/** SCHOLAR — Education & Training. Warm, friendly editorial: cream paper, navy ink, gold and teal accents, serif headlines, arch-cropped photos. */
const C = { cream: '#FBF5E9', ink: '#14213D', mute: '#4A5568', gold: '#F2A900', teal: '#1B998B', white: '#FFFFFF', paper: '#F3E8D2' }

export const scholarTheme: Theme = {
  id: 'lab-scholar', name: 'Scholar', templateId: 'lab-scholar', radius: 28,
  colors: { background: C.cream, surface: C.white, textPrimary: C.ink, textSecondary: C.mute, primary: C.ink, secondary: C.gold, accent: C.teal, onPrimary: C.cream },
  fonts: { heading: 'Playfair Display', body: 'DM Sans' },
  motion: { transition: 'fade', entrance: 'fade-up', stagger: 140, duration: 800 },
}

/** dotted grid ornament */
const dotGrid = (b: SlideBuilder, x: number, y: number, cols: number, rows: number, color: string) => {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) b.shape('ellipse', { x: x + c * 34, y: y + r * 34, w: 10, h: 10, fill: color, op: 0.55, decorative: true, anim: A('fade', 600 + (r + c) * 40, 600) })
  return b
}

const objectives = [
  { n: '1', t: 'Turn a table of numbers into one clear message', d: 500 },
  { n: '2', t: 'Choose the right chart for the question', d: 700 },
  { n: '3', t: 'Structure a short talk: beginning, middle and end', d: 900 },
] as const

const steps = [
  { t: 'Setup', s: 'Who, where, and what is normal', d: 500 },
  { t: 'Conflict', s: 'What changed or went wrong', d: 700 },
  { t: 'Resolution', s: 'What we should do about it', d: 900 },
] as const

export const scholar: LabTemplate = {
  id: 'lab-scholar', name: 'Scholar', category: 'Education & Training', tagline: 'Warm editorial paper, serif headlines and arch-cropped photography.', theme: scholarTheme,
  slides: (img) => [
    // 1 ─ TITLE: arch photo with gold and teal discs
    dotGrid(
      new SlideBuilder('sc1', { type: 'color', value: C.cream })
        .shape('ellipse', { x: 1380, y: 640, w: 420, h: 420, fill: C.gold, anim: A('zoom', 200, 900) })
        .shape('ellipse', { x: 1010, y: 90, w: 120, h: 120, fill: C.teal, anim: A('pop', 600, 600) })
        .image({ src: img('c-class'), alt: 'Students raising their hands in a bright classroom', x: 1130, y: 100, w: 640, h: 880, clip: 'arch', anim: A('kenburns', 0, 20000) })
        .pill({ x: 140, y: 160, w: 460, h: 56, text: 'Workshop · 90 minutes', fill: C.ink, color: C.cream, size: 20, anim: A('pop', 100, 600) })
        .shape('rect', { x: 140, y: 270, w: 110, h: 8, fill: C.gold, radius: 4, anim: A('wipe', 300, 700) })
        .text({ x: 140, y: 310, w: 900, h: 380, text: ['Introduction to', 'Data Storytelling'], size: 112, color: C.ink, role: 'title', weight: 700, lh: 1.04, ls: -2, anim: A('fade-up', 350, 800, { byParagraph: true, stagger: 170 }) })
        .text({ x: 140, y: 720, w: 800, h: 100, text: 'Make every number earn its place on the slide.', size: 38, color: C.mute, anim: A('fade-up', 1000, 700) })
        .text({ x: 140, y: 900, w: 700, h: 50, text: 'Facilitated by the Learning Team', size: 26, color: C.ink, role: 'caption', weight: 600, anim: A('fade', 1300, 600) }),
      620, 70, 5, 3, C.teal,
    ).build({ transition: 'fade' }),

    // 2 ─ OBJECTIVES: navy slide, numbered cards, circle photo
    objectives
      .reduce(
        (b, o, i) =>
          b
            .shape('rect', { x: 140, y: 330 + i * 200, w: 1060, h: 164, fill: C.cream, op: 0.1, radius: 32, anim: A('slide-left', o.d, 700) })
            .shape('ellipse', { x: 176, y: 362 + i * 200, w: 100, h: 100, fill: C.gold, anim: A('pop', o.d + 100, 600) })
            .text({ x: 176, y: 362 + i * 200, w: 100, h: 100, text: o.n, size: 52, color: C.ink, role: 'title', weight: 700, align: 'center', valign: 'middle', anim: A('pop', o.d + 100, 600) })
            .text({ x: 310, y: 330 + i * 200, w: 860, h: 164, text: o.t, size: 38, color: C.cream, valign: 'middle', anim: A('fade', o.d + 200, 700) }),
        new SlideBuilder('sc2', { type: 'color', value: C.ink })
          .shape('ellipse', { x: 1300, y: -260, w: 800, h: 800, fill: C.teal, op: 0.35, decorative: true, anim: A('float', 0, 9000) })
          .image({ src: img('c-teacher'), alt: 'Teacher explaining a diagram on a whiteboard', x: 1280, y: 300, w: 520, h: 520, clip: 'circle', anim: A('zoom', 400, 900) })
          .shape('ring', { x: 1250, y: 270, w: 580, h: 580, fill: 'none', stroke: C.gold, strokeWidth: 6, anim: A('zoom', 500, 900) })
          .pill({ x: 140, y: 130, w: 400, h: 52, text: 'Learning goals', fill: C.gold, color: C.ink, size: 20, anim: A('pop', 100, 600) })
          .text({ x: 140, y: 190, w: 1100, h: 120, text: 'By the end you will…', size: 84, color: C.cream, role: 'title', weight: 700, ls: -1.5, anim: A('fade-up', 250, 800) }),
      )
      .build({ transition: 'slide' }),

    // 3 ─ CONCEPT: rounded photo left, three steps right
    steps
      .reduce(
        (b, s, i) =>
          b
            .shape('ellipse', { x: 1010, y: 376 + i * 170, w: 74, h: 74, fill: C.teal, anim: A('pop', s.d, 600) })
            .text({ x: 1010, y: 376 + i * 170, w: 74, h: 74, text: '✓', size: 38, color: C.white, role: 'heading', weight: 700, align: 'center', valign: 'middle', anim: A('pop', s.d, 600) })
            .text({ x: 1114, y: 360 + i * 170, w: 700, h: 56, text: s.t, size: 42, color: C.ink, role: 'heading', weight: 700, anim: A('fade-up', s.d + 100, 600) })
            .text({ x: 1114, y: 418 + i * 170, w: 700, h: 50, text: s.s, size: 28, color: C.mute, anim: A('fade-up', s.d + 150, 600) }),
        new SlideBuilder('sc3', { type: 'color', value: C.cream })
          .shape('rect', { x: 96, y: 120, w: 900, h: 840, fill: C.gold, radius: 64, rot: -3, anim: A('fade', 0, 700) })
          .image({ src: img('c-study'), alt: 'Students studying together in a library', x: 120, y: 140, w: 880, h: 800, radius: 56, anim: A('kenburns', 0, 22000) })
          .pill({ x: 1010, y: 130, w: 380, h: 52, text: 'The core idea', fill: C.teal, color: C.white, size: 20, anim: A('pop', 100, 600) })
          .text({ x: 1010, y: 200, w: 820, h: 140, text: 'Every good story has three parts', size: 56, color: C.ink, role: 'title', weight: 700, lh: 1.08, ls: -1, anim: A('fade-up', 250, 800) }),
      )
      .build({ transition: 'fade' }),

    // 4 ─ EXERCISE: three rounded photos with a timeline
    new SlideBuilder('sc4', { type: 'color', value: C.paper })
      .pill({ x: 140, y: 100, w: 340, h: 52, text: 'Exercise · 30 min', fill: C.ink, color: C.cream, size: 20, anim: A('pop', 100, 600) })
      .text({ x: 140, y: 170, w: 1500, h: 110, text: 'Rewrite one of your own slides', size: 80, color: C.ink, role: 'title', weight: 700, ls: -1.5, anim: A('fade-up', 250, 800) })
      .image({ src: img('c-books'), alt: 'Books, coffee and a notebook on a desk', x: 140, y: 340, w: 530, h: 400, radius: 40, anim: A('kenburns', 0, 20000) })
      .image({ src: img('c-teacher'), alt: 'Teacher at the whiteboard', x: 695, y: 340, w: 530, h: 400, radius: 40, anim: A('kenburns', 0, 24000) })
      .image({ src: img('c-study'), alt: 'Students swapping notes', x: 1250, y: 340, w: 530, h: 400, radius: 40, anim: A('kenburns', 0, 22000) })
      .shape('ellipse', { x: 140, y: 770, w: 96, h: 96, fill: C.gold, anim: A('pop', 600, 600) })
      .text({ x: 140, y: 770, w: 96, h: 96, text: '5', size: 44, color: C.ink, role: 'metric', weight: 700, align: 'center', valign: 'middle', anim: A('count-up', 600, 1200) })
      .text({ x: 260, y: 770, w: 420, h: 96, text: ['5 min', 'Pick a slide from your own work'], size: 26, color: C.ink, valign: 'middle', anim: A('fade', 700, 600) })
      .shape('ellipse', { x: 695, y: 770, w: 96, h: 96, fill: C.teal, anim: A('pop', 800, 600) })
      .text({ x: 695, y: 770, w: 96, h: 96, text: '15', size: 40, color: C.white, role: 'metric', weight: 700, align: 'center', valign: 'middle', anim: A('count-up', 800, 1200) })
      .text({ x: 815, y: 770, w: 410, h: 96, text: ['15 min', 'Rewrite the title, cut the clutter'], size: 26, color: C.ink, valign: 'middle', anim: A('fade', 900, 600) })
      .shape('ellipse', { x: 1250, y: 770, w: 96, h: 96, fill: C.ink, anim: A('pop', 1000, 600) })
      .text({ x: 1250, y: 770, w: 96, h: 96, text: '10', size: 40, color: C.cream, role: 'metric', weight: 700, align: 'center', valign: 'middle', anim: A('count-up', 1000, 1200) })
      .text({ x: 1370, y: 770, w: 410, h: 96, text: ['10 min', 'Swap with a partner for feedback'], size: 26, color: C.ink, valign: 'middle', anim: A('fade', 1100, 600) })
      .build({ transition: 'slide' }),

    // 5 ─ THANK YOU: campus photo with an arch card
    new SlideBuilder('sc5', { type: 'color', value: C.ink })
      .image({ src: img('c-campus'), alt: 'University campus courtyard at golden hour', x: 0, y: 0, w: W, h: H, anim: A('kenburns', 0, 22000), overlay: { from: '#14213DB3', to: '#14213D33', angle: 90, opacity: 1 } })
      .shape('rect', { x: 130, y: 250, w: 760, h: 830, fill: C.cream, radius: 380, anim: A('fade-up', 300, 900) })
      .text({ x: 190, y: 480, w: 640, h: 200, text: 'Thank you', size: 100, color: C.ink, role: 'title', weight: 700, align: 'center', valign: 'middle', ls: -2, anim: A('fade-up', 700, 800) })
      .shape('rect', { x: 430, y: 700, w: 110, h: 8, fill: C.gold, radius: 4, anim: A('wipe', 1000, 600) })
      .text({ x: 190, y: 740, w: 640, h: 140, text: ['Slides and resources', 'will be shared after the session'], size: 30, color: C.mute, align: 'center', anim: A('fade', 1200, 700) })
      .build({ transition: 'fade' }),
  ],
}
