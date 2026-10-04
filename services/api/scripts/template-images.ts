/**
 * Generates the shared photography for the template catalogue: 10 images per category (slots: 1 hero 16:9, 2 wide 16:9, 3–4 portrait 3:4,
 * 5–6 square 1:1, 7 4:3, 8 wide 16:9 (closing slide), 9 portrait 3:4, 10 4:3). Templates re-use a category's set with their own crops,
 * colour washes and slot order, so 120 designs don't need 1,200 pictures. Restartable (skips what exists); quota-aware (the image model
 * allows roughly one picture a minute). Existing prototype pictures are re-used where they fit.
 *   pnpm --filter @prompttoppt/api exec tsx --env-file-if-exists=.env scripts/template-images.ts && bash scripts/template-images-optimise.sh
 */
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { gateway } from '../src/ai/gateway.ts'
import { env } from '../src/env.ts'

const OUT = '../../apps/web/public/template-assets'
const LAB = '../../apps/web/public/template-lab'
type Aspect = '16:9' | '3:4' | '1:1' | '4:3'
const ASPECT: Aspect[] = ['16:9', '16:9', '3:4', '3:4', '1:1', '1:1', '4:3', '16:9', '3:4', '4:3', '16:9', '3:4', '1:1', '4:3', '16:9', '3:4']
/** Image model (registry id). The "lite" model is ~$0.034/picture and looks great for scenes; the balanced one often hits its project quota. */
const MODEL = process.env['TEMPLATE_IMAGE_MODEL'] ?? `${env.AI_PROVIDER}:gemini-3.1-flash-lite-image`
const STYLE = 'Editorial photograph, natural light, rich colour, shallow depth of field where it suits.'
const NO = 'No text, no letters, no logos, no watermark. Ultra high quality, professional.'

/** [category, ten prompts]. A prompt starting with `=` re-uses a prototype picture instead of generating one. */
const SETS: Record<string, string[]> = {
  pitch: ['=a-hero', '=a-night', '=a-team', '=a-chaos', '=a-device', 'Close-up of a firm handshake between two business people in a bright modern office, warm light.', 'Founders whiteboarding a product roadmap with colourful sticky notes in a startup office.', '3D render of a sleek rocket launching with a glowing trail on a dark navy background, cinematic.', 'Confident founder presenting on a stage with a blurred audience, spotlight.', 'Investors reviewing documents around a table in a glass meeting room.'],
  sales: ['Two business professionals shaking hands across a modern conference table, bright office.', 'Sales team celebrating a closed deal in a modern open-plan office, joyful.', 'Confident salesperson in a blazer presenting a proposal on a tablet to a client.', 'Friendly customer success manager on a video call wearing a headset, smiling.', 'Signed contract with a fountain pen and a coffee cup on a wooden table, top-down.', 'Laptop on a desk showing a colourful sales pipeline funnel chart.', 'Handshake over a table with documents and a laptop, warm light.', 'City skyline at sunrise seen through a corporate boardroom window.', 'Woman in business attire writing on a glass wall with a marker.', 'Team gathered around a table reviewing printed proposals.'],
  marketing: ['Vibrant neon-lit campaign stage: a giant glowing megaphone and bold colourful 3D shapes bursting with confetti on a dark background, magenta, orange and cyan light, cinematic wide.', 'Billboard and street advertising in a vibrant city at golden hour, wide.', '=s-p1', '=s-p2', '=s-group', '=s-mega', 'Creative team brainstorming with colourful sticky notes on a glass wall.', 'Social media creators filming content with a ring light in a colourful studio, wide.', '=s-p3', 'Overhead shot of a laptop showing analytics charts beside a coffee and notebook.'],
  strategy: ['Executives around a boardroom table with a city view, editorial.', 'Aerial view of a winding road toward distant mountains at sunrise, a journey, cinematic wide.', 'Chess pieces on a board with the king in focus, dramatic light.', 'CEO standing in front of a large window with a city skyline, thoughtful pose.', 'Compass resting on a map with a pen, top-down.', 'Whiteboard with a strategy diagram and sticky notes, close-up.', 'Leadership team workshop around a roadmap printed on the wall.', 'Sailing ship on a calm ocean at sunrise, cinematic wide.', 'Woman looking over a city from a high-rise at dusk, silhouette.', 'Stack of reports and a tablet showing charts on a boardroom table.'],
  product: ['Product team gathered around a table with laptops and a prototype phone in a design studio.', 'Floating glass app screens and UI cards in 3D on a soft gradient background.', 'Designer holding a smartphone showing an app prototype.', 'Developer wearing headphones coding on dual monitors, moody light.', '3D render of a smartphone with colourful floating app icons.', 'Wireframe sketches on paper next to a pen and sticky notes, top-down.', 'Kanban board with sticky notes on a wall in a bright office.', 'Rocket launch on a clear day, dramatic, wide.', 'Woman user-testing an app on a tablet in a café.', 'Product roadmap timeline drawn on a glass wall with markers.'],
  tech: ['Futuristic data centre with glowing blue server racks, cinematic wide.', 'Abstract network of glowing nodes and connections over a dark background.', 'Engineer in a server room holding a tablet, blue light.', 'Female developer coding on a laptop in a dark room lit by the screen.', 'Macro photo of a circuit board with blue light.', '3D render of a glowing cloud made of cubes and lines on a dark background.', 'Team reviewing an architecture diagram on a large monitor.', 'Fibre-optic cables with glowing light, macro, wide.', 'Cybersecurity analyst in front of several monitors, blue light.', 'Hands typing on a mechanical keyboard with code reflections.'],
  reports: ['Modern analytics dashboard on a large monitor in a dark office, glowing charts.', 'Aerial view of a business district with geometric patterns in daylight.', 'Analyst pointing at charts on a glass wall.', 'Woman reviewing printed financial reports with a pen.', 'Top-down view of printed bar charts, a calculator and a pen on a desk.', '3D render of colourful bar chart blocks rising on a pastel background.', 'Team reviewing quarterly results on a screen in a meeting.', 'Sunrise over skyscrapers symbolising growth, wide.', 'Businessman reading a tablet with graphs, shallow depth of field.', 'Laptop with a line chart, a notebook and a coffee, flat lay.'],
  education: ['=c-campus', 'Modern lecture hall with students and a presenter, wide.', '=c-class', 'Young student reading under a tree with a notebook, warm light.', '=c-books', 'Colourful classroom supplies arranged flat lay: pencils, notebooks and a small globe.', '=c-teacher', 'Graduates throwing caps in the air at golden hour, wide.', 'Teacher helping a student with a tablet in a bright classroom.', '=c-study'],
  'case-studies': ['Consultants presenting to a client team in a modern meeting room.', 'Busy modern warehouse with workers and organised shelves, wide.', 'Smiling retail store manager in a bright shop.', 'Engineer in a hard hat reviewing plans at a construction site at sunrise.', 'Tidy, organised shelf close-up, before-and-after concept.', 'Hands exchanging a project folder across a table.', 'Workshop with colourful sticky notes on a wall and people discussing.', 'Wide shot of a modern factory floor with robotic arms.', 'Customer service agent with a headset smiling at a desk.', 'Team celebrating success with a high-five in an office.'],
  team: ['Diverse team laughing together around a table in a bright modern office.', 'Company offsite picnic on a sunny lawn, joyful, wide.', 'Friendly new employee being welcomed with a handshake at the office door.', 'Woman smiling at her desk surrounded by plants in a bright office.', 'Team high-five over a table with coffee cups, top-down.', 'Colourful office kitchen with healthy snacks and a fruit bowl.', 'Team standup meeting around a whiteboard.', 'Happy diverse team posing outdoors in front of an office building, wide.', 'Man mentoring a younger colleague at a laptop.', 'Employees volunteering together planting trees.'],
}

