'use client'

import { PageHeader } from '@/components/PageHeader'
import { ExerciseTracker } from '@/components/trackers/ExerciseTracker'
import { MeditationTracker } from '@/components/trackers/MeditationTracker'
import { MoodTracker } from '@/components/trackers/MoodTracker'
import { SleepTracker } from '@/components/trackers/SleepTracker'
import { TrackerBoundary } from '@/components/trackers/TrackerBoundary'
import { WeightTracker } from '@/components/trackers/WeightTracker'
import { TRACKERS, type TrackerId } from '@/lib/trackers'
import { useProfile } from '@/lib/useProfile'

function Weight() {
  const { profile, setProfile } = useProfile()
  return (
    <WeightTracker
      profileWeightKg={profile?.weight_kg}
      onProfileWeightChange={(kg) => setProfile((p) => (p ? { ...p, weight_kg: kg } : p))}
    />
  )
}

function Exercise() {
  const { profile } = useProfile()
  return <ExerciseTracker profileWeightKg={profile?.weight_kg} />
}

/** Water has its own section (app/(app)/water: Today · Stats · Garden). */
type PageTrackerId = Exclude<TrackerId, 'water'>

/** Only the trackers that need the profile load it. */
const BODIES: Record<PageTrackerId, () => JSX.Element> = {
  mood: () => <MoodTracker />,
  meditation: () => <MeditationTracker />,
  sleep: () => <SleepTracker />,
  weight: Weight,
  exercise: Exercise,
}

/** A tracker's dedicated page: header plus the tracker, isolated by an error boundary. */
export function TrackerPage({ id }: { id: PageTrackerId }) {
  const tracker = TRACKERS.find((t) => t.id === id)!
  const Body = BODIES[id]
  return (
    <>
      <PageHeader
        title={tracker.name}
        description={tracker.description}
        icon={tracker.icon}
        accent={tracker.accent}
      />
      <TrackerBoundary name={tracker.name}>
        <Body />
      </TrackerBoundary>
    </>
  )
}
