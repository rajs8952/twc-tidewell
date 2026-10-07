import { defineConfig } from 'tsup'

export default defineConfig({
  // The public modules; everything else is bundled into them.
  entry: ['src/index.ts', 'src/MoodTracker.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Every module here is a React client component or hook.
  banner: { js: "'use client'" },
})
