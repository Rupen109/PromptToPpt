import dates from './page-dates.generated.json'

/**
 * When a page's content last really changed (from git, written before every build by scripts/gen-page-dates.mjs). Used for the sitemap's lastmod and the
 * dateModified of the page's structured data, so the dates are true. A dynamic page (a template, a collection) takes the date of its route and data.
 * No date is given when it is not known (a build without git history), never a made-up one.
 */
const D = dates as Record<string, string>
export function pageDate(path: string): Date | undefined {
  const exact = D[path] ?? D[path.replace(/\/[^/]+$/, '/*')]
  return exact ? new Date(exact) : undefined
}
/** `{ dateModified }` to spread into a page's JSON-LD (nothing when the date is unknown) */
export const modified = (path: string): { dateModified?: string } => { const d = pageDate(path); return d ? { dateModified: d.toISOString() } : {} }
