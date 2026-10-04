import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'
import { create } from 'zustand'
import type { Presentation } from '@prompttoppt/validation'

enablePatches()

interface Entry {
  label: string
  patches: Patch[]
  inverse: Patch[]
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
  apply: (label, recipe, opts) => {
    const { doc, past } = get()
    if (!doc) return
    const [next, patches, inverse] = produceWithPatches(doc, recipe)
    if (patches.length === 0) return
    const now = Date.now()
    const last = past[past.length - 1]
    let nextPast: Entry[]
    if (opts?.mergeKey && last?.mergeKey === opts.mergeKey && now - last.at < MERGE_WINDOW_MS) {
      // inverse of (A then B) = inverse(B) then inverse(A)
      nextPast = [...past.slice(0, -1), { ...last, patches: [...last.patches, ...patches], inverse: [...inverse, ...last.inverse], at: now }]
    } else {
      nextPast = [...past, { label, patches, inverse, mergeKey: opts?.mergeKey, at: now }].slice(-MAX_HISTORY)
    }
    set((s) => ({ doc: next, past: nextPast, future: [], seq: s.seq + 1 }))
  },
  undo: () => {
    const { doc, past, future } = get()
    const entry = past[past.length - 1]
    if (!doc || !entry) return
    set((s) => ({ doc: applyPatches(doc, entry.inverse), past: past.slice(0, -1), future: [...future, entry], seq: s.seq + 1 }))
  },
  redo: () => {
    const { doc, past, future } = get()
    const entry = future[future.length - 1]
    if (!doc || !entry) return
    set((s) => ({ doc: applyPatches(doc, entry.patches), past: [...past, { ...entry, mergeKey: undefined }], future: future.slice(0, -1), seq: s.seq + 1 }))
  },
}))

export const canUndo = () => useDoc.getState().past.length > 0
export const canRedo = () => useDoc.getState().future.length > 0
export const nextUndoLabel = () => useDoc.getState().past.at(-1)?.label ?? null
