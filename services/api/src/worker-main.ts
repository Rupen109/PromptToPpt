import { createServer } from 'node:http'
import { env } from './env.ts'
import { startWorker } from './generation/worker.ts'
import { startMediaWorker } from './media/worker.ts'
import { queueStats } from './generation/queue.ts'

/**
 * The worker service: builds decks and runs media jobs, serves no web traffic. It is its own process so decks never compete with page loads for CPU
 * or memory, and so it scales on its own: add processes when the slots are busy (see /metrics). Jobs are checkpointed, so these can run on spot machines.
 *   GET /healthz   200 while alive
 *   GET /metrics   slots busy / free and the queue per line: what an autoscaler watches. The rule is HEADROOM: keep at least 40 % of the slots free,
 *                  so a new deck starts at once. Scale on free slots, never on how long the line already is (somebody already waited by then).
 */
const worker = startWorker()
const media = startMediaWorker()

const http = env.WORKER_PORT
  ? createServer((req, res) => {
      void (async () => {
        if (req.url === '/healthz') { res.writeHead(200).end('ok'); return }
        if (req.url === '/metrics') {
          const s = worker.stats()
          const q = await queueStats().catch(() => null)
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ...s, freeRatio: s.slots ? s.free / s.slots : 0, queue: q }))
          return
        }
        res.writeHead(404).end()
      })()
    }).listen(env.WORKER_PORT)
  : null
console.log(`[worker] ${worker.stats().slots} slots${env.WORKER_PORT ? `, health and metrics on :${env.WORKER_PORT}` : ''}`)

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e))
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => {
  media()
  http?.close()
  void worker.stop().finally(() => process.exit(0))
})
