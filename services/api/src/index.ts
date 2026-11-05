import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { env } from './env.ts'
import { seedBilling } from './billing/seed.ts'
import { configuredProviders, aiConfigured } from './ai/gateway.ts'
import { listCatalog } from './ai/registry-db.ts'
import { startWorker } from './generation/worker.ts'
import { startMediaWorker } from './media/worker.ts'
import { purgeExpiredDrafts } from './routes/drafts.ts'
import { purgeOldShareViews } from './routes/share-analytics.ts'

await seedBilling() // idempotent: inserts the default plan catalogue only if missing
// A key with no models to serve (AI_PROVIDER names a backend the catalogue has no rows for) would otherwise show up only as "the AI service is busy" on every request: say it at startup
if (aiConfigured && (await listCatalog(configuredProviders)).length === 0) console.error(`[ai] AI_PROVIDER=${env.AI_PROVIDER} is configured but the model catalogue has no enabled models for it, so every AI request will fail. Use vertex (dev), openrouter (production) or ollama, or add catalogue rows.`)

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

const worker = env.RUN_WORKER ? startWorker() : null
const stopMediaWorker = env.RUN_WORKER ? startMediaWorker() : () => {}
const purge = setInterval(() => void purgeExpiredDrafts().catch((e) => console.error('[purge]', e)), 10 * 60_000)
purge.unref()
const purgeViews = setInterval(() => void purgeOldShareViews().catch((e) => console.error('[purge views]', e)), 6 * 3600_000)
purgeViews.unref()

// A failure inside an outbound request to a site a user pointed us at (bad encoding, reset socket, ...) must never take the API down
// for everyone else. Those are logged and survived; anything else is a real bug in our own state, so exit and let the platform restart us.
const isOutboundError = (e: unknown) => {
  const x = e as { code?: string; stack?: string; name?: string } | null
  return !!x && (/undici|node:zlib|node:internal\/deps\/undici/.test(x.stack ?? '') || /^(UND_ERR|ECONN|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|ERR_(STREAM|ZLIB|HTTP2))/.test(x.code ?? '') || x.name === 'AbortError' || x.name === 'TimeoutError')
}
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', isOutboundError(e) ? 'outbound request failed:' : '', e))
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e)
  if (!isOutboundError(e)) process.exit(1)
})

// Graceful shutdown so ECS/Fargate rolling deploys drain in-flight requests.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => {
    stopMediaWorker()
    server.close()
    // running decks get a short time to finish; the rest are handed back and resumed by another worker from their checkpoints
    void (worker ? worker.stop() : Promise.resolve()).finally(() => process.exit(0))
  })
