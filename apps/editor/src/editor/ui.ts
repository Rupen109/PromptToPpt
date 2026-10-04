import { create } from 'zustand'
import type { SlideElement } from '@prompttoppt/validation'

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
  activeSlideId: string | null
  selection: string[]
  editingId: string | null
  drawer: 'style' | 'ai' | null
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
  activeSlideId: null,
  selection: [],
  editingId: null,
  drawer: null,
  notesOpen: false,
  clipboard: [],
  setActiveSlide: (id) => set({ activeSlideId: id, selection: [], editingId: null }),
  select: (ids, additive) => set((s) => ({ selection: additive ? [...new Set([...s.selection, ...ids])] : ids, editingId: null })),
  edit: (id) => set({ editingId: id, ...(id ? { selection: [id] } : {}) }),
  setDrawer: (drawer) => set((s) => ({ drawer: s.drawer === drawer ? null : drawer })),
  toggleNotes: (open) => set((s) => ({ notesOpen: open ?? !s.notesOpen })),
  setClipboard: (clipboard) => set({ clipboard }),
}))
