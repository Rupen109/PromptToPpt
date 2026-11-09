import { COOL_DATA } from '../data/cool'
import type { MorphTemplate, TemplatePicture } from '../types'

const pic = (src: string, alt: string, extra: Partial<TemplatePicture> = {}): TemplatePicture => ({ src, alt, ...extra })
const a = (name: string, alt: string) => pic(`cool-${name}.webp`, alt)
const pink = a('blob-pink', 'A glowing pink and lilac ribbon of light')
const lilac = a('blob-lilac', 'A lilac cloud of light with a bright arc')
const olive = a('blob-olive', 'An olive and teal glow with a pale arc')
const slate = a('blob-slate', 'A slate-blue glow with a pale arc')
const cream = a('blob-cream', 'A cream glow with an indigo swoosh')
const x = a('blob-x', 'Two crossing swooshes of light')
const haze1 = a('haze-1', 'A soft lilac haze')
const haze2 = a('haze-2', 'A soft grey haze')
const backdrop = a('backdrop', 'A dark studio backdrop with soft lilac light')
const woman = a('woman', 'A woman in sunglasses and a white turtleneck')

/** the source deck's pictures, by the asset they come from (scripts/morph-import-canva.mjs names each one by a hash of its asset id) */
const BY_HASH: Record<string, TemplatePicture> = {
  '833fc9db': pink, '4a79b9cc': pink,
  '7e8364d7': lilac, df5662ad: lilac, '96f703b6': lilac,
  '282973c6': olive, adc0b05c: slate, '1ffd52f5': cream, '233e80e9': x,
  '8df96213': haze1, e97e325f: haze1, '833bd22a': haze1, '594af809': haze1, bc78f844: haze2, '68c5ad6c': haze2,
  '570f256f': woman, '616d3f2f': backdrop, '1b8d7a24': woman, '53d72edb': backdrop,
  b48ec977: a('john-1', 'A member of the team'), '388674c9': a('jane-1', 'A member of the team'), '359c43ed': a('john-2', 'A member of the team'),
  c95c961f: a('interior', 'A stylish interior with a yellow armchair'), f7e248fa: a('cocktail', 'A hand lifting an olive from a martini glass'), '56096ebd': a('motion-face', 'A face in motion blur'),
}

/**
 * Cool Morph: a quiet, dark deck where soft holographic forms of light drift behind giant, wide, thin headlines. Pictures are moody and cinematic, the words are few. The
 * choreography is the geometry of SlidesCarnival's "Cool Morph Animated Slides" (positions, sizes, order, what moves into what), re-drawn with our own artwork.
 */
export const COOL_TEMPLATE: MorphTemplate = {
  id: 'cool',
  category: 'marketing',
  audience: "The Cool Morph template suits design and creative studios, portfolios, agencies, fashion and photography, brand and marketing presentations, and any talk that should feel calm, modern and minimal.",
  name: 'Cool Morph',
  tagline: 'Soft light, big words',
  description: 'A dark, minimal Morph deck where soft holographic forms of light drift behind giant, wide headlines, and cinematic photographs slide in and out as the story moves on.',
  topics: ['design', 'creative', 'portfolio', 'agency', 'studio', 'fashion', 'art', 'photography', 'technology', 'startup', 'brand', 'branding', 'marketing', 'modern', 'minimal', 'portfolio', 'architecture', 'music', 'event'],
  fonts: { heading: 'Sora', body: 'Inter' },
  headingWeight: 300,
  coverCrops: true,
  colors: { background: '#231F20', surface: '#2f2a2b', textPrimary: '#FFFFFF', textSecondary: '#D8D3D6', primary: '#FFFFFF', secondary: '#9d8cf0', accent: '#c8f0a0', onPrimary: '#231F20' },
  durationMs: 1500,
  background: '#231F20',
  // the fourth team portrait is hidden behind an overlay in the source; here all four people are shown
  data: { ...COOL_DATA, slides: COOL_DATA.slides.filter((s) => s.n <= 11).map((s) => (s.n === 7 ? { ...s, objects: s.objects.map((o) => (o.hash === '359c43ed' ? { ...o, alpha: 1 } : o)) } : s)) },
  pictures: { void: pic('space-void.png', ''), ...Object.fromEntries(Object.entries(BY_HASH).map(([k, v]) => [k, v])) },
  replace: { slidescarnival: 'SLIDESDONE', reallygreatsite: 'yoursite', '05.08.2024': 'DD.MM.YYYY' },
  scenes: [
    { id: 's1', title: 'Cover', purpose: 'The opening: one giant title across the slide over a glowing ribbon of light.' },
    { id: 's2', title: 'Contents', purpose: 'The chapters listed between thin lines, each with a small window of light.' },
    { id: 's3', title: 'Chapter opener', purpose: 'A chapter title across the middle with the light drifting behind it.' },
    { id: 's4', title: 'Welcome', purpose: 'A portrait on the left, a short welcome and paragraphs on the right.' },
    { id: 's5', title: 'Mission and vision', purpose: 'Two big words, mission and vision, with a paragraph.' },
    { id: 's6', title: 'Chapter opener', purpose: 'A chapter title centred over crossing swooshes of light.' },
    { id: 's7', title: 'Team', purpose: 'Four names with their positions along the top, portraits rising from the bottom.' },
    { id: 's8', title: 'Gallery', purpose: 'A mosaic of photographs under a title.' },
    { id: 's9', title: 'Statement', purpose: 'A big title and a paragraph above a wide panel.' },
    { id: 's10', title: 'Quote', purpose: 'A quotation with its source, centred.' },
    { id: 's11', title: 'Contact', purpose: 'The contact details beside a large title.' },
  ],
}
