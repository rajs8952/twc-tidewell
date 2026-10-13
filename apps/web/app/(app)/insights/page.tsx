import type { Metadata } from 'next'
import { InsightsView } from '@/components/insights/InsightsView'
import { PremiumGate } from '@/components/plans/PremiumGate'

export const metadata: Metadata = { title: 'Insights' }

export default function InsightsPage() {
  return (
    <PremiumGate feature="insights">
      <InsightsView />
    </PremiumGate>
  )
}
