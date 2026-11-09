import { SPACE_DATA } from '../data/space'
import type { MorphTemplate, TemplatePicture } from '../types'

const pic = (src: string, alt: string, extra: Partial<TemplatePicture> = {}): TemplatePicture => ({ src, alt, ...extra })
const stars = pic('space-stars.svg', 'A field of stars')
const earth = pic('space6.png', 'The Earth')
const mars = pic('space1.png', 'Mars')
const venus = pic('space3.png', 'Venus')
const saturn = pic('space4.png', 'Saturn and its rings')
const mercury = pic('space5.png', 'Mercury')
const astronaut = pic('space2.png', 'An astronaut in a white helmet')

/**
 * Space: a planet is the protagonist. One huge planet travels across the slides (it rises from the bottom edge, grows to fill half the slide, slides out as the next arrives), the
 * chapter titles scroll sideways like a ticker behind it, and the words stay small and quiet at the edge. Black, stars, Inter. The choreography is the geometry of
 * SlidesCarnival's "Morph Space-Themed Background" (positions, sizes, order, and what moves into what), re-drawn with our own and the owner's artwork.
 */
export const SPACE_TEMPLATE: MorphTemplate = {
  id: 'space',
  category: 'technology',
  audience: "The Space template suits astronomy, space missions, the Moon, planets, science and research talks, technology and future-looking presentations, and any topic that benefits from a sense of scale and discovery.",
  name: 'Space',
  tagline: 'A planet carries your story',
  description: 'A cinematic Morph deck in deep space: giant planets glide across the slide, headlines scroll behind them like a ticker, and every slide flows into the next in one smooth movement.',
  topics: ['space', 'astronomy', 'astrophysics', 'moon', 'mars', 'planets', 'solar system', 'rockets', 'satellites', 'science', 'research', 'nature', 'physics', 'exploration', 'technology', 'future'],
  fonts: { heading: 'Inter', body: 'Inter' },
  colors: { background: '#000000', surface: '#10131c', textPrimary: '#FFFFFF', textSecondary: '#C9CCD6', primary: '#FFFFFF', secondary: '#8f96ad', accent: '#f2a65a', onPrimary: '#000000' },
  durationMs: 1500,
  background: '#000000',
  data: { ...SPACE_DATA, slides: SPACE_DATA.slides.filter((s) => s.n <= 20) },
  pictures: {
    '1bc6b942': stars, '7b9647ff': stars,
    '70942a42': earth, '514c9c9e': earth, '4ca8fc3f': earth,
    '85034c05': mars, '17be826f': mars,
    '2412b263': astronaut,
    '4cc00137': venus, '0d8932d2': venus, cf4812f1: venus,
    f142f906: saturn, df7c85a5: saturn,
    '061d17cb': mercury, '1a5ef54f': mercury,
    '6739dc63': pic('space7.png', 'Jupiter'),
    ddbcc91c: pic('space-uranus.webp', 'Uranus'), d7fa7bbe: pic('space-neptune.webp', 'Neptune'),
    '04866583': pic('space-sun.webp', 'The Sun'),
    '0aa244c1': pic('space-lineup.png', 'The eight planets in a row, from Mercury to Neptune'),
    '3fbe3c49': pic('space-moon.webp', 'The Moon'),
    '89c05983': pic('space2.png', 'A member of the crew', { clip: 'circle' }), f9aff33a: pic('space2.png', 'A member of the crew', { clip: 'circle' }), '82b7aa7a': pic('space2.png', 'A member of the crew', { clip: 'circle' }),
    bf5e5cc3: pic('', '', { drop: true }),
    void: pic('space-void.png', ''),
  },
  replace: { slidescarnival: 'SLIDESDONE', 'tech company': 'YOUR COMPANY' },
  scenes: [
    { id: 's1', title: 'Cover', purpose: 'The opening: a huge title across the bottom with the Earth rising behind it.' },
    { id: 's2', title: 'Contents', purpose: 'The chapters of the talk, listed in the middle of the slide as the Earth leaves through the top.' },
    { id: 's3', title: 'Chapter opener', purpose: 'A chapter title that scrolls sideways across Mars like a ticker.' },
    { id: 's4', title: 'Welcome', purpose: 'A person (an astronaut) and a big planet on the right, a short welcome and paragraph on the left.' },
    { id: 's5', title: 'About', purpose: 'One big statement on the left over a planet, three short question-and-answer blocks on the right.' },
    { id: 's6', title: 'Chapter opener', purpose: 'A chapter title scrolling across Venus.' },
    { id: 's7', title: 'History', purpose: 'A huge planet on the left, a title and a paragraph on the right.' },
    { id: 's8', title: 'Mission and vision', purpose: 'Saturn on the right, one large mission statement on the left.' },
    { id: 's9', title: 'Team', purpose: 'Three people in circles with their names and roles, Saturn sweeping away on the left.' },
    { id: 's10', title: 'The whole system', purpose: 'All eight planets on a diagonal, with the title scrolling above and the Sun at the left edge.' },
    { id: 's11', title: 'Planet detail', purpose: 'One planet large on the left, a paragraph about it on the right.' },
    { id: 's12', title: 'Planet detail', purpose: 'A planet on the right, a title and paragraph on the left.' },
    { id: 's13', title: 'Planet detail', purpose: 'The planet rises from the bottom edge, a big statement across the top.' },
    { id: 's14', title: 'Planet detail', purpose: 'The planet at the top, a big statement across the bottom.' },
    { id: 's15', title: 'Planet detail', purpose: 'A planet on the right, a title and paragraph on the left.' },
    { id: 's16', title: 'Planet detail', purpose: 'A giant planet filling the slide, a statement on the right.' },
    { id: 's17', title: 'Planet detail', purpose: 'A planet at the top, a statement across the bottom.' },
    { id: 's18', title: 'Planet detail', purpose: 'A planet at the bottom, a statement across the top.' },
    { id: 's19', title: 'Quote', purpose: 'A quotation with its source, on a quiet field of stars.' },
    { id: 's20', title: 'Contact', purpose: 'The Moon on both edges, the contact details in the middle.' },
  ],
}
