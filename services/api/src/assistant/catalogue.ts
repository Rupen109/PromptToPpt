/**
 * THE CATALOGUE of how people really ask (docs/AI_EDIT_V3_ARCHITECTURE.md §5, §11): each entry is a real phrasing (most of them typed by real users in our editor, typos kept) and
 * how it must be read. It is used two ways:
 *   1. EXAMPLES: for each message, the few closest entries are shown to the understanding model (`examplesFor`): the static guide stays short, and the model sees how a message
 *      like this one is read. Retrieval is plain word overlap, weighted by how rare a word is (no model, no cost).
 *   2. EVALUATION: scripts/assistant-eval-catalogue.ts runs every phrasing through the REAL model with its own entry left out, and compares the reading (`matches`).
 * A real chat that goes wrong becomes an entry here. `loose` names values whose exact content may differ (a colour's hex, a request restated): only their presence is checked.
 */
export interface Reading {
  kind?: 'edit' | 'question' | 'chat' | 'off_topic' | 'help' | 'review'
  review?: 'all' | 'text' | 'design' | 'story' | 'brand'
  tasks?: { family: string; targets?: unknown[]; values?: Record<string, unknown> }[]
}
export interface Entry { say: string; read: Reading; loose?: string[]; /** what the reading needs that is not built yet (the phase): reported by the evaluation, not counted in its score */ pending?: string; /** this entry's reading depends on what is selected or on screen (the example says so) */ context?: string; /** the slide on screen when it was said (the evaluation shows that slide); default: the timeline slide */ screen?: number }

const T = (family: string, targets: unknown[] = [], values: Record<string, unknown> = {}) => ({ family, targets, values })
const n = (k: number) => ({ by: 'number', n: k })

