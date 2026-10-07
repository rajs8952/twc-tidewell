import type { Metadata } from 'next'
import { WaterStats } from '@rajs8952/tracker-water/WaterStats'

export const metadata: Metadata = { title: 'Water stats' }

export default function WaterStatsPage() {
  return <WaterStats />
}
