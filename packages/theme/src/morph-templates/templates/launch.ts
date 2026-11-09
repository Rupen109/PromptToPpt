import { LAUNCH_DATA } from '../data/launch'
import type { MorphTemplate, TemplatePicture } from '../types'

const pic = (src: string, alt: string, extra: Partial<TemplatePicture> = {}): TemplatePicture => ({ src, alt, ...extra })
const can = (colour: string, tilt?: 1 | -1): TemplatePicture => pic(`launch-can-${colour}.webp`, `A ${colour === 'pink' ? 'raspberry' : colour === 'blue' ? 'blueberry' : 'lime'} soda can`, { aspect: 369 / 670, ...(tilt ? { tilt } : {}) })

/** the source deck's pictures, by their file name inside it */
const BY_FILE: Record<string, TemplatePicture> = {
  'media/image3.png': can('pink'), 'media/image6.png': can('pink'), 'media/image35.png': can('pink', 1), 'media/image14.png': can('pink', -1), 'media/image19.png': can('pink', 1), 'media/image37.png': can('pink', -1),
  'media/image7.png': can('blue'), 'media/image21.png': can('blue'), 'media/image30.png': can('blue'), 'media/image22.png': can('blue', -1), 'media/image26.png': can('blue', 1), 'media/image32.png': can('blue', 1),
  'media/image8.png': can('green'), 'media/image10.png': can('green', -1),
  'media/image13.png': pic('launch-berries.webp', 'Raspberries'), 'media/image15.png': pic('launch-berries.webp', 'Raspberries'), 'media/image34.png': pic('launch-berries.webp', 'Raspberries'), 'media/image36.png': pic('launch-berries.webp', 'Raspberries'),
  'media/image31.png': pic('launch-blueberries.webp', 'Blueberries'), 'media/image33.png': pic('launch-blueberries.webp', 'Blueberries'),
  'media/image9.png': pic('launch-limes.webp', 'Lime slices'), 'media/image11.png': pic('launch-limes.webp', 'Lime slices'),
  'media/image12.png': pic('launch-bubbles.webp', 'Fizz bubbles'), 'media/image16.png': pic('launch-bubbles.webp', 'Fizz bubbles'),
  'media/image1.png': pic('launch-bg-sky.webp', 'A bright summer sky with clouds'), 'media/image2.png': pic('launch-table.webp', 'A wooden table'),
  'media/image5.png': pic('launch-bg-beach.webp', 'A tropical beach'), 'media/image20.png': pic('launch-bg-pool.webp', 'A sunlit swimming pool'),
  'media/image4.png': pic('launch-panel-wall.webp', 'A pink wall with a doorway to the sky'), 'media/image17.png': pic('launch-panel-berries.webp', 'Raspberries on pink'),
  'media/image18.png': pic('launch-portrait.webp', 'A person with coral-pink hair looking up'),
  'media/image23.png': pic('launch-gallery-1.webp', 'A glass of cola with ice'), 'media/image24.png': pic('launch-gallery-2.webp', 'A splash of sparkling drink with lemon slices'), 'media/image25.png': pic('launch-gallery-3.webp', 'The top of a blue can'),
  'media/image27.png': pic('launch-avatar-1.webp', 'A member of the team'), 'media/image28.png': pic('launch-avatar-2.webp', 'A member of the team'), 'media/image29.png': pic('launch-avatar-3.webp', 'A member of the team'),
  'media/image76.png': pic('', '', { drop: true }),
}
const pictures: Record<string, TemplatePicture> = { void: pic('space-void.png', '') }
for (const [hash, file] of Object.entries(LAUNCH_DATA.media)) { const p = BY_FILE[file.replace('media/ppt/', '')] ?? BY_FILE[file]; if (p) pictures[hash] = p }

/**
 * Product Launch: a product is the protagonist. One hero object (here a can) stays on screen through the whole deck, growing, shrinking and tumbling from slide to slide, with
 * giant condensed headlines behind and across it, and the background changing colour and scene with the story (pink, sky, pool, blue, beach, green). The choreography is the
 * geometry of SlidesCarnival's "Morph Product Launch Business Proposal": positions, sizes, rotations, order and what moves into what, re-drawn with vector art.
 */
export const LAUNCH_TEMPLATE: MorphTemplate = {
  id: 'launch',
  category: 'launch',
  audience: "The Product Launch template suits new products, consumer brands, campaigns, startup pitches, sales presentations and business proposals: any talk where one product or idea should stay in view while the story changes around it.",
  name: 'Product Launch',
  tagline: 'Your product does the talking',
  description: 'A bold, colourful Morph deck for launching a product: the product tumbles, grows and travels from slide to slide, giant headlines run behind it, and the colours change with every chapter.',
  topics: ['product launch', 'product', 'launch', 'startup', 'brand', 'marketing', 'sales', 'pitch', 'consumer', 'beverage', 'food', 'retail', 'e-commerce', 'campaign', 'proposal', 'business'],
  fonts: { heading: 'Anton', body: 'DM Sans' },
  colors: { background: '#D90368', surface: '#FFE3F0', textPrimary: '#FFFFFF', textSecondary: '#FFD1E6', primary: '#90E0FF', secondary: '#FF62AC', accent: '#FFFF82', onPrimary: '#1B0A2A' },
  durationMs: 1500,
  background: '#D90368',
  data: { ...LAUNCH_DATA, slides: LAUNCH_DATA.slides.filter((s) => s.n <= 15) },
  pictures,
  replace: { slidescarnival: 'SLIDESDONE', 'brand name': 'YOUR BRAND' },
  scenes: [
    { id: 's1', title: 'Cover', purpose: 'The opening: a giant two-line title with the product tilted across it, in a cloud of berries and bubbles.' },
    { id: 's2', title: 'Contents', purpose: 'The chapters of the talk on the right, the product on a photo panel on the left.' },
    { id: 's3', title: 'Chapter opener', purpose: 'A giant chapter title, the product standing on a table against a summer sky.' },
    { id: 's4', title: 'Welcome', purpose: 'A headline and a welcome paragraph, a person looking up from the bottom right corner.' },
    { id: 's5', title: 'Our brand', purpose: 'Two short question-and-answer blocks on the left, the product small on a pink architectural photo.' },
    { id: 's6', title: 'Mission and vision', purpose: 'A starburst of rays behind a huge two-line statement, the product tilted across it.' },
    { id: 's7', title: 'Chapter opener', purpose: 'A giant chapter title over a swimming pool, the product standing in front.' },
    { id: 's8', title: 'History', purpose: 'The product huge and cropped on the left, a headline and paragraph on the right.' },
    { id: 's9', title: 'Gallery', purpose: 'Three tall pictures side by side under a headline, the product peeking in from a corner.' },
    { id: 's10', title: 'Team', purpose: 'Three people with names and roles on the left, the product large on the right.' },
    { id: 's11', title: 'Products', purpose: 'A giant title over a beach, three product variants standing in a row.' },
    { id: 's12', title: 'Product feature', purpose: 'A green slide: the product tilted with fruit around it, the price and a big word across it.' },
    { id: 's13', title: 'Product feature', purpose: 'A blue slide: another variant, tilted the other way, with its price.' },
    { id: 's14', title: 'Product feature', purpose: 'A pink slide: the first variant again, with its price.' },
    { id: 's15', title: 'Contact', purpose: 'The ending: the contact details on the left, the product tilted on the right.' },
  ],
}