const EXTRA: Record<string, string[]> = {
  "pitch": [
    "Rocket launching at dawn with a long glowing plume over the ocean, cinematic wide.",
    "Tall vertical view of a glass skyscraper reaching into a purple twilight sky, dramatic angle.",
    "Minimal flat lay of a notebook, smartphone and coffee on a dark desk with soft neon reflections.",
    "Small startup office at night, warm lamps and laptops on desks, empty, cosy.",
    "Aerial view of a futuristic city grid with glowing lines at night, wide.",
    "Vertical stack of rising stairs made of glass leading into bright light, abstract."
  ],
  "sales": [
    "Handshake silhouette in front of a large window at golden hour, wide, no faces visible.",
    "Tall vertical view of a revolving glass door of a modern corporate lobby.",
    "Flat lay of a signed contract, pen and tablet showing a rising chart on a clean desk.",
    "Modern showroom interior with product displays and warm lighting, empty.",
    "Wide shot of a bright open-plan sales floor with large screens showing charts, no close-ups.",
    "Vertical view of a trophy and a gold medal on a podium with soft spotlight."
  ],
  "marketing": [
    "Colourful abstract paint splashes in magenta, orange and cyan on a white background, wide.",
    "Tall vertical wall of neon signs and posters in a city alley at dusk.",
    "Flat lay of colourful sticky notes, markers and a phone showing social media icons, bright.",
    "Pop-up shop window decorated with balloons and bold colours, daytime.",
    "Rooftop party with string lights and confetti in the air at sunset, wide, distant crowd.",
    "Vertical stack of colourful megaphones and speech bubbles arranged as a sculpture, studio photo."
  ],
  "strategy": [
    "Chess board with a king and pawns in dramatic side light, shallow depth of field, wide.",
    "Tall vertical view of a lighthouse on a rocky coast at dusk, guiding light.",
    "Overhead flat lay of a compass, map and notebook on a wooden table.",
    "Large meeting table with a city skyline through floor-to-ceiling windows, empty room, evening.",
    "Wide aerial of a mountain ridge above the clouds at sunrise, summit in the distance.",
    "Vertical view of a long staircase climbing up a hill toward a bright horizon."
  ],
  "product": [
    "Wide shot of a bright design studio with sketches and wireframes pinned on a wall, no people.",
    "Tall vertical view of floating translucent app cards over a soft gradient, 3D render.",
    "Flat lay of a prototype phone, sticky notes and a pencil on a clean desk.",
    "Close-up of hands-free workspace with a tablet showing a colourful user interface, shallow depth of field.",
    "Wide minimalist product shelf with gadgets under soft studio light, no text.",
    "Vertical rounded-corner smartphone floating over a pastel gradient with soft shadow, studio."
  ],
  "tech": [
    "Server racks with glowing green status lights in a dark corridor, wide.",
    "Tall vertical view of a fibre-optic cable bundle glowing blue, macro, shallow depth of field.",
    "Square close-up of a circuit board with golden traces, macro, dark background.",
    "Developer desk at night with two monitors showing abstract code, no readable text, moody.",
    "Wide aerial of a hyperscale data centre campus at dusk.",
    "Vertical abstract of cascading blue digital particles falling like rain, dark background."
  ],
  "reports": [
    "Wide minimalist desk with a laptop showing a clean analytics dashboard, soft daylight, no readable text.",
    "Tall vertical view of a modern glass office tower seen from below, geometric, blue sky.",
    "Square flat lay of printed charts, a calculator and a pen on a white desk.",
    "Stacks of colourful bar charts printed on paper arranged neatly, studio, soft shadow.",
    "Wide aerial of a financial district at blue hour with light trails, no text.",
    "Vertical close-up of a pen resting on a printed line chart, shallow depth of field."
  ],
  "education": [
    "Colourful classroom with empty desks and sunlight through tall windows, wide.",
    "Tall vertical bookshelf full of colourful books in a bright library.",
    "Square flat lay of a globe, pencils, notebook and an apple on a wooden desk.",
    "Chalkboard with abstract doodles and shapes (no words) and a stick of chalk, classroom.",
    "Wide school corridor with lockers and warm light, empty, welcoming.",
    "Vertical view of a telescope and a microscope on a lab bench, soft light."
  ],
  "case-studies": [
    "Wide view of a modern factory floor with robotic arms and orderly lines, bright, no close-ups of people.",
    "Tall vertical view of a bridge cable structure against a blue sky, engineering, dramatic.",
    "Square flat lay of a consulting report, glasses and a coffee on a clean desk.",
    "Retail store interior with neat shelves and warm lighting, empty, wide 4:3.",
    "Wide aerial of a logistics port with colourful containers at sunrise.",
    "Vertical view of a modern hospital corridor with bright light, empty, clean."
  ],
  "team": [
    "Wide picnic blanket with snacks and lemonade on a sunny lawn, no faces, cheerful.",
    "Tall vertical view of a cosy office kitchen with plants and mugs, warm light.",
    "Square flat lay of colourful mugs, notebooks and a plant on a wooden table.",
    "Open-plan office with plants, hanging lights and beanbags, empty, warm and welcoming.",
    "Wide shot of a team offsite cabin by a lake at golden hour, no people.",
    "Vertical view of a wall of paper-craft hearts and stars in warm colours, studio."
  ]
}
for (const [cat, more] of Object.entries(EXTRA)) SETS[cat] = [...(SETS[cat] ?? []), ...more]

