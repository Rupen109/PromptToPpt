import type { Family } from '../understand.ts'
import type { CapabilityMeta } from './types.ts'

/**
 * What each capability is, who can use it and what it needs, in plain words. EXHAUSTIVE over the families (a new family does not compile until it declares itself here), and the single
 * source of the assistant's own answers to "what can you do": nothing is described that is not declared here, and nothing declared here with `ready: false` is offered.
 * The wording for results ("Done: ...") is not here: it is built from verified checks (packages/theme/src/assist/claims.ts).
 */
const MORPH_LAYOUT = { rule: 'refuse', why: 'its layout is part of the template animation (change the template, or its text, instead)' } as const

const OWN_LAYOUT = { rule: 'refuse', why: 'it is built from your own template, so its design stays as your file made it (I can change its words)' } as const

const TEMPLATE_TRANSITION = { rule: 'refuse', why: 'its transition is part of the template animation (change the template instead)' } as const

export const META: Record<Family, CapabilityMeta> = {
  text: { label: 'change the words of slides (rewrite, shorten, expand, translate, fix grammar, add points, speaker notes)', description: 'Rewrites the text of one slide, some slides or the whole deck. It only uses facts that are in your deck or your attached sources.', examples: ['make slide 3 shorter', 'translate this slide to Hindi', 'add 2 more points here'], scopes: ['slide', 'slides', 'deck'], ready: true, verifiedBy: ['edit'] },
  layout: { label: "change a slide's layout", description: 'Shows slides in a different layout, keeping their words.', examples: ['make slide 4 a timeline', 'these slides all look the same, vary them'], scopes: ['slide', 'slides', 'deck'], ready: true, verifiedBy: ['edit'], templates: { 'morph-template': MORPH_LAYOUT, morph: MORPH_LAYOUT, 'own-template': OWN_LAYOUT } },
  add_slide: { label: 'add a slide', description: 'Adds slides about a topic, in the deck\'s own design, where you say.', examples: ['add a thank you slide at the end', 'add 2 slides after slide 3 about the risks'], scopes: ['deck'], ready: true, verifiedBy: ['addition'] },
  remove_slide: { label: 'delete slides', description: 'Deletes slides (never the last one, never a locked one).', examples: ['delete slide 5'], scopes: ['slide', 'slides'], ready: true, verifiedBy: ['removal'] },
  move_slide: { label: 'move slides', description: 'Moves slides to the start, the end, or after another slide.', examples: ['move slide 6 to the end'], scopes: ['slide', 'slides'], ready: true, verifiedBy: ['move'] },
  duplicate_slide: { label: 'duplicate slides', description: 'Copies slides.', examples: ['duplicate slide 2'], scopes: ['slide', 'slides'], ready: true, verifiedBy: ['duplicate'] },
  lock_slide: { label: 'lock or unlock slides (the AI will not change a locked one)', description: 'Protects slides from AI changes, or unlocks them.', examples: ['lock slide 1'], scopes: ['slide', 'slides'], ready: true, verifiedBy: ['lock'] },
  background: {
    label: 'change the background of slides (a colour, a gradient, or take the background picture off)', description: 'Sets a slide background and keeps its text readable.', examples: ['make slide 2 navy', 'give the last slide a purple gradient'], scopes: ['slide', 'slides'], ready: true, verifiedBy: ['background', 'gradient', 'clear_pictures'],
    parts: [{ id: 'colour', label: 'a background colour', examples: ['make slide 2 navy'] }, { id: 'gradient', label: 'a gradient background', examples: ['a blue to purple gradient'] }, { id: 'remove-picture', label: 'take the background picture off', examples: ['remove the background picture'] }],
  },
  readability: { label: 'fix text that is hard to read on its background', description: 'Recolours only the text that does not read.', examples: ['the text on slide 3 is hard to read'], scopes: ['slide', 'slides', 'deck'], ready: true, verifiedBy: ['readability'] },
  picture: {
    label: 'add or remove pictures', description: 'Adds a free photo, proposes a generated picture, takes pictures off a slide, or removes the background of a picture.', examples: ['add a photo of a coffee cup to slide 2', 'remove the pictures from slide 4'], scopes: ['slide', 'slides'], ready: true, verifiedBy: ['photo', 'clear_pictures', 'picture_swap', 'proposal'],
    parts: [
      { id: 'photo', label: 'a free photo', examples: ['add a photo of mountains'] },
      { id: 'ai-image', label: 'a generated picture', examples: ['generate a picture of a coffee cup'], flag: 'image_generation', note: 'uses credits and asks you to confirm' },
      { id: 'remove', label: 'take pictures off a slide', examples: ['remove the pictures from slide 4'] },
      { id: 'replace', label: 'put one of your uploaded pictures where a picture is', examples: ['use my coffee photo here'] },
      { id: 'cutout', label: "remove the background of a picture", examples: ['remove the background of this image'], flag: 'background_removal', note: 'development only until a commercially approved provider is chosen' },
    ],
  },
  refresh_pictures: { label: 'replace every slide\'s pictures with better matching ones', description: 'Picks new pictures for every slide and keeps your words.', examples: ['change all the pictures to match each slide'], scopes: ['deck'], ready: true, verifiedBy: ['rewrite'] },
  palette: { label: 'change the colours of the whole deck, or switch light and dark mode', description: 'Sets the deck palette or light/dark mode.', examples: ['make the theme dark', 'use navy and gold'], scopes: ['deck'], ready: true, verifiedBy: ['theme'] },
  template: {
    label: 'restyle the whole deck with another design', description: 'Applies a design (template) from the library.', examples: ['try a more modern design', 'use the Minimal design'], scopes: ['deck'], ready: true, verifiedBy: ['theme'],
    parts: [{ id: 'basic', label: 'the free designs', examples: ['use a clean design'] }, { id: 'premium', label: 'premium designs', examples: ['use a premium design'], feature: 'premiumTemplates' }],
  },
  fonts: { label: 'change the fonts of the whole deck (from our font list)', description: 'Sets a heading/body font pair from the list we offer.', examples: ['use a more professional font'], scopes: ['deck'], ready: true, verifiedBy: ['theme'] },
  footer: {
    label: 'show slide numbers (and the deck title) at the bottom of every slide, or hide them', description: 'Switches the footer on or off for the whole deck: slide numbers, or the deck title and slide numbers. It looks the same on screen, in PDF and image exports and in the PowerPoint file, and it is not shown on the title slide.',
    examples: ['add slide numbers', 'remove the slide numbers'], scopes: ['deck'], ready: true, verifiedBy: ['theme'],
    parts: [{ id: 'numbers', label: 'slide numbers', examples: ['add slide numbers'] }, { id: 'title', label: 'the deck title and slide numbers', examples: ['show the deck title and slide numbers on every slide'] }, { id: 'off', label: 'hide the footer', examples: ['remove the slide numbers'] }],
  },
  repair: {
    label: 'fix the problems a review finds (text that is too long or hard to read), and list the rest', description: 'Fixes what can be fixed safely after a review: shortens slides with too much text (keeping every figure, adding nothing) and makes hard-to-read text readable. Anything that needs your decision (an empty slide, a missing title, a repeated layout) is listed with what to say. Not on locked or hand-edited slides.',
    examples: ['fix the problems you found', 'clean up my deck'], scopes: ['deck'], ready: true, verifiedBy: ['edit', 'readability'],
  },
  combine: {
    label: 'merge slides into one, or split one slide into two or three', description: 'Merges two to four slides into one slide (using only their own words, the first slide keeps its place and the others are deleted), or splits one slide into two or three. I tell you which figures of the originals are not on the result. Not on locked or hand-edited slides, and not on animated-template slides.',
    examples: ['merge slides 3 and 4', 'split slide 5 into two slides'], scopes: ['slides'], ready: true, verifiedBy: ['edit', 'removal', 'addition'],
    templates: { 'morph-template': { rule: 'refuse', why: 'its words and layout are part of the template animation' }, morph: { rule: 'refuse', why: 'its words and layout are part of the template animation' } },
    parts: [{ id: 'merge', label: 'merge slides into one', examples: ['merge slides 3 and 4'] }, { id: 'split', label: 'split one slide into two or three', examples: ['split slide 5 into two slides'] }],
  },
  restructure: {
    label: 'tidy the whole deck: delete empty or repeated slides, bring it down to a number of slides, or reorder it (I show the plan and you confirm)', description: 'Deck-level changes that I show you before doing them: delete the empty slides, delete slides that repeat an earlier one word for word, choose which slides to cut to reach a number of slides, or suggest a better order. Nothing happens until you confirm, slides are never rewritten, and locked slides stay where they are.',
    examples: ['delete the duplicate slides', 'reduce the deck to 10 slides', 'put the slides in a better order'], scopes: ['deck'], ready: true, verifiedBy: ['removal', 'move'],
    parts: [{ id: 'empty', label: 'delete the empty slides', examples: ['delete the empty slides'] }, { id: 'duplicates', label: 'delete repeated slides', examples: ['delete the duplicate slides'] }, { id: 'reduce', label: 'bring the deck down to a number of slides', examples: ['reduce the deck to 10 slides'] }, { id: 'reorder', label: 'suggest a better order', examples: ['put the slides in a better order'] }],
  },
  transition: {
    label: 'set how slides arrive (fade, slide, zoom, push, wipe, none; Morph on Gold and Premium)', description: 'Sets the slide transition of one slide, some slides or the whole deck: the type, how fast, which way a push or wipe comes from, and moving on by itself after some seconds. Not on locked slides, and not on animated-template slides (their transitions are part of the design).',
    examples: ['add a fade transition between all the slides', 'make slide 3 arrive with a push from the left', 'remove all transitions'], scopes: ['slide', 'slides', 'deck'], ready: true, verifiedBy: ['transition'],
    templates: { 'morph-template': TEMPLATE_TRANSITION, morph: TEMPLATE_TRANSITION },
    parts: [{ id: 'basic', label: 'fade, slide, zoom, push, wipe or none', examples: ['add a fade transition between all the slides'] }, { id: 'morph', label: 'Morph between slides', examples: ['use Morph between the slides'], feature: 'morph' }],
  },
  motion: { label: 'set one animation style for the whole deck', description: 'Chooses the deck-wide entrance animation (or none).', examples: ['animate every slide', 'remove all animations'], scopes: ['deck'], ready: true, verifiedBy: ['theme'] },
  undo: { label: 'put back my last change', description: 'Undoes the assistant\'s own earlier change.', examples: ['undo that'], scopes: ['deck'], ready: true, verifiedBy: ['revert'] },
  rewrite_deck: { label: 'rebuild every slide from details you give', description: 'Rewrites the whole deck from new details (owner only; it runs as a separate job).', examples: ['rebuild this deck for a bank'], scopes: ['deck'], ready: true, verifiedBy: ['rewrite'], ownerOnly: true },
  element: {
    label: 'change objects on a slide (bigger or smaller, move, align, text size, bold, colour, delete) add simple shapes and animate objects', description: 'Resizes, moves, aligns, restyles or deletes particular objects of a slide: the one you select, or the title, the picture, the text. Adds an entrance, emphasis or exit animation to an object (or takes its animations off), adds a rectangle, circle, line, triangle, ring or arrow, and changes a shape\'s colour, outline, corners and see-through. Never on a locked slide or a locked object; on animated-template slides only the words and the text style.',
    examples: ['make this bigger', 'move the picture to the right', 'make the title size 40', 'make the body text bold'], scopes: ['slide'], ready: true, verifiedBy: ['element'], needsFeature: 'advancedEditor',
    parts: [{ id: 'size', label: 'make an object bigger or smaller', examples: ['make this smaller'] }, { id: 'move', label: 'move or align an object', examples: ['move it to the left'] }, { id: 'text', label: 'text size, bold, italic, colour, alignment', examples: ['make the heading bold'] }, { id: 'delete', label: 'delete an object', examples: ['delete the picture'] }, { id: 'cell', label: 'change one table cell or one chart figure to a value you give me', examples: ['set the price of Basic to $12', 'rename the Price column to Cost'] }, { id: 'chart-from-table', label: 'add a chart made from a table\'s own numbers', examples: ['make a chart from this table'] }, { id: 'copy', label: 'copy a chart, table, picture or text from another slide', examples: ['copy the chart from slide 6 to slide 2'] }, { id: 'animate', label: 'animate an object (entrance, emphasis or exit) or take its animation off', examples: ['make the title fly in from the left', 'remove the animation from this picture'] }, { id: 'add-shape', label: 'add a rectangle, circle, line, triangle, ring or arrow', examples: ['add a rectangle behind the heading', 'add a circle in the centre'] }, { id: 'shape-style', label: 'change a shape\'s colour, outline, rounded corners or see-through', examples: ['make this shape accent coloured'] }],
  },
  brand: {
    label: 'apply your saved brand, or the brand of a website you name (colours, fonts, logo)', description: 'Applies your brand kit to the whole deck, or reads a company website you name and applies the colours, fonts and logo it really finds there (and tells you what it could not find).',
    examples: ['use my brand', 'match the brand of acme.com'], scopes: ['deck'], ready: true, verifiedBy: ['theme'], needsFeature: 'brandKit',
    parts: [{ id: 'saved', label: 'your saved brand', examples: ['use my brand'] }, { id: 'site', label: 'the brand of a website you name', examples: ['match the brand of acme.com'], noChip: true, note: 'it reads the page itself: colours, fonts and a logo; a few lookups an hour' }],
  },
  brand_kit: { label: 'create, change or delete your saved brand kits (always asked first)', description: 'Saves a new brand kit, changes or deletes one of yours, or makes one your default: shown and confirmed first. It changes your kits, not the deck.', examples: ['create a brand kit called Acme with navy and gold', 'delete my old brand kit'], scopes: ['deck'], ready: true, verifiedBy: [], changesNothing: true, needsFeature: 'brandKit' },
  comment: { label: 'comments: add one, summarise them, list the open ones, suggest replies, resolve them (asked first)', description: 'Adds a comment in your words (marked as added with AI), summarises or lists the comments, drafts replies you can copy, or resolves them after asking.', examples: ['add a comment "check these numbers"', 'which comments are still open?'], scopes: ['slide', 'deck'], ready: true, verifiedBy: [], changesNothing: true },
  history: { label: 'what changed since the last saved version', description: 'Compares the deck with its previous saved version and says what changed.', examples: ['what changed since the last version?'], scopes: ['deck'], ready: true, verifiedBy: [], changesNothing: true },
  workflow: { label: 'present, export or share (I prepare it, you press the button)', description: 'Starts presenting from a slide, downloads the deck in a format, or opens Share with an email filled in: always with one button for you to press.', examples: ['present from this slide', 'export as PDF', 'share with anna@example.com'], scopes: ['deck'], ready: true, verifiedBy: [], changesNothing: true },
  enrich: { label: 'add more detail from your attached document', description: 'Expands slides with facts from the attached documents or links.', examples: ['add more detail from my document'], scopes: ['slide', 'deck'], ready: true, verifiedBy: ['edit'], needsSources: true },
}
