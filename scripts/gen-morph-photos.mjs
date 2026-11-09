#!/usr/bin/env node
/**
 * The pictures of the Morph templates that are not the owner's own cut-outs: made by a Google Gemini image model, cleaned here and saved as WebP in apps/web/public/morph-templates.
 *
 *   node scripts/gen-morph-photos.mjs [--only name,name] [--model gemini-3-pro-image] [--list]
 *
 * The model cannot make transparency, so every cut-out is made on a flat key colour (green, or magenta when the subject is green) and keyed here; bubbles and planets are made
 * on black and use their own brightness as transparency. The key is read from services/api/.env and never printed. One image costs about $0.13 on the Studio model.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// sharp is a dependency of the web app (the image optimizer), not of the repo root: take it from the package store
const sharpDir = readdirSync(join(root, 'node_modules', '.pnpm')).find((d) => d.startsWith('sharp@'))
const sharp = (await import(pathToFileURL(join(root, 'node_modules', '.pnpm', sharpDir, 'node_modules', 'sharp', 'dist', 'index.mjs')).href)).default
const OUT = join(root, 'apps', 'web', 'public', 'morph-templates')
const env = readFileSync(join(root, 'services', 'api', '.env'), 'utf8')
const KEY = (env.match(/^GEMINI_API_KEY=(.*)$/m) ?? [])[1]?.trim().replace(/^["']|["']$/g, '')
if (!KEY) { console.error('GEMINI_API_KEY is not set in services/api/.env'); process.exit(1) }
const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const MODEL = flag('--model') ?? 'gemini-3-pro-image'
const only = flag('--only')?.split(',')

const GREEN = 'a perfectly flat, evenly lit pure chroma-key green (#00FF00) background with no gradient, no floor, no reflection and no cast shadow'
const MAGENTA = 'a perfectly flat, evenly lit pure chroma-key magenta (#FF00FF) background with no gradient, no floor, no reflection and no cast shadow'
const BLUE = 'a perfectly flat, evenly lit pure chroma-key blue (#0000FF) background with no gradient, no floor, no reflection and no cast shadow'
const BLACK = 'a pure black background (#000000)'
const AD = 'Premium commercial advertising photography for a bright, modern fruit-soda brand, razor-sharp focus, rich saturated colour, high-end retouching. No text, no letters, no numbers, no logos, no watermark anywhere.'

/**
 * name, key ('green' | 'magenta' | 'black' | none), ratio for the model, final size [w, h] (cover-cropped), mode:
 *   trim  crop to the subject and centre it on a canvas of the final aspect (a cut-out object)
 *   frame keep the whole frame (scatters: the objects are already placed around the edges)
 */
