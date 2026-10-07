/* ------------------------------------------------------------------
 * OmniWell's Tailwind theme for the tracker packages.
 * Colours are CSS variables (space-separated RGB) so a host can retheme
 * by overriding --omni-* on :root or any wrapper; opacity modifiers such
 * as bg-ink/70 keep working. Component classes are namespaced omni-* so
 * they can't collide with the host's own .btn or .input.
 * ------------------------------------------------------------------ */

const plugin = require('tailwindcss/plugin')

const PALETTE = {
  mist: '#EDF4F3',
  ink: '#0F2F37',
  muted: '#557178',
  line: '#D3E2E0',
  alert: '#B8402B',
  'sun-100': '#FDF1D6',
  'sun-400': '#F2AE2E',
  'sun-600': '#B97C0E',
  'tide-50': '#F0F9FD',
  'tide-100': '#DDF1FB',
  'tide-200': '#B4E1F7',
  'tide-300': '#7FCBF0',
  'tide-400': '#46ACE6',
  'tide-500': '#2189D6',
  'tide-600': '#1A6DB5',
  'tide-700': '#185690',
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')
const color = (name) => `rgb(var(--omni-${name}) / <alpha-value>)`
const scale = (prefix) =>
  Object.fromEntries(
    Object.keys(PALETTE)
      .filter((k) => k.startsWith(`${prefix}-`))
      .map((k) => [k.slice(prefix.length + 1), color(k)]),
  )

const btn = 'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45'

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        mist: color('mist'),
        ink: color('ink'),
        muted: color('muted'),
        line: color('line'),
        alert: color('alert'),
        sun: scale('sun'),
        tide: scale('tide'),
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(({ addBase, addComponents }) => {
      addBase({
        ':root': Object.fromEntries(Object.entries(PALETTE).map(([k, hex]) => [`--omni-${k}`, channels(hex)])),
        '.omni-input[type="number"]': { '-moz-appearance': 'textfield' },
        '.omni-input[type="number"]::-webkit-inner-spin-button, .omni-input[type="number"]::-webkit-outer-spin-button': {
          '-webkit-appearance': 'none',
          margin: '0',
        },
      })
      addComponents({
        '.omni-label': { '@apply mb-1.5 block text-sm font-bold text-ink': {} },
        '.omni-input': {
          '@apply w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink transition placeholder:text-muted/60 focus:border-tide-500 focus:outline-none focus:ring-4 focus:ring-tide-200/60':
            {},
        },
        '.omni-btn': { [`@apply ${btn}`]: {} },
        '.omni-btn-primary': { [`@apply ${btn} bg-ink text-white hover:bg-ink/85`]: {} },
        '.omni-btn-secondary': { [`@apply ${btn} bg-white text-ink ring-1 ring-line hover:ring-tide-400`]: {} },
        '.omni-notice-error': { '@apply rounded-2xl bg-alert/10 px-4 py-3 text-sm font-semibold text-alert': {} },
        '.omni-notice-ok': { '@apply rounded-2xl bg-tide-100 px-4 py-3 text-sm font-semibold text-tide-700': {} },
      })
    }),
  ],
}