const have = (key: string) => ['png', 'jpg'].some((e) => existsSync(`${OUT}/${key}.${e}`))
const queue: { key: string; aspect: Aspect; prompt: string }[] = []
for (const [cat, prompts] of Object.entries(SETS)) {
  prompts.forEach((p, i) => {
    const key = `${cat}-${i + 1}`
    if (have(key)) return
    if (p.startsWith('=')) {
      const src = `${LAB}/${p.slice(1)}.jpg`
      if (existsSync(src)) copyFileSync(src, `${OUT}/${key}.jpg`)
      return
    }
    queue.push({ key, aspect: ASPECT[i]!, prompt: p })
  })
}
console.log(`${queue.length} pictures to generate`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const tries = new Map<string, number>()
while (queue.length) {
  const job = queue.shift()!
  const n = (tries.get(job.key) ?? 0) + 1
  tries.set(job.key, n)
  try {
    const r = await gateway.image({ model: MODEL, prompt: `${job.prompt} ${STYLE} ${NO}`, aspectRatio: job.aspect, ctx: {} })
    writeFileSync(`${OUT}/${job.key}.${r.mime === 'image/jpeg' ? 'jpg' : 'png'}`, r.bytes)
    console.log('ok', job.key, `(${queue.length} left)`)
    await sleep(15000)
  } catch (e) {
    console.log('retry-later', job.key, n, (e as Error).message.slice(0, 50))
    if (n < 8) queue.push(job)
    await sleep(30000)
  }
}
console.log('done')
process.exit(0)
