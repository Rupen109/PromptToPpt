import { QUICK_EDITS, type QuickEditId } from '@prompttoppt/validation'

/**
 * A quick edit (the editor's menu) as the ONE assistant task it stands for, on the slide on screen. The task is fixed here, so the model is never asked what
 * the click meant: runAssistant gets it as a confirmed task (`proceed`) and checks it like any other (plan, locks, templates), writes, checks the result,
 * and the route charges it by the usual price units (one AI edit; each further written slide at the written-slide price).
 */
const HERE = [{ by: 'current' as const }]
const TASKS: Record<QuickEditId, { family: string; values: Record<string, unknown> }> = {
  improve: { family: 'text', values: { request: 'Improve the writing: clearer, more precise, more professional wording. Keep the meaning, every fact and about the same length.' } },
  expand: { family: 'text', values: { request: 'Expand the text with more useful detail and explanation about the slide\'s own topic. Add no figures that are not already here.', length: 'longer' } },
  shorten: { family: 'text', values: { request: 'Make the text shorter and tighter. Keep the key points and every figure.', length: 'shorter' } },
  simplify: { family: 'text', values: { request: 'Simplify the language so anyone can understand it: short sentences, everyday words, no jargon. Keep the facts.' } },
  tone_professional: { family: 'text', values: { request: 'Make the tone more professional and confident. Keep the meaning and every fact.' } },
  tone_friendly: { family: 'text', values: { request: 'Make the tone warmer and friendlier. Keep the meaning and every fact.' } },
  tone_persuasive: { family: 'text', values: { request: 'Make the tone more persuasive: lead with the benefit, use active voice. Keep the meaning and every fact.' } },
  rewrite: { family: 'text', values: { request: 'Rewrite the text in fresh words. Keep the meaning, every fact and about the same length.' } },
  grammar: { family: 'text', values: { request: 'Fix spelling, grammar and punctuation only. Change nothing else.' } },
  notes: { family: 'text', values: { request: 'Write speaker notes for this slide: what to say, in a natural speaking voice, without reading the slide word for word.', notesOnly: true } },
  redesign: { family: 'layout', values: {} },
  split: { family: 'combine', values: { action: 'split', parts: 2 } },
  readability: { family: 'readability', values: {} },
  photo: { family: 'picture', values: { source: 'photo', placement: 'beside' } },
  ai_image: { family: 'picture', values: { source: 'ai', placement: 'beside' } },
  remove_pictures: { family: 'picture', values: { remove: true } },
}

export const quickLabel = (id: QuickEditId) => QUICK_EDITS.find((q) => q.id === id)!.label

/** the confirmed task a quick edit runs (always the slide on screen) */
export function quickConfirm(id: QuickEditId) {
  const t = TASKS[id]
  return { kind: 'proceed' as const, tasks: [{ family: t.family, targets: HERE, values: t.values, phrase: quickLabel(id).toLowerCase() }] }
}
