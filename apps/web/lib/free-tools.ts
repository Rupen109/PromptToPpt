import { ApiError, type FreeOutline } from '@prompttoppt/api-client'
import { api } from './api'
import { EDITOR_URL } from './env'

/** Free-tool results turned into the prompt the editor's create flow starts from (the API caps prompts at 4000 characters). */
export function outlineToPrompt(o: FreeOutline, extra = ''): string {
  const body = o.slides.map((s, i) => `${i + 1}. ${s.title}${s.points.length ? ` — ${s.points.join('; ')}` : ''}`).join('\n')
  const text = `Create a presentation titled "${o.title}" with exactly ${o.slides.length} slides, following this outline:\n${body}${extra ? `\n${extra}` : ''}`
  return text.length <= 3900 ? text : `${text.slice(0, 3890)}…`
}

/** Store the prompt (and, for PDFs, the already-parsed document) server-side and hand the editor an opaque draft id. Never put text in a URL. */
export async function openInEditor(prompt: string, attachmentIds: string[] = []): Promise<void> {
  const { id } = await api.createDraft(prompt, attachmentIds)
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- cross-origin editor subdomain
  window.location.assign(`${EDITOR_URL}/start?draft=${encodeURIComponent(id)}`)
}

export const toolError = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)
