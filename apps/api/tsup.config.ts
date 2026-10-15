import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  clean: true,
  // Workspace packages ship TypeScript sources, so bundle them into the output.
  noExternal: [/^@weft\//],
})
