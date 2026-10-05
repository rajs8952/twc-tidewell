import type { Metadata } from 'next'
import { TrackerPage } from '@/components/trackers/TrackerPage'

export const metadata: Metadata = { title: 'Mood' }

export default function MoodPage() {
  return <TrackerPage id="mood" />
}