const A = [
  { name: 'can-pink', key: 'green', ratio: '9:16', size: [600, 1090], mode: 'trim', fill: 0.97, p: `${AD} One single upright standard 330 ml aluminium soda can with stubby proportions (its height is only about 1.8 times its width), seen straight on at eye level and very slightly from above so the silver lid and pull-tab show, the body a vivid glossy raspberry-pink anodised finish with crisp specular highlights and a few fine condensation droplets, plain body with no label and no graphics, exact cylinder proportions, filling the frame vertically with a small margin, on ${GREEN}.` },
  { name: 'can-blue', key: 'green', ratio: '9:16', size: [600, 1090], mode: 'trim', fill: 0.97, p: `${AD} One single upright standard 330 ml aluminium soda can with stubby proportions (its height is only about 1.8 times its width), seen straight on at eye level and very slightly from above so the silver lid and pull-tab show, the body a vivid glossy royal-blue anodised finish with crisp specular highlights and a few fine condensation droplets, plain body with no label and no graphics, exact cylinder proportions, filling the frame vertically with a small margin, on ${GREEN}.` },
  { name: 'can-green', key: 'magenta', ratio: '9:16', size: [600, 1090], mode: 'trim', fill: 0.97, p: `${AD} One single upright standard 330 ml aluminium soda can with stubby proportions (its height is only about 1.8 times its width), seen straight on at eye level and very slightly from above so the silver lid and pull-tab show, the body a vivid glossy lime-green anodised finish with crisp specular highlights and a few fine condensation droplets, plain body with no label and no graphics, exact cylinder proportions, filling the frame vertically with a small margin, on ${MAGENTA}.` },
  { name: 'berries', key: 'green', ratio: '1:1', size: [1200, 1200], mode: 'frame', p: `${AD} Only six fresh raspberries in total: four large ones (each about a fifth of the frame's width) and two small ones, spread far apart around the frame, and nothing else (no leaves), glossy and detailed with tiny water droplets, floating in mid-air, arranged in a loose ring along the edges and corners of a square frame with the whole centre of the frame EMPTY, every object completely inside the frame with a clear margin of at least 8% from every edge (nothing cropped by the frame), no object touching another, on ${GREEN}.` },
  { name: 'blueberries', key: 'green', ratio: '1:1', size: [1200, 1200], mode: 'frame', p: `${AD} Eight very large plump blueberries (each about a sixth of the frame's width) with dusty-blue bloom and the star-shaped crown, a few with water droplets, floating in mid-air at different sizes, arranged in a loose ring along the edges and corners of a square frame with the whole centre of the frame EMPTY, every object completely inside the frame with a clear margin of at least 8% from every edge (nothing cropped by the frame), no object touching another, on ${GREEN}.` },
  { name: 'limes', key: 'magenta', ratio: '1:1', size: [1200, 1200], mode: 'frame', p: `${AD} Very large lime slices, half-slices and wedges (each about a fifth of the frame's width) with glistening translucent flesh and segment detail, plus one whole lime, floating in mid-air, arranged in a loose ring along the edges and corners of a square frame with the whole centre of the frame EMPTY, every object completely inside the frame with a clear margin of at least 8% from every edge (nothing cropped by the frame), no object touching another, on ${MAGENTA}.` },
  { name: 'bubbles', key: 'black', ratio: '1:1', size: [1200, 1200], mode: 'frame', p: `${AD} Only nine crisp transparent soap-like fizz bubbles with bright specular highlights and a faint iridescent rim: two large and seven small, placed in the four corners of the square frame (two or three per corner), with everything else, the whole centre and the edges between the corners, EMPTY black. ONLY bubbles: no bottle, no glass, no liquid, no object of any kind. On ${BLACK}.` },
  { name: 'bg-sky', key: null, ratio: '16:9', size: [1920, 1080], mode: 'cover', p: `${AD} A glorious bright summer sky: deep cobalt blue at the top fading to pale blue at the horizon, with big soft volumetric white cumulus clouds, and nothing else in the frame: no ground, no objects. The lower fifth is calm pale blue sky.` },
  { name: 'table', key: null, ratio: '16:9', size: [1920, 283], mode: 'cover', p: `${AD} The top of a warm honey-oak wooden table filling the whole frame completely edge to edge, photographed straight on from the front at table height so it reads as a thin horizontal slab: the lighter top edge catching sun along the upper border and fine realistic wood grain running horizontally.` },
  { name: 'bg-pool', key: null, ratio: '16:9', size: [1920, 1080], mode: 'cover', p: `${AD} A swimming pool seen from directly above in bright midday sun: clear turquoise water with beautiful sharp caustic light patterns, and a smooth pale sandstone pool edge along the bottom-right corner. Nothing else in the frame.` },
  { name: 'bg-beach', key: null, ratio: '16:9', size: [1920, 1080], mode: 'cover', p: `${AD} A pristine tropical beach: blue sky with a few soft clouds in the top third, a turquoise sea with a gentle white foam line across the middle, and clean pale sand filling the lower half with soft palm shadows. No people, no objects.` },
  { name: 'panel-wall', key: null, ratio: '2:3', size: [1008, 1620], mode: 'cover', p: `${AD} A minimalist pastel architectural photograph: a dusty-rose plaster wall and a lighter pink building corner with an arched doorway opening onto a deep blue sky, hard sun casting long soft shadows, calm, graphic, editorial. ONLY architecture: no people, no bottle, no objects, no furniture.` },
  { name: 'panel-berries', key: null, ratio: '2:3', size: [1098, 1620], mode: 'cover', p: `${AD} A top-down flat-lay on a pale pink seamless background: about nine fresh raspberries scattered evenly with a few mint leaves, glossy, soft natural shadows, generous space between them.` },
  { name: 'portrait', key: 'green', ratio: '16:9', size: [1650, 1032], mode: 'trim', fill: 1, anchor: 'bottom', p: `${AD} A fashion-editorial beauty close-up of a young person's upper face, cropped by the bottom of the frame just under the eyes: voluminous short coral-pink hair swept to one side, strong arched brows, bold pink eyeshadow, long lashes, fresh glowing skin, the gaze lifted up and to the right. The head fills the frame width, on ${GREEN}.` },
  { name: 'avatar-1', key: null, ratio: '1:1', size: [600, 600], mode: 'cover', p: `A natural professional headshot of a friendly woman in her thirties with long brown hair, smiling warmly, white blouse, soft studio light, a clean light-grey backdrop, shoulders and head centred, photorealistic. No text.` },
  { name: 'avatar-2', key: null, ratio: '1:1', size: [600, 600], mode: 'cover', p: `A natural professional headshot of a friendly man in his thirties with short dark hair and a neat short beard, smiling warmly, red polo shirt, soft studio light, a clean light-grey backdrop, shoulders and head centred, photorealistic. No text.` },
  { name: 'avatar-3', key: null, ratio: '1:1', size: [600, 600], mode: 'cover', p: `A natural professional headshot of a friendly woman in her thirties with voluminous curly black hair and round glasses, smiling warmly, pale pink blazer, soft studio light, a clean light-grey backdrop, shoulders and head centred, photorealistic. No text.` },
  { name: 'gallery-1', key: null, ratio: '4:5', size: [816, 1008], mode: 'cover', p: `${AD} A tall glass of dark fizzing cola over clear ice cubes with beads of condensation, bubbles rising, shot against a deep moody dark background with a warm rim light, shallow depth of field.` },
  { name: 'gallery-2', key: null, ratio: '4:5', size: [816, 1008], mode: 'cover', p: `${AD} A dynamic splash photograph on a light sky-blue background: a glass bottle of sparkling lemon drink in the lower centre with a crown-shaped splash, lemon slices and droplets frozen in mid-air around it.` },
  { name: 'gallery-3', key: null, ratio: '4:5', size: [816, 1008], mode: 'cover', p: `${AD} An extreme macro close-up of the top of a royal-blue aluminium can seen from slightly above against a black background: the silver lid, the tab and the rim with water droplets, dramatic rim light.` },
  // the Space template's planets that the owner's cut-outs do not include (on black, so the slide's own black shows through)
  { name: 'space-moon', key: 'black', ratio: '1:1', size: [1200, 1200], mode: 'trim', fill: 0.94, p: `A photorealistic, NASA-quality photograph of the full Moon as a complete circular disc centred in the frame, lit from the upper left with a soft shadow on the right edge, sharp craters and maria, floating in empty space on ${BLACK}. No stars, no text.` },
  { name: 'space-sun', key: 'black', ratio: '1:1', size: [1200, 1200], mode: 'trim', fill: 0.94, p: `A photorealistic, scientific-visualisation image of the Sun as a complete circular disc centred in the frame, glowing orange-yellow with granulated plasma texture, prominences at the limb and a soft corona, on ${BLACK}. No stars, no text.` },
  { name: 'space-uranus', key: 'black', ratio: '1:1', size: [1200, 1200], mode: 'trim', fill: 0.94, p: `A photorealistic, NASA-quality image of the planet Uranus as a complete circular globe centred in the frame, pale cyan-teal with faint banding, lit from the upper left with a soft shadow on the right, on ${BLACK}. No rings, no stars, no text.` },
  { name: 'space-neptune', key: 'black', ratio: '1:1', size: [1200, 1200], mode: 'trim', fill: 0.94, p: `A photorealistic, NASA-quality image of the planet Neptune as a complete circular globe centred in the frame, deep azure blue with white wispy cloud streaks and a dark storm, lit from the upper left with a soft shadow on the right, on ${BLACK}. No rings, no stars, no text.` },
]

