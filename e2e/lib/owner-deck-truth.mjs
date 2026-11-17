/**
 * Ground truth for the owner's real 13-slide deck (a SlidesDone export: one 1920x1080 JPEG per page, no text in the file). Read by eye from the rendered slides.
 * Only DATA about the deck lives here (the words on the slides and where its photos are); the PDF itself is never committed (E2E_OWNER_PDF_DIR).
 * Photo boxes are in page points of the 1440 x 810 pt page (the deck's JPEGs are 1920 x 1080 px, so 1 px = 0.75 pt).
 * Text items are the visible words per slide, grouped the way a person reads them (a title, a bullet, a card label, a grey sub-line, a number).
 * Words inside photos (a phone screen, a monitor) are NOT listed: a text finder that reports them has produced junk.
 */
const px = (x, y, w, h) => ({ x: x * 0.75, y: y * 0.75, w: w * 0.75, h: h * 0.75 })
const RIGHT = px(992, 96, 832, 888)
const COVER = px(34, 34, 1852, 540)

export const OWNER_DECK_PHOTOS = { 1: [COVER], 2: [RIGHT], 4: [RIGHT], 9: [RIGHT], 12: [RIGHT], 13: [COVER] }

export const OWNER_DECK_TEXT = {
  1: ["Hyperlocal Market Penetration: Zomato's Digital Marketing Strategy", 'Analysis of location-based marketing, regional promotions, and digital execution'],
  2: ['Executive Summary: Connecting Neighborhoods to Nearby Dining', 'Bridging the gap between local restaurants and hungry neighborhood consumers', 'Transitioning from restaurant search and discovery to high-frequency transactional engagement', 'Leveraging targeted digital channels to build strong regional brand recall'],
  3: ['Agenda and Presentation Structure', '01', '02', '03', '04', '05', 'Target Audience and Consumer Personas', 'Hyperlocal Positioning and Regional Nuances', 'Core Digital Marketing Channels', 'Social Media and Contextual Push Strategy', 'Execution Roadmap and Strategic Outlook',
    'Segmentation across urban professionals, students, and families', 'Tailoring messages and cuisine offerings to specific neighborhoods', 'Search, paid acquisition, and organic content strategies', 'Real-time notifications, moments marketing, and viral campaigns', 'Key takeaways and future growth drivers for food delivery marketing'],
  4: ['Target Audience and Consumer Segmentation', 'Urban working professionals seeking convenient, fast daily meal solutions during busy office hours', 'Students and young adults driven by competitive value, promotional discounts, and late-night food options', 'Families and larger households ordering for weekend gatherings, group dining, and special occasions'],
  5: ['Hyperlocal Engine Drives Location-Based Engagement', 'Location Intelligence', 'Personalization Engine', 'Merchant Network', 'Geo-fenced mobile ads', 'Real-time vicinity triggers', 'Dynamic recommendations', 'Local culinary matching', 'Neighborhood partnerships', 'Hyper-relevant search',
    'Combines real-time location data with merchant partnerships to convert local intent into immediate orders.'],
  6: ['Multi-Channel Digital Touchpoint Coordination', '1', '2', '3', '4', 'User Intent Level', 'Search Engine Marketing', 'Captures high-intent search traffic', 'Targets local dining and delivery keywords', 'Contextual Push Notifications', 'Reaches users at specific meal hours', 'Delivers time-sensitive localized offers',
    'Social Media Campaigns', 'Drives engagement via viral humor', 'Capitalizes on trending pop culture topics', 'In-App Merchant Ads', 'Promotes featured restaurant partners', 'Converts active app users at checkout'],
  7: ['Time-Sensitive Notification Lifecycle', 'Morning', 'Midday', 'Evening', 'Late Night', 'Delivers breakfast reminders and convenient coffee pickup prompts', 'Triggers time-sensitive lunch deals tailored to office districts', 'Pushes dinner discounts and special weekend feast promotions', 'Sends targeted craving prompts for midnight food orders'],
  8: ['Localization Strategy Across Diverse Markets', 'Metro Campaigns', 'Tier 2 & 3 Growth', 'Focus on delivery speed and everyday convenience', 'Highlight international and trending cuisines', 'Target fast-paced urban working professionals', 'Leverage local vernacular and regional dialects', 'Align messaging with regional festivals and celebrations', 'Emphasize value-driven family meal deals'],
  9: ['Moment Marketing and Viral Social Engagement', 'Capitalizing on trending pop culture, sports tournaments, and news events', 'Minimalist creative design combined with witty, conversational copy', 'High-shareability content that generates organic social reach without paid spend'],
  10: ['Customer Retention and Loyalty Marketing', '01', '02', '03', '04', 'Gamified app experiences and seasonal promotional events to incentivize interaction', 'Subscription-based benefits driving user lock-in and reduced drop-off rates', 'Personalized re-engagement emails based on individual order history and preferences', 'Segmented push notifications tailored to local dining habits and peak meal times'],
  11: ['Strategic Roadmap for Hyperlocal Growth', 'Phase 1', 'Phase 2', 'Phase 3', 'Geo-Targeting Expansion', 'AI Notification Timing', 'Merchant Co-Branding', 'Deepen geo-targeting capabilities in emerging regional hubs', 'Tailor messaging to local regional culinary preferences', 'Refine AI-driven personalized push notification timing', 'Optimize trigger intervals around individual meal patterns',
    'Scale merchant co-branding digital advertising programs', 'Integrate restaurant partners into shared digital campaigns'],
  12: ['Key Takeaways for Business Strategists', 'Hyperlocal relevance outweighs generic broad-reach marketing in logistics-heavy sectors', 'Tone of voice and topical timing drive organic engagement and brand affection', 'Seamless integration across search, push, and app interface maximizes conversion'],
  13: ['Defining the Future of Hyperlocal Delivery Marketing', 'Questions & Discussion'],
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const words = (s) => norm(s).split(' ').filter(Boolean)
/** edit distance <= 1 for words of 5+ letters (an OCR slip), exact for the short ones (numbers, "AI", "of") */
const same = (a, b) => {
  if (a === b) return true
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i)
}
/**
 * Score what a text finder read from ONE slide. `found` = strings (lines or blocks). An expected item counts as found when at least 85 % of its words
 * are among the words read (each read word is used once). A read string is junk when fewer than half of its words belong to any expected item of the slide.
 */
