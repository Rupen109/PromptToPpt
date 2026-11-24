/** Typed registry of KNOWN feature flags. The DB (feature_flag) can override a flag's state, but never creates new keys. */
export interface FlagDef {
  description: string
  /** state when there is no DB row */
  default: boolean
}

export const FLAGS = {
  maintenance_mode: { description: 'Maintenance mode: new AI generation jobs and AI assistant/edit calls are refused with a friendly message. Everything else keeps working.', default: false },
  ai_assistant: { description: 'AI assistant and AI slide edits inside the editor.', default: true },
  assistant_v2: { description: 'The AI assistant runs the v2 pipeline (understand, resolve, do, check). Off = the old single-prompt assistant (fallback until v2 is signed off).', default: true },
  image_generation: { description: 'AI picture generation (also needs IMAGES_ENABLED in the server environment).', default: true },
  exports: { description: 'Exporting presentations (PPTX, PDF, images, HTML).', default: true },
  /** DEVELOPMENT ONLY: on by default outside production, off in production (and kept off there until a provider is APPROVED in code, media/bg-providers.ts, even if this is turned on) until a commercially approved model or provider is chosen. */
  background_removal: { description: 'Background removal editor (DEVELOPMENT ONLY: not available in production until a commercially approved model or provider is chosen).', default: process.env['NODE_ENV'] !== 'production' },
} as const satisfies Record<string, FlagDef>

export type FlagKey = keyof typeof FLAGS
export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[]
export const isFlagKey = (k: string): k is FlagKey => Object.hasOwn(FLAGS, k)
