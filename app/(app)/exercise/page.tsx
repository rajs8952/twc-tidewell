import type { Metadata } from 'next'
import { TrackerPage } from '@/components/trackers/TrackerPage'

export const metadata: Metadata = { title: 'Exercise' }

export default function ExercisePage() {
  return <TrackerPage id="exercise" />
}
