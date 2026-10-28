import { produce, type Draft } from 'immer'
import { create } from 'zustand'
import type { Presentation } from '@prompttoppt/validation'
import { applyDiff, diffDocs } from './docdiff'

/** One undo step = the deck before and after (they share almost all their memory). The change itself is derived by id on demand, so history survives collaborators' edits. */
interface Entry {
  label: string
  before: Presentation
  after: Presentation
  mergeKey?: string | undefined
  at: number
}

interface DocState {
  doc: Presentation | null
  /** server revision this copy is based on (optimistic-concurrency token for saves) */
  revision: number
  past: Entry[]
  future: Entry[]
  /** bumps on EVERY change incl. undo/redo — autosave subscribes to this */
  seq: number
  load: (doc: Presentation, revision: number) => void
  apply: (label: string, recipe: (d: Draft<Presentation>) => void, opts?: { mergeKey?: string }) => void
  undo: () => void
  redo: () => void
  setRevision: (revision: number) => void
  /** replace the document without touching history (used when adopting a restored/recovered copy) */
  replaceDoc: (doc: Presentation, revision: number) => void
  /** a collaborator's saved version replaced mine and I had nothing unsaved: not a local change (no seq bump → nothing to autosave), history kept */
  adoptRemote: (doc: Presentation, revision: number) => void
  /** their version merged with my unsaved edits: a local change that still has to be saved on top of their revision */
  mergeRemote: (doc: Presentation, revision: number) => void
}

const MAX_HISTORY = 200
const MERGE_WINDOW_MS = 1000

/**
 * The document store: ONLY serializable document state + its history (spec §9 "separate document state from UI state").
 * Every change is recorded as patches + inverse patches, so undo/redo is exact and cheap (no snapshots of the whole deck).
 * Rapid edits with the same `mergeKey` (typing, nudging) collapse into one undo step.
 */
export const useDoc = create<DocState>((set, get) => ({
  doc: null,
  revision: 1,
  past: [],
  future: [],
  seq: 0,
  load: (doc, revision) => set({ doc, revision, past: [], future: [], seq: 0 }),
  replaceDoc: (doc, revision) => set((s) => ({ doc, revision, seq: s.seq + 1 })),
  setRevision: (revision) => set({ revision }),
  adoptRemote: (doc, revision) => set({ doc, revision }),
  mergeRemote: (doc, revision) => set((s) => ({ doc, revision, seq: s.seq + 1 })),
  apply: (label, recipe, opts) => {
    const { doc, past } = get()
    if (!doc) return
    const next = produce(doc, recipe)
    if (next === doc) return
    const now = Date.now()
    const last = past[past.length - 1]
    let nextPast: Entry[]
    if (opts?.mergeKey && last?.mergeKey === opts.mergeKey && now - last.at < MERGE_WINDOW_MS) {
      nextPast = [...past.slice(0, -1), { ...last, after: next, at: now }] // typing / nudging collapses into one step: first "before", latest "after"
    } else {
      nextPast = [...past, { label, before: doc, after: next, mergeKey: opts?.mergeKey, at: now }].slice(-MAX_HISTORY)
    }
    set((s) => ({ doc: next, past: nextPast, future: [], seq: s.seq + 1 }))
  },
  undo: () => {
    const { doc, past, future } = get()
    const entry = past[past.length - 1]
    if (!doc || !entry) return
    set((s) => ({ doc: applyDiff(doc, diffDocs(entry.before, entry.after), 'backward', true), past: past.slice(0, -1), future: [...future, entry], seq: s.seq + 1 }))
  },
  redo: () => {
    const { doc, past, future } = get()
    const entry = future[future.length - 1]
    if (!doc || !entry) return
    set((s) => ({ doc: applyDiff(doc, diffDocs(entry.before, entry.after), 'forward', true), past: [...past, { ...entry, mergeKey: undefined }], future: future.slice(0, -1), seq: s.seq + 1 }))
  },
}))

export const canUndo = () => useDoc.getState().past.length > 0
export const canRedo = () => useDoc.getState().future.length > 0
export const nextUndoLabel = () => useDoc.getState().past.at(-1)?.label ?? null
