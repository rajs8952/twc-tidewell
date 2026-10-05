import { PILLAR_COLORS } from '@/lib/brand'

/**
 * Soft, blurred blobs in all six pillar colours: the holistic backdrop
 * behind the landing hero and the auth panel. Decorative only.
 * `tone`: 'light' for pale page backgrounds, 'deep' for the dark auth panel.
 */
export function BrandBackdrop({ tone = 'light', className = '' }: { tone?: 'light' | 'deep'; className?: string }) {
  const o = tone === 'deep' ? 0.55 : 0.22
  const blobs: { color: string; className: string }[] = [
    { color: PILLAR_COLORS.water, className: 'left-[-10%] top-[-12%] h-[55%] w-[55%] animate-drift' },
    { color: PILLAR_COLORS.meditation, className: 'right-[-12%] top-[-6%] h-[50%] w-[50%] animate-drift-slow' },
    { color: PILLAR_COLORS.mood, className: 'right-[5%] top-[38%] h-[45%] w-[42%] animate-drift' },
    { color: PILLAR_COLORS.exercise, className: 'bottom-[-14%] right-[-6%] h-[45%] w-[45%] animate-drift-slow' },
    { color: PILLAR_COLORS.weight, className: 'bottom-[-12%] left-[-8%] h-[50%] w-[50%] animate-drift' },
    { color: PILLAR_COLORS.sleep, className: 'left-[18%] top-[30%] h-[40%] w-[40%] animate-drift-slow' },
  ]
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {blobs.map((b) => (
        <div
          key={b.color}
          className={`absolute rounded-full blur-3xl ${b.className}`}
          style={{ background: b.color, opacity: o }}
        />
      ))}
    </div>
  )
}
