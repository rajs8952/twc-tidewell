import type { Metadata } from 'next'
import { WaterStats } from '@/components/water/WaterStats'

export const metadata: Metadata = { title: 'Water stats' }

export default function WaterStatsPage() {
  return <WaterStats />
}
