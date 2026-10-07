import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/supabase.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
})