// ── the Education template: illustrations in one flat, grainy-gradient storybook style (the shape of each is the shape of its place in the template) ──
const STORY = `Children's-book illustration in a flat vector style with soft grainy stippled gradient shading, a warm sunset palette (coral red, orange, golden yellow, deep plum, teal green), clean silhouette, no outline, charming and polished. No text, no letters, no logo.`
const dino = (name, ratio, size, key, what) => ({ name: `edu-${name}`, key, ratio, size, mode: 'trim', fill: 0.97, check: true, p: `${STORY} ${what} Friendly cartoon dinosaur in side view, the whole body in frame, a large round dark eye with a white glint, a cream belly, simple shapes, completely inside the frame with a clear margin of about 6% on every side (no part cropped by the frame), alone, with NO ground, NO hills, NO sky, NO landscape and NO shadow, on ${key === 'green' ? GREEN : key === 'magenta' ? MAGENTA : BLUE}.` })
const flora = (name, ratio, size, key, what) => ({ name: `edu-${name}`, key, ratio, size, mode: 'trim', fill: 0.97, check: true, ground: true, p: `${STORY} ${what} A single isolated illustration completely inside the frame with a clear margin of about 6% on every side (no part cropped by the frame), with NO sky, NO sunset, NO landscape background, nothing else, on ${key === 'green' ? GREEN : key === 'magenta' ? MAGENTA : BLUE}.` })
const EDU = [
  dino('trex', '4:5', [800, 1006], 'blue', 'A coral-red Tyrannosaurus rex standing upright on two legs, tiny arms, a lighter orange belly stripe.'),
  dino('ptero', '5:4', [1000, 826], 'green', 'An orange pterodactyl with its yellow wings spread wide, a long pointed crest.'),
  dino('purple', '1:1', [1000, 986], 'green', 'A purple duck-billed hadrosaur walking, wearing a little purple cap-like crest, white belly.'),
  dino('trike', '5:4', [1000, 792], 'magenta', 'A lime-green Triceratops with three horns, a frilled collar and a yellow belly.'),
  dino('ankylo', '21:9', [1000, 376], 'blue', 'An orange Ankylosaurus with a spiked, armoured back, a club tail and a cream belly, long and low.'),
  dino('stego', '16:9', [1000, 481], 'magenta', 'A green Stegosaurus with orange back plates and a spiked tail.'),
  dino('bronto', '5:4', [1000, 824], 'green', 'A sky-blue long-necked Brachiosaurus, head up high, with small dark-blue spots along the neck and back, pale belly.'),
  dino('carno', '1:1', [1000, 997], 'blue', 'An orange Carnotaurus-like dinosaur standing upright, two small horns, a cream belly and a darker orange back.'),
  flora('flowers', '1:1', [1000, 972], 'magenta', 'A cluster of three big many-petalled flowers (coral, golden, cream centres) on green stems with leaves, growing from a small tuft of grass.'),
  flora('trees-red', '1:1', [1000, 1000], 'green', 'Three stylised round-topped trees with plum-red and orange gradient foliage and slim orange trunks, standing together on a thin teal ground line.'),
  flora('mushrooms', '3:2', [1000, 635], 'blue', 'A group of red toadstool mushrooms with white spots, big and small, on a bed of teal grass.'),
  flora('mountains', '3:2', [1000, 709], 'green', 'A range of three jagged mountains in rust, orange and plum gradients with pale snow caps.'),
  flora('rocks', '4:3', [1000, 847], 'green', 'A cluster of faceted angular rocks in deep brown, plum and golden-ochre planes.'),
  flora('leaves', '1:1', [1000, 1012], 'magenta', 'A big fan of tall pointed tropical leaves in teal-green gradients.'),
  flora('pines', '4:5', [800, 1000], 'magenta', 'Three tall pine trees in layered teal-green tiers on brown trunks, one big and two smaller, with a small green bush at the base.'),
  flora('pine-island', '5:4', [1000, 794], 'magenta', 'A cluster of teal-green pine trees growing on a small floating island of brown earth.'),
  flora('bushes', '5:4', [1000, 809], 'blue', 'A lush bush made of rounded teal-green leaves with plum-red berry-balls behind it.'),
  flora('trees-tall', '1:1', [1000, 980], 'blue', 'Three tall rounded trees in orange and plum-red gradients standing on a mound of green bushes.'),
  flora('mush-yellow', '1:1', [1000, 960], 'blue', 'A group of tall golden-yellow bell-shaped mushrooms with orange gills on teal grass dotted with tiny white flowers.'),
  flora('blossom', '1:1', [1000, 932], 'blue', 'A leafy teal-green plant with a golden-yellow fan of leaves and floating orange glowing spores around it.'),
  flora('sunflowers', '5:4', [1000, 793], 'blue', 'A row of small golden sunflowers on teal-green leafy stems with a few tiny bees flying around.'),
  flora('trees-pink', '16:9', [1000, 573], 'green', 'A group of slim lollipop-style trees with pale pink-and-peach round crowns of different sizes on thin stems, standing on a teal ground line.'),
  flora('tree-orange', '4:5', [840, 1000], 'blue', 'A tall slender golden-orange teardrop-shaped tree with a brown trunk, growing from a tuft of green bushes and yellow grass.'),
  flora('hills', '21:9', [1000, 291], 'blue', 'A low row of soft green-and-golden grassy hills with tiny pink and white flowers.'),
  flora('hills-pink', '21:9', [1000, 394], 'blue', 'A low range of soft mountains in plum, orange and pink gradients with golden sun glow.'),
  flora('sun', '1:1', [1000, 997], 'blue', 'A big sun disc with a pale cream-white glowing centre and an orange-gold rim of triangular rays.'),
  flora('sunrise', '16:9', [1000, 524], 'green', 'A sun rising behind a layered fluffy cloud, pastel blue, lilac and pink gradients, rays fanning out.'),
  flora('storm', '1:1', [1000, 995], 'magenta', 'A dark teal-navy storm cloud with three golden-orange lightning bolts underneath.'),
  flora('burst', '1:1', [1000, 950], 'blue', 'A burst of overlapping fan-shaped petals in orange, coral and plum, with a golden sun at the top-left and a few curling lines.'),
  { name: 'edu-fossil-1', key: null, ratio: '4:3', size: [1416, 1064], mode: 'cover', p: `${AD} A museum photograph of a dinosaur (a Velociraptor-like predator) model's head in profile in warm dim light, textured scaly skin, amber eye, shallow depth of field, dark rocky background.` },
  { name: 'edu-fossil-2', key: null, ratio: '3:2', size: [1344, 896], mode: 'cover', p: `${AD} A dramatic museum photograph of a Tyrannosaurus rex fossil skull in profile with sharp teeth, lit from the side against a pure black background.` },
  { name: 'edu-fossil-3', key: null, ratio: '1:1', size: [1142, 1048], mode: 'cover', p: `${AD} A photograph of a small theropod dinosaur fossil skull in profile, displayed on a flat mustard-yellow background, soft studio light.` },
  { name: 'edu-raptor-strip', key: null, ratio: '21:9', size: [1316, 372], mode: 'cover', p: `${AD} A very wide panoramic close-up of a Velociraptor-like predator's eye and snout in profile in warm dim light, textured scaly skin, amber eye, dark rocky background.` },
]
A.push(...EDU)

