import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { SUPPORTED_FONTS } from '@prompttoppt/theme'
import { GateError } from '../billing/errors.ts'
import { db } from '../db/index.ts'
import { brandKit, brandKitImage } from '../db/schema.ts'
import { assetIdFromUrl, assetUrl, checkRaster, deleteAsset, ownedAsset, storeAsset } from './assets.ts'
import { getStorage } from '../storage/index.ts'
import { imageSize } from '../export/png.ts'

/** How many brand kits a plan may keep (business decision: Pro 1, Gold 5; Starter none). */
export const MAX_KITS: Record<string, number> = { starter: 0, pro: 1, gold: 5 }
export const MAX_IMAGES_PER_KIT = 20
export const MAX_LOGO_BYTES = 2 * 1024 * 1024
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024

export interface KitView {
  id: string
  name: string
  colors: { primary: string | null; accent: string | null; extra: string[] }
  fonts: { heading: string | null; body: string | null }
  logo: { url: string; aspect: number } | null
  images: { id: string; name: string; url: string; aspect: number }[]
  sourceUrl: string | null
  isDefault: boolean
  updatedAt: string
}
export interface KitInput {
  name?: string | undefined
  primary?: string | null | undefined
  accent?: string | null | undefined
  extra?: string[] | undefined
  headingFont?: string | null | undefined
  bodyFont?: string | null | undefined
  sourceUrl?: string | null | undefined
  /** one of OUR asset URLs (e.g. the logo a website lookup saved for this user) */
  logoUrl?: string | undefined
}

export class KitError extends Error { constructor(public readonly code: 'NOT_FOUND' | 'INVALID' , message: string) { super(message) } }

const hex = (v: string | null | undefined): string | null => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null)
const font = (v: string | null | undefined): string | null => (v && SUPPORTED_FONTS.includes(v) ? v : null)

async function viewOf(rows: (typeof brandKit.$inferSelect)[]): Promise<KitView[]> {
  if (rows.length === 0) return []
  const imgs = await db.select().from(brandKitImage).where(inArray(brandKitImage.kitId, rows.map((r) => r.id))).orderBy(asc(brandKitImage.createdAt))
  return rows.map((k) => ({
    id: k.id, name: k.name,
    colors: { primary: k.primaryColor, accent: k.accentColor, extra: k.extraColors },
    fonts: { heading: k.headingFont, body: k.bodyFont },
    logo: k.logoAssetId && k.logoAspect ? { url: assetUrl(k.logoAssetId), aspect: Number(k.logoAspect) } : null,
    images: imgs.filter((i) => i.kitId === k.id).map((i) => ({ id: i.id, name: i.name, url: assetUrl(i.assetId), aspect: Number(i.aspect) })),
    sourceUrl: k.sourceUrl, isDefault: k.isDefault, updatedAt: k.updatedAt.toISOString(),
  }))
}

export async function listKits(userId: string): Promise<KitView[]> {
  return viewOf(await db.select().from(brandKit).where(eq(brandKit.userId, userId)).orderBy(desc(brandKit.isDefault), asc(brandKit.createdAt)))
}
export async function getKit(userId: string, id: string): Promise<KitView | null> {
  const [row] = await db.select().from(brandKit).where(and(eq(brandKit.id, id), eq(brandKit.userId, userId)))
  return row ? (await viewOf([row]))[0]! : null
}
export async function defaultKit(userId: string): Promise<KitView | null> {
  const [row] = await db.select().from(brandKit).where(and(eq(brandKit.userId, userId), eq(brandKit.isDefault, true)))
  return row ? (await viewOf([row]))[0]! : null
}

/** The logo behind one of our asset URLs, if it is the user's own logo: its asset id and the aspect measured from the stored bytes. */
async function logoFromUrl(userId: string, url: string): Promise<{ assetId: string; aspect: number }> {
  const assetId = assetIdFromUrl(url)
  const row = assetId ? await ownedAsset(userId, assetId, ['logo']) : null
  if (!assetId || !row) throw new KitError('INVALID', 'That logo is not available. Upload it again.')
  const bytes = await (await getStorage()).get(row.storageKey)
  const size = bytes ? imageSize(Buffer.from(bytes)) : null
  if (!size) throw new KitError('INVALID', 'That logo could not be read. Upload it again.')
  return { assetId, aspect: Math.round((size.w / size.h) * 1000) / 1000 }
}

