/* ------------------------------------------------------------------
 * OmniWell brand constants: the one place the product name, copy and
 * pillar palette live. (Formerly Tidewell, a water-only tracker.)
 * ------------------------------------------------------------------ */

export const BRAND = {
  name: 'OmniWell',
  tagline: 'Your whole wellbeing, in one place',
  description:
    'Track water, sleep, mood, meditation, exercise and weight in one calm app, then see how your habits connect.',
  /** Browser UI colour (address bar, PWA splash). Matches the app background. */
  themeColor: '#EDF4F3',
  backgroundColor: '#F6F9F8',
} as const

/**
 * The six pillars in brand order: the order of the logo's petals and the
 * multi-colour gradient. Colours match each tracker's accent in lib/trackers.ts.
 */
export const PILLAR_COLORS = {
  water: '#2189D6',
  sleep: '#4A5BC4',
  meditation: '#7C6BD6',
  mood: '#E8628A',
  exercise: '#E9851F',
  weight: '#2E9C8F',
} as const

export const PILLAR_ORDER = Object.keys(PILLAR_COLORS) as (keyof typeof PILLAR_COLORS)[]

/** The brand gradient, for backgrounds and accents. */
export const BRAND_GRADIENT = `linear-gradient(120deg, ${PILLAR_ORDER.map((k) => PILLAR_COLORS[k]).join(', ')})`

/**
 * Browser-storage key prefix. Deliberately still "tidewell:": renaming it
 * would silently drop existing users' saved settings (weight unit, a
 * pending profile photo awaiting email confirmation, timezone sync).
 */
export const STORAGE_PREFIX = 'tidewell:'
export const storageKey = (name: string) => `${STORAGE_PREFIX}${name}`
