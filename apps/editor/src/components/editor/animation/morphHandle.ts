import type { MorphHandle } from '@prompttoppt/ui'
/** The running Morph preview's handle (set by the preview on the canvas, used by the Morph panel's Replay and scrubber). */
export const morphPreviewHandle: { current: MorphHandle | null } = { current: null }
