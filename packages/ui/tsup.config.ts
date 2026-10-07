import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/*.ts', 'src/*.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Every module here is a React client component or hook.
  banner: { js: "'use client'" },
})
