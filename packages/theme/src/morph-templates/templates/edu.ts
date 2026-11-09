import { EDU_DATA } from '../data/edu'
import type { MorphTemplate, TemplatePicture } from '../types'

const pic = (src: string, alt: string, extra: Partial<TemplatePicture> = {}): TemplatePicture => ({ src, alt, ...extra })
const a = (name: string, alt: string) => pic(`edu-${name}.webp`, alt)

/** the source deck's pictures, by their file name inside it */
const BY_FILE: Record<string, TemplatePicture> = {
  'media/image1.png': a('burst', 'A burst of orange petals and a golden sun'), 'media/image41.png': a('burst', 'A burst of orange petals and a golden sun'),
  'media/image2.png': a('storm', 'A storm cloud with lightning'),
  'media/image3.png': a('trex', 'A red Tyrannosaurus rex'),
  'media/image4.png': a('ptero', 'An orange pterodactyl'), 'media/image11.png': a('ptero', 'An orange pterodactyl'),
  'media/image5.png': pic('edu-line.svg', 'A teal ground line'),
  'media/image6.png': a('purple', 'A purple hadrosaur'),
  'media/image7.png': a('flowers', 'Flowers'),
  'media/image8.png': a('trees-red', 'Red trees'), 'media/image17.png': a('trees-red', 'Red trees'),
  'media/image9.png': a('trike', 'A green Triceratops'),
  'media/image10.png': a('hills', 'Grassy hills'), 'media/image43.png': a('hills', 'Grassy hills'),
  'media/image12.png': a('ankylo', 'An orange Ankylosaurus'),
  'media/image13.png': a('mountains', 'Mountains'),
  'media/image14.png': a('mushrooms', 'Red mushrooms'),
  'media/image15.png': a('rocks', 'Rocks'), 'media/image26.png': a('rocks', 'Rocks'), 'media/image40.png': a('rocks', 'Rocks'),
  'media/image16.png': a('leaves', 'Tropical leaves'), 'media/image44.png': a('leaves', 'Tropical leaves'),
  'media/image18.png': a('sunrise', 'A sun rising behind a cloud'),
  'media/image19.png': a('trees-tall', 'Tall trees'),
  'media/image20.png': a('pines', 'Pine trees'),
  'media/image21.png': a('sun', 'The sun'), 'media/image25.png': a('sun', 'The sun'),
  'media/image22.png': a('stego', 'A green Stegosaurus'),
  'media/image23.png': a('bronto', 'A blue long-necked dinosaur'), 'media/image28.png': a('bronto', 'A blue long-necked dinosaur'),
  'media/image24.png': a('blossom', 'A leafy plant'), 'media/image37.png': a('blossom', 'A leafy plant'),
  'media/image27.png': a('bushes', 'Bushes'), 'media/image42.png': a('bushes', 'Bushes'),
  'media/image29.jpg': a('fossil-1', 'A dinosaur model'),
  'media/image30.png': a('mush-yellow', 'Yellow mushrooms'),
  'media/image31.png': a('carno', 'An orange dinosaur'),
  'media/image32.png': a('hills-pink', 'Soft pink mountains'),
  'media/image33.png': a('fossil-3', 'A fossil skull'),
  'media/image34.jpg': a('fossil-2', 'A fossil skull'), 'media/image38.png': a('fossil-2', 'A fossil skull'),
  'media/image35.png': a('raptor-strip', 'A dinosaur model'),
  'media/image36.png': a('pine-island', 'Pine trees on an island'),
  'media/image39.png': a('sunflowers', 'Sunflowers and bees'), 'media/image47.png': a('sunflowers', 'Sunflowers and bees'),
  'media/image45.png': a('tree-orange', 'A golden tree'), 'media/image62.png': a('tree-orange', 'A golden tree'),
  'media/image46.png': a('trees-pink', 'Pink trees'),
}
const pictures: Record<string, TemplatePicture> = { void: pic('space-void.png', '') }
for (const [hash, file] of Object.entries(EDU_DATA.media)) { const p = BY_FILE[file.replace('media/ppt/', '')] ?? BY_FILE[file]; if (p) pictures[hash] = p }

/**
 * Education: a lesson with a storybook look. Friendly illustrated creatures and plants glide in and out of a deep navy or warm cream page, title words ride a ticker, and every
 * slide flows into the next. The choreography is the geometry of SlidesCarnival's "Morph Transition Education Background for Elementary" (positions, sizes, order, what moves
 * into what), re-drawn with our own illustrations.
 */
export const EDU_TEMPLATE: MorphTemplate = {
  id: 'edu',
  category: 'education',
  audience: "The Education template suits lessons, school and classroom talks, workshops, training sessions, nature and science topics, and storytelling for children: any presentation that should feel friendly, colourful and alive.",
  name: 'Education',
  tagline: 'Lessons that come alive',
  description: 'A playful Morph deck for lessons and workshops: friendly illustrated creatures and plants glide from slide to slide on a navy and cream storybook page, and every chapter flows into the next.',
  topics: ['education', 'school', 'lesson', 'teaching', 'kids', 'children', 'elementary', 'classroom', 'learning', 'science', 'nature', 'biology', 'animals', 'dinosaurs', 'history', 'workshop', 'training', 'story'],
  fonts: { heading: 'Josefin Sans', body: 'Josefin Sans' },
  colors: { background: '#21223E', surface: '#2c2e52', textPrimary: '#F4F7E2', textSecondary: '#C9CCE0', primary: '#F4F7E2', secondary: '#F59E0B', accent: '#F28C38', onPrimary: '#21223E' },
  durationMs: 1500,
  background: '#21223E',
  data: { ...EDU_DATA, slides: EDU_DATA.slides.filter((s) => s.n <= 15) },
  pictures,
  replace: { reallygreatsite: 'yourschool' },
  scenes: [
    { id: 's1', title: 'Cover', purpose: 'The opening: the title and subtitle on navy with a burst of colour and a sun at the edge.' },
    { id: 's2', title: 'Contents', purpose: 'The chapters of the lesson listed on a cream page, with scenery on either side.' },
    { id: 's3', title: 'Chapter opener', purpose: 'A single chapter title on navy with trees growing in.' },
    { id: 's4', title: 'Welcome', purpose: 'A short welcome and a paragraph, with a friendly creature walking in from the right.' },
    { id: 's5', title: 'Topic questions', purpose: 'Three short question-and-answer blocks (what, why, where) with a big title.' },
    { id: 's6', title: 'Chapter opener', purpose: 'A chapter title on navy with mountains rising behind it.' },
    { id: 's7', title: 'Timeline', purpose: 'Two periods side by side, each with a date and a short paragraph.' },
    { id: 's8', title: 'Timeline', purpose: 'The timeline moves on to the next period.' },
    { id: 's9', title: 'Gallery', purpose: 'A row of pictures under a title.' },
    { id: 's10', title: 'Chapter opener', purpose: 'A chapter title on navy with creatures lining up.' },
    { id: 's11', title: 'Subject detail', purpose: 'One subject large with a title and a paragraph about it.' },
    { id: 's12', title: 'Subject detail', purpose: 'The next subject, a title and a paragraph.' },
    { id: 's13', title: 'Subject detail', purpose: 'A third subject with a short personal paragraph.' },
    { id: 's14', title: 'Quote', purpose: 'A quotation with its source on navy.' },
    { id: 's15', title: 'Contact', purpose: 'The contact details with trees and a creature at the edges.' },
  ],
}