export async function createKit(userId: string, planId: string, input: KitInput): Promise<KitView> {
  const cap = MAX_KITS[planId] ?? 0
  if (cap === 0) throw new GateError('UPGRADE_REQUIRED', 'Brand kits are available on Pro and Gold.', 403, { feature: 'brand' })
  const logo = input.logoUrl ? await logoFromUrl(userId, input.logoUrl) : null
  const id = nanoid(16)
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'brandkit:' + userId}))`) // two parallel creates must not both slip under the cap
    const mine = await tx.select({ id: brandKit.id }).from(brandKit).where(eq(brandKit.userId, userId))
    if (mine.length >= cap) throw new GateError('LIMIT_REACHED', cap === 1 ? 'Your plan includes 1 brand kit. Edit it, or upgrade for more.' : `Your plan includes ${cap} brand kits.`, 429, { feature: 'brand', limit: cap })
    await tx.insert(brandKit).values({
      id, userId, name: (input.name ?? '').trim().slice(0, 60) || 'My brand',
      primaryColor: hex(input.primary), accentColor: hex(input.accent), extraColors: (input.extra ?? []).map(hex).filter((x): x is string => !!x).slice(0, 8),
      headingFont: font(input.headingFont), bodyFont: font(input.bodyFont), sourceUrl: input.sourceUrl?.slice(0, 2000) ?? null,
      logoAssetId: logo?.assetId ?? null, logoAspect: logo ? String(logo.aspect) : null, isDefault: mine.length === 0, // the first kit is the default
    })
  })
  return (await getKit(userId, id))!
}

export async function updateKit(userId: string, id: string, patch: KitInput & { isDefault?: boolean | undefined; removeLogo?: boolean | undefined }): Promise<KitView> {
  const kit = await getKit(userId, id)
  if (!kit) throw new KitError('NOT_FOUND', 'Brand kit not found')
  const set: Partial<typeof brandKit.$inferInsert> = { updatedAt: new Date() }
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 60) || kit.name
  if (patch.primary !== undefined) set.primaryColor = hex(patch.primary)
  if (patch.accent !== undefined) set.accentColor = hex(patch.accent)
  if (patch.extra !== undefined) set.extraColors = patch.extra.map(hex).filter((x): x is string => !!x).slice(0, 8)
  if (patch.headingFont !== undefined) set.headingFont = font(patch.headingFont)
  if (patch.bodyFont !== undefined) set.bodyFont = font(patch.bodyFont)
  if (patch.removeLogo) { if (kit.logo) await deleteAsset(userId, assetIdFromUrl(kit.logo.url)!, id); set.logoAssetId = null; set.logoAspect = null }
  await db.transaction(async (tx) => {
    if (patch.isDefault === true) await tx.update(brandKit).set({ isDefault: false }).where(and(eq(brandKit.userId, userId), ne(brandKit.id, id)))
    if (patch.isDefault !== undefined && !(patch.isDefault === false && kit.isDefault)) set.isDefault = patch.isDefault // the default kit cannot simply be un-defaulted: make another one the default instead
    await tx.update(brandKit).set(set).where(and(eq(brandKit.id, id), eq(brandKit.userId, userId)))
  })
  return (await getKit(userId, id))!
}

export async function deleteKit(userId: string, id: string): Promise<void> {
  const kit = await getKit(userId, id)
  if (!kit) throw new KitError('NOT_FOUND', 'Brand kit not found')
  for (const a of [kit.logo?.url, ...kit.images.map((i) => i.url)]) { const aid = a ? assetIdFromUrl(a) : null; if (aid) await deleteAsset(userId, aid, id) }
  await db.delete(brandKit).where(and(eq(brandKit.id, id), eq(brandKit.userId, userId))) // its pictures go with it (foreign key)
  if (kit.isDefault) { // another kit takes over as the default
    const [next] = await db.select({ id: brandKit.id }).from(brandKit).where(eq(brandKit.userId, userId)).orderBy(asc(brandKit.createdAt)).limit(1)
    if (next) await db.update(brandKit).set({ isDefault: true }).where(eq(brandKit.id, next.id))
  }
}

export async function setKitLogo(userId: string, id: string, bytes: Buffer): Promise<KitView> {
  const kit = await getKit(userId, id)
  if (!kit) throw new KitError('NOT_FOUND', 'Brand kit not found')
  const info = (() => { try { return checkRaster(bytes, { maxBytes: MAX_LOGO_BYTES, minSide: 48, maxAspect: 6 }) } catch (e) { throw new KitError('INVALID', (e as Error).message) } })()
  const assetId = await storeAsset(userId, 'logo', bytes, info.mime, `logo:${kit.name}`)
  if (kit.logo) await deleteAsset(userId, assetIdFromUrl(kit.logo.url)!, id)
  await db.update(brandKit).set({ logoAssetId: assetId, logoAspect: String(info.aspect), updatedAt: new Date() }).where(and(eq(brandKit.id, id), eq(brandKit.userId, userId)))
  return (await getKit(userId, id))!
}

export async function addKitImage(userId: string, id: string, name: string, bytes: Buffer): Promise<KitView> {
  const kit = await getKit(userId, id)
  if (!kit) throw new KitError('NOT_FOUND', 'Brand kit not found')
  if (kit.images.length >= MAX_IMAGES_PER_KIT) throw new GateError('LIMIT_REACHED', `A brand kit holds up to ${MAX_IMAGES_PER_KIT} pictures.`, 429, { feature: 'brand-images', limit: MAX_IMAGES_PER_KIT })
  const info = (() => { try { return checkRaster(bytes, { maxBytes: MAX_IMAGE_BYTES, minSide: 32, maxAspect: 8 }) } catch (e) { throw new KitError('INVALID', (e as Error).message) } })()
  const assetId = await storeAsset(userId, 'brand', bytes, info.mime, `brand:${kit.name}:${name}`)
  await db.insert(brandKitImage).values({ id: nanoid(16), kitId: id, userId, assetId, name: name.trim().slice(0, 80) || 'Picture', aspect: String(info.aspect) })
  await db.update(brandKit).set({ updatedAt: new Date() }).where(eq(brandKit.id, id))
  return (await getKit(userId, id))!
}

export async function removeKitImage(userId: string, id: string, imageId: string): Promise<KitView> {
  const [img] = await db.select().from(brandKitImage).where(and(eq(brandKitImage.id, imageId), eq(brandKitImage.kitId, id), eq(brandKitImage.userId, userId)))
  if (!img) throw new KitError('NOT_FOUND', 'Picture not found')
  await deleteAsset(userId, img.assetId, id)
  await db.delete(brandKitImage).where(eq(brandKitImage.id, imageId))
  return (await getKit(userId, id))!
}
