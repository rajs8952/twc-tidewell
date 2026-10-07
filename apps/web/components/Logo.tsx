import { BRAND, PILLAR_COLORS, PILLAR_ORDER } from '@/lib/brand'

/**
 * The OmniWell mark: six overlapping petals, one per pillar (water, sleep,
 * meditation, mood, exercise, weight), forming a single flower.
 * `light` renders it white for use on the brand gradient.
 */
export function LogoMark({ className = 'h-7 w-7', light = false }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      {PILLAR_ORDER.map((k, i) => {
        const angle = (i / PILLAR_ORDER.length) * Math.PI * 2 - Math.PI / 2
        return (
          <circle
            key={k}
            cx={16 + Math.cos(angle) * 6.4}
            cy={16 + Math.sin(angle) * 6.4}
            r={6.2}
            fill={light ? '#FFFFFF' : PILLAR_COLORS[k]}
            fillOpacity={light ? 0.42 : 0.82}
            style={light ? undefined : { mixBlendMode: 'multiply' }}
          />
        )
      })}
      <circle cx={16} cy={16} r={2.6} fill={light ? '#FFFFFF' : '#FFFFFF'} fillOpacity={light ? 0.95 : 0.9} />
    </svg>
  )
}

export function Logo({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight ${className}`}>
      <LogoMark light={light} />
      <span className={light ? 'text-white' : 'text-ink'}>{BRAND.name}</span>
    </span>
  )
}
