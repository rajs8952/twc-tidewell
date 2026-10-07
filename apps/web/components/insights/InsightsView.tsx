'use client'

import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getInsights } from '@/app/actions/insights'
import { PageHeader } from '@/components/PageHeader'
import { ExploreConnections } from '@/components/insights/ExploreConnections'
import { IconPair, InsightCard } from '@/components/insights/InsightCard'
import { errorMessage } from '@rajs8952/core/errors'
import type { Insights } from '@/lib/insights/analyze'
import type { HeadlineIcon } from '@/lib/insights/headline'
import { trackProgress } from '@/lib/progress'

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

/** The Insights page: the headline finding, every connection in words, and the optional deep dive. */
export function InsightsView() {
  const [data, setData] = useState<Insights | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        description={`How your habits connect over the last ${data?.days.length ?? 30} days`}
        icon={Sparkles}
        accent="#6A55C9"
      />

      <div className="space-y-6">
        <InsightCard headline={data ? data.headline : error ? null : undefined} error={error} />

        {data && (
          <section aria-labelledby="connections-title">
            <h2 id="connections-title" className="text-lg font-bold">
              All connections
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
