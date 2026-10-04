import type { SlideContent, ThemeStyle } from '@prompttoppt/validation'

/** Worst-case-ish sample content for every generatable layout. Used by the quality-gate tests and the dev gallery. */

export const common = { speakerNotes: '', sources: [] }
export const CLASSIC: ThemeStyle = { title: 'bar', header: 'bar', card: 'flat', decor: 'none', bullet: '•', footer: 'none', bodyBackground: 'solid', titleBackground: 'primary', headingWeight: 800, uppercaseHeadings: false, headingTracking: 0, photo: 'none', diagram: 'classic' }
export const long = 'Reducing manual handoffs between teams so that customers get answers in minutes instead of days'
export const SAMPLES: SlideContent[] = [
  { layout: 'title', title: 'Salesforce Agentforce: an executive overview for the board', subtitle: 'What it is, why it matters, how to start', ...common },
  { layout: 'section-divider', title: 'How it works', ...common },
  { layout: 'title-body', title: 'Why teams adopt autonomous agents', bullets: [long, long, long, long, long, long], ...common },
  { layout: 'split-image-text', title: 'A day in the life of an agent', bullets: [long, long, long], imagePrompt: 'office', imageAlt: 'office', ...common },
  { layout: 'quote', quote: long + ' ' + long, attribution: 'Customer', ...common },
  { layout: 'metrics', title: 'Results at a glance', metrics: [{ value: '42%', label: 'Faster resolution', detail: long }, { value: '3x', label: 'Throughput' }, { value: '$1.2M', label: 'Savings' }, { value: '98', label: 'CSAT' }], ...common },
  { layout: 'process', title: 'Implementation roadmap', steps: [1, 2, 3, 4, 5].map((i) => ({ label: `Phase ${i} setup`, detail: long })), ...common },
  { layout: 'timeline', title: 'Rollout timeline', steps: [1, 2, 3, 4, 5, 6].map((i) => ({ label: `Q${i}`, detail: long })), ...common },
  { layout: 'comparison', title: 'Before vs after', left: { heading: 'Before', bullets: [long, long, long, long] }, right: { heading: 'After', bullets: [long, long, long, long] }, ...common },
  { layout: 'chart', title: 'Adoption by quarter', chartType: 'bar', labels: ['Q1', 'Q2'], series: [{ name: 'Teams', values: [3, 9] }], takeaway: long, ...common },
  { layout: 'table', title: 'Options compared', header: ['Option', 'Strength'], rows: [['A', 'Simple'], ['B', 'Flexible']], ...common },
  { layout: 'thank-you', title: 'Thank you', subtitle: 'Questions?', ...common },
  { layout: 'agenda', title: 'Agenda for today', items: Array.from({ length: 8 }, (_, i) => ({ label: `Item ${i + 1}: a reasonably long agenda label`, detail: 'A short supporting detail line for this agenda item' })), ...common },
  { layout: 'team', title: 'Meet the team behind the product', people: Array.from({ length: 6 }, (_, i) => ({ name: `Alexandra Montgomery-${i}`, role: 'Head of Customer Success', bio: 'Ten years building support teams that customers actually love working with.' })), ...common },
  { layout: 'matrix', title: 'Where to focus next quarter', xLabel: 'Effort', yLabel: 'Impact', quadrants: Array.from({ length: 4 }, (_, i) => ({ heading: `Quadrant ${i + 1} heading`, bullets: [long, long, long].map((b) => b.slice(0, 70)) })), ...common },
  { layout: 'big-number', title: 'The result in one number', value: '$12.4M', label: 'Annual recurring revenue added in the last twelve months', context: [long, long, long], ...common },
  { layout: 'roadmap', title: 'Roadmap for the next year', phases: Array.from({ length: 5 }, (_, i) => ({ label: `Q${i + 1} 2026`, heading: `Phase ${i + 1} milestone heading`, bullets: [long, long, long].map((b) => b.slice(0, 70)) })), ...common },
  { layout: 'architecture', title: 'How the platform fits together', layers: Array.from({ length: 4 }, (_, i) => ({ name: `Layer ${i + 1} name here`, items: ['Component alpha', 'Component beta', 'Component gamma', 'Component delta', 'Component epsilon'] })), note: 'Every layer scales independently and is observable end to end.', ...common },
  { layout: 'case-study', title: 'How Acme cut resolution time in half', client: 'Acme Corporation', challenge: long + ' ' + long, approach: [long, long, long, long], results: [long, long, long, long], headline: { value: '-52%', label: 'Average time to resolution' }, ...common },
]

