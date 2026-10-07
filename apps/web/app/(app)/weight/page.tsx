import type { Metadata } from 'next'
import { TrackerPage } from '@/components/trackers/TrackerPage'

export const metadata: Metadata = { title: 'Weight' }

export default function WeightPage() {
  return <TrackerPage id="weight" />
}
