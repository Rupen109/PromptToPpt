import { defineConfig } from 'tsup'

export default defineConfig({
  // the file-reading worker (src/sources/parse-worker.ts) is its own entry: dist/parse-worker.js sits next to dist/index.js, where the pool looks for it
  entry: { index: 'src/index.ts', 'parse-worker': 'src/sources/parse-worker.ts', migrate: 'src/db/migrate.ts' }, // migrate.js is what the one-off "run migrations" task executes in the image
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TS source, so they must be bundled; third-party deps stay external.
  noExternal: [/^@prompttoppt\//],
})
