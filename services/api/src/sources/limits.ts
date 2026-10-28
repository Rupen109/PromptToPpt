/** Shared by every reader (kept apart from extract.ts so the readers can import it without importing each other). */
export const MAX_TEXT_CHARS = 200_000
export const clean = (s: string) => s.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
