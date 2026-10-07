import type { Metadata } from 'next'
import { WaterGarden } from '@omniwell/tracker-water/WaterGarden'

export const metadata: Metadata = { title: 'Garden' }

export default function WaterGardenPage() {
  return <WaterGarden />
}
