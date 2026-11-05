/**
 * An extra deck-generation worker with many slots (dev / load tests): the same worker the production service runs (src/worker-main.ts).
 *   tsx --env-file-if-exists=.env scripts/worker-pool.ts [slots=12]
 */
import { isProd } from '../src/env.ts'
import { startWorker } from '../src/generation/worker.ts'

if (isProd) { console.error('Refusing to run in production'); process.exit(1) }
const slots = Number(process.argv[2] ?? 12)
const worker = startWorker({ slots })
console.log(`[worker-pool] one worker with ${slots} slots running`)
const stop = () => { void worker.stop().finally(() => process.exit(0)) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
