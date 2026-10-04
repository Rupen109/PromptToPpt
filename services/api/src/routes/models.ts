import { Hono } from 'hono'
import { catalog } from '../ai/gateway.ts'
import type { CatalogRow } from '../ai/registry-db.ts'
import { creditPrice } from '../billing/credits.ts'
import { getEntitlements } from '../billing/entitlements.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import type { AccessTier, Entitlements } from '@prompttoppt/validation'

export const models = new Hono<AppEnv>()
models.use('*', requireAuth)

/** The model a user gets when they don't choose: the best tier their plan allows below frontier, first by sort order. */
export function defaultModel(ent: Pick<Entitlements, 'features'>, rows: CatalogRow[]): CatalogRow | undefined {
  const text = rows.filter((r) => r.kind === 'text' && ent.features.modelTiers.includes(r.accessTier as AccessTier))
  const rank = (t: string) => (t === 'premium' ? 0 : t === 'starter' ? 1 : 2)
  return [...text].sort((a, b) => rank(a.accessTier) - rank(b.accessTier) || (a.routeQuality ?? 99) - (b.routeQuality ?? 99) || a.sortOrder - b.sortOrder)[0]
}

/**
 * Every selectable model, with a lock flag for models outside the user's plan (so the UI can show them with an upgrade
 * badge instead of hiding them). Prices shown are CREDITS, not provider dollars.
 */
models.get('/', async (c) => {
  const [ent, { rows }] = await Promise.all([getEntitlements(c.get('session')!.user.id), catalog()])
  const perSlide: Record<AccessTier, number> = { starter: await creditPrice('generate_slide', 'starter'), premium: await creditPrice('generate_slide', 'premium'), frontier: await creditPrice('generate_slide', 'frontier') }
  const editPrice: Record<AccessTier, number> = { starter: await creditPrice('ai_edit', 'starter'), premium: await creditPrice('ai_edit', 'premium'), frontier: await creditPrice('ai_edit', 'frontier') }
  const kind = c.req.query('kind') === 'image' ? 'image' : 'text'
  const imagePrice: Record<AccessTier, number> = { starter: await creditPrice('image', 'starter'), premium: await creditPrice('image', 'premium'), frontier: await creditPrice('image', 'frontier') }
  const text = rows.filter((r) => r.kind === kind)
  return c.json({
    success: true,
    data: {
      default: (kind === 'image' ? rows.find((r) => r.kind === 'image' && ent.features.modelTiers.includes(r.accessTier as AccessTier)) : defaultModel(ent, rows))?.id ?? null,
      models: text.map((r) => ({
        id: r.id, displayName: r.displayName, vendor: r.vendor, description: r.description, tier: r.accessTier,
        allowed: ent.features.modelTiers.includes(r.accessTier as AccessTier), creditsPerSlide: perSlide[r.accessTier as AccessTier], creditsPerEdit: editPrice[r.accessTier as AccessTier], creditsPerImage: imagePrice[r.accessTier as AccessTier],
      })),
    },
  })
})
