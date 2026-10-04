/** Joins class names, skipping falsy values. (Deliberately tiny — no dependency.) */
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')
