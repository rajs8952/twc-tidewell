import type { Metadata } from 'next'
import { TrackerPage } from '@/components/trackers/TrackerPage'

export const metadata: Metadata = { title: 'Sleep' }

export default function SleepPage() {
  return <TrackerPage id="sleep" />
}
