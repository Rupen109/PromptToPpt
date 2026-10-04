import type { Theme } from '@prompttoppt/validation'
import { CATEGORIES, type CategoryId } from './categories'
import { DESIGN_ROWS } from './designs'
import { FONT_PAIRS, KITS, MAX_WEIGHT, MOTIONS } from './kits'
import { makeColors } from '../palette'

export interface TemplateDesign {
  id: string
  name: string
  category: CategoryId
  tagline: string
  /** zero-based position inside its category */
  index: number
  /** which of the category's photos this design starts from. Defaults to `index`; fixed per design so re-ordering the list never changes a template's pictures */
  photoSeed: number
  /** Starter gets the first 3 designs of every category; the rest need `premiumTemplates` (Pro+). */
  premium: boolean
  kit: string
  motion: string
  theme: Theme
}

/** How each design frames its pictures, from its title composition (odd-numbered `bar` designs get arches, so neighbours differ). */
const PHOTO_FOR_TITLE: Record<string, NonNullable<Theme['style']>['photo']> = { split: 'split', diagonal: 'diagonal', center: 'full', band: 'full', stack: 'full', frame: 'frame', badge: 'circle', minimal: 'arch', bar: 'full' }

export const FREE_PER_CATEGORY = 3
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Largest weight the family really has that doesn't exceed the kit's request. */
function clampWeight(font: string, want: number): number {
  const max = MAX_WEIGHT[font] ?? 900
  return Math.min(want, max)
}

export const DESIGNS: TemplateDesign[] = CATEGORIES.flatMap((cat) =>
  DESIGN_ROWS[cat.id].map(([name, tagline, primary, accent, mode, bg, fonts, kit, motion, extra], index): TemplateDesign => {
    const [heading, body] = FONT_PAIRS[fonts]
    const k = KITS[kit] as Record<string, unknown> & { headingWeight?: number }
    const id = `${cat.id}-${slug(name)}`
    const theme: Theme = {
      id, name, templateId: id,
      colors: makeColors({ primary, accent, mode, ...(bg.startsWith('#') ? { ground: bg } : bg !== '-' ? { bg: bg as 'white' | 'warm' | 'cool' | 'sun' } : {}) }),
      fonts: { heading, body },
      radius: extra?.radius ?? 16,
      style: { ...KITS[kit], photo: kit === 'classicBar' && index % 2 ? 'arch' : PHOTO_FOR_TITLE[(KITS[kit] as { title: string }).title] ?? 'full', headingWeight: clampWeight(heading, k.headingWeight ?? 800), ...(extra?.style ?? {}) } as Theme['style'],
      motion: { ...MOTIONS[motion] } as Theme['motion'],
    }
    return { id, name, category: cat.id, tagline, index, photoSeed: extra?.seed ?? index, premium: index >= FREE_PER_CATEGORY, kit, motion, theme }
  }),
)

export const designById = (id: string) => DESIGNS.find((d) => d.id === id)
