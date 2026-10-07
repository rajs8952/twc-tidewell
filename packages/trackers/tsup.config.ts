import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/registry.ts', 'src/hub.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
})
