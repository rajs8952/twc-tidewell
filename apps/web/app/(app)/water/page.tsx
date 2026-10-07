import type { Metadata } from 'next'
import { WaterToday } from '@/components/water/WaterToday'

export const metadata: Metadata = { title: 'Water' }

export default function WaterPage() {
  return <WaterToday />
}
