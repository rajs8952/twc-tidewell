import type { Metadata } from 'next'
import { WaterStats } from '@omniwell/tracker-water/WaterStats'

export const metadata: Metadata = { title: 'Water stats' }

export default function WaterStatsPage() {
  return <WaterStats />
}
