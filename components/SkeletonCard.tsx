/* ------------------------------------------------------------------
 * Loading placeholders that match the real cards' size and shape, so
 * nothing jumps when data arrives. Purely visual (aria-hidden): wrap a
 * group of them in <SkeletonGroup label="…"> for one screen-reader cue.
 * Tailwind's animate-pulse is disabled under prefers-reduced-motion by
 * motion-safe:, leaving a calm static placeholder.
 * ------------------------------------------------------------------ */

const bone = 'rounded-full bg-mist motion-safe:animate-pulse'

type Variant =
  /** A Hub tracker card: ring on the left, name, value and caption. */
  | 'tracker'
  /** A titled panel, e.g. a tracker page's main card. */
  | 'panel'
  /** A single list row: icon tile and two lines. */
  | 'row'

export function SkeletonCard({ variant = 'panel', lines = 3, className = '' }: { variant?: Variant; lines?: number; className?: string }) {
  if (variant === 'tracker') {
    return (
      <div aria-hidden className={`flex items-center gap-4 rounded-3xl bg-white p-4 ring-1 ring-line ${className}`}>
        <div className={`h-[68px] w-[68px] shrink-0 ${bone}`} />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className={`h-3.5 w-20 ${bone}`} />
          <div className={`h-5 w-28 ${bone}`} />
          <div className={`h-3 w-32 ${bone}`} />
        </div>
      </div>
    )
  }

  if (variant === 'row') {
    return (
      <div aria-hidden className={`flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-line ${className}`}>
        <div className={`h-10 w-10 shrink-0 rounded-xl bg-mist motion-safe:animate-pulse`} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`h-3.5 w-1/3 ${bone}`} />
          <div className={`h-3 w-2/3 ${bone}`} />
        </div>
      </div>
    )
  }

  return (
    <div aria-hidden className={`rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-2xl bg-mist motion-safe:animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className={`h-4 w-40 ${bone}`} />
          <div className={`h-3 w-56 max-w-full ${bone}`} />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          // Varying widths read as text rather than a grid of bars.
          <div key={i} className={`h-3.5 ${bone}`} style={{ width: `${[92, 78, 85, 64, 88][i % 5]}%` }} />
        ))}
      </div>
    </div>
  )
}

/** Groups skeletons with a single polite "Loading …" for screen readers. */
export function SkeletonGroup({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** The page title block's placeholder, matching PageHeader. */
export function SkeletonHeader() {
  return (
    <div aria-hidden className="mb-6 flex items-center gap-3 sm:mb-8 sm:gap-4">
      <div className="h-12 w-12 shrink-0 rounded-2xl bg-white motion-safe:animate-pulse sm:h-14 sm:w-14" />
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-full bg-white motion-safe:animate-pulse sm:h-8" />
        <div className="h-3.5 w-64 max-w-[60vw] rounded-full bg-white motion-safe:animate-pulse" />
      </div>
    </div>
  )
}
