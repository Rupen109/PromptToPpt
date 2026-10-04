/** Typed registry of KNOWN feature flags. The DB (feature_flag) can override a flag's state, but never creates new keys. */
export interface FlagDef {
  description: string
  /** state when there is no DB row */
  default: boolean
}

export const FLAGS = {
  maintenance_mode: { description: 'Maintenance mode: new AI generation jobs and AI assistant/edit calls are refused with a friendly message. Everything else keeps working.', default: false },
  ai_assistant: { description: 'AI assistant and AI slide edits inside the editor.', default: true },
  image_generation: { description: 'AI picture generation (also needs IMAGES_ENABLED in the server environment).', default: true },
  exports: { description: 'Exporting presentations (PPTX, PDF, images, HTML).', default: true },
} as const satisfies Record<string, FlagDef>

export type FlagKey = keyof typeof FLAGS
export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[]
export const isFlagKey = (k: string): k is FlagKey => Object.hasOwn(FLAGS, k)
