import { create } from 'zustand'
import type { SlideElement } from '@prompttoppt/validation'
import { editorOf, useLive } from './live'

export interface ImageDialogRequest {
  prompt?: string
  /** the picture frame being filled/replaced, if any */
  elementId?: string
}

/** Transient UI state — deliberately NOT part of the document and never persisted (spec §9). */
interface UiState {
  imageDialog: ImageDialogRequest | null
  openImageDialog: (req?: ImageDialogRequest) => void
  closeImageDialog: () => void
  /** the table whose cells are being edited (double-click a table) */
  tableEditId: string | null
  editTable: (id: string | null) => void
  activeSlideId: string | null
  selection: string[]
  editingId: string | null
  drawer: 'style' | 'ai' | 'comments' | null
  notesOpen: boolean
  clipboard: SlideElement[]
  setActiveSlide: (id: string | null) => void
  select: (ids: string[], additive?: boolean) => void
  edit: (id: string | null) => void
  setDrawer: (d: UiState['drawer']) => void
  toggleNotes: (open?: boolean) => void
  setClipboard: (els: SlideElement[]) => void
}

export const useUi = create<UiState>((set) => ({
  imageDialog: null,
  openImageDialog: (req = {}) => set({ imageDialog: req }),
  closeImageDialog: () => set({ imageDialog: null }),
  tableEditId: null,
  editTable: (tableEditId) => set({ tableEditId }),
  activeSlideId: null,
  selection: [],
  editingId: null,
  drawer: null,
  notesOpen: false,
  clipboard: [],
  setActiveSlide: (id) => set({ activeSlideId: id, selection: [], editingId: null }),
  select: (ids, additive) => set((s) => ({ selection: additive ? [...new Set([...s.selection, ...ids])] : ids, editingId: null })),
  edit: (id) => {
    // two people typing into the same text box would overwrite each other: while a collaborator is editing it, it is theirs
    const other = id ? editorOf(id) : null
    if (other) { useLive.setState({ notice: `${other.name} is editing this text right now.` }); return }
    set({ editingId: id, ...(id ? { selection: [id] } : {}) })
  },
  setDrawer: (drawer) => set((s) => ({ drawer: s.drawer === drawer ? null : drawer })),
  toggleNotes: (open) => set((s) => ({ notesOpen: open ?? !s.notesOpen })),
  setClipboard: (clipboard) => set({ clipboard }),
}))
