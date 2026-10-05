'use client'

import { AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { getTrackerData, type TrackerData } from '@/app/actions/dashboard'
import { Avatar } from '@/components/Avatar'
import { HubCard } from '@/components/hub/HubCard'
import { InterventionBanner } from '@/components/interventions/InterventionBanner'
import { getLogsBetween } from '@/lib/data'
import { errorMessage } from '@/lib/errors'
import { exerciseRange } from '@/lib/exercise'
import { hubSummaries, type HubSummary } from '@/lib/hub'
import { addDays, effectiveGoal, greeting, startOfDay } from '@/lib/hydration'
import { latestInterventions } from '@/lib/intervention-engine'
import { meditationRange } from '@/lib/meditation'
import { moodRange } from '@/lib/mood'
import { sleepRange } from '@/lib/sleep'
import { createClient } from '@/lib/supabase/client'
import { TRACKERS, type TrackerId } from '@/lib/trackers'
import { useDismissed } from '@/lib/useDismissed'
import { useProfile } from '@/lib/useProfile'
import { weightRange } from '@/lib/weight'

/** The Home Hub: one at-a-glance card per tracker, each linking to its page. */
export function HubView() {
  const supabase = useMemo(() => createClient(), [])
  const { profile, error: profileError } = useProfile()
  const [trackerData, setTrackerData] = useState<TrackerData | null>(null)
  const [waterMl, setWaterMl] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const now = new Date()
    // One server action for the five server-loaded trackers (Next.js runs actions one at a time).
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
        const failed = { ok: false as const, error: errorMessage(e) }
        setTrackerData({ mood: failed, meditation: failed, sleep: failed, weight: failed, exercise: failed })
      })
    // Water reads straight from the browser, as the water tracker does.
    const today = startOfDay(now)
    getLogsBetween(supabase, today, addDays(today, 1))
      .then((logs) => alive && setWaterMl(logs.reduce((s, l) => s + l.effective_ml, 0)))
      .catch(() => alive && setWaterMl(-1))
    return () => {
      alive = false
    }
  }, [supabase])

  const now = new Date()
  const summaries: Partial<Record<TrackerId, HubSummary>> = useMemo(() => {
    if (!trackerData || waterMl === null || !profile) return {}
    const water = waterMl < 0 ? null : { todayMl: waterMl, goalMl: effectiveGoal(profile) }
    return hubSummaries(trackerData, water)
  }, [trackerData, waterMl, profile])

  // Alerts from the latest mood, sleep and weight; each can be dismissed (or, if critical, acknowledged) once.
  const { isDismissed, dismiss, ready } = useDismissed()
  const interventions = useMemo(() => {
    if (!trackerData || !profile) return []
    const data = <T,>(r: { ok: true; data: T[] } | { ok: false }) => (r.ok ? r.data : undefined)
    return latestInterventions({ mood: data(trackerData.mood), sleep: data(trackerData.sleep), weight: data(trackerData.weight) }, profile)
  }, [trackerData, profile])
  const visible = ready ? interventions.filter((i) => !isDismissed(i.key)) : []
  const crisis = visible.find((i) => i.severity === 'CRITICAL') ?? null
  const banners = visible.filter((i) => i.severity !== 'CRITICAL')

  const loaded = Object.keys(summaries).length > 0
  const doneCount = TRACKERS.filter((t) => summaries[t.id]?.done).length
  const firstName = profile?.full_name.split(' ')[0]

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
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

      {profileError && <p role="alert" className="notice-error mb-6">{profileError}</p>}

      <InterventionBanner intervention={crisis} onDismiss={() => crisis && dismiss(crisis.key)} />
      <div className={banners.length ? 'mb-6 space-y-3' : undefined}>
        <AnimatePresence initial={false}>
          {banners.map((i) => (
            <InterventionBanner key={i.key} intervention={i} onDismiss={() => dismiss(i.key)} />
          ))}
        </AnimatePresence>
      </div>

      <section aria-labelledby="today-title" className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <h2 id="today-title" className="text-lg font-bold">
          Today
        </h2>
        <p className="flex items-center gap-2 text-sm font-semibold text-muted" aria-live="polite">
          {loaded ? (
            <>
              <span className="flex gap-1" aria-hidden>
                {TRACKERS.map((t) => (
                  <span
                    key={t.id}
                    className="h-2 w-5 rounded-full"
                    style={{ background: summaries[t.id]?.done ? t.accent : '#D3E2E0' }}
                  />
                ))}
              </span>
              {doneCount} of {TRACKERS.length} done
            </>
          ) : (
            'Loading…'
          )}
        </p>
      </section>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {TRACKERS.map((t) => (
          <li key={t.id}>
            <HubCard tracker={t} summary={summaries[t.id] ?? null} />
          </li>
        ))}
      </ul>
    </>
  )
}
