import { SkeletonCard, SkeletonGroup } from '@/components/SkeletonCard'
import { TRACKERS } from '@/lib/trackers'

/**
 * Shown by Next.js while the Home route is loading (its server payload and
 * code), in the same layout as the Hub so the page doesn't jump.
 */
export default function DashboardLoading() {
  return (
    <SkeletonGroup label="Loading your Home screen">
      <div aria-hidden className="mb-6 space-y-2 sm:mb-8">
        <div className="h-3.5 w-36 rounded-full bg-white motion-safe:animate-pulse" />
        <div className="h-9 w-64 max-w-full rounded-full bg-white motion-safe:animate-pulse" />
      </div>
      <div aria-hidden className="mb-4 h-5 w-16 rounded-full bg-white motion-safe:animate-pulse sm:mb-6" />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {TRACKERS.map((t) => (
          <li key={t.id}>
            <SkeletonCard variant="tracker" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  )
}
