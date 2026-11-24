/**
 * Background removal: the shapes shared by every module. The editor works with ONE standard result, a foreground alpha mask, and never with a model or a provider: inference (providers/),
 * mask editing (mask.ts), compositing (composite.ts), rendering (renderer.ts) and exporting (worker.ts) are separate modules that only meet here.
 */

/** A foreground alpha mask: one 0-255 value per pixel, row by row, 255 = the subject, 0 = background. */
export interface ForegroundMask {
  width: number
  height: number
  data: Uint8Array
}

export type SegmentPhase = 'preparing' | 'loading-model' | 'segmenting' | 'refining'
export interface SegmentProgress { phase: SegmentPhase; /** 0 to 1 when known (a model download), absent when it cannot be known */ fraction?: number }

/** What a provider is given: the picture's own bytes and size, and where it lives (only for a provider that works from our server's copy). */
export interface SegmentInput {
  image: Blob
  width: number
  height: number
  source?: { deckId: string; url: string }
}
export interface SegmentOptions { signal?: AbortSignal; onProgress?: (p: SegmentProgress) => void }

export type ProviderKind = 'browser-onnx' | 'commercial-api' | 'self-hosted' | 'mock'
export type MaskKind = 'matte' | 'binary'

/** What a provider can do and what using it means for the person's picture. The dialog decides from this (size limits, a privacy line), never from a provider's name. */
export interface ProviderCapabilities {
  kind: ProviderKind
  /** the most pixels (width x height) and the longest side this provider accepts; the dialog refuses a bigger picture BEFORE calling it */
  maxInputPixels: number
  maxInputSide: number
  /** true when the picture leaves the person's device (an API, our server): the dialog says so */
  imageLeavesDevice: boolean
  /** the longest side of the mask the provider really computes (the dialog brings it up to the picture's size) */
  nativeMaskSide: number
  /** a soft alpha matte (keeps hair and glass) or a hard in/out mask */
  maskKind: MaskKind
}

/** The record that lets a provider run in a PRODUCTION build: who approved it, when, and where the licence/terms review is written down. A provider without it is for development only. */
export interface ProviderApproval { approvedBy: string; approvedAt: string; evidence: string }

export type ProviderErrorCode = 'unsupported' | 'too-large' | 'no-subject' | 'busy' | 'quota' | 'network' | 'unavailable' | 'aborted' | 'bad-output'

/** What a provider throws: a code the editor can act on (retry or not) and a sentence a person can read. */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly retryable: boolean
  constructor(code: ProviderErrorCode, message: string, retryable = defaultRetryable(code)) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.retryable = retryable
  }
}
const defaultRetryable = (c: ProviderErrorCode) => c === 'busy' || c === 'network' || c === 'unavailable' || c === 'aborted'

/**
 * Anything that can find the subject of a picture: our server model, a commercial API, a browser model or a test stand-in. It returns a mask at ANY size (the dialog brings it to the
 * picture's own size), throws a ProviderError when it cannot, and must stop and throw when `signal` is aborted.
 */
export interface SegmentationProvider {
  readonly id: string
  readonly label: string
  readonly capabilities: ProviderCapabilities
  /** absent = development only: a production build refuses the provider (providers/index.ts) */
  readonly approval?: ProviderApproval
  /** get ready (load weights, wake an endpoint) before the first picture; optional */
  warmUp?(opts?: SegmentOptions): Promise<void>
  segment(input: SegmentInput, opts?: SegmentOptions): Promise<ForegroundMask>
  /** let go of whatever the provider holds (sessions, GPU buffers); called when the dialog closes */
  dispose?(): void
}

export type BackgroundSpec =
  | { kind: 'transparent' }
  | { kind: 'color'; color: string }
  | { kind: 'image' }

export interface Rect { x: number; y: number; w: number; h: number }
