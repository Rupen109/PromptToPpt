import { create } from 'zustand'
import { ApiError, type CommentPerson, type CommentThread } from '@prompttoppt/api-client'
import { api } from '@/lib/api'

/**
 * Comments on slides. They are NOT part of the deck document (never saved with it, never in undo, never exported): this store just mirrors what the server
 * holds and re-reads it when someone changes something (live event), when the tab regains focus, and every minute as a safety net.
 */
export const MAX_BODY = 2000
export const SIZE = { open: 'open', resolved: 'resolved' } as const

interface Pending { slideId: string; x: number; y: number }
interface CommentsState {
  deckId: string | null
  threads: CommentThread[]
  people: CommentPerson[]
  /** comments by other people newer than the last time the panel was opened */
  seenAt: string
  loaded: boolean
  error: string | null
  /** pin mode: the next click on the slide chooses where the comment goes */
  placing: boolean
  /** where the new comment will be pinned (null = the slide as a whole) */
  pending: Pending | null
  /** the thread to bring into view / highlight (from clicking a pin or a bubble) */
  focus: string | null
  start: (deckId: string) => void
  stop: () => void
  refresh: () => void
  setPlacing: (v: boolean) => void
  setPending: (p: Pending | null) => void
  setFocus: (id: string | null) => void
  markSeen: () => Promise<void>
}

let timer: ReturnType<typeof setTimeout> | null = null
let inflight = false
export const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')

export const useComments = create<CommentsState>((set, get) => ({
  deckId: null, threads: [], people: [], seenAt: new Date(0).toISOString(), loaded: false, error: null, placing: false, pending: null, focus: null,
  start: (deckId) => { if (get().deckId === deckId) return; set({ deckId, threads: [], people: [], loaded: false, error: null, placing: false, pending: null, focus: null }); get().refresh() },
  stop: () => { if (timer) clearTimeout(timer); timer = null; set({ deckId: null, threads: [], people: [], loaded: false, placing: false, pending: null }) },
  refresh: () => {
    // several events in a row (someone posting a few replies) become one read
    if (timer) return
    timer = setTimeout(async () => {
      timer = null
      const id = get().deckId
      if (!id || inflight) return
      inflight = true
      try {
        const d = await api.comments(id)
        if (get().deckId === id) set({ threads: d.threads, people: d.people, seenAt: d.seenAt, loaded: true, error: null })
      } catch (e) { if (get().deckId === id) set({ loaded: true, error: e instanceof ApiError && e.status === 404 ? null : messageOf(e) }) } finally { inflight = false }
    }, 150)
  },
  setPlacing: (placing) => set({ placing }),
  setPending: (pending) => set({ pending, placing: false }),
  setFocus: (focus) => set({ focus }),
  markSeen: async () => {
    const id = get().deckId; if (!id) return
    try { const r = await api.markCommentsSeen(id); set({ seenAt: r.seenAt }) } catch { /* the dot just stays until the next try */ }
  },
}))

// ─── helpers the panel and the rail share ────────────────────────────────────
export const openCount = (threads: CommentThread[]) => threads.filter((t) => t.status === 'open').length
export const isUnread = (t: CommentThread, seenAt: string) => t.comments.some((c) => !c.mine && c.createdAt > seenAt)
export const unreadCount = (threads: CommentThread[], seenAt: string) => threads.reduce((n, t) => n + t.comments.filter((c) => !c.mine && c.createdAt > seenAt).length, 0)

const TOKEN = /@\{([A-Za-z0-9_-]{6,64})\}/g
/** `@{userId}` → `@Name` for showing and editing */
export const showMentions = (body: string, people: CommentPerson[]) => body.replace(TOKEN, (_m, id: string) => `@${people.find((p) => p.id === id)?.name ?? 'former member'}`)
/** The picks that are still in the text: a person chosen earlier and then deleted from the box must not be remembered (the latest picks of a name win). */
export function prunePicks(text: string, picks: { id: string; name: string }[]): { id: string; name: string }[] {
  const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const keep = new Set<number>()
  for (const name of new Set(picks.map((p) => p.name))) {
    const present = (text.match(new RegExp(`@${esc(name)}(?![\\p{L}\\p{N}_])`, 'gu')) ?? []).length
    if (present === 0) continue
    picks.map((p, i) => [p, i] as const).filter(([p]) => p.name === name).slice(-present).forEach(([, i]) => keep.add(i))
  }
  return picks.filter((_, i) => keep.has(i))
}

/**
 * `@Name` typed by a person → `@{userId}` for sending. Anyone chosen from the list is matched exactly (`picks`, in the order picked), so two people with the
 * same name never get mixed up. A name typed by hand is only turned into a mention when exactly one person has it — never a guess.
 */
export function encodeMentions(text: string, people: CommentPerson[], picks: { id: string; name: string }[] = []): string {
  const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let out = text
  for (const p of picks) {
    const re = new RegExp(`@${esc(p.name)}(?![\\p{L}\\p{N}_])`, 'u')
    out = out.replace(re, `@{${p.id}}`)
  }
  for (const p of [...people].sort((a, b) => b.name.length - a.name.length)) {
    if (!p.name.trim() || people.filter((x) => x.name === p.name).length > 1) continue
    out = out.replace(new RegExp(`@${esc(p.name)}(?![\\p{L}\\p{N}_])`, 'gu'), `@{${p.id}}`)
  }
  return out
}
