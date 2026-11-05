import { Hono } from 'hono'
import { catalog } from '../ai/gateway.ts'
import type { CatalogRow } from '../ai/registry-db.ts'
import { creditPrice } from '../billing/credits.ts'
import { getEntitlements } from '../billing/entitlements.ts'
import { requireAuth, type AppEnv } from '../middleware/session.ts'
import type { AccessTier, Entitlements } from '@prompttoppt/validation'

export const models = new Hono<AppEnv>()
models.use('*', requireAuth)

/** The best model a plan's tiers allow: the fallback when none of the plan's own models is served by this deployment (a load-test or key-less setup). */
export function defaultModel(ent: Pick<Entitlements, 'features'>, rows: CatalogRow[]): CatalogRow | undefined {
  const text = rows.filter((r) => r.kind === 'text' && ent.features.modelTiers.includes(r.accessTier as AccessTier))
  const rank = (t: string) => (t === 'premium' ? 0 : t === 'starter' ? 1 : 2)
  return [...text].sort((a, b) => rank(a.accessTier) - rank(b.accessTier) || (a.routeQuality ?? 99) - (b.routeQuality ?? 99) || a.sortOrder - b.sortOrder)[0]
}

/** A model's name without its provider: "google/gemini-3.6-flash" and "gemini-3.6-flash" are the same model on OpenRouter and on Vertex. */
const stemOf = (r: CatalogRow) => r.modelId.split('/').pop()

/**
 * The model a request runs on: ONE rule for every place that writes or edits with a model.
 *  · Premium (`modelChoice`) may name a model; an id that is not in the served catalogue gives `undefined` (the route answers "that model is not available").
 *  · Every other plan is never asked and cannot choose: a model sent by an old client is ignored, and the plan's own models (`fixedModels`, best first) decide, the first one this deployment serves.
 *  · If none of them is served (a load-test deployment on Ollama, a key-less one on the mock), the plan's best allowed model is used, so the product still works.
 */
export function chooseModel(ent: Pick<Entitlements, 'features'>, rows: CatalogRow[], requestedId?: string): CatalogRow | undefined {
  if (requestedId && ent.features.modelChoice) return rows.find((r) => r.id === requestedId && r.kind === 'text')
  const text = rows.filter((r) => r.kind === 'text' && ent.features.modelTiers.includes(r.accessTier as AccessTier))
  for (const stem of ent.features.fixedModels) {
    const hit = text.find((r) => stemOf(r) === stem)
    if (hit) return hit
  }
  return defaultModel(ent, rows)
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
      /** true = this plan picks its model (Premium): show the picker. false = the plan uses its own models and is never asked */
      choice: ent.features.modelChoice,
      default: (kind === 'image' ? rows.find((r) => r.kind === 'image' && ent.features.modelTiers.includes(r.accessTier as AccessTier)) : chooseModel(ent, rows))?.id ?? null,
      models: text.map((r) => ({
        id: r.id, displayName: r.displayName, vendor: r.vendor, description: r.description, tier: r.accessTier,
        allowed: ent.features.modelTiers.includes(r.accessTier as AccessTier), creditsPerSlide: perSlide[r.accessTier as AccessTier], creditsPerEdit: editPrice[r.accessTier as AccessTier], creditsPerImage: imagePrice[r.accessTier as AccessTier],
      })),
    },
  })
})
