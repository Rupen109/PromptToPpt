/**
 * What a Morph template is ABOUT, beyond its keywords, so a topic can be matched to it honestly. The template's own `topics` are the words of its subject; this adds what its
 * PICTURES show (a deck about taxes must not get a soda can), so a template whose art is about one subject is offered only to requests about that subject.
 *
 *  · `abstract`: shapes, gradients, glass, icons: suits any subject in its family
 *  · `themed`:   pictures of a loose world (lifestyle, corporate, school): suits its family, better when the request is about that world
 *  · `subject`:  pictures of one subject (planets, a drinks can, a microscope): offered ONLY when the request is about that subject
 *
 * `subjects` are the words of that world. `droppable` are the scenes a SHORTER deck may leave out, first to go first (see scenes.ts). A test keeps this table in step with the template list.
 */
export interface MorphProfile {
  art: 'abstract' | 'themed' | 'subject'
  /** the words of the subject the pictures show (matched whole-word, any case) */
  subjects: string[]
  /** scenes that can be left out without losing the story, in the order they go (a chapter opener before a content scene); never the first or the last. Missing: the template is only offered at its full length. */
  droppable?: string[]
}

export const MORPH_PROFILES: Record<string, MorphProfile> = {
  space: { art: 'subject', subjects: ['space', 'astronomy', 'astrophysics', 'planet', 'planets', 'moon', 'mars', 'jupiter', 'saturn', 'venus', 'solar system', 'galaxy', 'cosmos', 'universe', 'rocket', 'rockets', 'satellite', 'satellites', 'astronaut', 'astronauts', 'nasa', 'isro', 'orbit', 'mission to', 'chandrayaan', 'telescope'], droppable: ["s3", "s6", "s2", "s5", "s9", "s7", "s17", "s16", "s15", "s14", "s13", "s12"] },
  launch: { art: 'subject', subjects: ['beverage', 'beverages', 'drink', 'drinks', 'soda', 'juice', 'cola', 'snack', 'snacks', 'food', 'fruit', 'candy', 'fmcg', 'consumer goods', 'confectionery', 'energy drink', 'sparkling'], droppable: ["s3", "s7", "s2", "s9", "s10", "s8", "s6"] },
  edu: { art: 'subject', subjects: ['kids', 'children', 'child', 'dinosaur', 'dinosaurs', 'nature', 'animals', 'elementary', 'primary school', 'kindergarten', 'forest', 'prehistoric', 'wildlife', 'environment', 'story'], droppable: ["s3", "s6", "s10", "s2", "s9", "s5", "s13", "s12"] },
  cool: { art: 'abstract', subjects: [], droppable: ["s3", "s6", "s2", "s7", "s8", "s10"] },
  biz: { art: 'themed', subjects: ['product', 'products', 'gadget', 'gadgets', 'electronics', 'device', 'devices', 'headphones', 'smartphone', 'phone', 'hardware', 'consumer electronics', 'product series', 'lineup'], droppable: ["s3", "s11", "s2", "s4", "s13"] },
  'pitch-orbit': { art: 'abstract', subjects: [], droppable: ["s9", "s8", "s7", "s6"] },
  'biz-matrix': { art: 'abstract', subjects: [], droppable: ["s2", "s6", "s10", "s9"] },
  'biz-roadmap': { art: 'abstract', subjects: [], droppable: ["s2", "s10", "s9"] },
  'biz-annual': { art: 'themed', subjects: ['annual report', 'corporate', 'sustainability', 'esg', 'shareholders', 'shareholder', 'real estate', 'architecture', 'office', 'governance', 'financial results', 'earnings', 'investor relations'], droppable: ["s2", "s5", "s7", "s8", "s10"] },
  'pitch-market': { art: 'abstract', subjects: [], droppable: ["s9", "s8", "s6", "s4"] },
  'pitch-cards': { art: 'themed', subjects: ['marketplace', 'consumer', 'consumer app', 'e-commerce', 'local business', 'delivery', 'courier', 'handmade', 'makers', 'founder story', 'artisan', 'small business', 'direct to consumer', 'd2c'], droppable: ["s2", "s10", "s9", "s3"] },
  'mkt-billboard': { art: 'subject', subjects: ['drink', 'drinks', 'soda', 'beverage', 'beverages', 'juice', 'energy drink', 'consumer brand', 'retail', 'summer campaign', 'fmcg', 'snack', 'snacks', 'promotion', 'promotional offer', 'billboard', 'outdoor advertising', 'seasonal campaign', 'brand awareness'], droppable: ["s2", "s4", "s7", "s10"] },
  'mkt-feed': { art: 'themed', subjects: ['social media', 'instagram', 'tiktok', 'facebook', 'content calendar', 'content', 'influencer', 'creator', 'lifestyle', 'wellness', 'coffee', 'fashion', 'community', 'followers', 'reels', 'brand awareness'], droppable: ["s2", "s9", "s8", "s4"] },
  'mkt-moodboard': { art: 'themed', subjects: ['brand identity', 'brand guidelines', 'brand book', 'moodboard', 'mood board', 'lookbook', 'rebrand', 'visual identity', 'fashion', 'lifestyle', 'interiors', 'candles', 'ceramics', 'coffee', 'packaging', 'craft', 'art direction', 'photography', 'tone of voice', 'creative portfolio'], droppable: ["s2", "s10", "s6", "s5", "s9"] },
  'launch-unbox': { art: 'subject', subjects: ['headphones', 'gadget', 'gadgets', 'device', 'hardware', 'wearable', 'consumer electronics', 'audio', 'speaker', 'camera', 'smart ring', 'charger', 'earbuds', 'unboxing', 'tech launch', 'hardware launch', 'electronics'], droppable: ["s4", "s9", "s7", "s10", "s3"] },
  'launch-spotlight': { art: 'abstract', subjects: [], droppable: ["s6", "s9", "s10", "s8"] },
  'launch-countdown': { art: 'subject', subjects: ['sneaker', 'sneakers', 'shoe', 'shoes', 'fashion', 'streetwear', 'drop', 'festival', 'grand opening', 'opening', 'event', 'launch event', 'countdown', 'teaser', 'coming soon', 'unveiling', 'retail', 'apparel'], droppable: ["s11", "s10"] },
  'tech-neural': { art: 'abstract', subjects: [], droppable: ["s2", "s8", "s10", "s6"] },
  'tech-dashboard': { art: 'abstract', subjects: [], droppable: ["s7", "s9", "s8", "s4"] },
  'tech-circuit': { art: 'subject', subjects: ['hardware', 'embedded', 'embedded systems', 'electronics', 'chip', 'chips', 'pcb', 'firmware', 'robotics', 'iot', 'semiconductor', 'circuit', 'microcontroller', 'silicon', 'fpga', 'sensor'], droppable: ["s2", "s9", "s7", "s8"] },
  'edu-chalk': { art: 'themed', subjects: ['lesson', 'lesson plan', 'classroom', 'school', 'teacher', 'teaching', 'students', 'learning', 'tutorial', 'study', 'worksheet', 'quiz', 'homework', 'training', 'workshop', 'course'], droppable: ["s2", "s10", "s12", "s8", "s5"] },
  'edu-lab': { art: 'subject', subjects: ['science', 'chemistry', 'physics', 'atoms', 'atom', 'molecules', 'molecule', 'laboratory', 'lab', 'experiment', 'stem', 'periodic table', 'elements', 'matter', 'biology', 'scientific method', 'reaction'], droppable: ["s2", "s7", "s6", "s12", "s10"] },
  'edu-atlas': { art: 'subject', subjects: ['geography', 'history', 'nature', 'river', 'rivers', 'journey', 'map', 'atlas', 'environment', 'ecosystem', 'water cycle', 'explorer', 'social studies', 'adventure', 'travel', 'exploration', 'culture'], droppable: ["s9", "s10"] },
  'biz-sales': { art: 'abstract', subjects: [], droppable: ["s10", "s9", "s7", "s3"] },
  'biz-casestudy': { art: 'abstract', subjects: [], droppable: ["s4", "s7", "s12", "s11", "s2"] },
  'biz-team': { art: 'themed', subjects: ["onboarding", "new hire", "new hires", "company culture", "orientation", "hr", "human resources", "recruiting", "all hands", "team introduction", "meet the team", "first week", "welcome to the team", "team building", "employee handbook"], droppable: ["s11", "s9", "s10", "s2"] },
  'edu-health': { art: 'subject', subjects: ["health", "healthcare", "wellness", "medical", "medicine", "patient", "patients", "hospital", "clinic", "nurse", "nurses", "doctor", "doctors", "nutrition", "diet", "fitness", "mental health", "mindfulness", "yoga", "wellbeing", "public health", "first aid", "hygiene", "sleep", "stress", "physiotherapy", "dental", "pharmacy", "healthy habits", "patient information", "preventive care", "wellness retreat", "safety training", "heart health", "self-care", "hydration", "hand hygiene"], droppable: ["s9", "s4", "s11", "s10", "s2"] },
  'biz-finance': { art: 'subject', subjects: ["finance", "financial", "budget", "budgeting", "tax", "taxes", "savings", "investing", "investment", "investments", "wealth", "banking", "bank", "loan", "loans", "mortgage", "insurance", "retirement", "pension", "cash flow", "accounting", "expenses", "profit margin", "profit and loss", "stocks", "mutual funds", "credit score", "credit card"], droppable: ["s9", "s5", "s10", "s2", "s11"] },
}
