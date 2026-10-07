import type { Metadata } from 'next'
import { TrackerPage } from '@/components/trackers/TrackerPage'

export const metadata: Metadata = { title: 'Meditation' }

export default function MeditationPage() {
  return <TrackerPage id="meditation" />
}
