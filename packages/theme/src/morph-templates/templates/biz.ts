import { BIZ_DATA } from '../data/biz'
import type { MorphTemplate, TemplatePicture } from '../types'

const pic = (src: string, alt: string, extra: Partial<TemplatePicture> = {}): TemplatePicture => ({ src, alt, ...extra })
const a = (name: string, alt: string) => pic(`biz-${name}.webp`, alt)
const yellow = a('grad-yellow', 'A warm yellow and orange gradient')
const pink = a('grad-pink', 'A lilac, pink and coral gradient')
const red = a('grad-red', 'A vivid red and orange gradient')
const blue = a('grad-blue', 'A deep blue gradient')
const gold = a('grad-gold', 'A warm gold gradient')
const teal = a('grad-teal', 'A mint and teal gradient')
const card1 = a('product-earbuds', 'Wireless earbuds and their charging case')
const card2 = a('product-watch', 'A smartwatch with a blue face')
const card3 = a('product-speaker', 'A fabric-wrapped wireless speaker')
const call = a('product-phone-up', 'A smartphone with a teal screen')

/** the source deck's pictures, by their file name inside it */
const BY_FILE: Record<string, TemplatePicture> = {
  'media/image9.png': yellow, 'media/image10.png': a('product-headphones', 'Premium wireless headphones'),
  'media/image1.png': pink, 'media/image11.png': a('product-phone', 'A smartphone with a glowing screen'), 'media/image12.png': a('stripes-orange', 'Glowing orange stripes'),
  'media/image3.png': red, 'media/image4.png': blue, 'media/image2.png': gold,
  'media/image13.png': card1, 'media/image14.png': card2, 'media/image15.png': card3,
  'media/image5.png': red, 'media/image16.png': card1,
  'media/image6.png': blue, 'media/image17.png': card2,
  'media/image7.png': gold, 'media/image8.png': card3,
  'media/image18.png': teal, 'media/image19.png': a('product-laptop', 'A thin laptop with a glowing screen'), 'media/image20.png': teal,
  'media/image21.png': pic('biz-chart.svg', 'A line chart rising to the right'),
  'media/image22.png': a('stripes-red', 'Glowing red stripes'), 'media/image23.png': call, 'media/image24.png': call,
  'media/image25.png': a('stripes-teal', 'Glowing teal stripes'), 'media/image26.png': a('stripes-red', 'Glowing red stripes'),
}
const pictures: Record<string, TemplatePicture> = { void: pic('space-void.png', '') }
for (const [hash, file] of Object.entries(BIZ_DATA.media)) { const p = BY_FILE[file.replace('media/ppt/', '')] ?? BY_FILE[file]; if (p) pictures[hash] = p }

/**
 * Business Plan: confident, colourful and bold. A hero product fills each slide against a grainy colour field (yellow, pink, red, blue, gold, teal) on a near-black page, giant titles
 * ride a ticker across them, three project cards open one by one into full slides, and a timeline closes the plan. The choreography is the geometry of SlidesCarnival's "Business
 * Plan with Morph Transition" (positions, sizes, order, what moves into what), re-drawn with our own photography.
 */
export const BIZ_TEMPLATE: MorphTemplate = {
  id: 'biz',
  category: 'business',
  audience: "The Business Plan template suits business plans, pitch decks, product series, proposals, marketing and sales presentations, agency and consulting decks.",
  name: 'Business Plan',
  tagline: 'Pitch it like a brand',
  description: 'A bold Morph deck for business plans, pitches and product series: a hero product on rich colour fields, project cards that open into full slides, and a clean timeline, all flowing from one slide to the next.',
  topics: ['business', 'business plan', 'pitch', 'pitch deck', 'startup', 'product', 'product series', 'proposal', 'marketing', 'sales', 'strategy', 'investors', 'company', 'brand', 'portfolio', 'report', 'agency', 'consulting', 'finance'],
  fonts: { heading: 'Plus Jakarta Sans', body: 'Plus Jakarta Sans' },
  headingWeight: 800,
  textOnTop: true,
  colors: { background: '#101010', surface: '#1c1c1c', textPrimary: '#FFFFFF', textSecondary: '#D4D4D4', primary: '#FFFFFF', secondary: '#FF6B3D', accent: '#FFB23D', onPrimary: '#101010' },
  durationMs: 1500,
  background: '#101010',
  // on the contact slide the striped light sits behind the product
  data: { ...BIZ_DATA, slides: BIZ_DATA.slides.filter((s) => s.n <= 14).map((s) => (s.n === 14 ? { ...s, objects: [...s.objects.filter((o) => o.file?.includes('image25.')), ...s.objects.filter((o) => !o.file?.includes('image25.'))].map((o, z) => ({ ...o, z })) } : s)) },
  pictures,
  replace: { slidescarnival: 'SLIDESDONE', 'slidescarnival.com': 'slidesdone.com', reallygreatsite: 'yourcompany', '05.10.2024': 'DD.MM.YYYY' },
  scenes: [
    { id: 's1', title: 'Cover', purpose: 'The opening: a giant title across the bottom, a hero product on a warm yellow-orange field.' },
    { id: 's2', title: 'Contents', purpose: 'The chapters of the plan in two columns, each with a short line.' },
    { id: 's3', title: 'Chapter opener', purpose: 'A chapter title scrolling across a product on a pink-coral field.' },
    { id: 's4', title: 'Welcome', purpose: 'A product with striped light on the left, a welcome and paragraphs on the right.' },
    { id: 's5', title: 'Products', purpose: 'Three project cards side by side, each with a title over a product.' },
    { id: 's6', title: 'First product', purpose: 'The first card opens into a full slide: a big title and a paragraph on a red field.' },
    { id: 's7', title: 'Products', purpose: 'Back to the three cards.' },
    { id: 's8', title: 'Second product', purpose: 'The second card opens into a full blue slide with the title across the top.' },
    { id: 's9', title: 'Products', purpose: 'The three cards once more.' },
    { id: 's10', title: 'Third product', purpose: 'The third card opens into a full gold slide with the title and a paragraph.' },
    { id: 's11', title: 'Chapter opener', purpose: 'A chapter title scrolling across a product on a teal field.' },
    { id: 's12', title: 'Market and numbers', purpose: 'A rising line chart above a title and a paragraph.' },
    { id: 's13', title: 'Main points', purpose: 'A timeline of four main points with short explanations, striped light behind.' },
    { id: 's14', title: 'Contact', purpose: 'A product with striped light, the contact details on the right.' },
  ],
}
