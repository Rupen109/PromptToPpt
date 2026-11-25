/**
 * The AI assistant chat's limits, in ONE place: the editor builds what it sends with them and the server checks with them, so the two can never disagree
 * (a 185-character change summary once broke every later message of a chat, because the editor sent its own history longer than the server accepted).
 *
 * What the person types is user input: it has a limit and a plain message. The conversation and the list of recent changes are CONTEXT the assistant wrote
 * itself: the server trims them to these sizes instead of refusing a new message because of an old answer.
 */
export const ASSIST_LIMITS = {
  /** one message the person types or pastes (longer text is attached as a source) */
  instruction: 4000,
  /** earlier turns sent as context, and the length of each */
  conversationTurns: 8,
  conversationText: 600,
  /** recent changes the editor can still undo, and the lines describing each */
  recentChanges: 5,
  recentLines: 8,
  recentLine: 160,
} as const

/** a line cut to a length, with "…" when cut */
export const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`)

/** the conversation as the assistant may receive it: the last turns, each clipped */
export function clipConversation<T extends { role: 'user' | 'assistant'; text: string }>(turns: readonly T[]): T[] {
  return turns.slice(-ASSIST_LIMITS.conversationTurns).map((t) => ({ ...t, text: clip(t.text, ASSIST_LIMITS.conversationText) }))
}

/** the recent changes as the assistant may receive them: newest first, a few lines each, every line clipped */
export function clipRecent<T extends { summary: string[] }>(changes: readonly T[]): T[] {
  return changes.slice(0, ASSIST_LIMITS.recentChanges).map((c) => ({ ...c, summary: c.summary.slice(0, ASSIST_LIMITS.recentLines).map((l) => clip(l, ASSIST_LIMITS.recentLine)) }))
}
