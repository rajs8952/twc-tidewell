import type { Config } from 'tailwindcss'
import omniwell from '@omniwell/tailwind-preset'

const config: Config = {
  presets: [omniwell],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', '../../packages/*/src/**/*.{ts,tsx}'],
  plugins: [],
}

export default config
