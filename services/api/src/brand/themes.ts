import { and, desc, eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { brandTheme as themeOf, designById } from '@prompttoppt/theme'
import type { Theme } from '@prompttoppt/validation'
import { GateError } from '../billing/errors.ts'
import { db } from '../db/index.ts'
import { brandTheme } from '../db/schema.ts'
import { KitError, assertBrand, listKits, type KitView } from './kits.ts'

/**
 * THEMES made from a brand kit ("create a theme from this kit"): a design in light or dark with the kit's colours, fonts and logo, saved under a name and used like a template
 * (Brand tab → Apply, a new deck built in it, the assistant). Only the inputs are stored; the theme is worked out from the kit AS IT IS NOW (packages/theme brand-theme.ts), so
 * editing a kit changes its themes, and deleting the kit deletes them. Same gate as kits (`assertBrand`); a Pro design needs `premiumTemplates`, as when it is picked as a template.
 */
export const MAX_BRAND_THEMES = 20

export interface BrandThemeView {
  id: string
  name: string
  kitId: string
  kitName: string
  designId: string
  designName: string
  mode: 'light' | 'dark'
  /** the theme as it is now (the kit's current colours, fonts and logo) */
  theme: Theme
  createdAt: string
}
export interface BrandThemeInput { kitId: string; designId: string; mode: 'light' | 'dark'; name?: string | undefined }

/** the theme of a kit + design + mode: ONE place for the API (the editor and the generator get it from here) */
export function kitTheme(kit: Pick<KitView, 'name' | 'colors' | 'fonts' | 'logo'>, designId: string, mode: 'light' | 'dark', name: string, id?: string): Theme | null {
  const design = designById(designId)
  if (!design) return null
  return themeOf(design, mode, { primary: kit.colors.primary, accent: kit.colors.accent, headingFont: kit.fonts.heading, bodyFont: kit.fonts.body, name: kit.name, logo: kit.logo }, name, id)
}

const viewOf = (row: typeof brandTheme.$inferSelect, kits: KitView[]): BrandThemeView | null => {
  const kit = kits.find((k) => k.id === row.kitId)
  const theme = kit ? kitTheme(kit, row.designId, row.mode, row.name, `brand-theme-${row.id}`) : null
  if (!kit || !theme) return null // (a design that was retired: the theme is not offered)
  return { id: row.id, name: row.name, kitId: kit.id, kitName: kit.name, designId: row.designId, designName: designById(row.designId)!.name, mode: row.mode, theme, createdAt: row.createdAt.toISOString() }
}

export async function listBrandThemes(userId: string): Promise<BrandThemeView[]> {
  const rows = await db.select().from(brandTheme).where(eq(brandTheme.userId, userId)).orderBy(desc(brandTheme.createdAt))
  if (!rows.length) return []
  const kits = await listKits(userId)
  return rows.map((r) => viewOf(r, kits)).filter((v): v is BrandThemeView => !!v)
}

export async function getBrandTheme(userId: string, id: string): Promise<BrandThemeView | null> {
  const [row] = await db.select().from(brandTheme).where(and(eq(brandTheme.id, id), eq(brandTheme.userId, userId)))
  return row ? viewOf(row, await listKits(userId)) : null
}

export async function createBrandTheme(userId: string, ent: { features: { brandKit: boolean; premiumTemplates: boolean } }, input: BrandThemeInput): Promise<BrandThemeView> {
  assertBrand(ent)
  const kits = await listKits(userId)
  const kit = kits.find((k) => k.id === input.kitId)
  if (!kit) throw new KitError('NOT_FOUND', 'Brand kit not found')
  const design = designById(input.designId)
  if (!design) throw new KitError('INVALID', 'Unknown design')
  if (design.premium && !ent.features.premiumTemplates) throw new GateError('UPGRADE_REQUIRED', `"${design.name}" is a Pro template.`, 403, { feature: 'premiumTemplates' })
  const name = (input.name ?? '').trim().slice(0, 60) || `${kit.name} ${input.mode === 'dark' ? 'dark' : 'light'}`
  const id = nanoid(16)
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'brandtheme:' + userId}))`) // two parallel creates must not both slip under the cap
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(brandTheme).where(eq(brandTheme.userId, userId))
    if (n >= MAX_BRAND_THEMES) throw new GateError('LIMIT_REACHED', `You can keep ${MAX_BRAND_THEMES} brand themes. Delete one to make another.`, 429, { feature: 'brand', limit: MAX_BRAND_THEMES })
    await tx.insert(brandTheme).values({ id, userId, kitId: kit.id, name, designId: design.id, mode: input.mode })
  })
  return (await getBrandTheme(userId, id))!
}

export async function deleteBrandTheme(userId: string, id: string): Promise<void> {
  const gone = await db.delete(brandTheme).where(and(eq(brandTheme.id, id), eq(brandTheme.userId, userId))).returning({ id: brandTheme.id })
  if (!gone.length) throw new KitError('NOT_FOUND', 'Theme not found')
}
