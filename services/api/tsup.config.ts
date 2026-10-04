import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TS source, so they must be bundled; third-party deps stay external.
  noExternal: [/^@prompttoppt\//],
})
