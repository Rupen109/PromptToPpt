export const CATEGORY_IDS = ['pitch', 'sales', 'marketing', 'strategy', 'product', 'tech', 'reports', 'education', 'case-studies', 'team'] as const
export type CategoryId = (typeof CATEGORY_IDS)[number]

export interface Category {
  id: CategoryId
  name: string
  /** one-line promise shown on cards */
  blurb: string
  /** what the slide sequence in these templates covers */
  covers: string
}

export const CATEGORIES: Category[] = [
  { id: 'pitch', name: 'Pitch & Investors', blurb: 'Investor decks that tell a fundable story.', covers: 'problem, solution, market, product, traction, business model, team, the ask' },
  { id: 'sales', name: 'Sales & Proposals', blurb: 'Decks that move a deal from first call to signature.', covers: 'discovery, value proposition, solution fit, pricing, proof, next steps' },
  { id: 'marketing', name: 'Marketing & Campaigns', blurb: 'Campaign plans and readouts that make results obvious.', covers: 'objectives, audience, channels, creative, funnel, results, learnings, next budget' },
  { id: 'strategy', name: 'Business & Strategy', blurb: 'Board-ready strategy, vision and operating reviews.', covers: 'context, vision, priorities, roadmap, risks, financial outlook, decisions needed' },
  { id: 'product', name: 'Product & Roadmap', blurb: 'Launches, specs and roadmaps your team can rally behind.', covers: 'vision, user problem, solution, roadmap, release plan, metrics, feedback' },
  { id: 'tech', name: 'Technology & Architecture', blurb: 'Architecture, security and engineering reviews that stay clear.', covers: 'context, architecture layers, data flow, security, rollout, risks, decisions' },
  { id: 'reports', name: 'Reports & Analytics', blurb: 'Quarterly results and insights with the numbers up front.', covers: 'headline metrics, trends, breakdowns, analysis, forecast, recommendations' },
  { id: 'education', name: 'Education & Training', blurb: 'Lessons, workshops and courses people actually follow.', covers: 'objectives, agenda, concepts, examples, exercises, recap, resources' },
  { id: 'case-studies', name: 'Case Studies & Consulting', blurb: 'Client stories and consulting findings with proof.', covers: 'situation, challenge, approach, results, lessons, recommendations' },
  { id: 'team', name: 'Team & HR', blurb: 'Onboarding, culture and company updates with a human voice.', covers: 'welcome, mission and values, team, how we work, benefits, priorities, Q&A' },
]
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id)