// ── the Cool Morph template: soft holographic gradient forms (their own brightness is their transparency) and moody editorial photographs ──
const GRAIN = `A soft, out-of-focus abstract holographic gradient form with extremely soft blurred edges and a fine film-grain noise, glowing against a pure black background (#000000). Nothing else in the frame. No text.`
const blob = (name, what) => ({ name: `cool-${name}`, key: 'black', ratio: '1:1', size: [1400, 1400], mode: 'frame', p: `${GRAIN} ${what}` })
const MOOD = `Cinematic editorial photograph, shallow depth of field, moody and dark, a cool lilac-and-blue colour grade, fine film grain. No text, no logo, no watermark.`
const COOL = [
  blob('blob-pink', 'A single flowing S-shaped ribbon of light in glowing pink, magenta, lilac and pale lime-green, large and centred, curving diagonally.'),
  blob('blob-lilac', 'A large lilac and periwinkle-blue cloud of light with a thin bright cream-white arc curving through its lower half, centred.'),
  blob('blob-olive', 'A soft olive-green and teal form with a bright pale-lime arc sweeping across it from the upper left to the right, centred.'),
  blob('blob-slate', 'A soft slate-blue and steel-grey form with a pale arc curving from the top right down to the left, centred.'),
  blob('blob-cream', 'A bright cream-white glowing form with an indigo-violet swoosh sweeping through it, centred.'),
  blob('blob-x', 'An X-shaped crossing of two soft swooshes of light, one pale teal and one cream-lime, glowing, centred.'),
  blob('haze-1', 'A huge, very dim and subtle haze of lilac and blue-grey light, low brightness overall (never brighter than 35% grey), strongest in the upper middle and fading smoothly to black at every edge.'),
  blob('haze-2', 'A huge, very dim and subtle haze of cool grey and muted olive light, low brightness overall (never brighter than 35% grey), strongest in the middle and fading smoothly to black at every edge.'),
  { name: 'cool-woman', key: null, ratio: '3:4', size: [1200, 1600], mode: 'cover', p: `${MOOD} A woman with a sleek dark chin-length bob and black sunglasses, wearing a white turtleneck under a black sheer lace jacket, waist-up, centred, against a dark backdrop with soft lilac light.` },
  { name: 'cool-backdrop', key: null, ratio: '4:3', size: [1600, 1200], mode: 'cover', p: `${MOOD} An almost black charcoal photographic studio backdrop, very dark overall, with only the faintest soft cloudy violet-grey mottling and a strong vignette to black at the edges, no subject, no objects.` },
  { name: 'cool-john-1', key: null, ratio: '3:4', size: [900, 1200], mode: 'cover', p: `${MOOD} A man with short dark hair in a black jacket, head and shoulders, centred, against a dark backdrop with soft blue light.` },
  { name: 'cool-jane-1', key: null, ratio: '3:4', size: [900, 1200], mode: 'cover', p: `${MOOD} A woman with long wavy auburn hair in a dark blazer, head and shoulders, centred, against a dark backdrop with soft violet light.` },
  { name: 'cool-john-2', key: null, ratio: '3:4', size: [900, 1200], mode: 'cover', p: `${MOOD} A man with a short beard and a grey knit sweater, head and shoulders, centred, against a dark backdrop with soft teal light.` },
  { name: 'cool-interior', key: null, ratio: '21:9', size: [1800, 771], mode: 'cover', p: `${MOOD} A stylish mid-century interior: a mustard-yellow leather armchair beside a wooden sideboard, a black moulded chair and a round oak table, warm light, wide frame.` },
  { name: 'cool-cocktail', key: null, ratio: '4:3', size: [1200, 900], mode: 'cover', p: `${MOOD} A woman's hand with red nail polish lifting an olive from a martini glass on a dark red table, a small dish of olives beside it, close-up.` },
  { name: 'cool-motion-face', key: null, ratio: '16:9', size: [1600, 900], mode: 'cover', p: `${MOOD} A long-exposure photograph of a person's face with deliberate motion blur, soft smeared skin tones, abstract and atmospheric.` },
]
A.push(...COOL)

