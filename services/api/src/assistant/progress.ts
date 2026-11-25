/**
 * What an AI assistant request is doing right now, for the person waiting: "Reading your request", "Rewriting 12 slides (1 of 2 groups done)", "Saving".
 * The request itself is unchanged (one POST that answers when done); its stages are kept here per person + request id, and a short Server-Sent Events
 * stream (routes/presentations.ts) passes them to the editor while it waits. Nothing here is needed for the answer: if the stream is not open (or lands on
 * another API instance), the chat simply shows "Working on it…" as before.
 */
export interface Stage { text: string; done?: number; total?: number; at: number }
type Listener = (s: Stage | null) => void
interface Channel { stages: Stage[]; listeners: Set<Listener>; ended: boolean; timer: ReturnType<typeof setTimeout> }

const channels = new Map<string, Channel>()
/** a channel lives this long after its last stage (the stream may open a moment after the request starts, or never) */
const KEEP_MS = 2 * 60_000
const MAX_CHANNELS = 5000
const keyOf = (userId: string, requestId: string) => `${userId}:${requestId}`

function channel(key: string): Channel {
  let ch = channels.get(key)
  if (!ch) {
    if (channels.size >= MAX_CHANNELS) { const oldest = channels.keys().next().value; if (oldest) drop(oldest) }
    ch = { stages: [], listeners: new Set(), ended: false, timer: setTimeout(() => drop(key), KEEP_MS) }
    ch.timer.unref?.()
    channels.set(key, ch)
  }
  return ch
}
function drop(key: string) { const ch = channels.get(key); if (!ch) return; clearTimeout(ch.timer); for (const l of ch.listeners) l(null); channels.delete(key) }

/** the reporter one request uses: `stage` says what it is doing now, `end` that it is finished */
export function progressFor(userId: string, requestId: string) {
  const key = keyOf(userId, requestId)
  return {
    stage(text: string, done?: number, total?: number) {
      const ch = channel(key)
      const s: Stage = { text, ...(done !== undefined ? { done } : {}), ...(total !== undefined ? { total } : {}), at: Date.now() }
      ch.stages.push(s); if (ch.stages.length > 50) ch.stages.shift()
      clearTimeout(ch.timer); ch.timer = setTimeout(() => drop(key), KEEP_MS); ch.timer.unref?.()
      for (const l of ch.listeners) l(s)
    },
    end() { const ch = channels.get(key); if (!ch) return; ch.ended = true; for (const l of ch.listeners) l(null) },
  }
}

/** follow one request's stages: the ones so far, then each new one; `null` when it is finished. Returns the way to stop following. */
export function followProgress(userId: string, requestId: string, onStage: Listener): () => void {
  const ch = channel(keyOf(userId, requestId))
  for (const s of ch.stages) onStage(s)
  if (ch.ended) { onStage(null); return () => {} }
  ch.listeners.add(onStage)
  return () => ch.listeners.delete(onStage)
}

export type ProgressReporter = ReturnType<typeof progressFor>
