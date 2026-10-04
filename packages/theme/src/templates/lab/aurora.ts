import type { Theme } from '@prompttoppt/validation'
import { A, H, SlideBuilder, W, type LabTemplate } from './dsl'

/** AURORA — Pitch & Investors. Dark, cinematic, photo-led; mint glow on deep navy with a coral spark. */
const C = { bg: '#07131F', surface: '#0E2233', ink: '#F4FBFF', mute: '#9FB8C8', mint: '#3DF5C1', coral: '#FF7A59', blue: '#7AA2FF' }

export const auroraTheme: Theme = {
  id: 'lab-aurora', name: 'Aurora', templateId: 'lab-aurora', radius: 24,
  colors: { background: C.bg, surface: C.surface, textPrimary: C.ink, textSecondary: C.mute, primary: C.mint, secondary: C.coral, accent: C.coral, onPrimary: '#04201A' },
  fonts: { heading: 'Sora', body: 'Inter' },
  motion: { transition: 'fade', entrance: 'fade-up', stagger: 140, duration: 800 },
}

export const aurora: LabTemplate = {
  id: 'lab-aurora', name: 'Aurora', category: 'Pitch & Investors', tagline: 'Cinematic, photo-led, glowing mint on midnight navy.', theme: auroraTheme,
  slides: (img) => [
    // 1 ─ TITLE: full-bleed city at blue hour, slow Ken Burns, left-weighted type, floating glass stat card
    new SlideBuilder('au1', { type: 'color', value: C.bg })
      .image({ src: img('a-hero'), alt: 'City skyline at blue hour under a green aurora', x: 0, y: 0, w: W, h: H, anim: A('kenburns', 0, 24000), overlay: { from: '#07131FFA', to: '#07131F40', angle: 90, opacity: 1 } })
      .shape('rect', { x: 0, y: 0, w: W, h: H, fill: '#07131F', op: 0.28, decorative: true })
      .shape('rect', { x: 140, y: 238, w: 120, h: 8, fill: C.mint, radius: 4, anim: A('wipe', 200, 700) })
      .pill({ x: 140, y: 150, w: 330, h: 54, text: 'Seed round · 2026', fill: C.mint, fillOp: 0.16, color: C.mint, size: 22, stroke: C.mint, anim: A('pop', 100, 600) })
      .text({ x: 140, y: 290, w: 1050, h: 420, text: ['We move goods', 'at the speed', 'of thought.'], size: 118, color: C.ink, role: 'title', weight: 800, lh: 1.02, ls: -2, anim: A('fade-up', 350, 800, { byParagraph: true, stagger: 160 }) })
      .text({ x: 140, y: 752, w: 900, h: 90, text: 'Northwind builds route intelligence for fleets of 5 to 200 vehicles.', size: 36, color: C.mute, anim: A('fade-up', 1000, 700) })
      .text({ x: 140, y: 930, w: 800, h: 50, text: 'Priya Nair · Founder & CEO', size: 26, color: C.ink, role: 'caption', weight: 600, anim: A('fade', 1300, 600) })
      .shape('rect', { x: 1290, y: 640, w: 440, h: 270, fill: '#FFFFFF', radius: 32, op: 0.1, stroke: '#FFFFFF', strokeWidth: 2, anim: A('float', 800, 6000) })
      .text({ x: 1322, y: 672, w: 380, h: 36, text: 'ANNUAL RECURRING REVENUE', size: 18, color: C.mint, role: 'caption', weight: 700, ls: 2, anim: A('float', 800, 6000) })
      .text({ x: 1322, y: 722, w: 380, h: 110, text: '$610K', size: 104, color: C.ink, role: 'metric', weight: 800, anim: A('float', 800, 6000) })
      .text({ x: 1322, y: 842, w: 380, h: 40, text: '+17% month on month', size: 24, color: C.mint, role: 'caption', weight: 600, anim: A('float', 800, 6000) })
      .build({ notes: 'Open with the promise, then pause. The stat card floats to draw the eye.', transition: 'fade' }),

    // 2 ─ PROBLEM: angled photo crop on the left, stat rows on the right
    new SlideBuilder('au2', { type: 'color', value: C.bg })
      .image({ src: img('a-chaos'), alt: 'Founder working late at a cluttered desk', x: -60, y: 0, w: 960, h: H, clip: 'diagonal', anim: A('kenburns', 0, 26000), overlay: { from: '#07131F', to: '#0B3B4A', angle: 135, opacity: 0.35 } })
      .shape('rect', { x: 818, y: 0, w: 12, h: H, fill: C.mint, op: 0.9, rot: 7.9, anim: A('fade', 300, 800), decorative: true })
      .pill({ x: 1010, y: 130, w: 250, h: 50, text: 'The problem', fill: C.mint, color: '#04201A', size: 20, anim: A('pop', 100, 600) })
      .text({ x: 1010, y: 210, w: 840, h: 260, text: ['23% of delivery', 'spend is wasted.'], size: 84, color: C.ink, role: 'title', weight: 800, lh: 1.05, ls: -1.5, anim: A('fade-up', 250, 800, { byParagraph: true, stagger: 150 }) })
      .shape('rect', { x: 1010, y: 520, w: 820, h: 130, fill: C.surface, radius: 28, anim: A('slide-right', 500, 700) })
      .text({ x: 1050, y: 540, w: 140, h: 90, text: '01', size: 64, color: C.mint, role: 'metric', weight: 800, valign: 'middle', anim: A('slide-right', 600, 700) })
      .text({ x: 1190, y: 540, w: 620, h: 90, text: 'Routes are still planned by hand in spreadsheets', size: 30, color: C.ink, valign: 'middle', anim: A('slide-right', 600, 700) })
      .shape('rect', { x: 1010, y: 676, w: 820, h: 130, fill: C.surface, radius: 28, anim: A('slide-right', 700, 700) })
      .text({ x: 1050, y: 696, w: 140, h: 90, text: '02', size: 64, color: C.coral, role: 'metric', weight: 800, valign: 'middle', anim: A('slide-right', 800, 700) })
      .text({ x: 1190, y: 696, w: 620, h: 90, text: 'Customers get vague windows and failed first attempts', size: 30, color: C.ink, valign: 'middle', anim: A('slide-right', 800, 700) })
      .shape('rect', { x: 1010, y: 832, w: 820, h: 130, fill: C.surface, radius: 28, anim: A('slide-right', 900, 700) })
      .text({ x: 1050, y: 852, w: 140, h: 90, text: '03', size: 64, color: C.blue, role: 'metric', weight: 800, valign: 'middle', anim: A('slide-right', 1000, 700) })
      .text({ x: 1190, y: 852, w: 620, h: 90, text: 'Enterprise tools are built for fleets ten times larger', size: 30, color: C.ink, valign: 'middle', anim: A('slide-right', 1000, 700) })
      .build({ transition: 'slide' }),

    // 3 ─ TRACTION: circle-cropped team photo with a glowing ring, count-up metrics
    new SlideBuilder('au3', { type: 'gradient', value: C.bg, gradient: { from: '#07131F', to: '#0C2A3A', angle: 160 } })
      .shape('ellipse', { x: 1180, y: -260, w: 900, h: 900, fill: C.mint, op: 0.07, decorative: true, anim: A('float', 0, 9000) })
      .shape('ring', { x: 96, y: 206, w: 668, h: 668, fill: 'none', stroke: C.mint, strokeWidth: 6, anim: A('zoom', 100, 900) })
      .image({ src: img('a-team'), alt: 'Northwind team collaborating', x: 130, y: 240, w: 600, h: 600, clip: 'circle', anim: A('zoom', 250, 900) })
      .pill({ x: 900, y: 150, w: 260, h: 50, text: 'Traction', fill: C.mint, fillOp: 0.16, color: C.mint, size: 20, stroke: C.mint, anim: A('pop', 100, 600) })
      .text({ x: 900, y: 226, w: 900, h: 130, text: 'Growing 17% every month.', size: 76, color: C.ink, role: 'title', weight: 800, ls: -1.5, lh: 1.05, anim: A('fade-up', 250, 800) })
      .shape('rect', { x: 900, y: 440, w: 300, h: 300, fill: C.surface, radius: 32, anim: A('fade-up', 500, 700) })
      .text({ x: 930, y: 470, w: 250, h: 130, text: '84', size: 104, color: C.mint, role: 'metric', weight: 800, anim: A('count-up', 700, 1400) })
      .text({ x: 930, y: 620, w: 250, h: 90, text: 'paying fleets', size: 28, color: C.mute, anim: A('fade', 800, 600) })
      .shape('rect', { x: 1220, y: 440, w: 300, h: 300, fill: C.surface, radius: 32, anim: A('fade-up', 650, 700) })
      .text({ x: 1250, y: 470, w: 250, h: 130, text: '$610K', size: 62, color: C.coral, role: 'metric', weight: 800, valign: 'middle', anim: A('count-up', 850, 1400) })
      .text({ x: 1250, y: 620, w: 250, h: 90, text: 'annual recurring revenue', size: 28, color: C.mute, anim: A('fade', 950, 600) })
      .shape('rect', { x: 1540, y: 440, w: 300, h: 300, fill: C.surface, radius: 32, anim: A('fade-up', 800, 700) })
      .text({ x: 1570, y: 470, w: 250, h: 130, text: '98%', size: 90, color: C.blue, role: 'metric', weight: 800, anim: A('count-up', 1000, 1400) })
      .text({ x: 1570, y: 620, w: 250, h: 90, text: 'customer retention', size: 28, color: C.mute, anim: A('fade', 1100, 600) })
      .text({ x: 900, y: 800, w: 900, h: 60, text: 'Sample figures — replace with your own numbers.', size: 22, color: C.mute, role: 'caption', anim: A('fade', 1300, 600) })
      .build({ transition: 'zoom' }),

    // 4 ─ PRODUCT: glowing device render, numbered features
    new SlideBuilder('au4', { type: 'color', value: '#081726' })
      .shape('ellipse', { x: 980, y: 40, w: 940, h: 940, fill: C.mint, op: 0.1, decorative: true, anim: A('zoom', 0, 1200) })
      .image({ src: img('a-device'), alt: 'Glass phone showing a glowing analytics dashboard', x: 1010, y: 70, w: 880, h: 880, clip: 'circle', anim: A('float', 300, 7000) })
      .pill({ x: 140, y: 150, w: 270, h: 50, text: 'The product', fill: C.coral, color: '#2A0E06', size: 20, anim: A('pop', 100, 600) })
      .text({ x: 140, y: 226, w: 820, h: 260, text: ['One platform.', 'Every route.'], size: 96, color: C.ink, role: 'title', weight: 800, lh: 1.04, ls: -2, anim: A('fade-up', 250, 800, { byParagraph: true, stagger: 150 }) })
      .text({ x: 140, y: 540, w: 120, h: 70, text: '01', size: 44, color: C.mint, role: 'metric', weight: 800, anim: A('slide-left', 500, 700) })
      .text({ x: 250, y: 540, w: 640, h: 70, text: 'Plans every route in under a minute', size: 34, color: C.ink, valign: 'middle', anim: A('slide-left', 500, 700) })
      .shape('rect', { x: 140, y: 636, w: 760, h: 2, fill: '#FFFFFF', op: 0.15, anim: A('wipe', 600, 700) })
      .text({ x: 140, y: 660, w: 120, h: 70, text: '02', size: 44, color: C.mint, role: 'metric', weight: 800, anim: A('slide-left', 650, 700) })
      .text({ x: 250, y: 660, w: 640, h: 70, text: 'Live delivery windows customers trust', size: 34, color: C.ink, valign: 'middle', anim: A('slide-left', 650, 700) })
      .shape('rect', { x: 140, y: 756, w: 760, h: 2, fill: '#FFFFFF', op: 0.15, anim: A('wipe', 750, 700) })
      .text({ x: 140, y: 780, w: 120, h: 70, text: '03', size: 44, color: C.mint, role: 'metric', weight: 800, anim: A('slide-left', 800, 700) })
      .text({ x: 250, y: 780, w: 640, h: 70, text: 'Runs on the vans and phones you already have', size: 34, color: C.ink, valign: 'middle', anim: A('slide-left', 800, 700) })
      .build({ transition: 'slide' }),

    // 5 ─ THE ASK: full-bleed night photo, giant count-up
    new SlideBuilder('au5', { type: 'color', value: C.bg })
      .image({ src: img('a-night'), alt: 'Financial district at night with light trails', x: 0, y: 0, w: W, h: H, anim: A('kenburns', 0, 22000), overlay: { from: '#07131FEB', to: '#07131F99', angle: 0, opacity: 1 } })
      .pill({ x: 140, y: 150, w: 230, h: 50, text: 'The ask', fill: C.mint, color: '#04201A', size: 20, anim: A('pop', 100, 600) })
      .text({ x: 140, y: 230, w: 1300, h: 330, text: '$2.5M', size: 300, color: C.mint, role: 'metric', weight: 800, ls: -4, lh: 1, anim: A('count-up', 300, 1600) })
      .text({ x: 140, y: 590, w: 1100, h: 130, text: 'Seed round to reach 300 fleets and break-even routes within 18 months.', size: 44, color: C.ink, anim: A('fade-up', 900, 800) })
      .pill({ x: 140, y: 800, w: 330, h: 64, text: 'Product 40%', fill: '#FFFFFF', fillOp: 0.14, color: C.ink, size: 22, stroke: '#FFFFFF', anim: A('pop', 1200, 600) })
      .pill({ x: 490, y: 800, w: 330, h: 64, text: 'Go to market 40%', fill: '#FFFFFF', fillOp: 0.14, color: C.ink, size: 22, stroke: '#FFFFFF', anim: A('pop', 1350, 600) })
      .pill({ x: 840, y: 800, w: 330, h: 64, text: 'Runway 20%', fill: '#FFFFFF', fillOp: 0.14, color: C.ink, size: 22, stroke: '#FFFFFF', anim: A('pop', 1500, 600) })
      .text({ x: 140, y: 940, w: 900, h: 50, text: 'priya@northwind.example', size: 26, color: C.mute, role: 'caption', anim: A('fade', 1700, 600) })
      .build({ transition: 'fade' }),
  ],
}