// ── the Business template: grainy colour-field gradients, cut-out portraits of entrepreneurs and makers, striped light ──
const FIELD = `A smooth, richly saturated colour-field gradient filling the whole frame, with a fine film-grain noise and a very soft vignette. Abstract: no objects, no shapes, no text.`
const field = (name, what) => ({ name: `biz-${name}`, key: null, ratio: '16:9', size: [1920, 1080], mode: 'cover', p: `${FIELD} ${what}` })
const PRODUCT = `Premium commercial product photography for a modern consumer-technology brand: a single hero product floating at a slight dynamic angle, razor-sharp detail, crisp studio lighting with a warm orange rim light and soft reflections, high-end retouching. The whole product is inside the frame with a clear margin on every side. No hands, no people, no text, no logos, no brand marks, no cables.`
const product = (name, ratio, size, key, what, fill = 0.9) => ({ name: `biz-${name}`, key, ratio, size, mode: 'trim', fill, check: true, p: `${PRODUCT} ${what} On ${key === 'green' ? GREEN : key === 'blue' ? BLUE : MAGENTA}.` })
const STRIPES = `Dense, perfectly horizontal, evenly spaced fine glowing stripes, like light through venetian blinds, glowing against pure black (#000000) and fading smoothly into darkness toward the edges with a soft vignette. No text, no objects.`
const stripe = (name, ratio, size, what) => ({ name: `biz-${name}`, key: 'black', ratio, size, mode: 'frame', p: `${STRIPES} ${what}` })
const BIZ = [
  field('grad-yellow', 'Warm butter-yellow melting into bright orange, a soft diagonal sweep of light from the upper left.'),
  field('grad-pink', 'A lilac-blue glow on the left blending through magenta-pink into coral-orange on the right.'),
  field('grad-red', 'A bold vermilion glow fading into coral-orange toward the right, with a slightly deeper shade in the bottom-left corner.'),
  field('grad-blue', 'A deep ultramarine blue with a lighter cobalt glow in the middle and a darker edge.'),
  field('grad-gold', 'A warm sandy gold and soft apricot gradient, brighter in the upper right.'),
  field('grad-teal', 'A fresh mint-teal gradient with a soft pink-magenta glow at the left edge.'),
  product('product-headphones', '5:4', [1257, 1140], 'green', 'A pair of premium over-ear wireless headphones in matte black with brushed copper details and soft leather ear cushions, shown at a three-quarter angle.'),
  product('product-phone', '4:5', [1373, 1143], 'green', 'A modern flagship smartphone with an edge-to-edge screen glowing with an abstract orange-to-pink gradient wallpaper, thin aluminium frame, shown at a three-quarter angle with a slight tilt.'),
  product('product-earbuds', '4:5', [592, 750], 'green', 'A pair of white wireless earbuds standing beside their open, pill-shaped charging case with a soft glowing indicator light.'),
  product('product-watch', '4:5', [592, 750], 'green', 'A premium smartwatch with a round graphite case, a deep blue glowing watch face showing abstract rings, and a soft charcoal silicone strap, shown upright at a slight angle.'),
  product('product-speaker', '4:5', [592, 750], 'green', 'A minimalist portable wireless speaker: a smooth cylinder wrapped in warm grey woven fabric with a thin metal ring on top, shown at a slight angle.'),
  product('product-laptop', '4:3', [1971, 1588], 'blue', 'A premium thin laptop, open, three-quarter view, silver aluminium body, the screen glowing with an abstract orange and magenta gradient wallpaper, no keyboard legends visible.', 0.62),
  product('product-phone-up', '4:5', [1134, 1327], 'green', 'A modern smartphone standing upright and slightly angled, edge-to-edge screen glowing with a cool teal-to-blue abstract gradient, thin dark frame.'),
  stripe('stripes-orange', '1:1', [1400, 1280], 'The stripes glow orange and amber, strongest at the left and fading to the right.'),
  stripe('stripes-red', '4:3', [1500, 1080], 'The stripes glow red-orange and form a bow-tie shape: wide at the left and right edges and pinched in the middle, fading into darkness.'),
  stripe('stripes-teal', '4:5', [960, 1080], 'The stripes glow teal, cyan and blue and occupy only the left 40% of the frame, strongest at the left edge and fading to nothing by the middle; the right 60% of the frame is completely empty black.'),
]
A.push(...BIZ)

