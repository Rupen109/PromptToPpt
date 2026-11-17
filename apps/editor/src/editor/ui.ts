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
  chartEditId: string | null
  editChart: (id: string | null) => void
  activeSlideId: string | null
  selection: string[]
  editingId: string | null
  drawer: 'style' | 'ai' | 'comments' | 'animations' | 'selection' | 'morph' | null
  /** the ribbon strip under the toolbar (PowerPoint's Animations and Transitions tabs) */
  ribbon: 'animations' | 'transitions' | null
  /** the effect the Timing group and Effect Options edit (the one last clicked in the pane or the one of the selected object) */
  activeEffectId: string | null
  /** Animation Painter: the object whose animations the next click copies onto another object */
  painterFrom: string | null
  /** the motion-path effect being drawn or edited on the canvas */
  pathEditId: string | null
  /** while true the next stroke drawn on the canvas becomes the path of the effect being edited */
  pathDrawing: boolean
  /** an animation preview playing on the canvas in place: `only` = just these objects' effects, `fromEffectId` = start at that effect's click; `run` restarts it */
  preview: { run: number; only: string[] | null; fromEffectId: string | null } | null
  /** a transition preview (the transition into this slide) */
  transitionPreview: { run: number; /** stays on screen (the Morph scrubber) until stopped */ hold: boolean } | null
  notesOpen: boolean
  clipboard: SlideElement[]
  setActiveSlide: (id: string | null) => void
  select: (ids: string[], additive?: boolean) => void
  edit: (id: string | null) => void
  setDrawer: (d: UiState['drawer']) => void
  setRibbon: (r: UiState['ribbon']) => void
  setActiveEffect: (id: string | null) => void
  setPainter: (id: string | null) => void
  setPathEdit: (id: string | null, drawing?: boolean) => void
  setPathDrawing: (drawing: boolean) => void
  startPreview: (only?: string[] | null, fromEffectId?: string | null) => void
  stopPreview: () => void
  startTransitionPreview: (hold?: boolean) => void
  stopTransitionPreview: () => void
  toggleNotes: (open?: boolean) => void
  setClipboard: (els: SlideElement[]) => void
}

export const useUi = create<UiState>((set) => ({
  imageDialog: null,
  openImageDialog: (req = {}) => set({ imageDialog: req }),
  closeImageDialog: () => set({ imageDialog: null }),
  tableEditId: null,
  editTable: (tableEditId) => set({ tableEditId }),
  chartEditId: null,
  editChart: (chartEditId) => set({ chartEditId }),
  activeSlideId: null,
  selection: [],
  editingId: null,
  drawer: null,
  ribbon: null,
  activeEffectId: null,
  painterFrom: null,
  pathEditId: null,
  pathDrawing: false,
  preview: null,
  transitionPreview: null,
  notesOpen: false,
  clipboard: [],
  setActiveSlide: (id) => set({ activeSlideId: id, selection: [], editingId: null, activeEffectId: null, painterFrom: null, pathEditId: null, pathDrawing: false, preview: null, transitionPreview: null }),
  select: (ids, additive) => set((s) => ({ selection: additive ? [...new Set([...s.selection, ...ids])] : ids, editingId: null })),
  edit: (id) => {
    // two people typing into the same text box would overwrite each other: while a collaborator is editing it, it is theirs
    const other = id ? editorOf(id) : null
    if (other) { useLive.setState({ notice: `${other.name} is editing this text right now.` }); return }
    set({ editingId: id, ...(id ? { selection: [id] } : {}) })
  },
  setDrawer: (drawer) => set((s) => ({ drawer: s.drawer === drawer ? null : drawer })),
  setRibbon: (r) => set((s) => ({ ribbon: s.ribbon === r ? null : r, ...(s.ribbon === r ? { painterFrom: null, pathEditId: null, pathDrawing: false } : {}) })),
  setActiveEffect: (activeEffectId) => set({ activeEffectId }),
  setPainter: (painterFrom) => set({ painterFrom }),
  setPathEdit: (pathEditId, drawing = false) => set({ pathEditId, pathDrawing: !!pathEditId && drawing, ...(pathEditId ? { activeEffectId: pathEditId } : {}) }),
  setPathDrawing: (pathDrawing) => set({ pathDrawing }),
  startPreview: (only = null, fromEffectId = null) => set((s) => ({ preview: { run: (s.preview?.run ?? 0) + 1, only, fromEffectId }, transitionPreview: null })),
  stopPreview: () => set({ preview: null }),
  startTransitionPreview: (hold = false) => set((s) => ({ transitionPreview: { run: (s.transitionPreview?.run ?? 0) + 1, hold }, preview: null })),
  stopTransitionPreview: () => set({ transitionPreview: null }),
  toggleNotes: (open) => set((s) => ({ notesOpen: open ?? !s.notesOpen })),
  setClipboard: (clipboard) => set({ clipboard }),
}))
