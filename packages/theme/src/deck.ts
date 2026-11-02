import type { Slide } from '@prompttoppt/validation'

/** Facts about a deck that the editor and the server must agree on (the assistant reasons with them, the editor applies with them). */

/** A slide's own headline, whatever its layout calls it. */
export const slideTitle = (content: unknown): string => {
  const c = (content ?? {}) as Record<string, unknown>
  return String(c['title'] ?? c['quote'] ?? c['headline'] ?? c['heading'] ?? c['label'] ?? '').replace(/\s+/g, ' ').slice(0, 90)
}

/** The solid background colour most slides share (upper case), ignoring one slide; null when no slide has a solid colour. */
export function commonSlideBackground(slides: readonly Pick<Slide, 'id' | 'background'>[], exceptSlideId = ''): string | null {
  const count = new Map<string, number>()
  for (const s of slides) if (s.id !== exceptSlideId && s.background?.type === 'color') count.set(s.background.value.toUpperCase(), (count.get(s.background.value.toUpperCase()) ?? 0) + 1)
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