export const CATALOGUE: Entry[] = [
  // ── text: words, length, points, notes (real chats)
  { say: 'add more content in the 2nd slide', read: { tasks: [T('text', [n(2)], { request: 'add more content', length: 'longer' })] }, loose: ['request'] },
  { say: 'add more data please', read: { tasks: [T('text', [], { request: 'add more data', length: 'longer' })] }, loose: ['request'], context: 'about the slide on screen' },
  { say: 'add detailed info here in academemic pursuits', read: { tasks: [T('text', [], { request: 'add detailed information', length: 'longer' })] }, loose: ['request'], context: 'on the Academic Pursuits slide' },
  { say: 'no you please add the content from yourself', read: { tasks: [T('text', [{ by: 'just_changed' }], { request: 'add more content from general knowledge', length: 'longer' })] }, loose: ['request', 'targets'] },
  { say: 'also add 5 points total in timeline', read: { tasks: [T('text', [], { request: 'make the timeline 5 points', totalPoints: 5 })] }, loose: ['request'] },
  { say: 'please add 2 more bullet points here', read: { tasks: [T('text', [], { request: 'add 2 more bullet points', addPoints: 2 })] }, loose: ['request'] },
  { say: 'currently its 3 bullet points, please add 2 more in both side', read: { tasks: [T('text', [], { request: 'add 2 more points on each side', addPoints: 2 })] }, loose: ['request'], context: 'on a comparison slide', screen: 11 },
  { say: 'make slide 3 shorter', read: { tasks: [T('text', [n(3)], { request: 'shorten', length: 'shorter' })] }, loose: ['request'] },
  { say: 'rewrite slide 7', read: { tasks: [T('text', [n(7)], { request: 'rewrite the slide' })] }, loose: ['request'] },
  { say: 'edit the last slide content ..', read: { tasks: [T('text', [{ by: 'last', count: 1 }], { request: 'improve the wording' })] }, loose: ['request'] },
  { say: 'please edit 11 number slide content', read: { tasks: [T('text', [n(11)], { request: 'improve the wording' })] }, loose: ['request'] },
  { say: 'translate slide 2 to Hindi', read: { tasks: [T('text', [n(2)], { request: 'translate to Hindi' })] }, loose: ['request'] },
  { say: 'fix the spelling and grammar on this slide', read: { tasks: [T('text', [], { request: 'fix spelling and grammar' })] }, loose: ['request'] },
  { say: 'add speaker notes to every slide', read: { tasks: [T('text', [{ by: 'all' }], { request: 'write speaker notes', notesOnly: true })] }, loose: ['request'] },
  { say: 'write a 30 second script for this slide', read: { tasks: [T('text', [], { request: 'write a 30-second script as speaker notes', notesOnly: true })] }, loose: ['request'] },
  // ── slides
  { say: 'add 4 more slides after slide 6', read: { tasks: [T('add_slide', [], { count: 4, where: 'after', after: n(6) })] } },
  { say: 'add 4 more slides in between', read: { tasks: [T('add_slide', [], { count: 4, where: 'spread' })] } },
  { say: 'add 2 more slides', read: { tasks: [T('add_slide', [], { count: 2, where: 'end' })] } },
  { say: 'add thank you page also', read: { tasks: [T('add_slide', [], { count: 1, where: 'end', about: 'thank you', layout: 'thank-you' })] }, loose: ['about'] },
  { say: 'add the thank you page at lat', read: { tasks: [T('add_slide', [], { count: 1, where: 'end', about: 'thank you', layout: 'thank-you' })] }, loose: ['about'] },
  { say: 'add a slide about real-world applications after slide 5', read: { tasks: [T('add_slide', [], { count: 1, where: 'after', after: n(5), about: 'real-world applications' })] }, loose: ['about'] },
  { say: 'delete slide 5', read: { tasks: [T('remove_slide', [n(5)])] } },
  { say: 'duplicate slide 2', read: { tasks: [T('duplicate_slide', [n(2)])] } },
  { say: 'move slide 3 to the end', read: { tasks: [T('move_slide', [n(3)], { where: 'end' })] } },
  { say: 'swap slides 2 and 4', read: { tasks: [T('move_slide', [n(2), n(4)], { where: 'swap' })] } },
  { say: 'lock slide 1', read: { tasks: [T('lock_slide', [n(1)], { locked: true })] } },
  // ── layout
  { say: 'all 4 slides(slide : 7,8,9,10) format is same so update all 4 slides format', read: { tasks: [T('layout', [{ by: 'range', from: 7, to: 10 }], {})] } },
  { say: 'change slide 4 layout to two columns', read: { tasks: [T('layout', [n(4)], { layout: 'comparison' })] } },
  { say: 'make slide 5 look like slide 2', read: { tasks: [T('layout', [n(5)], { like: 2 })] } },
  // ── colours, theme, fonts
  { say: 'make theme light', read: { tasks: [T('palette', [], { mode: 'light' })] } },
  { say: 'make theme dark again ..', read: { tasks: [T('palette', [], { mode: 'dark' })] } },
  { say: 'make the dark theme of environment', read: { tasks: [T('palette', [], { mode: 'dark', primary: '#2E7D32' })] }, loose: ['primary'] },
  { say: 'color should be brown', read: { tasks: [T('palette', [], { primary: '#8B5A2B' })] }, loose: ['primary'] },
  { say: 'green color is not good, update it', read: { tasks: [T('palette', [], { accent: '#1565C0' })] }, loose: ['values'] },
  { say: 'change color of theme to environment color okay ..', read: { tasks: [T('palette', [], { primary: '#2E7D32' })] }, loose: ['primary'] },
  { say: 'change the accent color to blue', read: { tasks: [T('palette', [], { accent: '#1E63D5' })] }, loose: ['accent'] },
  { say: 'make the theme minimalist', read: { tasks: [T('template', [], { mood: 'minimalist' })] }, loose: ['mood'] },
  { say: 'change the fonts style', read: { tasks: [T('fonts', [], { pair: 'playfair' })] }, loose: ['pair'] },
  { say: 'change fonts to professional', read: { tasks: [T('fonts', [], { pair: 'manrope' })] }, loose: ['pair'] },
  // ── background
  { say: 'please change the background color of thank you page to same as other slides bg', read: { tasks: [T('background', [{ by: 'title', text: 'thank you' }], { color: 'deck' })] }, loose: ['targets'] },
  { say: 'change the background of slide 2 to black', read: { tasks: [T('background', [n(2)], { color: '#000000' })] } },
  { say: 'add a grid pattern to the background of slide 3', read: { tasks: [T('background', [n(3)], { pattern: 'grid' })] } },
  { say: 'take the pattern off this slide', read: { tasks: [T('background', [], { pattern: 'none' })] } },
  { say: 'blur the background photo on this slide so the text is easier to read', read: { tasks: [T('background', [], { blur: 'soft' })] } },
  // ── objects (the next step chooses the operations; targets are the slides)
  { say: 'update the text color to red', read: { tasks: [T('element', [{ by: 'all' }], {})] } },
  { say: 'make the title on slide 1 red', read: { tasks: [T('element', [n(1)], {})] } },
  { say: 'merge the Q1 and Q2 cells in the table header', read: { tasks: [T('element', [], {})] }, context: 'a slide with a table' },
  { say: 'unmerge the cells of the table on slide 4', read: { tasks: [T('element', [n(4)], {})] } },
  { say: 'make this image a circle', read: { tasks: [T('element', [], {})] }, context: 'a picture is selected' },
  { say: 'update the shape of the this image', read: { tasks: [T('element', [], {})] }, context: 'a picture is selected' },
  { say: 'make this image bigger', read: { tasks: [T('element', [], {})] }, context: 'a picture is selected' },
  // ── W2 pictures: crop to a shape, a side, a subject; copy a look
  { say: 'crop this image to 16:9', read: { tasks: [T('element', [], {})] }, context: 'a picture is selected' },
  { say: 'crop the photo to focus on the coffee cup', read: { tasks: [T('element', [], {})] }, context: 'a picture is selected' },
  { say: 'make all the product images look like this one', read: { tasks: [T('element', [{ by: 'all' }], {})] }, context: 'a picture is selected' },
  // ── W2 shapes
  { say: 'make this rectangle a perfect circle', read: { tasks: [T('element', [], {})] }, context: 'a shape is selected' },
  { say: 'rotate this 45 degrees', read: { tasks: [T('element', [], {})] }, context: 'an object is selected' },
  { say: 'make these cards the same size', read: { tasks: [T('element', [], {})] }, context: 'several shapes are selected' },
  { say: 'add three equal cards on this slide', read: { tasks: [T('element', [], {})] } },
  { say: 'add a star shape', read: { tasks: [T('element', [], {})] } },
  { say: 'on slide 1 make the title red and underline the subtitle', read: { tasks: [T('element', [n(1)], {}), T('element', [n(1)], {})] } },
  // ── W3 animation and transitions
  { say: 'remove the 3rd animation on this slide', read: { tasks: [T('element', [], {})] } },
  { say: 'make all animations start automatically', read: { tasks: [T('element', [], {})] } },
  { say: 'apply the same animation as the title to all headings', read: { tasks: [T('element', [], {})] } },
  { say: 'animate the title first, then the subtitle, then the image', read: { tasks: [T('element', [], {})] } },
  { say: 'make the transition 1.2 seconds', read: { tasks: [T('transition', [], { type: 'fade', seconds: 1.2 })] }, loose: ['type'] },
  { say: 'use the same transition as the previous slide', read: { tasks: [T('transition', [], { like: 'previous' })] } },
  // ── W4 workflow and brand kits
  { say: 'start presenting from this slide', read: { tasks: [T('workflow', [], { action: 'present', fromSlide: 'current' })] } },
  { say: 'export this deck as pdf', read: { tasks: [T('workflow', [], { action: 'export', format: 'pdf' })] } },
  { say: 'share this with anna@example.com', read: { tasks: [T('workflow', [], { action: 'invite', email: 'anna@example.com' })] } },
  { say: 'use my second brand kit called Nova', read: { tasks: [T('brand', [], { kit: 'Nova' })] } },
  { say: 'save these colours as a new brand kit called Nova', read: { tasks: [T('brand_kit', [], { action: 'create', name: 'Nova', fromDeck: true })] } },
  { say: 'which slides break my brand guidelines', read: { kind: 'review', review: 'brand' } },
  { say: 'morph the product image to the right on the next slide', read: { tasks: [T('duplicate_slide', []), T('transition', [{ by: 'added_by_task', task: 0 }], { type: 'morph' }), T('element', [{ by: 'added_by_task', task: 0 }], {})] } },
  // ── text formatting (W1): spacing, case, lists, fit, underline, place in the box: object operations
  { say: 'increase the line spacing on slide 3', read: { tasks: [T('element', [n(3)], {})] } },
  { say: 'make all headings title case', read: { tasks: [T('element', [{ by: 'all' }], {})] } },
  { say: 'underline the title', read: { tasks: [T('element', [], {})] } },
  { say: 'convert these points into a numbered list', read: { tasks: [T('element', [], {})] }, context: 'a text box is selected' },
  { say: 'text is going out of the box, make it fit', read: { tasks: [T('element', [], {})] }, context: 'a text box is selected' },
  { say: 'center the text vertically in the box', read: { tasks: [T('element', [], {})] }, context: 'a text box is selected' },
  // ── selection and layers (W1): object operations
  { say: 'select all images on slide 3', read: { tasks: [T('element', [n(3)], {})] } },
  { say: 'send the picture behind the text', read: { tasks: [T('element', [], {})] } },
  { say: 'bring the logo one layer forward', read: { tasks: [T('element', [], {})] } },
  { say: 'lock the background shapes on this slide', read: { tasks: [T('element', [], {})] } },
  { say: 'lock the picture on slide 1', read: { tasks: [T('element', [n(1)], {})] } },
  { say: 'hide the selected object', read: { tasks: [T('element', [], {})] }, context: 'an object is selected' },
  { say: 'rename this layer to Product Image', read: { tasks: [T('element', [], {})] }, context: 'a picture is selected' },
  { say: 'delete all the decorative elements on this slide', read: { tasks: [T('element', [], {})] } },
  // ── W1 slice 3: brand colours, own uploads, timed scripts
  { say: 'make the title our brand colour', read: { tasks: [T('element', [], {})] } },
  { say: 'make the background of slide 2 our brand primary', read: { tasks: [T('background', [n(2)], { color: 'brand_primary' })] } },
  { say: 'put my product photo on slide 4', read: { tasks: [T('picture', [n(4)], { replace: 'product' })] }, loose: ['replace'] },
  { say: 'write a 30 second script for slide 3', read: { tasks: [T('text', [n(3)], { request: 'write a 30-second speaker script', notesOnly: true, notesSeconds: 30 })] }, loose: ['request'] },
  { say: 'give me a 2 minute talk track for every slide', read: { tasks: [T('text', [{ by: 'all' }], { request: 'write a 2-minute talk track', notesOnly: true, notesSeconds: 120 })] }, loose: ['request'] },
  { say: 'add statistics to slide 4', read: { tasks: [T('text', [n(4)], { request: 'add statistics', length: 'longer' })] }, loose: ['request', 'values'] },
  // ── pictures
  { say: 'add a picture to the title slide', read: { tasks: [T('picture', [n(1)], { source: 'photo' })] }, loose: ['targets'] },
  { say: 'add images here in the ppt please', read: { tasks: [T('picture', [{ by: 'all' }], { source: 'photo' })] }, loose: ['targets'] },
  { say: 'please remove the background from this coffee image, only coffe product i want', read: { tasks: [T('picture', [], { cutout: true })] }, context: 'a picture is selected' },
  { say: 'replace all pictures with better ones', read: { tasks: [T('refresh_pictures')] } },
  { say: 'replace this image with a better one', read: { tasks: [T('picture', [], { source: 'photo', subject: 'a better photo of the same subject' })] }, loose: ['subject'], context: 'a picture is selected' },
  { say: 'image is not visible clearly because of overlay please fix it', read: { tasks: [T('element', [], {})] }, context: 'on a slide with a picture under a dark overlay' },
  // ── slide management, motion, footer
  { say: 'add a fade transition to all slides', read: { tasks: [T('transition', [{ by: 'all' }], { type: 'fade' })] } },
  { say: 'add slide numbers', read: { tasks: [T('footer', [], { mode: 'number' })] } },
  { say: 'reduce the deck to 6 slides', read: { tasks: [T('restructure', [], { action: 'reduce', target: 6 })] } },
  { say: 'merge slides 4 and 6', read: { tasks: [T('combine', [n(4), n(6)], { action: 'merge' })] } },
  // ── deck tidying (moved here from the always-sent guide: shown when a message is like them)
  { say: 'delete the empty slides', read: { tasks: [T('restructure', [], { action: 'empty' })] } },
  { say: 'remove the duplicate slides', read: { tasks: [T('restructure', [], { action: 'duplicates' })] } },
  { say: 'put the slides in a better order', read: { tasks: [T('restructure', [], { action: 'reorder' })] } },
  { say: 'group the slides into sections', read: { tasks: [T('restructure', [], { action: 'sections' })] } },
  // ── more ways people say the same things (so a phrasing never depends on one example)
  { say: 'add some more details please', read: { tasks: [T('text', [], { request: 'add more details', length: 'longer' })] }, loose: ['request'], context: 'no slide named: the slide on screen' },
  { say: 'make this slide background same as the other slides', read: { tasks: [T('background', [], { color: 'deck' })] } },
  { say: 'add more information on this slide', read: { tasks: [T('text', [], { request: 'add more information', length: 'longer' })] }, loose: ['request'] },
  { say: 'make slide 6 two columns', read: { tasks: [T('layout', [n(6)], { layout: 'comparison' })] } },
  { say: 'make it dark with blue colours', read: { tasks: [T('palette', [], { mode: 'dark', primary: '#1E63D5' })] }, loose: ['primary'] },
  { say: 'add a photo of a modern office to slide 5', read: { tasks: [T('picture', [n(5)], { source: 'photo', subject: 'modern office' })] }, loose: ['subject'] },
  { say: 'generate an AI image of a robot for slide 2', read: { tasks: [T('picture', [n(2)], { source: 'ai', subject: 'robot' })] }, loose: ['subject'] },
  { say: 'the photo is hard to see because of the dark layer on it', read: { tasks: [T('element', [], {})] }, context: 'on a slide with a picture under a dark overlay' },
  // ── undo, review, help, chat
  { say: 'what is wrong with my slides?', read: { kind: 'review', review: 'all' } },
  { say: 'find slides with too much text', read: { kind: 'review', review: 'text' } },
  { say: 'how can I improve my story?', read: { kind: 'review', review: 'story' } },
  { say: 'does my deck flow well?', read: { kind: 'review', review: 'story' } },
  { say: 'didnt like it revert it please', read: { tasks: [T('undo', [], { change: 0, part: 'all' })] } },
  { say: 'review my deck', read: { kind: 'review', review: 'all' } },
  { say: 'what can you do?', read: { kind: 'help' } },
  { say: 'hii', read: { kind: 'chat' } },
  { say: 'give me some water please', read: { kind: 'off_topic' } },
]