// ── per-template specs: scripts/morph-art/<template>.mjs, each `export default (ctx) => [spec, ...]` (ctx has the key backgrounds and style lines used above) ──
{
  const { readdirSync: ls, existsSync } = await import('node:fs')
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'morph-art')
  if (existsSync(dir)) {
    const ctx = { GREEN, MAGENTA, BLUE, BLACK, AD }
    for (const f of ls(dir).filter((x) => x.endsWith('.mjs')).sort()) {
      // one template's unfinished spec must never stop another's run
      try { A.push(...(await import(pathToFileURL(join(dir, f)).href)).default(ctx)) } catch (e) { console.warn(`skipping scripts/morph-art/${f}: ${e.message}`) }
    }
  }
}

if (args.includes('--list')) { console.log(A.map((a) => a.name).join('\n')); process.exit(0) }

let lastReason = ''
async function ask(prompt, ratio) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ratio } } }),
        signal: AbortSignal.timeout(240_000),
      })
      if (r.ok) {
        const j = await r.json()
        const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
        if (part) return Buffer.from(part.inlineData.data, 'base64')
        lastReason = `finish=${j.candidates?.[0]?.finishReason ?? '?'}`
        continue
      }
      lastReason = `status ${r.status}`
      if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 5000 * (attempt + 1))); continue }
      throw new Error(`Gemini answered ${r.status}`)
    } catch (e) { lastReason = e.message; await new Promise((res) => setTimeout(res, 3000 * (attempt + 1))) }
  }
  throw new Error(`no picture (${lastReason})`)
}

