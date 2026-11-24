import { defineConfig } from 'tsup'

export default defineConfig({
  // the file-reading worker (src/sources/parse-worker.ts) is its own entry: dist/parse-worker.js sits next to dist/index.js, where the pool looks for it
  // migrate.js is what the one-off "run migrations" task executes in the image. The development-only background removal model (media/cutout-child.ts, @huggingface/transformers,
  // a devDependency) is NOT built: production refuses that provider (media/bg-providers.ts), so the image carries neither it nor its ~200 MB runtime; development runs the .ts.
  entry: { index: 'src/index.ts', worker: 'src/worker-main.ts', 'parse-worker': 'src/sources/parse-worker.ts', migrate: 'src/db/migrate.ts' },
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TS source, so they must be bundled; third-party deps stay external.
  noExternal: [/^@prompttoppt\//],
})
