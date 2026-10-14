/* ------------------------------------------------------------------
 * OmniWell's colours and spacing, matching the website
 * (packages/config-tailwind and apps/web/lib/brand.ts).
 * ------------------------------------------------------------------ */

export const COLORS = {
  background: '#F6F9F8',
  mist: '#EDF4F3',
  ink: '#0F2F37',
  muted: '#557178',
  line: '#D3E2E0',
  white: '#FFFFFF',
  alert: '#B8402B',
  alertBg: '#FDECEA',
  tide50: '#F0F9FD',
  tide100: '#DDF1FB',
  tide200: '#B4E1F7',
  tide500: '#2189D6',
  tide600: '#1A6DB5',
  tide700: '#185690',
} as const

/** The six pillars in brand order: the logo's petals. */
export const PILLAR_COLORS = ['#2189D6', '#4A5BC4', '#7C6BD6', '#E8628A', '#E9851F', '#2E9C8F'] as const

export const RADIUS = { field: 16, card: 24, pill: 999 } as const
