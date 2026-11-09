import type { Presentation, Slide } from '@prompttoppt/validation'
import { composeTemplateScene, templateTheme, textSlots } from './compose'
import type { DemoScene } from './types'
import { getMorphTemplate } from './registry'

/**
 * Demo decks of the Morph templates: a few scenes of each, filled with plainly-labelled sample words (never a made-up quotation or statistic), for the website's live previews and
 * the template gallery. `copy` lists the words for a scene's text slots from top to bottom (textSlots); a missing entry keeps the template's own words.
 */
export type { DemoScene }

export const DEMOS: Record<string, DemoScene[]> = {
  space: [
    { scene: 's1', copy: ['A LUNAR SCIENCE BRIEFING', 'Moon Research'] },
    { scene: 's2', copy: ['Why the Moon', 'The mission', 'Our instruments', 'The crew', 'What comes next'] },
    { scene: 's3', copy: ['Why the Moon'] },
    { scene: 's4', copy: ['Welcome aboard', 'The Moon is the closest world we can study up close. This briefing shows what we want to learn there, how we plan to do it, and why it matters for everything that comes next in space exploration.'] },
    { scene: 's5', copy: ['Why now?', 'Ice in shadowed craters could one day supply water to crews.', 'Our mission is to understand the Moon well enough to return and stay.', 'What we do?', 'Landers, orbiters and rovers map the surface and sample the soil.', 'What next?', 'Every answer shortens the road to Mars.'] },
    { scene: 's7', copy: ['Our history', 'Twelve people have walked on the Moon, all between 1969 and 1972. Fifty years of better instruments now let us ask questions they could not.'] },
    { scene: 's8', copy: ['Learn to live and work on the Moon'] },
    { scene: 's10', copy: ['The solar system'] },
    { scene: 's11', copy: ['Mercury is the smallest planet and the closest to the Sun.'] },
    { scene: 's16', copy: ['Saturn is a gas giant ringed with ice.'] },
    { scene: 's19', copy: ['“', 'One line your audience should remember.', '— Add a credit or a source'] },
    { scene: 's20', copy: ['Contact us', 'Your address here', 'Your phone here', 'you@example.com', '@yourhandle', 'yoursite.com'] },
  ],
  edu: [
    { scene: 's1', copy: ['DINO DAY', 'A LESSON FOR GRADE 3'] },
    { scene: 's2', copy: ['CONTENTS', 'I. THE GIANTS', 'II. WHAT THEY ATE', 'III. HOW WE KNOW', 'IV. YOUR TURN'] },
    { scene: 's3', copy: ['WHO THEY WERE'] },
    { scene: 's4', copy: ['WELCOME', 'Hello, explorers! Today we travel back millions of years to meet the giants that once walked where we sit. Bring your questions, your curiosity and a sharp pencil.'] },
    { scene: 's5', copy: ['OUR TOPIC', 'WHAT?', 'WHY?', 'WHERE?', 'Dinosaurs were reptiles that lived on Earth for a very long time.', 'Fossils let us read the story of life from long before people.', 'Their bones turn up on every continent.'] },
    { scene: 's7', copy: ['TIMELINE', 'TRIASSIC PERIOD', 'JURASSIC PERIOD', 'ABOUT 250 MILLION YEARS AGO', 'ABOUT 200 MILLION YEARS AGO', 'The first small dinosaurs appear.', 'Giant long-necked plant eaters grow huge.'] },
    { scene: 's8', copy: ['TIMELINE', 'JURASSIC PERIOD', 'CRETACEOUS PERIOD', 'ABOUT 200 MILLION YEARS AGO', 'ABOUT 145 MILLION YEARS AGO', 'Giant long-necked plant eaters grow huge.', 'Tyrannosaurus and Triceratops roam the land.'] },
    { scene: 's9', copy: ['GALLERY'] },
    { scene: 's10', copy: ['DINOSAUR TYPES'] },
    { scene: 's11', copy: ['TYRANNOSAURUS REX', 'A big meat eater that walked on two strong legs and had tiny arms. Its teeth were as long as bananas.'] },
    { scene: 's12', copy: ['ANKYLOSAURUS', 'A plant eater covered in bony armour, with a heavy club at the end of its tail to keep hunters away.'] },
    { scene: 's13', copy: ['PTEROSAUR', 'Pterosaurs were flying reptiles and close cousins of the dinosaurs. Some were as small as a bird, others as wide as a small plane.'] },
    { scene: 's14', copy: ['“', 'FOSSILS TELL STORIES', '— Add a credit or a source'] },
    { scene: 's15', copy: ['CONTACT US', 'Your school address', 'Your phone number', 'hello@yourschool.com', '@yourschool', 'yourschool.com'] },
  ],
  cool: [
    { scene: 's1', copy: ['AURORA'] },
    { scene: 's2', copy: ['CONTENTS', 'OUR STORY', 'OUR WORK', 'OUR PROCESS', 'CONTACT US'] },
    { scene: 's3', copy: ['OUR STORY'] },
    { scene: 's4', copy: ['WELCOME', 'We turn ideas into brands, one detail at a time.', 'Follow us at @yourstudio.', 'Our work begins with listening. We sit with your team, learn what makes you different, and shape an identity that feels true on every screen, in every room and in every hand.', 'From the first sketch to the final file we keep the process open: you see the thinking, you steer the direction, and nothing is a surprise on launch day.'] },
    { scene: 's5', copy: ['MISSION', 'Our statement in one line.', 'We help small teams look as good as they work, with identities that are clear, calm and built to last.', 'VISION'] },
    { scene: 's6', copy: ['ABOUT US'] },
    { scene: 's7', copy: ['MEET THE TEAM', 'JOHN DOE', 'JANE DOE', 'JANE DOE', 'JOHN DOE', 'Founder', 'Design lead', 'Strategy', 'Engineering'] },
    { scene: 's8', copy: ['GALLERY'] },
    { scene: 's9', copy: ['Our research in a line.', 'MARKET RESEARCH', 'Add your key findings here: what you asked, whom you asked and what you learned.', 'Then say what it means for the decision in front of you.'] },
    { scene: 's10', copy: ['“', 'WRITE A STATEMENT WORTH REMEMBERING', '— Add a credit or a source'] },
    { scene: 's11', copy: ['CONTACT US', 'Your address here', 'Your phone', 'hello@yoursite.com', '@yoursite', 'yoursite.com'] },
  ],
  biz: [
    { scene: 's1', copy: ['Business Plan'] },
    { scene: 's2', copy: ['Contents', 'Our story', 'Our market', 'Why we started.', 'Who we serve.', 'Our product', 'Our model', 'What we make.', 'How we earn.', 'Our team', 'Our plan', 'Who builds it.', 'The next steps.', 'Our numbers', 'Our ask', 'Where we stand.', 'What we need.'] },
    { scene: 's3', copy: ['Our story'] },
    { scene: 's4', copy: ['Welcome', 'Thank you for being here. Follow us at @yourcompany.\n\nThis plan shows the products we are building, who they are for and how we will bring them to market, one clear step at a time.\n\nAsk anything, any time: the best ideas in a plan usually start as questions.'] },
    { scene: 's5', copy: ['Earbuds', 'Watch', 'Speaker'] },
    { scene: 's6', copy: ['Earbuds', 'Our first product: wireless earbuds designed for all-day comfort. Add what makes them different, who they are for and how you will reach those people.'] },
    { scene: 's7', copy: ['Earbuds', 'Watch', 'Speaker'] },
    { scene: 's8', copy: ['Watch', 'The second product builds on the first: a smartwatch with the same design language and new ways to use it every day.', 'Add its price, its launch date and the customers who asked for it.'] },
    { scene: 's9', copy: ['Earbuds', 'Watch', 'Speaker'] },
    { scene: 's10', copy: ['Speaker', 'The third product completes the series: a speaker that fills a room. Add how the three work together and what customers get when they own them all.'] },
    { scene: 's11', copy: ['Our product'] },
    { scene: 's12', copy: ['Our market', 'Add the size of your market, how fast it is growing and where your first customers are. Replace the chart with your own numbers.'] },
    { scene: 's13', copy: ['Discovery', 'We talk to customers and test the idea.', 'Build', 'We make a first version and improve it weekly.', 'Launch', 'We open the doors and learn from real use.', 'Grow', 'We add the channels and customers that fit.'] },
    { scene: 's14', copy: ['Contact Us', 'Your address here', 'Your phone', 'hello@yourcompany.com', '@yourcompany', 'yourcompany.com'] },
  ],
  launch: [
    { scene: 's1', copy: [] },
    { scene: 's2', copy: ['TABLE OF CONTENTS', 'THE PRODUCT', 'THE STORY', 'THE FLAVOURS', 'GET IN TOUCH'] },
    { scene: 's3', copy: ['THE PRODUCT'] },
    { scene: 's4', copy: ['WELCOME', 'Thank you for joining us. Today we introduce a new drink made with real fruit, bold colour and nothing you cannot pronounce.'] },
    { scene: 's5', copy: ['OUR BRAND', 'WHO WE ARE', 'A small team that loves fruit and good design.', 'WHAT WE DO', 'We make fizzy drinks with real fruit and bright flavour.'] },
    { scene: 's6', copy: ['MISSION\n& VISION', 'We want everyone to enjoy a drink that tastes like fruit and looks like fun.'] },
    { scene: 's8', copy: ['HISTORY OF OUR PRODUCT', 'It began in a kitchen with a pile of raspberries and a simple question: why can a fizzy drink not taste like the fruit it is named after? Months of tasting later, the first flavour was ready.'] },
    { scene: 's9', copy: ['GALLERY'] },
    { scene: 's10', copy: ['MEET THE TEAM', 'JANE DOE', 'Founder', 'JOHN DOE', 'Flavour lead', 'JANE DOE', 'Design lead'] },
    { scene: 's11', copy: ['THE FLAVOURS'] },
    { scene: 's12', copy: ['LIME FLAVOR', 'Crisp, zesty and bright.', 'SODA', '$2.50'] },
    { scene: 's13', copy: ['BLUEBERRY\nFLAVOR', 'SODA', 'Deep, juicy and smooth.', '$2.50'] },
    { scene: 's15', copy: ['CONTACT US', 'Your address here', 'Your phone here', 'you@example.com', '@yourhandle', 'yoursite.com'] },
  ],
}


/** The slides of a template's demo, ready to draw (`assetBase` is where the template's pictures are served from). */
export function demoSlides(templateId: string, assetBase = ''): { slides: Slide[]; theme: Presentation['theme']; titles: string[] } {
  const tpl = getMorphTemplate(templateId)
  if (!tpl) throw new Error(`Unknown Morph template ${templateId}`)
  const titles: string[] = []
  const slides = (tpl.demo ?? DEMOS[templateId] ?? []).map(({ scene, copy }, i): Slide => {
    const fields = Object.fromEntries(textSlots(tpl, scene).flatMap((s, k) => (copy[k] !== undefined ? [[s.id, copy[k]!]] : [])))
    const composed = composeTemplateScene(tpl, { layout: 'morph-template', template: templateId, scene, fields, images: {}, speakerNotes: '', sources: [] }, { assetBase })
    titles.push(tpl.scenes.find((s) => s.id === scene)?.title ?? scene)
    return { id: `${templateId}-${i}`, locked: false, validation: { status: 'passed', issues: [] }, ...composed } as Slide
  })
  return { slides, theme: templateTheme(tpl), titles }
}
