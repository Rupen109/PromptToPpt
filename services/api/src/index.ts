import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { env } from './env.ts'
import { seedBilling } from './billing/seed.ts'
import { startWorker } from './generation/worker.ts'
import { purgeExpiredDrafts } from './routes/drafts.ts'
import { purgeOldShareViews } from './routes/share-analytics.ts'

await seedBilling() // idempotent: inserts the default plan catalogue only if missing

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

const stopWorker = env.RUN_WORKER ? startWorker() : () => {}
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
    stopWorker()
    server.close(() => process.exit(0))
  })
