import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { env } from './env.ts'
import { seedBilling } from './billing/seed.ts'
import { startWorker } from './generation/worker.ts'
import { purgeExpiredDrafts } from './routes/drafts.ts'

await seedBilling() // idempotent: inserts the default plan catalogue only if missing

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

const stopWorker = env.RUN_WORKER ? startWorker() : () => {}
const purge = setInterval(() => void purgeExpiredDrafts().catch((e) => console.error('[purge]', e)), 10 * 60_000)
purge.unref()

// Graceful shutdown so ECS/Fargate rolling deploys drain in-flight requests.
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => {
    stopWorker()
    server.close(() => process.exit(0))
  })
