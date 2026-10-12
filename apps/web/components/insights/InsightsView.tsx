'use client'

import { Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getInsights } from '@/app/actions/insights'
import { PageHeader } from '@/components/PageHeader'
import { ExploreConnections } from '@/components/insights/ExploreConnections'
import { IconPair, InsightCard } from '@/components/insights/InsightCard'
import { YourStats } from '@/components/insights/YourStats'
import { errorMessage } from '@rajs8952/core/errors'
import type { Insights } from '@/lib/insights/analyze'
import type { HeadlineIcon } from '@/lib/insights/headline'
import { trackProgress } from '@/lib/progress'
import { computeStats, loadStats, type StatsEntries } from '@/lib/insights/stats'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/useProfile'
import { effectiveGoal } from '@rajs8952/core/hydration'
import { goalsOf } from '@rajs8952/core/goals'

const ICON: Record<Insights['insights'][number]['id'], HeadlineIcon> = {
  'water-next-sleep': 'water-sleep',
  'sleep-mood': 'sleep-mood',
  'water-mood': 'water-mood',
}

const TITLE: Record<Insights['insights'][number]['id'], string> = {
  'water-next-sleep': 'Water and sleep',
  'sleep-mood': 'Sleep and mood',
  'water-mood': 'Water and mood',
}

/** The Insights page: last 30 days per tracker, habits that go together, then the longer-term connections. */
export function InsightsView() {
  const [data, setData] = useState<Insights | null>(null)
  const [error, setError] = useState<string | null>(null)
  const supabase = useMemo(() => createClient(), [])
  const { profile } = useProfile()
  const [entries, setEntries] = useState<StatsEntries | null>(null)

  useEffect(() => {
    let alive = true
    loadStats(supabase)
      .then((e) => alive && setEntries(e))
      .catch(() => alive && setEntries({ mood: [], sleep: [], meditation: [], exercise: [], weight: [], water: {} }))
    return () => {
      alive = false
    }
  }, [supabase])

  const stats = useMemo(() => (entries && profile ? computeStats(entries, effectiveGoal(profile), goalsOf(profile)) : null), [entries, profile])

  useEffect(() => {
    let alive = true
    trackProgress(getInsights())
      .then((r) => {
        if (!alive) return
        if (r.ok) setData(r.data)
        else setError(r.error)
      })
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      <PageHeader
        title="Insights"
        description="Your habits over the last 30 days, and how they connect"
        icon={Sparkles}
        accent="#6A55C9"
      />

      <div className="space-y-8">
        <YourStats stats={stats} />

        <InsightCard headline={data ? data.headline : error ? null : undefined} error={error} />

        {data && (
          <section aria-labelledby="connections-title">
            <h2 id="connections-title" className="text-lg font-bold">
              Water, sleep and mood over time
            </h2>
            <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {data.insights.map((i) => (
                <li key={i.id} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mist [&_svg]:h-8 [&_svg]:w-8">
                    <IconPair icon={i.level === 'insufficient' ? 'collecting' : ICON[i.id]} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold">{TITLE[i.id]}</p>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">{i.headline}</p>
                    <p className="mt-1 text-sm text-ink/80">{i.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && <ExploreConnections days={data.days} insights={data.insights} goalMl={data.goalMl} />}
      </div>
    </>
  )
}
