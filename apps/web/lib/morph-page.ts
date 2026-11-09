import type { Faq } from '@/lib/seo'

/**
 * The words of /morph-animation-templates. Every answer says what is true of the product today: the Morph plays in SlidesDone's present mode and shared view, and the
 * Morph templates belong to the Gold and Premium plans (the same gate the server enforces).
 */
export const MORPH_FAQS: readonly Faq[] = [
  { q: 'What is a Morph transition?', a: 'A Morph transition moves the objects that two slides have in common from where they were to where they are, instead of cutting or fading between slides. A picture that is small on one slide and large on the next grows smoothly; a title that sits at the top and then moves to the middle glides there. The result feels like one continuous movement through the whole presentation.' },
  { q: 'What are Morph animation templates?', a: 'Morph animation templates are presentation designs built for Morph. Their slides are planned together: the same pictures and words sit in different places and sizes from slide to slide, so every change of slide is a smooth transformation. SlidesDone has Morph templates in six families: business and strategy, pitch and investor, marketing and campaigns, product launch, technology, and education.' },
  { q: 'How do I make a Morph presentation?', a: 'Describe your topic to SlidesDone, choose Morph animation, and the AI writes the slides into a Morph template that fits the topic. Then present it: each press of the arrow key plays the Morph to the next slide. You can edit the words and pictures of every slide in your browser.' },
  { q: 'Which plans include Morph animation templates?', a: 'Morph animation templates are included with the Gold and Premium plans. The basic slide transitions (fade, slide, zoom, push and wipe) are available on every plan.' },
  { q: 'Can I choose which Morph template to use?', a: 'Yes. Each template suits certain topics, and you can pick the one you want. If you describe your topic and let SlidesDone choose, it picks the template that fits the subject best.' },
  { q: 'Which kinds of Morph templates does SlidesDone have?', a: 'Six families: business and strategy (plans, roadmaps, reports), pitch and investor (fundraising and market stories), marketing and campaigns (billboards, social feeds, moodboards), product launch (unboxings, feature tours, countdowns), technology (AI, dashboards, hardware) and education (classrooms, labs, learning paths). Each family has several templates, each with its own look and its own kind of movement.' },
  { q: 'Do Morph presentations work in PowerPoint?', a: 'PowerPoint has its own Morph transition. In SlidesDone, the Morph plays in the presenter view and in shared links. When you export to PowerPoint, your slides, text and pictures come with you, and the movement between slides is set up as a standard transition.' },
  { q: 'Does a Morph presentation need a fast computer?', a: 'No. The movement runs in your browser using the graphics your device already has, and it respects the setting that asks your device for less motion: with that setting on, the slides change without the movement.' },
]

export const MORPH_STEPS = [
  { title: 'Say what it is about', text: 'Describe your topic in a sentence or two, or add a document. SlidesDone works out what kind of presentation it is.' },
  { title: 'Choose Morph animation', text: 'Switch on Morph animation and pick a template, or let SlidesDone choose the one that fits your subject.' },
  { title: 'Present it', text: 'The AI writes the slides into the template. Present them and every slide change plays as one smooth movement. Edit any slide in your browser.' },
] as const

/** What makes a Morph deck different, in the order a reader asks. */
export const MORPH_POINTS = [
  { title: 'One object carries the story', text: 'A planet, a product or a headline stays on screen and changes size and place from slide to slide, so the audience follows it instead of starting again on every slide.' },
  { title: 'Slides are planned as one piece', text: 'In a Morph template the slides are designed together: what is hidden off the edge of one slide is what glides in on the next.' },
  { title: 'Words stay quiet', text: 'Bold type and big pictures do the moving. The sentences are short and sit at the edge, so the movement is never fighting the text.' },
  { title: 'Edit it like any other deck', text: 'Every word and picture on every slide can be changed in your browser. The movement between slides follows your edits.' },
] as const
