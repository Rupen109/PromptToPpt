// Development and tests only: the same worker as parse-worker.ts, started with tsx so it can read the workspace packages' TypeScript source (the built dist/parse-worker.js needs none of this).
import { register } from 'tsx/esm/api'

register()
await import('./parse-worker.ts')
