import type { Metadata } from 'next'
import { WaterGarden } from '@rajs8952/tracker-water/WaterGarden'
import { PremiumGate } from '@/components/plans/PremiumGate'

export const metadata: Metadata = { title: 'Garden' }

export default function WaterGardenPage() {
  return (
    <PremiumGate feature="garden">
      <WaterGarden />
    </PremiumGate>
  )
}