/** RGBA pixels with the key removed. */
async function keyOut(buf, key) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const px = (x, y) => (y * w + x) * 4
  // the key colour as photographed: the median of the four corners
  const sample = []
  for (const [cx, cy] of [[4, 4], [w - 24, 4], [4, h - 24], [w - 24, h - 24]]) for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) sample.push([data[px(cx + x, cy + y)], data[px(cx + x, cy + y) + 1], data[px(cx + x, cy + y) + 2]])
  const med = (i) => sample.map((s) => s[i]).sort((a, b) => a - b)[Math.floor(sample.length / 2)]
  const bg = [med(0), med(1), med(2)]
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2], a = 255
    if (key === 'black') {
      // brightness is opacity; the colour is what the light would be over black
      const m = Math.max(r, g, b)
      a = Math.min(255, Math.max(0, (m - 6) * 1.35))
      if (a > 0) { const k = 255 / Math.max(m, 1); r = Math.min(255, r * k); g = Math.min(255, g * k); b = Math.min(255, b * k) }
    } else {
      const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2])
      a = Math.round(255 * Math.min(1, Math.max(0, (d - 70) / 80)))
      // spill: the key colour reflects onto the subject, so it is taken out everywhere (no subject of a green key is green, none of a magenta key is magenta)
      if (key === 'green') g = Math.min(g, Math.max(r, b))
      else if (key === 'blue') b = Math.min(b, Math.max(r, g))
      else { const m = Math.min(r, b); if (m > g) { const s = (m - g) * 0.85; r -= s; b -= s } }
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a
  }
  if (key !== 'black') {
    // pull the edge in by about a pixel so no halo of the key colour is left: blur the opacity, then stretch it
    const alpha = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).extractChannel(3).blur(1.4).raw().toBuffer()
    for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = Math.min(255, Math.max(0, Math.round((alpha[i] - 100) * (255 / 130)))) * (data[i * 4 + 3] > 0 ? 1 : 0)
  }
  return { data, info }
}

