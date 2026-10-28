import type { CategoryId } from '@prompttoppt/theme'

/**
 * Search landing pages, one per template category. The copy is written per category (not templated) so every page is genuinely
 * different. Slides, counts and designs come from the live template data; only the words live here.
 */
export interface Landing {
  category: CategoryId
  slug: string
  /** "Pitch Deck" → "Free Pitch Deck Templates" */
  noun: string
  intro: string[]
  tips: { title: string; text: string }[]
  faqs: { q: string; a: string }[]
}

export const LANDINGS: Landing[] = [
  {
    category: 'pitch', slug: 'pitch-deck-templates', noun: 'Pitch Deck',
    intro: ['Investors give a pitch a few minutes, so the deck has to say the important things in the right order. Every pitch deck template here already follows the story investors expect: the problem, your solution, the market, the product, traction, business model, team and the ask.', 'Pick a design, open it in the editor and replace the sample text with your company. The AI assistant can rewrite any slide for your startup, and you can switch colours and fonts without touching the layout.'],
    tips: [{ title: 'Lead with the problem', text: 'Say who has it and what it costs them before you describe your product.' }, { title: 'Show traction early', text: 'One real number beats a page of claims. Put your best metric on its own slide.' }, { title: 'End with a specific ask', text: 'State how much you are raising and what it will achieve in the next 18 months.' }],
    faqs: [{ q: 'How many slides should a pitch deck have?', a: 'Most investor decks work best at 10 to 14 slides. The templates here give you a full story arc you can trim or extend.' }, { q: 'Can I edit these pitch deck templates?', a: 'Yes. Open any template in the editor and change the text, images, colours and layout. Your changes are saved to your account.' }, { q: 'Are the numbers in the templates real?', a: 'No. The sample text and figures describe a fictional company. Replace them with your own before you present.' }],
  },
  {
    category: 'sales', slug: 'sales-presentation-templates', noun: 'Sales Presentation',
    intro: ['A sales deck moves a prospect from the first call to a signed deal. These templates are laid out around that path: what you learned in discovery, the value you offer, how the solution fits, pricing, proof from other customers and the clear next steps.', 'Use one as the base for every deal. Swap in the prospect’s name and numbers, and let the AI assistant tailor the wording to their industry.'],
    tips: [{ title: 'Use their words', text: 'Repeat the problems the prospect told you about, in the way they said them.' }, { title: 'Prove it with a customer', text: 'One short customer result is worth more than a list of features.' }, { title: 'Make the next step obvious', text: 'End on a single clear action with a date, not a general thank-you.' }],
    faqs: [{ q: 'What should a sales presentation include?', a: 'The prospect’s situation, the value you deliver, how your solution fits, pricing, proof and next steps. These templates include all of them.' }, { q: 'How long should a sales deck be?', a: 'Aim for 8 to 12 slides for a first meeting. Keep detail for the follow-up so the conversation stays open.' }, { q: 'Can I reuse a template for many prospects?', a: 'Yes. Duplicate your deck for each deal and change the name, numbers and examples.' }],
  },
  {
    category: 'marketing', slug: 'marketing-presentation-templates', noun: 'Marketing',
    intro: ['Marketing decks have two jobs: get approval for a plan, and show what the plan achieved. These templates cover both, from objectives and audience to channels, creative, the funnel, results, learnings and the next budget.', 'Pick a bold design for campaign pitches or a calmer one for monthly readouts, then fill in your own numbers.'],
    tips: [{ title: 'Start with the goal', text: 'Put the one number the campaign must move on the first slide after the title.' }, { title: 'Show the funnel, not just the totals', text: 'Where people drop off tells the team what to fix next.' }, { title: 'End with what you learned', text: 'A learnings slide makes the next budget request easy to approve.' }],
    faqs: [{ q: 'What goes in a marketing plan presentation?', a: 'Objectives, target audience, channels, creative direction, the funnel, results and learnings, and the next budget. The templates are built around those parts.' }, { q: 'Are these good for campaign reports?', a: 'Yes. Use the results and funnel slides to report on a finished campaign.' }, { q: 'Can I change the colours to match my brand?', a: 'Yes. Pick a colour palette in the Style panel and the whole deck updates.' }],
  },
  {
    category: 'strategy', slug: 'business-strategy-presentation-templates', noun: 'Business Strategy',
    intro: ['Strategy decks go to boards and leadership teams who want clarity fast. These business strategy templates set out the context, the vision, the priorities, the roadmap, the risks, the financial outlook and the decisions you need from the room.', 'They are a calm, confident starting point for annual reviews, operating models, merger plans and long-range vision papers.'],
    tips: [{ title: 'Name the decision', text: 'Say on the first slide what you need the room to decide.' }, { title: 'Limit the priorities', text: 'Three to five priorities are remembered; ten are not.' }, { title: 'Be honest about risks', text: 'A short risks slide builds trust and prevents surprises later.' }],
    faqs: [{ q: 'What is in a business strategy presentation?', a: 'Context, vision, priorities, a roadmap, risks, the financial outlook and decisions needed. These templates cover each.' }, { q: 'Can I use these for board meetings?', a: 'Yes. They are designed for board and leadership audiences, with clean layouts for numbers and timelines.' }, { q: 'Can the AI fill the template for my company?', a: 'Describe your business in the AI assistant and it rewrites the slides for you. You review and edit the result.' }],
  },
  {
    category: 'product', slug: 'product-roadmap-presentation-templates', noun: 'Product Roadmap',
    intro: ['A product deck has to make a team want to build the thing. These templates tell the product story in order: the vision, the user problem, the solution, the roadmap, the release plan, the metrics and the feedback so far.', 'Use them for launches, specs, quarterly roadmaps and stakeholder reviews.'],
    tips: [{ title: 'Describe the user problem first', text: 'A shared view of the problem makes the roadmap easier to agree on.' }, { title: 'Group the roadmap by outcome', text: 'Now, next and later is clearer than a long list of dates.' }, { title: 'Show how you will measure it', text: 'Pick the metric for each release before you build it.' }],
    faqs: [{ q: 'What should a product roadmap presentation show?', a: 'The vision, the user problem, the solution, what ships when, how you will measure success and what users have told you.' }, { q: 'Do the templates include a roadmap slide?', a: 'Yes. Each product template has timeline and process slides you can adapt.' }, { q: 'Can I present it directly from the editor?', a: 'Yes. Present mode runs your deck full screen with its transitions.' }],
  },
  {
    category: 'tech', slug: 'technology-presentation-templates', noun: 'Technology and Architecture',
    intro: ['Engineering reviews fail when the diagram is unreadable. These technology templates keep architecture clear: context, system layers, data flow, security, rollout, risks and the decisions engineers need to make.', 'They suit design reviews, security briefings and platform updates for mixed audiences of engineers and managers.'],
    tips: [{ title: 'One diagram per idea', text: 'Split a crowded architecture into layers instead of shrinking the text.' }, { title: 'Put security on its own slide', text: 'Reviewers look for it; make it easy to find.' }, { title: 'List the open decisions', text: 'End with what is still undecided and who decides it.' }],
    faqs: [{ q: 'What belongs in an architecture review deck?', a: 'The context, the main components and layers, how data flows, security controls, the rollout plan, risks and open decisions.' }, { q: 'Are the templates suitable for non-technical audiences?', a: 'Yes. Plain layouts and short text keep them readable for managers as well as engineers.' }, { q: 'Can I add my own diagrams?', a: 'Yes. Add shapes, images and tables in the editor, or replace a picture slide with your diagram.' }],
  },
  {
    category: 'reports', slug: 'report-presentation-templates', noun: 'Report and Analytics',
    intro: ['A results presentation should put the numbers up front and the explanation right behind them. These report templates start with the headline metrics, then trends, breakdowns, analysis, the forecast and recommendations.', 'Use them for quarterly business reviews, performance reports and analytics readouts.'],
    tips: [{ title: 'Headline first', text: 'Open with the three numbers that matter, then explain them.' }, { title: 'One chart, one message', text: 'Title each chart with the conclusion, not just the metric name.' }, { title: 'Recommend something', text: 'End with what you think the team should do next.' }],
    faqs: [{ q: 'What should a quarterly report presentation include?', a: 'Headline metrics, trends, breakdowns by segment, your analysis, a forecast and recommendations.' }, { q: 'Can I add charts?', a: 'Yes. The editor has chart and table elements you can fill with your own data.' }, { q: 'Can I reuse the deck next quarter?', a: 'Yes. Duplicate it, update the numbers and change the title.' }],
  },
  {
    category: 'education', slug: 'education-presentation-templates', noun: 'Education and Training',
    intro: ['A good lesson tells people what they will learn, teaches it in small steps and lets them practise. These education templates are organised that way: objectives, agenda, key concepts, examples, exercises, a recap and resources.', 'They work for school lessons, workshops, courses and staff training.'],
    tips: [{ title: 'State the objectives', text: 'Tell learners what they will be able to do by the end.' }, { title: 'Alternate teaching and doing', text: 'Follow every concept with an example or a short exercise.' }, { title: 'Finish with a recap', text: 'A one-slide summary helps people remember the main points.' }],
    faqs: [{ q: 'How many slides should a lesson have?', a: 'About one slide per two to three minutes of teaching is a good rule, plus time for exercises.' }, { q: 'Are these templates good for students?', a: 'Yes. Students can use them for class presentations and projects, with clear sections for ideas and examples.' }, { q: 'Can I use them offline?', a: 'You can present from the editor in your browser. Downloading to PowerPoint or PDF is available on paid plans.' }],
  },
  {
    category: 'case-studies', slug: 'case-study-presentation-templates', noun: 'Case Study and Consulting',
    intro: ['A case study is a story with proof. These templates lay out the situation, the challenge, your approach, the results, the lessons and the recommendations, so a client or a hiring panel can follow your thinking.', 'Use them for client stories, consulting findings and project reviews.'],
    tips: [{ title: 'Make the result concrete', text: 'Put a before and after number on the results slide.' }, { title: 'Explain your approach simply', text: 'Show the three or four steps you took, not every detail.' }, { title: 'Quote the client', text: 'A short quote makes the result feel real.' }],
    faqs: [{ q: 'How do I structure a case study presentation?', a: 'Situation, challenge, approach, results, lessons and recommendations. These templates follow that structure.' }, { q: 'Can I use these for consulting deliverables?', a: 'Yes. They are built for findings and recommendations that need clear evidence.' }, { q: 'Can I add client logos?', a: 'Yes. Upload images in the editor and place them anywhere on the slide.' }],
  },
  {
    category: 'team', slug: 'team-and-hr-presentation-templates', noun: 'Team and HR',
    intro: ['Onboarding and company updates work best when they feel human. These team and HR templates cover the welcome, mission and values, the team, how you work, benefits, current priorities and a Q&A.', 'Use them for new-hire onboarding, culture decks and all-hands updates.'],
    tips: [{ title: 'Start with a welcome', text: 'A warm first slide sets the tone for everything after it.' }, { title: 'Put faces to names', text: 'Use photos of the team so new people recognise them.' }, { title: 'Leave room for questions', text: 'End with a Q&A slide and a point of contact.' }],
    faqs: [{ q: 'What should an onboarding presentation include?', a: 'A welcome, your mission and values, the team, how you work, benefits, current priorities and where to ask questions.' }, { q: 'Can I use these for all-hands meetings?', a: 'Yes. The priorities and Q&A slides suit regular company updates.' }, { q: 'Can I change the colours to match my company?', a: 'Yes. Choose a palette in the Style panel and the deck updates.' }],
  },
]

export const landingBySlug = (slug: string) => LANDINGS.find((l) => l.slug === slug)
export const landingByCategory = (id: string) => LANDINGS.find((l) => l.category === id)
