import { and, desc, eq, isNull } from 'drizzle-orm'
import { assetUrl } from '../brand/assets.ts'
import { db } from '../db/index.ts'
import { brandKit, generatedAsset } from '../db/schema.ts'
import type { RunCtx } from './capabilities/types.ts'

/** The owner's own uploaded pictures, newest first (what "use my coffee photo" can name): the same list as "My uploads". */
export async function loadUploads(ownerId: string, limit = 30): Promise<RunCtx['uploads']> {
  const rows = await db.select({ id: generatedAsset.id, label: generatedAsset.prompt }).from(generatedAsset)
    .where(and(eq(generatedAsset.userId, ownerId), eq(generatedAsset.kind, 'brand'), eq(generatedAsset.model, 'upload'), eq(generatedAsset.status, 'ready'), isNull(generatedAsset.deletedAt)))
    .orderBy(desc(generatedAsset.createdAt)).limit(limit)
  return rows.map((r) => ({ id: r.id, url: assetUrl(r.id), name: r.label ?? 'upload' }))
}

/** All the owner's saved brand kits (default first), for "use my Acme kit" and for changing kits from the chat. */
export async function loadBrandKits(ownerId: string): Promise<import('./capabilities/brand-kit.ts').KitInfo[]> {
  const rows = await db.select().from(brandKit).where(eq(brandKit.userId, ownerId)).orderBy(desc(brandKit.isDefault), desc(brandKit.updatedAt))
  return rows.map((k) => ({ id: k.id, name: k.name, primary: k.primaryColor, accent: k.accentColor, headingFont: k.headingFont, bodyFont: k.bodyFont, isDefault: k.isDefault }))
}

/** The owner's default brand kit (else the newest), in the shape the capability needs; null when they have none. */
export async function loadBrand(ownerId: string): Promise<RunCtx['brand']> {
  const [k] = await db.select().from(brandKit).where(eq(brandKit.userId, ownerId)).orderBy(desc(brandKit.isDefault), desc(brandKit.updatedAt)).limit(1)
  if (!k) return null
  return {
    name: k.name, primary: k.primaryColor, accent: k.accentColor, headingFont: k.headingFont, bodyFont: k.bodyFont,
    logo: k.logoAssetId && k.logoAspect ? { url: assetUrl(k.logoAssetId), aspect: Number(k.logoAspect) } : null,
  }
}