/** True when the keyed subject is sliced by the frame: opaque pixels run along the left, right or top edge (and the bottom edge too, unless the piece stands on the ground). */
function touchesFrame(data, w, h, groundOk) {
  const A = (x, y) => data[(y * w + x) * 4 + 3]
  const run = (get, n) => { let best = 0, cur = 0; for (let i = 0; i < n; i++) { if (get(i) > 200) { cur++; best = Math.max(best, cur) } else cur = 0 } return best / n }
  const sides = [run((y) => A(1, y), h), run((y) => A(w - 2, y), h), run((x) => A(x, 1), w)]
  if (!groundOk) sides.push(run((x) => A(x, h - 2), w))
  return Math.max(...sides) > 0.08
}

async function build(a, raw) {
  const [W, H] = a.size
  let img
  if (!a.key) img = sharp(raw).resize(W, H, { fit: 'cover', position: 'centre' })
  else {
    const { data, info } = await keyOut(raw, a.key)
    if (a.check && touchesFrame(data, info.width, info.height, a.ground)) throw Object.assign(new Error('the subject is cut by the frame'), { retry: true })
    let k = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    if (a.mode === 'trim') {
      // crop to the subject, then place it on a canvas of the final shape
      const { data: d2, info: i2 } = await k.clone().raw().toBuffer({ resolveWithObject: true })
      let x0 = i2.width, y0 = i2.height, x1 = 0, y1 = 0
      for (let y = 0; y < i2.height; y++) for (let x = 0; x < i2.width; x++) if (d2[(y * i2.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1
      const fill = a.fill ?? 0.95
      const s = Math.min((W * fill) / cw, (H * fill) / ch)
      const tw = Math.max(1, Math.round(cw * s)), th = Math.max(1, Math.round(ch * s))
      const part = await k.extract({ left: x0, top: y0, width: cw, height: ch }).resize(tw, th).png().toBuffer()
      const top = a.anchor === 'bottom' ? H - th : Math.round((H - th) / 2)
      img = sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: part, left: Math.round((W - tw) / 2), top }])
    } else img = k.resize(W, H, { fit: 'cover' })
  }
  return img.webp({ quality: 88, alphaQuality: 92, effort: 5 }).toBuffer()
}

const todo = A.filter((a) => !only || only.includes(a.name))
let next = 0
const results = []
async function worker() {
  while (next < todo.length) {
    const a = todo[next++]
    try {
      let out
      for (let attempt = 0; ; attempt++) {
        try { out = await build(a, await ask(a.p, a.ratio)); break } catch (e) { if (!e.retry || attempt >= 3) throw e }
      }
      await sharp(out).toFile(join(OUT, `${/^(space|edu|cool|biz)-/.test(a.name) || a.fileName ? '' : /^(can|berries|blueberries|limes|bubbles|bg|table|panel|portrait|avatar|gallery)/.test(a.name) ? 'launch-' : ''}${a.name}.webp`))
      results.push(`ok   ${a.name} (${Math.round(out.length / 1024)} KB)`)
    } catch (e) { results.push(`FAIL ${a.name}: ${e.message}`) }
  }
}
await Promise.all([worker(), worker()])
console.log(results.sort().join('\n'))
