'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getTrackerData, type TrackerData } from '@/app/actions/dashboard'
import { Avatar } from '@/components/Avatar'
import { ExerciseTracker } from '@/components/trackers/ExerciseTracker'
import { MeditationTracker } from '@/components/trackers/MeditationTracker'
import { MoodTracker } from '@/components/trackers/MoodTracker'
import { SleepTracker } from '@/components/trackers/SleepTracker'
import { PlaceholderCard, TrackerBoundary, TrackerCard } from '@/components/trackers/TrackerCard'
import { WaterTracker } from '@/components/trackers/WaterTracker'
import { WeightTracker } from '@/components/trackers/WeightTracker'
import { flushPendingAvatar } from '@/lib/avatar'
import { getProfile } from '@/lib/data'
import { errorMessage } from '@/lib/errors'
import { exerciseRange } from '@/lib/exercise'
import { greeting } from '@/lib/hydration'
import { meditationRange } from '@/lib/meditation'
import { moodRange } from '@/lib/mood'
import { sleepRange } from '@/lib/sleep'
import { createClient } from '@/lib/supabase/client'
import { TRACKERS, type TrackerId } from '@/lib/trackers'
import type { Profile } from '@/lib/types'
import { weightRange } from '@/lib/weight'

/**
 * Six-column grid, in registry order. Water spans the first row; Mood and
 * Meditation share the second; Sleep, Weight and Exercise (two columns
 * inside each) take a full row apiece.
 * On tablets every card is full width.
 */
const SPAN: Partial<Record<TrackerId, string>> = {
  water: 'sm:col-span-2 lg:col-span-6',
  mood: 'sm:col-span-2 lg:col-span-3',
  meditation: 'sm:col-span-2 lg:col-span-3',
  sleep: 'sm:col-span-2 lg:col-span-6',
  weight: 'sm:col-span-2 lg:col-span-6',
  exercise: 'sm:col-span-2 lg:col-span-6',
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  // null while loading; each tracker card waits for its slice.
  const [trackerData, setTrackerData] = useState<TrackerData | null>(null)

  // All server-action trackers in one request: Next.js runs a page's server
  // actions one at a time, so per-card loads queued up behind each other.
  useEffect(() => {
    let alive = true
    const now = new Date()
    getTrackerData({
      mood: moodRange(now),
      meditation: meditationRange(now),
      sleep: sleepRange(now),
      weight: weightRange(now),
      exercise: exerciseRange(now),
    })
      .then((d) => alive && setTrackerData(d))
      .catch((e) => {
        if (!alive) return
        const failed = { ok: false as const, error: errorMessage(e, 'Couldn’t load your trackers. Reload to try again.') }
        setTrackerData({ mood: failed, meditation: failed, sleep: failed, weight: failed, exercise: failed })
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const p = await getProfile(supabase)
        if (!alive) return
        setProfile(p)
        const url = await flushPendingAvatar(supabase, p.id)
        if (url && alive) setProfile({ ...p, avatar_url: url })
      } catch (e) {
        if (alive) setError(errorMessage(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase])

  const now = new Date()
  const firstName = profile?.full_name.split(' ')[0]

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-4 sm:mb-10">
        <div>
          <p className="text-sm font-semibold text-muted">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-extrabold sm:text-4xl">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        {profile && (
          <Link href="/profile" aria-label="Edit profile" className="rounded-full">
            <Avatar src={profile.avatar_url} name={profile.full_name} size={48} />
          </Link>
        )}
      </header>

      {error && <p role="alert" className="notice-error mb-6">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-6">
        {TRACKERS.map((t) => (
          <TrackerBoundary key={t.id} name={t.name} className={SPAN[t.id]}>
            {t.status === 'live' ? (
              <TrackerCard tracker={t} className={SPAN[t.id]}>
                {t.id === 'water' && <WaterTracker profile={profile} />}
                {t.id === 'mood' && <MoodTracker initialData={trackerData?.mood ?? null} />}
                {t.id === 'meditation' && <MeditationTracker initialData={trackerData?.meditation ?? null} />}
                {t.id === 'sleep' && <SleepTracker initialData={trackerData?.sleep ?? null} />}
                {t.id === 'weight' && (
                  <WeightTracker
                    profileWeightKg={profile?.weight_kg}
                    onProfileWeightChange={(kg) => setProfile((p) => (p ? { ...p, weight_kg: kg } : p))}
                    initialData={trackerData?.weight ?? null}
                  />
                )}
                {t.id === 'exercise' && <ExerciseTracker profileWeightKg={profile?.weight_kg} initialData={trackerData?.exercise ?? null} />}
              </TrackerCard>
            ) : (
              <PlaceholderCard tracker={t} className={SPAN[t.id]} />
            )}
          </TrackerBoundary>
        ))}
      </div>
    </>
  )
}
