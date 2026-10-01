import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mist: '#EDF4F3',
        ink: '#0F2F37',
        muted: '#557178',
        line: '#D3E2E0',
        sun: { 100: '#FDF1D6', 400: '#F2AE2E', 600: '#B97C0E' },
        alert: '#B8402B',
        tide: {
          50: '#F0F9FD',
          100: '#DDF1FB',
          200: '#B4E1F7',
          300: '#7FCBF0',
          400: '#46ACE6',
          500: '#2189D6',
          600: '#1A6DB5',
          700: '#185690',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
