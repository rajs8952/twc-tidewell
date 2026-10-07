import { PageHeader } from '@/components/PageHeader'
import { TrackerBoundary } from '@omniwell/ui/TrackerBoundary'
import { WaterTabs } from '@/components/water/WaterTabs'
import { TRACKERS } from '@/lib/trackers'

const water = TRACKERS.find((t) => t.id === 'water')!

/** The Water section: shared header and Today · Stats · Garden tabs. */
export default function WaterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title={water.name} description={water.description} icon={water.icon} accent={water.accent} />
      <WaterTabs />
      <TrackerBoundary name={water.name}>{children}</TrackerBoundary>
    </>
  )
}