const STOP = new Set('a an the to of in on for and or is it this that please pls me my our your i we you be can do with at as by from so all also here there its it\'s'.split(' '))
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9ऀ-ॿ\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w))
const df = new Map<string, number>()
for (const e of CATALOGUE) for (const w of new Set(words(e.say))) df.set(w, (df.get(w) ?? 0) + 1)
const idf = (w: string) => Math.log(1 + CATALOGUE.length / (df.get(w) ?? 0.5))

/** The entries closest to a message (rare shared words count most); `except` leaves one entry out (the evaluation never shows a phrasing its own answer). */
export function closest(message: string, k = 5, except?: string): Entry[] {
  const mine = new Set(words(message))
  if (!mine.size) return []
  return CATALOGUE.filter((e) => e.say !== except && !e.pending)
    .map((e) => ({ e, s: [...new Set(words(e.say))].reduce((a, w) => a + (mine.has(w) ? idf(w) : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.e)
}

/** The examples block for the understanding prompt (empty when nothing is close). Bounded: at most `k` entries, each one line. */
export function examplesFor(message: string, k = 5, except?: string): string {
  const got = closest(message, k, except)
  if (!got.length) return ''
  return `<examples>\nHow similar messages are read (the deck they were said about may differ: resolve slides from <focus> and <slides> as usual):\n${got.map((e) => `"${e.say}"${e.context ? ` (${e.context})` : ''} → ${JSON.stringify(e.read)}`).join('\n')}\n</examples>`
}

/**
 * Does a real reading match an entry? kind, the first task's family, its targets and its values (exactly, except the `loose` ones, which only need to be there).
 * `slidesOf` compares targets by the SLIDES they mean, not by how they are written ("no slide named" = "the current slide" = "slide 4" when slide 4 is on screen; "7, 8, 9, 10" = "7 to 10");
 * it returns null for a family that takes no slides (a deck-wide change), whose targets are then not compared.
 */
export function matches(e: Entry, got: { kind: string; review?: string | undefined; tasks: { family: string; targets: unknown[]; values: Record<string, unknown> }[] }, slidesOf?: (family: string, refs: unknown[]) => string[] | null): { ok: boolean; why: string } {
  const kind = e.read.kind ?? 'edit'
  if (got.kind !== kind) return { ok: false, why: `kind ${got.kind}, wanted ${kind}` }
  if (e.read.review && got.review !== e.read.review) return { ok: false, why: `review ${got.review}, wanted ${e.read.review}` }
  const want = e.read.tasks?.[0]
  if (!want) return { ok: true, why: '' }
  const t = got.tasks[0]
  if (!t) return { ok: false, why: 'no task' }
  if (t.family !== want.family) return { ok: false, why: `family ${t.family}, wanted ${want.family}` }
  const loose = new Set(e.loose ?? [])
  const norm = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x))
  if (!loose.has('targets') && want.targets) {
    if (slidesOf) {
      const a = slidesOf(t.family, t.targets), b = slidesOf(want.family, want.targets)
      if (a && b && norm([...a].sort()) !== norm([...b].sort())) return { ok: false, why: `slides ${JSON.stringify(a)}, wanted ${JSON.stringify(b)} (targets ${JSON.stringify(t.targets)})` }
    } else if (norm(t.targets) !== norm(want.targets)) return { ok: false, why: `targets ${JSON.stringify(t.targets)}, wanted ${JSON.stringify(want.targets)}` }
  }
  if (!loose.has('values')) for (const [k, v] of Object.entries(want.values ?? {})) {
    if (loose.has(k)) { if (t.values[k] === undefined || t.values[k] === null) return { ok: false, why: `no ${k}` }; continue }
    if (norm(t.values[k]) !== norm(v)) return { ok: false, why: `${k} ${JSON.stringify(t.values[k])}, wanted ${JSON.stringify(v)}` }
  }
  return { ok: true, why: '' }
}