export function scoreSlide(n, found) { return scoreList(OWNER_DECK_TEXT[n] ?? [], found) }
/** the same scoring for any list of expected items (the generated fixtures use it too) */
export function scoreList(truth, found) {
  const pool = found.flatMap(words)
  const used = new Array(pool.length).fill(false)
  const missed = []; let hit = 0
  for (const item of truth) {
    const w = words(item); let ok = 0; const take = []
    for (const t of w) { const i = pool.findIndex((p, j) => !used[j] && same(p, t)); if (i >= 0) { ok++; take.push(i) } }
    if (ok / w.length >= 0.85) { hit++; take.forEach((i) => { used[i] = true }) } else missed.push(item)
  }
  const all = new Set(truth.flatMap(words))
  const junk = found.filter((f) => { const w = words(f); return w.length && w.filter((t) => [...all].some((a) => same(a, t))).length < w.length / 2 })
  return { items: truth.length, hit, missed, junk }
}
export function scoreDeck(foundBySlide) {
  let items = 0, hit = 0; const junk = [], missed = []
  for (let n = 1; n <= 13; n++) { const r = scoreSlide(n, foundBySlide[n] ?? []); items += r.items; hit += r.hit; junk.push(...r.junk.map((j) => `${n}:${j}`)); missed.push(...r.missed.map((m) => `${n}:${m}`)) }
  return { items, hit, recall: hit / items, junk, missed }
}
export const iouBox = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? (w * h) / (a.w * a.h + b.w * b.h - w * h) : 0 }
