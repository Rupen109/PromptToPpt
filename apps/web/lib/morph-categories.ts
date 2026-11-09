import type { MorphCategory } from '@prompttoppt/theme/morph-templates'
import type { Faq } from '@/lib/seo'

/** The six families of Morph templates: what each is called, what it is for, and the words of its page. */
export interface MorphCategoryInfo {
  id: MorphCategory
  slug: string
  name: string
  /** one line for a card */
  short: string
  title: string
  description: string
  /** the answer first: what this family is, in plain words (also what an AI assistant will quote) */
  intro: string
  faqs: Faq[]
}

export const MORPH_CATEGORIES: readonly MorphCategoryInfo[] = [
  {
    id: 'business', slug: 'business-strategy', name: 'Business & Strategy', short: 'Plans, roadmaps, strategy reviews and annual reports',
    title: 'Business & Strategy Morph Animation Templates',
    description: 'Morph animation templates for business plans, strategy reviews, roadmaps and annual reports. Watch them play, then build yours with AI.',
    intro: 'Business and strategy Morph templates turn a plan into one continuous movement: a strategy matrix that zooms into each quadrant, a roadmap that pans from milestone to milestone, an annual report whose photographs and numbers trade places. They keep a long, serious story easy to follow.',
    faqs: [
      { q: 'What is a business Morph animation template?', a: 'It is a business presentation design where every slide change is one smooth movement. The same cards, numbers or pictures grow, shrink and glide from slide to slide, so a plan, a strategy or a report reads as one piece instead of a stack of separate slides.' },
      { q: 'Which business presentations suit a Morph template?', a: 'Business plans, strategy reviews, roadmaps and timelines, quarterly and annual reports, board updates, proposals, and consulting decks. Pick the template whose movement matches your story: zooming into themes, panning along a timeline, or trading panels for numbers.' },
    ],
  },
  {
    id: 'pitch', slug: 'pitch-investor', name: 'Pitch & Investor', short: 'Fundraising decks, market stories and startup pitches',
    title: 'Pitch & Investor Morph Animation Templates',
    description: 'Morph animation templates for pitch decks and investor presentations: market size, traction, business model and the ask. Watch them play, then build yours with AI.',
    intro: 'Pitch and investor Morph templates give a fundraising story momentum: market circles that zoom into the next slide, a positioning map where your dot travels to the top, cards that fly off one by one. Investors follow one object through the whole story instead of starting again on every slide.',
    faqs: [
      { q: 'What is a Morph animation template for a pitch deck?', a: 'It is a pitch deck design where the slides are planned as one movement. A core object, a set of circles or a stack of cards carries the audience from problem to solution, market, traction, business model and the ask without any slide feeling like a restart.' },
      { q: 'Are Morph pitch decks suitable for investors?', a: 'Yes, as long as the words stay clear and the numbers are yours. The movement draws attention to one idea at a time; the content is still written by you or by the AI from your brief. Replace every sample figure in a template with your own before you present.' },
    ],
  },
  {
    id: 'marketing', slug: 'marketing-campaigns', name: 'Marketing & Campaigns', short: 'Campaign decks, social feeds, brand moodboards and portfolios',
    title: 'Marketing & Campaign Morph Animation Templates',
    description: 'Morph animation templates for marketing plans, campaign decks, brand moodboards and creative portfolios. Watch them play, then build yours with AI.',
    intro: 'Marketing and campaign Morph templates bring a campaign to life: poster-size headlines and stickers that pop, a social feed that scrolls through your posts, a moodboard whose photographs rearrange to show the brand. They suit work that has to look as good as the product it sells.',
    faqs: [
      { q: 'What is a marketing Morph animation template?', a: 'It is a campaign or brand presentation where every slide flows into the next. Headlines, photographs and graphics move between slides, so a marketing plan, a campaign review or a brand story feels like the thing it describes: lively and designed.' },
      { q: 'Which marketing presentations suit a Morph template?', a: 'Campaign pitches and reviews, social media plans, brand guidelines and moodboards, agency credentials, creative portfolios, and product marketing decks. Choose a bold poster style for loud campaigns, a feed style for social, and an editorial collage style for brand work.' },
    ],
  },
  {
    id: 'launch', slug: 'product-launch', name: 'Product Launch', short: 'Unboxings, feature tours and launch countdowns',
    title: 'Product Launch Morph Animation Templates',
    description: 'Morph animation templates for product launches: unboxings, feature tours and countdowns. Watch them play, then build yours with AI.',
    intro: 'Product launch Morph templates keep the product on stage: it tumbles, grows and travels from slide to slide, spec call-outs point at it, a spotlight opens onto each feature, a countdown turns into the reveal. The audience watches the product, not the slides.',
    faqs: [
      { q: 'What is a product launch Morph animation template?', a: 'It is a launch presentation design where the product is one object that stays on screen and moves through the whole deck: bigger for the reveal, smaller beside a feature, rotated to show another side. Every slide change is one smooth movement of that hero.' },
      { q: 'Which launches suit a Morph template?', a: 'Consumer products and devices, apps and software releases, food and drink launches, campaigns with a hero item, and internal product reviews. Pick the unboxing style for a physical product, the spotlight style for features, and the countdown style for a big announcement.' },
    ],
  },
  {
    id: 'technology', slug: 'technology', name: 'Technology', short: 'AI, software, dashboards and hardware',
    title: 'Technology Morph Animation Templates',
    description: 'Morph animation templates for technology, AI, software and hardware presentations. Watch them play, then build yours with AI.',
    intro: 'Technology Morph templates show how a system works by moving it: a neural network whose nodes regroup from layer to layer, a dashboard whose widgets rearrange and expand, a circuit board that boots line by line. They make complex ideas easier to follow.',
    faqs: [
      { q: 'What is a technology Morph animation template?', a: 'It is a presentation design for technical subjects where the diagram is the animation: nodes, widgets or components keep their identity from slide to slide and move to new places, so the audience sees how one part relates to another instead of reading a new diagram each time.' },
      { q: 'Which technology presentations suit a Morph template?', a: 'AI and machine learning talks, software and SaaS product tours, architecture and platform overviews, hardware and engineering briefs, and data and analytics updates. Choose the network style for AI, the dashboard style for software, and the circuit style for hardware and engineering.' },
    ],
  },
  {
    id: 'education', slug: 'education', name: 'Education', short: 'Classrooms, science labs and learning paths',
    title: 'Education Morph Animation Templates',
    description: 'Morph animation templates for lessons, classrooms, science and training. Watch them play, then build yours with AI.',
    intro: 'Education Morph templates make a lesson feel alive: illustrated creatures and plants glide across a storybook page, a chalkboard fills with doodles, element tiles regroup into a molecule, a map path leads a class from one topic to the next. They keep attention while the content stays simple.',
    faqs: [
      { q: 'What is an education Morph animation template?', a: 'It is a lesson or training presentation where each slide flows into the next. Pictures, diagrams and headings move between slides, so a topic unfolds in a clear order that students can follow, and the visual style is chosen for the age and subject.' },
      { q: 'Which lessons suit a Morph template?', a: 'School lessons and classroom talks, science and nature topics, workshops and training sessions, storytelling for children, and study guides. Use the storybook style for younger students, the chalkboard for teaching moments, the lab style for science, and the atlas style for learning journeys.' },
    ],
  },
]

export const categoryBySlug = (slug: string) => MORPH_CATEGORIES.find((c) => c.slug === slug)
export const categoryById = (id: MorphCategory) => MORPH_CATEGORIES.find((c) => c.id === id)!
