/**
 * Quick edits: one-click AI actions on the slide on screen (the editor's "Quick edits" menu). Each id is turned by the SERVER into one fixed assistant task
 * (services/api/src/assistant/quick.ts), so nothing has to be understood from words: it runs through the same pipeline, checks, undo and credits as the chat.
 * `slides` = how many slides the action writes (for the price shown before clicking: one AI edit, then the written-slide price for each further slide).
 */
export const QUICK_EDITS = [
  { id: 'improve', group: 'Writing', label: 'Improve writing', slides: 1 },
  { id: 'expand', group: 'Writing', label: 'Expand text', slides: 1 },
  { id: 'shorten', group: 'Writing', label: 'Make shorter', slides: 1 },
  { id: 'simplify', group: 'Writing', label: 'Simplify language', slides: 1 },
  { id: 'tone_professional', group: 'Writing', label: 'Tone: more professional', slides: 1 },
  { id: 'tone_friendly', group: 'Writing', label: 'Tone: friendlier', slides: 1 },
  { id: 'tone_persuasive', group: 'Writing', label: 'Tone: more persuasive', slides: 1 },
  { id: 'rewrite', group: 'Writing', label: 'Rewrite text', slides: 1 },
  { id: 'grammar', group: 'Writing', label: 'Fix spelling and grammar', slides: 1 },
  { id: 'notes', group: 'Writing', label: 'Generate speaker notes', slides: 1 },
  { id: 'redesign', group: 'Design', label: 'Redesign slide (new layout)', slides: 1 },
  { id: 'split', group: 'Design', label: 'Split into 2 slides', slides: 2 },
  { id: 'readability', group: 'Design', label: 'Fix hard-to-read text', slides: 1 },
  { id: 'photo', group: 'Pictures', label: 'Add a matching photo', slides: 1 },
  { id: 'ai_image', group: 'Pictures', label: 'Generate an AI picture', slides: 1 },
  { id: 'remove_pictures', group: 'Pictures', label: 'Remove pictures', slides: 1 },
] as const

export type QuickEditId = (typeof QUICK_EDITS)[number]['id']
export const QUICK_EDIT_IDS = QUICK_EDITS.map((q) => q.id) as [QuickEditId, ...QuickEditId[]]
