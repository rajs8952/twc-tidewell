import { SkeletonCard, SkeletonGroup, SkeletonHeader } from '@/components/SkeletonCard'

/**
 * Fallback for every page in the signed-in app while its route loads.
 * Next.js wraps each page in <Suspense fallback={<Loading />}> using this
 * file; folders with their own loading.tsx (e.g. dashboard) override it.
 */
export default function AppLoading() {
  return (
    <SkeletonGroup label="Loading">
      <SkeletonHeader />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={3} />
      </div>
    </SkeletonGroup>
  )
}
