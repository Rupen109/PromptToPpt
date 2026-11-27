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
  /**
   * How many separate changes ONE message may ask for. More than this is not refused: the assistant does the first
   * `changesPerMessage`, lists the rest in its answer, and the person sends them next (services/api/src/assistant/pipeline.ts).
   * It is a quality limit, not a cost one: beyond about ten tasks a single plan stops holding together.
   */
  changesPerMessage: 10,
  /** earlier turns sent as context, and the length of each */
  conversationTurns: 8,
  conversationText: 600,
  /** recent changes the editor can still undo, and the lines describing each */
  recentChanges: 5,
  recentLines: 8,
  recentLine: 160,
} as const

/**
 * What a person may type in ONE new-deck prompt (the home box, `/generation/analyze` and `/generation/jobs`, and a draft).
 * It is a *typing* limit, not a limit on how much the deck may be built from: longer text is attached as a source and read in full,
 * which is also far cheaper (a source is read once, a prompt is sent with every step of the build).
 */
export const DECK_PROMPT_LIMIT = 4000

/** the message shown wherever a new-deck prompt is too long — one wording, server and browser (the browser knows the length, the server does not need it) */
export const deckPromptTooLong = (chars?: number) =>
  `${chars === undefined ? 'That text is' : `That text is ${chars.toLocaleString('en')} characters,`} longer than one prompt can be (${DECK_PROMPT_LIMIT.toLocaleString('en')} characters). Attach the long text as a source instead: a source is read in full, and here you only say what to make from it.`

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
